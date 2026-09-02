# Comprehensive Technical Specification: Scoped Realtime Notifications & In-Place State Optimization (Milestone 2)

**Author:** Explorer Agent (Notifications & Realtime Listener Specifier)  
**Date:** 2026-08-29  
**Working Directory:** `d:\Hodoori-Beta\.agents\explorer_m2_3`  
**Target Files:**
- `scripts/utils-notifications.js`
- `portal-student.html`
- `portal-parent.html`
- `scripts/core-db.js` (Interface & Cache Interaction)

---

## 1. Executive Summary & Problem Formulation

In the Hodoori educational platform, real-time alerts (absence notices, school announcements, class updates) are pushed to students, parents, and teachers using Firebase Firestore snapshot listeners (`onSnapshot`) managed by `scripts/utils-notifications.js`.

The Milestone 1 audit revealed two critical architectural flaws in the notification subsystem:
1. **Un-scoped Cross-Tenant Listener Leak (`scripts/utils-notifications.js:189`)**: The real-time listener attaches directly to the `v2_notifications` collection using `orderBy('timestamp', 'desc').limit(5)` without a `schoolId` equality filter (`where('schoolId', '==', schoolId)`). Every client across every registered school receives document change streams belonging to other institutions. Furthermore, the `unsubscribe` handle returned by `onSnapshot` is discarded within an unreturned Promise chain, making listener teardown impossible on tenant switch, user logout, or page unmount.
2. **Cascading Query Storm on Snapshot Arrival (`portal-student.html:278`, `scripts/core-db.js:889`)**: When a notification change is detected, `portal-student.html` handles the `new_notification_received` event by invoking `checkNotifications()`. This triggers `DB.getNotifications(target)`, which executes a **3-to-4 query cascade** against Firestore (`where('targetType', '==', 'all')`, `where('targetType', '==', 'class')`, `where('targetType', '==', 'student')`). If an administrator sends an announcement to a school of 200 connected students, that single document creation induces a storm of **600 to 800 simultaneous Firestore read operations** across client browsers.

### Target Milestone 2 Objectives
- **Strict Multi-Tenant Scoping**: Enforce `where('schoolId', '==', schoolId)` in the Firestore query in `scripts/utils-notifications.js`.
- **Complete Subscription Lifecycle Management**: Retain `this._unsubscribe`, expose a synchronous `NotificationManager.unsubscribe()` method, and bind automated disposal on `beforeunload` and `pagehide`.
- **In-Place State Injection (0 Cloud Reads on Push)**: Mutate in-memory notification lists (`window.studentNotifications`, `window.parentNotifications`) directly from the snapshot change payload, update unread indicators instantly, and invalidate the local L1 cache in `core-db.js` without issuing secondary queries.
- **Universal Multi-Target Filter**: Expand in-memory target matching (`_isTargetMatch`) to support `studentIds` arrays, classes, and parent accounts seamlessly.

---

## 2. Audit of Current Notification Architecture & Failure Modes

### 2.1. Listener Setup in `scripts/utils-notifications.js` (Lines 178–218)

```javascript
// BEFORE (VULNERABLE IMPLEMENTATION)
subscribeToNotifications(target = {}) {
    if (typeof DB === 'undefined') return;

    let isInitialLoad = true;

    DB.init().then(() => {
        console.log('Subscribing to real-time notifications for target:', target);
        const notificationsRef = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);
        
        // ❌ Vulnerability 1: Missing where('schoolId', '==', schoolId)
        // ❌ Vulnerability 2: Unsubscribe return value is discarded inside .then()
        return notificationsRef.orderBy('timestamp', 'desc').limit(5).onSnapshot(snapshot => {
            if (isInitialLoad) {
                isInitialLoad = false;
                return;
            }

            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const notif = change.doc.data(); // ❌ Missing doc.id
                    
                    let isForMe = false;
                    if (notif.targetType === 'all') isForMe = true;
                    else if (notif.targetType === 'class' && notif.targetId === target.classId) isForMe = true;
                    else if (notif.targetType === 'student' && notif.targetId === target.id) isForMe = true;
                    // ❌ Missing parent target matching & array target matching

                    if (isForMe) {
                        console.log('Real-time notification detected:', notif);
                        this.sendLocalNotification(notif.title, notif.message);
                        
                        // Emits event that triggers query storm
                        window.dispatchEvent(new CustomEvent('new_notification_received', { detail: notif }));
                    }
                }
            });
        }, err => {
            console.error('Real-time snapshot listener failed:', err);
        });
    });
}
```

### 2.2. The Query Cascade Call Graph

```
[Administrator / Teacher / Absence Scheduler]
                │
                ▼ creates notification document
    [Firestore Cloud: v2_notifications]
                │
                ▼ onSnapshot pushed to all connected clients
    [NotificationManager (scripts/utils-notifications.js)]
                │
                ▼ dispatches 'new_notification_received' CustomEvent
    [portal-student.html (Line 278)]
                │
                ▼ window.addEventListener('new_notification_received', () => checkNotifications())
        [checkNotifications() (Line 448)]
                │
                ▼ calls DB.getNotifications(target)
        [DB.getNotifications (scripts/core-db.js:889)]
                ├── Query 1: v2_notifications.where('targetType', '==', 'all').get()
                ├── Query 2: v2_notifications.where('targetType', '==', 'class').where('targetId', '==', classId).get()
                └── Query 3: v2_notifications.where('targetType', '==', 'student').where('targetId', '==', studentId).get()
                                │
                                ▼
        💥 3 Cloud Queries Executed Per Client On Every Notification!
```

---

## 3. Technical Specification: Scoped Realtime Listener

### 3.1. Class Structure & State Management in `NotificationManager`

`NotificationManager` shall be enhanced with internal tracking properties to guarantee lifecycle control, multi-tenant safety, and race condition prevention:

| Property | Type | Description |
|---|---|---|
| `_unsubscribe` | `Function \| null` | Stores the active Firestore `onSnapshot` cancellation closure. |
| `_activeSchoolId` | `string \| null` | Stores the active `schoolId` for the current listener. |
| `_activeTarget` | `Object \| null` | Stores the active target filter parameters (`{ id, academicId, classId, studentIds, classIds, isParent }`). |
| `_isSubscribing` | `boolean` | Flag indicating an asynchronous subscription pipeline is in-flight to prevent race conditions. |

### 3.2. Strict Multi-Tenant Scoping Rule
When building the query in `subscribeToNotifications(target)`:
1. Resolve `schoolId` using:
   ```javascript
   const schoolId = target.schoolId || (typeof DB !== 'undefined' && DB.getCurrentUserSchoolId()) || null;
   ```
2. If `schoolId` is valid and not `'ministry'` and not `'global'`, append `.where('schoolId', '==', schoolId)` to the Firestore collection reference:
   ```javascript
   let query = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);
   if (schoolId && schoolId !== 'ministry' && schoolId !== 'global') {
       query = query.where('schoolId', '==', schoolId);
   }
   query = query.orderBy('timestamp', 'desc').limit(10);
   ```
3. This guarantees that:
   - School A clients never receive snapshots from School B.
   - Firestore security rules with tenant boundaries are fully satisfied.
   - Network bandwidth and client evaluation overhead are minimized.

### 3.3. Multi-Target Matching Engine (`_isTargetMatch`)
The target matching algorithm must support single student IDs, parent accounts with multiple children, class IDs, and broadcast announcements:

```javascript
_isTargetMatch(notif, target) {
    if (!notif) return false;
    if (!target || Object.keys(target).length === 0) return true;

    // 1. Broadcasts to all members of the school
    if (notif.targetType === 'all') return true;

    const notifTargetId = notif.targetId ? String(notif.targetId) : null;
    if (!notifTargetId) return false;

    // 2. Class-targeted notifications
    if (notif.targetType === 'class') {
        if (target.classId && String(target.classId) === notifTargetId) return true;
        if (Array.isArray(target.classIds) && target.classIds.map(String).includes(notifTargetId)) return true;
    }

    // 3. Student-targeted notifications
    if (notif.targetType === 'student') {
        if (target.id && String(target.id) === notifTargetId) return true;
        if (target.academicId && String(target.academicId) === notifTargetId) return true;
        if (Array.isArray(target.studentIds) && target.studentIds.map(String).includes(notifTargetId)) return true;
    }

    // 4. Parent-targeted notifications
    if (notif.targetType === 'parent') {
        if (target.isParent) {
            if (target.id && String(target.id) === notifTargetId) return true;
            if (target.parentId && String(target.parentId) === notifTargetId) return true;
            if (Array.isArray(target.studentIds) && target.studentIds.map(String).includes(notifTargetId)) return true;
        }
    }

    return false;
}
```

### 3.4. Subscription & Unsubscription Lifecycle Contract

```javascript
async subscribeToNotifications(target = {}) {
    if (typeof DB === 'undefined') {
        console.warn('NotificationManager: DB module unavailable.');
        return null;
    }

    // 1. Clean up any existing active subscription
    this.unsubscribe();

    this._isSubscribing = true;
    this._activeTarget = { ...target };

    try {
        await DB.init();
        if (!this._isSubscribing) return null; // Unsubscribed while waiting for DB.init()

        const schoolId = target.schoolId || DB.getCurrentUserSchoolId();
        this._activeSchoolId = schoolId;

        let query = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);
        if (schoolId && schoolId !== 'ministry' && schoolId !== 'global') {
            query = query.where('schoolId', '==', schoolId);
        }
        query = query.orderBy('timestamp', 'desc').limit(10);

        let isInitialLoad = true;

        const unsubscribeFn = query.onSnapshot(snapshot => {
            if (isInitialLoad) {
                isInitialLoad = false;
                return;
            }

            snapshot.docChanges().forEach(change => {
                const docData = change.doc.data() || {};
                const notif = { id: change.doc.id, ...docData };

                if (change.type === 'added') {
                    if (this._isTargetMatch(notif, this._activeTarget)) {
                        // 1. Invalidate L1 Cache in core-db.js without triggering secondary queries
                        if (typeof DB !== 'undefined' && DB.invalidateCache) {
                            DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, {
                                schoolId: notif.schoolId || schoolId,
                                broadcast: false
                            });
                        }

                        // 2. Trigger OS/browser push notification & UI toast
                        this.sendLocalNotification(notif.title || 'إشعار جديد', notif.message || '', notif.url || '/');

                        // 3. Dispatch in-place update event to UI
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('new_notification_received', {
                                detail: notif
                            }));
                        }
                    }
                } else if (change.type === 'modified') {
                    if (this._isTargetMatch(notif, this._activeTarget)) {
                        if (typeof DB !== 'undefined' && DB.invalidateCache) {
                            DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, {
                                schoolId: notif.schoolId || schoolId,
                                broadcast: false
                            });
                        }
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('notification_modified', { detail: notif }));
                        }
                    }
                } else if (change.type === 'removed') {
                    if (typeof DB !== 'undefined' && DB.invalidateCache) {
                        DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, {
                            schoolId: notif.schoolId || schoolId,
                            broadcast: false
                        });
                    }
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('notification_deleted', { detail: { id: change.doc.id } }));
                    }
                }
            });
        }, err => {
            console.warn('Hodoori Notifications: Snapshot listener notice:', err ? err.message : err);
        });

        this._unsubscribe = unsubscribeFn;
        this._isSubscribing = false;
        return unsubscribeFn;

    } catch (err) {
        console.error('NotificationManager: Subscription error:', err);
        this._isSubscribing = false;
        return null;
    }
},

unsubscribe() {
    this._isSubscribing = false;
    if (typeof this._unsubscribe === 'function') {
        try {
            this._unsubscribe();
            console.log('NotificationManager: Unsubscribed successfully.');
        } catch (e) {
            console.warn('NotificationManager: Error during unsubscribe:', e);
        }
        this._unsubscribe = null;
        this._activeSchoolId = null;
        this._activeTarget = null;
        return true;
    }
    return false;
}
```

---

## 4. Technical Specification: In-Place State Updates & Cascade Elimination

### 4.1. Student Portal Optimization (`portal-student.html`)

#### 4.1.1. Registration & In-Place Mutation
Replace the old `window.addEventListener('new_notification_received', () => { checkNotifications(); });` with in-place array mutation and UI re-render:

```javascript
// In portal-student.html init()
if (typeof NotificationManager !== 'undefined') {
    NotificationManager.subscribeToNotifications({
        id: student.academicId || student.id,
        academicId: student.academicId || student.id,
        classId: student.classId,
        schoolId: student.schoolId
    });

    // In-Place Realtime Update (0 Firestore Queries)
    window.addEventListener('new_notification_received', (event) => {
        const notif = event.detail;
        if (!notif) return;

        window.studentNotifications = window.studentNotifications || [];
        const existingIdx = window.studentNotifications.findIndex(n => n.id === notif.id);
        if (existingIdx >= 0) {
            window.studentNotifications[existingIdx] = notif;
        } else {
            window.studentNotifications.unshift(notif);
        }
        window.studentNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // 1. Immediately activate unread badge
        const badge = document.getElementById('notifBadge');
        if (badge) badge.classList.remove('hidden');

        // 2. If notification drawer is open, re-render list instantly
        const overlay = document.getElementById('notifOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            renderNotificationList();
        }
    });
}
```

#### 4.1.2. Decoupled UI Renderer (`renderNotificationList`)
Refactor the drawer HTML generation into a standalone helper so both drawer opening and real-time push events can render with zero code duplication:

```javascript
function renderNotificationList() {
    const list = document.getElementById('notifList');
    if (!list) return;

    let enableBtnHtml = '';
    if (typeof NotificationManager !== 'undefined' && !NotificationManager.isPermissionGranted()) {
        enableBtnHtml = `
            <div class="mb-6 p-5 rounded-[2rem] bg-primary/5 border border-primary/10 flex flex-col gap-4 animate-fade-in">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <span class="material-symbols-outlined">notifications_active</span>
                    </div>
                    <div>
                        <h4 class="font-black text-gray-800 text-sm">تفعيل التنبيهات</h4>
                        <p class="text-[10px] text-gray-500 font-bold leading-tight">لم تقم بتفعيل التنبيهات على هذا الجهاز بعد.</p>
                    </div>
                </div>
                <button onclick="handleEnableNotifications(this)" class="w-full py-3 bg-primary text-white text-[10px] font-black rounded-xl shadow-none shadow-primary/20 active:none transition-all none-primary">تفعيل الآن</button>
            </div>
        `;
    }

    if (!window.studentNotifications || window.studentNotifications.length === 0) {
        list.innerHTML = enableBtnHtml + '<div class="p-12 text-center text-gray-400 text-sm font-bold">لا توجد إشعارات</div>';
        return;
    }

    list.innerHTML = enableBtnHtml + window.studentNotifications.map(n => `
        <div class="liquid-glass liquid-glass-prominent p-4 rounded-2xl border border-black/5">
            <div class="flex justify-between items-start mb-2">
                <h4 class="font-black text-gray-800 text-sm">${n.title || ''}</h4>
                <p class="text-[9px] font-bold text-gray-400">${n.timestamp ? new Date(n.timestamp).toLocaleDateString('ar-SA') : ''}</p>
            </div>
            <p class="text-xs text-gray-600 leading-relaxed mb-3 font-medium">${n.message || ''}</p>
            ${n.image ? `<img src="${UI.formatImgUrl(n.image)}" onclick="UI.viewImage(this.src)" class="w-full h-40 rounded-2xl object-cover mb-2 border border-black/10 cursor-pointer interactive">` : ''}
        </div>
    `).join('');
}

function openNotifications() {
    const overlay = document.getElementById('notifOverlay');
    const panel = document.getElementById('notifPanel');

    overlay.classList.remove('hidden');
    setTimeout(() => panel.classList.remove('translate-x-full'), 10);

    // Mark as seen
    if (window.currentStudent) {
        localStorage.setItem(`notif_count_${window.currentStudent.academicId}`, (window.studentNotifications || []).length);
        const badge = document.getElementById('notifBadge');
        if (badge) badge.classList.add('hidden');
    }

    renderNotificationList();
}
```

---

### 4.2. Parent Portal Optimization (`portal-parent.html`)

#### 4.2.1. Multi-Child Subscription & In-Place Handling
Enable real-time notification subscription across all linked children in `portal-parent.html`:

```javascript
function subscribeToAllChildren(myStudents) {
    if (typeof NotificationManager === 'undefined' || !myStudents || !myStudents.length) return;

    const studentIds = myStudents.map(s => s.academicId || s.id);
    const classIds = myStudents.map(s => s.classId).filter(Boolean);
    const schoolId = myStudents[0]?.schoolId || null;

    NotificationManager.subscribeToNotifications({
        studentIds: studentIds,
        classIds: classIds,
        isParent: true,
        schoolId: schoolId
    });

    window.addEventListener('new_notification_received', (event) => {
        const notif = event.detail;
        if (!notif) return;

        window.parentNotifications = window.parentNotifications || [];
        const existingIdx = window.parentNotifications.findIndex(n => n.id === notif.id);
        if (existingIdx >= 0) {
            window.parentNotifications[existingIdx] = notif;
        } else {
            window.parentNotifications.unshift(notif);
        }
        window.parentNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const badge = document.getElementById('notifBadge');
        if (badge) badge.classList.remove('hidden');

        const overlay = document.getElementById('notifOverlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            renderParentNotificationList();
        }
    });
}
```

---

## 5. Complete Proposed Replacement Code

### 5.1. `scripts/utils-notifications.js` (Complete File Replacement)

```javascript
/**
 * @fileoverview Notification Manager & Push Alerts Engine
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

const NotificationManager = {
    _unsubscribe: null,
    _activeSchoolId: null,
    _activeTarget: null,
    _isSubscribing: false,

    async init() {
        if (!('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return;
        }

        // Increment visit counter
        let visits = parseInt(localStorage.getItem('notif_visits') || '0');
        visits++;
        localStorage.setItem('notif_visits', visits);

        // Bind auto-cleanup on window unload
        if (typeof window !== 'undefined') {
            window.addEventListener('beforeunload', () => this.unsubscribe());
            window.addEventListener('pagehide', () => this.unsubscribe());
        }

        // If already granted, no need for auto-prompt
        if (this.isPermissionGranted()) return;

        // Path and User check
        if (!this.isEligiblePageAndUser()) return;

        // Logic: Show on 1st visit, then every 5th visit (5, 10, 15...)
        if (visits === 1 || visits % 5 === 0) {
            console.log(`NotificationManager: Auto-prompting on visit #${visits}`);
            setTimeout(() => this.showInitialPrompt(), 2500);
        }
    },

    isEligiblePageAndUser() {
        const path = window.location.pathname;
        const isStudentPortal = path.includes('portal-student.html');
        const isLoginPage = path.includes('index.html') || path.endsWith('/') || path.endsWith('attendance/');
        
        if (!isStudentPortal && !isLoginPage) return false;

        const currentUser = localStorage.getItem('attendance_current_user');
        if (currentUser) {
            try {
                const user = JSON.parse(currentUser);
                if (user.role === 'admin' || user.role === 'teacher') return false;
            } catch(e) {}
        }
        return true;
    },

    isPermissionGranted() {
        try {
            return ('Notification' in window) && Notification.permission === 'granted';
        } catch (e) {
            return false;
        }
    },

    async requestPermissionManually() {
        const granted = await this.requestPermission();
        if (granted) {
            this.sendLocalNotification('تم تفعيل التنبيهات ✨', 'ستصلك الآن تنبيهات الحضور والغياب مباشرة على شريط الإشعارات.');
        }
        return granted;
    },

    showInitialPrompt() {
        // Clean up any existing modal
        const existing = document.getElementById('notif-prompt-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'notif-prompt-modal';
        modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 animate-fade-in';
        modal.innerHTML = `
            <div class="bg-white rounded-[2.5rem] p-8 max-w-sm w-full border border-white/20 transform transition-all scale-100">
                <div class="flex flex-col items-center text-center">
                    <div class="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center text-primary mb-6">
                        <span class="material-symbols-outlined text-4xl" style="font-variation-settings: 'FILL' 1">notifications_active</span>
                    </div>
                    <h2 class="text-2xl font-black text-gray-800 mb-2">تفعيل التنبيهات</h2>
                    <p class="text-gray-500 text-sm font-medium leading-relaxed mb-8 px-4">لضمان وصول إشعارات الحضور والغياب والإعلانات الهامة في وقتها الحقيقي</p>
                    <button id="btn-allow-notif" class="w-full bg-primary text-white py-4 rounded-2xl font-black active:scale-95 transition-all hover:brightness-110">
                        تفعيل الآن
                    </button>
                    <button id="btn-deny-notif" class="w-full py-4 text-gray-400 font-bold active:scale-95 transition-all">
                        ليس الآن، ربما لاحقاً
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('btn-allow-notif').onclick = async () => {
            await this.requestPermissionManually();
            modal.classList.add('opacity-0');
            setTimeout(() => modal.remove(), 400);
        };

        document.getElementById('btn-deny-notif').onclick = () => {
            modal.classList.add('opacity-0');
            setTimeout(() => modal.remove(), 400);
        };
    },

    async requestPermission() {
        try {
            if (!('Notification' in window)) return false;
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (e) {
            console.error('Permission request failed', e);
            return false;
        }
    },

    async sendLocalNotification(title, body, url = '/') {
        console.log('📢 Notification Triggered:', title);
        
        if (!('Notification' in window)) {
            console.error('❌ This browser does not support notifications.');
            return;
        }
        
        if (Notification.permission !== 'granted') {
            console.warn('⚠️ Notification permission not granted. Current status:', Notification.permission);
            return;
        }

        const options = {
            body: body,
            icon: 'assets/brand-logo.png',
            badge: 'assets/brand-logo.png',
            dir: 'rtl',
            tag: 'attendance-alert',
            renotify: true,
            vibrate: [200, 100, 200],
            requireInteraction: true
        };

        // Show internal toast as fallback
        if (typeof UI !== 'undefined') {
            UI.toast('🔔 ' + title + ': ' + body);
        }

        // Method 1: Standard Window Notification (Faster on Localhost)
        try {
            const n = new Notification(title, options);
            n.onclick = function(e) {
                e.preventDefault();
                window.focus();
                this.close();
            };
            console.log('✅ Notification sent via Window Constructor');
            return;
        } catch (err) {
            console.warn('🛠 Window Notification failed, trying SW...', err);
        }

        // Method 2: Try via Service Worker
        try {
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.ready;
                if (registration) {
                    await registration.showNotification(title, options);
                    console.log('✅ Notification sent via Service Worker');
                }
            }
        } catch (err) {
            console.error('❌ All notification methods failed:', err);
        }
    },

    /**
     * Determines whether an incoming notification matches the target filter.
     * @private
     */
    _isTargetMatch(notif, target) {
        if (!notif) return false;
        if (!target || Object.keys(target).length === 0) return true;

        // 1. Broadcasts to all members of the school
        if (notif.targetType === 'all') return true;

        const notifTargetId = notif.targetId ? String(notif.targetId) : null;
        if (!notifTargetId) return false;

        // 2. Class-targeted notifications
        if (notif.targetType === 'class') {
            if (target.classId && String(target.classId) === notifTargetId) return true;
            if (Array.isArray(target.classIds) && target.classIds.map(String).includes(notifTargetId)) return true;
        }

        // 3. Student-targeted notifications
        if (notif.targetType === 'student') {
            if (target.id && String(target.id) === notifTargetId) return true;
            if (target.academicId && String(target.academicId) === notifTargetId) return true;
            if (Array.isArray(target.studentIds) && target.studentIds.map(String).includes(notifTargetId)) return true;
        }

        // 4. Parent-targeted notifications
        if (notif.targetType === 'parent') {
            if (target.isParent) {
                if (target.id && String(target.id) === notifTargetId) return true;
                if (target.parentId && String(target.parentId) === notifTargetId) return true;
                if (Array.isArray(target.studentIds) && target.studentIds.map(String).includes(notifTargetId)) return true;
            }
        }

        return false;
    },

    /**
     * Listens for new notifications in real-time with multi-tenant scoping (schoolId),
     * proper unsubscribe lifecycle retention, and in-place cache invalidation.
     * 
     * @param {Object} [target={}] - { id, academicId, classId, studentIds, classIds, isParent, schoolId }
     * @returns {Promise<Function|null>} Returns the unsubscribe function
     */
    async subscribeToNotifications(target = {}) {
        if (typeof DB === 'undefined') {
            console.warn('NotificationManager: DB module not available, subscription aborted.');
            return null;
        }

        // Clean up previous active subscription
        this.unsubscribe();

        this._isSubscribing = true;
        this._activeTarget = { ...target };

        try {
            await DB.init();
            if (!this._isSubscribing) return null;

            const schoolId = target.schoolId || DB.getCurrentUserSchoolId();
            this._activeSchoolId = schoolId;

            let query = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);

            // Strict Multi-Tenant Scoping
            if (schoolId && schoolId !== 'ministry' && schoolId !== 'global') {
                query = query.where('schoolId', '==', schoolId);
            }

            // Order by timestamp descending and limit to 10 most recent
            query = query.orderBy('timestamp', 'desc').limit(10);

            // Flag to suppress push notifications for existing database history on connect
            let isInitialLoad = true;

            const unsubscribeFn = query.onSnapshot(snapshot => {
                if (isInitialLoad) {
                    isInitialLoad = false;
                    return;
                }

                snapshot.docChanges().forEach(change => {
                    const docData = change.doc.data() || {};
                    const notif = { id: change.doc.id, ...docData };

                    if (change.type === 'added') {
                        if (this._isTargetMatch(notif, this._activeTarget)) {
                            console.log('📢 Real-time notification received:', notif);

                            // Invalidate local cache in core-db.js without triggering network reads
                            if (typeof DB !== 'undefined' && DB.invalidateCache) {
                                DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, {
                                    schoolId: notif.schoolId || schoolId,
                                    broadcast: false
                                });
                            }

                            // Trigger OS/Browser push notification & UI toast
                            this.sendLocalNotification(notif.title || 'إشعار جديد', notif.message || '', notif.url || '/');

                            // Dispatch in-place UI update event with complete notification object
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('new_notification_received', {
                                    detail: notif
                                }));
                            }
                        }
                    } else if (change.type === 'modified') {
                        if (this._isTargetMatch(notif, this._activeTarget)) {
                            if (typeof DB !== 'undefined' && DB.invalidateCache) {
                                DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, {
                                    schoolId: notif.schoolId || schoolId,
                                    broadcast: false
                                });
                            }
                            if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('notification_modified', { detail: notif }));
                            }
                        }
                    } else if (change.type === 'removed') {
                        if (typeof DB !== 'undefined' && DB.invalidateCache) {
                            DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, {
                                schoolId: notif.schoolId || schoolId,
                                broadcast: false
                            });
                        }
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('notification_deleted', { detail: { id: change.doc.id } }));
                        }
                    }
                });
            }, err => {
                console.warn('Hodoori Notifications: Realtime snapshot listener notice:', err ? err.message : err);
            });

            this._unsubscribe = unsubscribeFn;
            this._isSubscribing = false;
            return unsubscribeFn;

        } catch (error) {
            console.error('NotificationManager: Failed to subscribe to notifications:', error);
            this._isSubscribing = false;
            return null;
        }
    },

    /**
     * Detaches and cleans up the active Firestore realtime snapshot listener.
     * @returns {boolean} True if a listener was detached, false otherwise.
     */
    unsubscribe() {
        this._isSubscribing = false;
        if (typeof this._unsubscribe === 'function') {
            try {
                this._unsubscribe();
                console.log('NotificationManager: Unsubscribed successfully from real-time notifications.');
            } catch (err) {
                console.warn('NotificationManager: Error during unsubscribe:', err);
            }
            this._unsubscribe = null;
            this._activeSchoolId = null;
            this._activeTarget = null;
            return true;
        }
        return false;
    }
};

// Auto-init on page load
window.addEventListener('DOMContentLoaded', () => NotificationManager.init());

if (typeof window !== 'undefined') {
    window.NotificationManager = NotificationManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationManager;
}
```

---

## 6. Implementation Changes for Consuming Portals

### 6.1. `portal-student.html` Diff Specification

#### Change A: Listener Setup & In-Place Event Registration (Lines 270–281)

```diff
-                // Subscribe to real-time notifications
-                if (typeof NotificationManager !== 'undefined') {
-                    NotificationManager.subscribeToNotifications({
-                        id: student.id,
-                        classId: student.classId
-                    });
-                    
-                    // Refresh the notification red dot if a new one is received
-                    window.addEventListener('new_notification_received', () => {
-                        checkNotifications();
-                    });
-                }
+                // Subscribe to real-time notifications with in-place state updates (0 cascading queries)
+                if (typeof NotificationManager !== 'undefined') {
+                    NotificationManager.subscribeToNotifications({
+                        id: student.academicId || student.id,
+                        academicId: student.academicId || student.id,
+                        classId: student.classId,
+                        schoolId: student.schoolId
+                    });
+                    
+                    // In-place notification update: NO query cascade!
+                    window.addEventListener('new_notification_received', (event) => {
+                        const notif = event.detail;
+                        if (!notif) return;
+                        
+                        window.studentNotifications = window.studentNotifications || [];
+                        const existingIdx = window.studentNotifications.findIndex(n => n.id === notif.id);
+                        if (existingIdx >= 0) {
+                            window.studentNotifications[existingIdx] = notif;
+                        } else {
+                            window.studentNotifications.unshift(notif);
+                        }
+                        window.studentNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
+                        
+                        const badge = document.getElementById('notifBadge');
+                        if (badge) badge.classList.remove('hidden');
+                        
+                        const overlay = document.getElementById('notifOverlay');
+                        if (overlay && !overlay.classList.contains('hidden')) {
+                            renderNotificationList();
+                        }
+                    });
+                }
```

#### Change B: Drawer Rendering Extraction (Lines 470–518)

```diff
+        function renderNotificationList() {
+            const list = document.getElementById('notifList');
+            if (!list) return;
+
+            let enableBtnHtml = '';
+            if (typeof NotificationManager !== 'undefined' && !NotificationManager.isPermissionGranted()) {
+                enableBtnHtml = `
+                    <div class="mb-6 p-5 rounded-[2rem] bg-primary/5 border border-primary/10 flex flex-col gap-4 animate-fade-in">
+                        <div class="flex items-center gap-4">
+                            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
+                                <span class="material-symbols-outlined">notifications_active</span>
+                            </div>
+                            <div>
+                                <h4 class="font-black text-gray-800 text-sm">تفعيل التنبيهات</h4>
+                                <p class="text-[10px] text-gray-500 font-bold leading-tight">لم تقم بتفعيل التنبيهات على هذا الجهاز بعد.</p>
+                            </div>
+                        </div>
+                        <button onclick="handleEnableNotifications(this)" class="w-full py-3 bg-primary text-white text-[10px] font-black rounded-xl shadow-none shadow-primary/20 active:none transition-all none-primary">تفعيل الآن</button>
+                    </div>
+                `;
+            }
+
+            if (!window.studentNotifications || window.studentNotifications.length === 0) {
+                list.innerHTML = enableBtnHtml + '<div class="p-12 text-center text-gray-400 text-sm font-bold">لا توجد إشعارات</div>';
+                return;
+            }
+
+            list.innerHTML = enableBtnHtml + window.studentNotifications.map(n => `
+                <div class="liquid-glass liquid-glass-prominent p-4 rounded-2xl border border-black/5">
+                    <div class="flex justify-between items-start mb-2">
+                        <h4 class="font-black text-gray-800 text-sm">${n.title || ''}</h4>
+                        <p class="text-[9px] font-bold text-gray-400">${n.timestamp ? new Date(n.timestamp).toLocaleDateString('ar-SA') : ''}</p>
+                    </div>
+                    <p class="text-xs text-gray-600 leading-relaxed mb-3 font-medium">${n.message || ''}</p>
+                    ${n.image ? `<img src="${UI.formatImgUrl(n.image)}" onclick="UI.viewImage(this.src)" class="w-full h-40 rounded-2xl object-cover mb-2 border border-black/10 cursor-pointer interactive">` : ''}
+                </div>
+            `).join('');
+        }

         function openNotifications() {
             const overlay = document.getElementById('notifOverlay');
             const panel = document.getElementById('notifPanel');
-            const list = document.getElementById('notifList');

             overlay.classList.remove('hidden');
             setTimeout(() => panel.classList.remove('translate-x-full'), 10);

             // Mark as seen
             if (window.currentStudent) {
-                localStorage.setItem(`notif_count_${window.currentStudent.academicId}`, window.studentNotifications.length);
-                document.getElementById('notifBadge').classList.add('hidden');
+                localStorage.setItem(`notif_count_${window.currentStudent.academicId}`, (window.studentNotifications || []).length);
+                const badge = document.getElementById('notifBadge');
+                if (badge) badge.classList.add('hidden');
             }

-            // Permission check button
-            let enableBtnHtml = '';
-            if (typeof NotificationManager !== 'undefined' && !NotificationManager.isPermissionGranted()) {
-                enableBtnHtml = `
-                    <div class="mb-6 p-5 rounded-[2rem] bg-primary/5 border border-primary/10 flex flex-col gap-4 animate-fade-in">
-                        <div class="flex items-center gap-4">
-                            <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
-                                <span class="material-symbols-outlined">notifications_active</span>
-                            </div>
-                            <div>
-                                <h4 class="font-black text-gray-800 text-sm">تفعيل التنبيهات</h4>
-                                <p class="text-[10px] text-gray-500 font-bold leading-tight">لم تقم بتفعيل التنبيهات على هذا الجهاز بعد.</p>
-                            </div>
-                        </div>
-                        <button onclick="handleEnableNotifications(this)" class="w-full py-3 bg-primary text-white text-[10px] font-black rounded-xl shadow-none shadow-primary/20 active:none transition-all none-primary">تفعيل الآن</button>
-                    </div>
-                `;
-            }
-
-            if (!window.studentNotifications || window.studentNotifications.length === 0) {
-                list.innerHTML = enableBtnHtml + '<div class="p-12 text-center text-gray-400 text-sm font-bold">لا توجد إشعارات</div>';
-                return;
-            }
-
-            list.innerHTML = enableBtnHtml + window.studentNotifications.map(n => `
-                <div class="liquid-glass liquid-glass-prominent p-4 rounded-2xl border border-black/5">
-                    <div class="flex justify-between items-start mb-2">
-                        <h4 class="font-black text-gray-800 text-sm">${n.title}</h4>
-                        <p class="text-[9px] font-bold text-gray-400">${new Date(n.timestamp).toLocaleDateString('ar-SA')}</p>
-                    </div>
-                    <p class="text-xs text-gray-600 leading-relaxed mb-3 font-medium">${n.message}</p>
-                    ${n.image ? `<img src="${UI.formatImgUrl(n.image)}" onclick="UI.viewImage(this.src)" class="w-full h-40 rounded-2xl object-cover mb-2 border border-black/10 cursor-pointer interactive">` : ''}
-                </div>
-            `).join('');
+            renderNotificationList();
         }
```

---

## 7. Verification & Acceptance Criteria Matrix

| # | Verification Criterion | Pre-Optimization State | Target Optimized State | Verification Protocol |
|---|---|---|---|---|
| **V1** | Multi-Tenant Scoping | Query: `collection('v2_notifications').orderBy('timestamp')` (All Schools) | Query: `.where('schoolId', '==', 's1')` (Tenant-scoped) | Inspect Firestore query constraints via unit/mock tests. Verify School B receives 0 events when School A notification is created. |
| **V2** | Listener Unsubscribe Handle | Returned handle discarded in `.then()`; `_unsubscribe` property missing. | `NotificationManager.unsubscribe()` cleanly invokes Firestore unsubscribe closure and resets state. | Invoke `NotificationManager.subscribeToNotifications()`, assert returned function is callable, invoke `unsubscribe()`, verify listener detached. |
| **V3** | Query Cascade Elimination | Snapshot arrival triggers `checkNotifications()`, firing 3–4 Firestore `get()` calls. | Snapshot arrival updates `window.studentNotifications` in-place; **0 Firestore queries**. | Monitor `DB._inflightQueries` and network traffic on `new_notification_received` event; assert 0 Firestore calls. |
| **V4** | Initial Load Sound Suppression | Initial snapshot items trigger sound and browser toasts on page open. | `isInitialLoad` suppresses push for existing history; only subsequent `added` events fire push. | Mount listener with existing documents in collection; assert 0 browser alerts on first tick. |
| **V5** | Parent Multi-Child Matching | Parent portal had stubbed listener (`subscribeToAllChildren`). | Matches against array of `studentIds` and `classIds` in `_isTargetMatch`. | Send notification targeted to Child 2; verify parent listening for `{ studentIds: [Child 1, Child 2] }` receives and updates UI. |
| **V6** | Core DB Cache Invalidation | L1 cache was not synchronized on snapshot event. | `DB.invalidateCache(DB.KEYS.NOTIFICATIONS)` evicted locally without network roundtrip. | Check `DB.getCacheStats().invalidations` increments when snapshot change arrives. |

---

## 8. Interface Contract & Cross-Module Dependencies

### 8.1. `NotificationManager` Public API Contract

```typescript
interface NotificationTarget {
    id?: string;
    academicId?: string;
    classId?: string;
    studentIds?: string[];
    classIds?: string[];
    isParent?: boolean;
    schoolId?: string;
}

interface NotificationManagerAPI {
    init(): Promise<void>;
    isPermissionGranted(): boolean;
    requestPermissionManually(): Promise<boolean>;
    sendLocalNotification(title: string, body: string, url?: string): Promise<void>;
    subscribeToNotifications(target?: NotificationTarget): Promise<(() => void) | null>;
    unsubscribe(): boolean;
}
```

### 8.2. Event Payload Contracts

#### `new_notification_received` (Window CustomEvent)
```javascript
{
    detail: {
        id: "notif_doc_id_123",
        title: "تنبيه غياب",
        message: "تم تسجيل غياب الطالب في الحصة الأولى",
        targetType: "student", // "all" | "class" | "student" | "parent"
        targetId: "2024001",
        schoolId: "s1",
        timestamp: "2026-08-29T18:00:00.000Z",
        image?: "data:image/jpeg;base64,..."
    }
}
```
