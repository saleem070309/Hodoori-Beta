# Milestone 2 Technical Specification: Polling, Rendering Deduplication, Lifecycle Management & Targeted Queries

**Author:** Explorer Agent (Dashboard Polling & Lifecycle Specifier)  
**Date:** 2026-08-29  
**Status:** READY FOR IMPLEMENTATION (Milestone 2)  
**Target Files:**
- `dashboard-admin.html`
- `dashboard-teacher.html`
- `portal-student.html`
- `portal-parent.html`
- `scripts/core-auth.js`
- `scripts/utils-notifications.js`
- `scripts/core-db.js`
- `index.html`

---

## 1. Executive Summary & Architecture Overview

Milestone 2 eliminates all remaining frontend polling leaks, query amplification cascades, and full collection scans across the Hodoori educational platform. Following the successful implementation of the Smart L1 Cache and Persistence Layer in Milestone 1 (`scripts/core-db.js`), Milestone 2 refactors client-side components to consume cached data deterministically and enforce strict lifecycle management.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                FRONTEND CONSUMER PORTALS                               │
├───────────────────────────────┬───────────────────────────────┬────────────────────────┤
│     dashboard-admin.html      │    dashboard-teacher.html     │ portal-student / parent│
│  - Absence Alarm Scheduler    │  - Class Selection State      │ - Direct Target Lookup │
│  - RenderAll Deduplication    │  - Class Reset Caching        │ - In-Place Notifs      │
│  - PageLifecycleManager       │  - Zero Cloud Query Switching │ - Lifecycle Cleanup    │
└───────────────┬───────────────┴───────────────┬───────────────┴────────────┬───────────┘
                │                               │                            │
                ▼                               ▼                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           CENTRALIZED UTILITIES & AUTH LAYER                           │
├───────────────────────────────────────────────┬────────────────────────────────────────┤
│           scripts/core-auth.js                │      scripts/utils-notifications.js    │
│  - Targeted equality query (limit 1)          │  - Multi-tenant schoolId scoping       │
│  - 0 full teacher collection scans            │  - Clean unsubscribe lifecycle         │
└───────────────────────────────────────┬───────┴────────────────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        scripts/core-db.js (Smart Data Layer - M1)                      │
│   ├── L1 Cache (15-min Settings TTL, 5-min Students TTL, 3-min Records TTL)            │
│   ├── In-Flight Promise Coalescing Wrapper (_coalesce)                                 │
│   └── Multi-Tab IndexedDB Persistence & BroadcastChannel Sync                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Specification 1: Absence Alarm Background Polling Optimization

### 2.1. Problem & Current Flaws (`dashboard-admin.html:4120-4201`)
1. **Unthrottled 60s Interval (`dashboard-admin.html:4181-4201`)**:
   - `setInterval(async () => { const settings = (await DB.getSettings()) || {}; ... }, 60000)` runs 24/7 without checking whether the browser tab is hidden or active.
   - When triggered, it invokes `triggerAbsenceNotificationsNow(true)`.
2. **Full Collection Scan & Query Multiplication (`dashboard-admin.html:4135-4144`)**:
   - `const records = await DB.getCollection(DB.KEYS.RECORDS);` scans **all historical attendance records** across the school's entire history.
   - In the inner loop `for (const r of todayRecords)`:
     `const classStudents = await DB.getStudents(r.classId);` executes a new query per class, causing an $O(N)$ query multiplication.

### 2.2. Solution & Technical Design
1. **Lifecycle Registration**: Divert the `setInterval` to `PageLifecycle.registerInterval('absence_alarm', ...)`. This automatically halts the timer when `document.hidden === true` and resumes when visible.
2. **Cached Settings Read**: `DB.getSettings()` resolves directly from L1 cache (15-minute TTL). Result: **0 cloud reads** during normal 60s ticks.
3. **Date-Bounded Attendance Query**: Replace `DB.getCollection(DB.KEYS.RECORDS)` with `DB.getTodayRecords()`. This fetches only records where `date == todayStr` (3-minute TTL).
4. **Cached Student Lookups**: Pre-fetch or filter students using cached data, avoiding redundant per-class round-trips.

### 2.3. Precise Implementation / Diff

#### Target File: `dashboard-admin.html`

```javascript
// BEFORE (Lines 4120 - 4201)
// -------------------------------------------------------------
window.triggerAbsenceNotificationsNow = async function(isAuto = false) {
    const settings = (await DB.getSettings()) || {};
    const classesToNotify = isAuto ? (settings.absenceAlarmClasses || []) : selectedAlarmClasses;

    if (classesToNotify.length === 0) {
        if (!isAuto) UI.toast('يرجى تحديد فصل واحد على الأقل', 'error');
        return;
    }

    if (isAuto || await UI.confirm('تأكيد الإرسال الفوري', `هل تريد إرسال إشعارات غياب داخلية لـ ${classesToNotify.length} فصول؟`)) {
        if (!isAuto) UI.setLoading(true);
        try {
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

            const records = await DB.getCollection(DB.KEYS.RECORDS);
            const todayRecords = records.filter(r => r.date === todayStr && classesToNotify.includes(r.classId));

            let absentCount = 0;
            for (const r of todayRecords) {
                const absentees = r.details.filter(d => d.status === 'absent');
                if (absentees.length === 0) continue;

                const classStudents = await DB.getStudents(r.classId);

                for (const item of absentees) {
                    const student = classStudents.find(s => s.id === item.studentId || s.academicId === item.studentId);
                    const studentName = student ? student.name : 'الطالب';

                    await DB.addNotification({
                        title: 'تنبيه غياب',
                        message: `نحيطكم علماً بأن الطالب ${studentName} غائب اليوم الموافق ${todayStr}. يرجى متابعة حالة الطالب من خلال البوابة.`,
                        targetType: 'parent',
                        targetId: student ? (student.academicId || student.id) : item.studentId,
                        type: 'absence_alert'
                    });
                    absentCount++;
                }
            }

            if (absentCount === 0) {
                if (!isAuto) UI.toast('لا يوجد طلاب غائبين في الفصول المختارة اليوم', 'info');
            } else {
                UI.toast(isAuto ? `تنبيه تلقائي: تم إرسال ${absentCount} إشعار غياب` : `تم بنجاح! تم إرسال ${absentCount} إشعاراً داخلياً لأولياء الأمور.`);

                if (isAuto) {
                    settings.lastAlarmSentDate = todayStr;
                    await DB.saveSettings(settings);
                }
            }
            if (!isAuto) window.closeAbsenceAlarmModal();
        } catch (err) {
            console.error('Alarm Error:', err);
            if (!isAuto) UI.toast('فشل في إرسال الإشعارات', 'error');
        } finally {
            if (!isAuto) UI.setLoading(false);
        }
    }
};

// Background Scheduler (Checks every minute)
setInterval(async () => {
    const settings = (await DB.getSettings()) || {};
    if (!settings.customization?.['plugin-absence']) return;

    const now = new Date();
    const currentDay = now.getDay(); // 0 is Sunday, etc.
    const pad = n => String(n).padStart(2, '0');
    const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const scheduledTime = settings.absenceAlarmTime || '08:00';
    const scheduledDays = settings.absenceAlarmDays || [0, 1, 2, 3, 4];

    if (currentTime === scheduledTime &&
        scheduledDays.includes(currentDay) &&
        settings.lastAlarmSentDate !== todayStr) {

        console.log('Automated Absence Alarm Triggered');
        triggerAbsenceNotificationsNow(true);
    }
}, 60000);
```

```javascript
// AFTER (Optimized M2 Implementation)
// -------------------------------------------------------------
window.triggerAbsenceNotificationsNow = async function(isAuto = false) {
    // 1. Reads settings directly from L1 cache (15m TTL)
    const settings = (await DB.getSettings()) || {};
    const classesToNotify = isAuto ? (settings.absenceAlarmClasses || []) : selectedAlarmClasses;

    if (classesToNotify.length === 0) {
        if (!isAuto) UI.toast('يرجى تحديد فصل واحد على الأقل', 'error');
        return;
    }

    if (isAuto || await UI.confirm('تأكيد الإرسال الفوري', `هل تريد إرسال إشعارات غياب داخلية لـ ${classesToNotify.length} فصول؟`)) {
        if (!isAuto) UI.setLoading(true);
        try {
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

            // 2. Date-bounded attendance query (0 historical scans)
            const allTodayRecords = await DB.getTodayRecords();
            const todayRecords = (allTodayRecords || []).filter(r => classesToNotify.includes(r.classId));

            if (todayRecords.length === 0) {
                if (!isAuto) UI.toast('لا يوجد تقارير حضور مسجلة للفصول المختارة اليوم', 'info');
                return;
            }

            // 3. In-Memory cached student lookup (reusing L1 cached student catalog)
            const allStudents = await DB.getStudents();
            const studentMap = new Map();
            allStudents.forEach(s => {
                studentMap.set(s.id, s);
                if (s.academicId) studentMap.set(s.academicId, s);
            });

            let absentCount = 0;
            const notificationPromises = [];

            for (const r of todayRecords) {
                const absentees = (r.details || []).filter(d => d.status === 'absent');
                if (absentees.length === 0) continue;

                for (const item of absentees) {
                    const student = studentMap.get(item.studentId);
                    const studentName = student ? student.name : 'الطالب';
                    const targetId = student ? (student.academicId || student.id) : item.studentId;

                    notificationPromises.push(
                        DB.addNotification({
                            title: 'تنبيه غياب',
                            message: `نحيطكم علماً بأن الطالب ${studentName} غائب اليوم الموافق ${todayStr}. يرجى متابعة حالة الطالب من خلال البوابة.`,
                            targetType: 'parent',
                            targetId: targetId,
                            type: 'absence_alert'
                        })
                    );
                    absentCount++;
                }
            }

            if (notificationPromises.length > 0) {
                await Promise.all(notificationPromises);
            }

            if (absentCount === 0) {
                if (!isAuto) UI.toast('لا يوجد طلاب غائبين في الفصول المختارة اليوم', 'info');
            } else {
                UI.toast(isAuto ? `تنبيه تلقائي: تم إرسال ${absentCount} إشعار غياب` : `تم بنجاح! تم إرسال ${absentCount} إشعاراً داخلياً لأولياء الأمور.`);

                if (isAuto) {
                    settings.lastAlarmSentDate = todayStr;
                    await DB.saveSettings(settings);
                }
            }
            if (!isAuto) window.closeAbsenceAlarmModal();
        } catch (err) {
            console.error('Alarm Error:', err);
            if (!isAuto) UI.toast('فشل في إرسال الإشعارات', 'error');
        } finally {
            if (!isAuto) UI.setLoading(false);
        }
    }
};

// Background Scheduler Registered with Universal Page Lifecycle Manager
if (typeof PageLifecycle !== 'undefined') {
    PageLifecycle.registerInterval('absence_alarm_scheduler', async () => {
        const settings = (await DB.getSettings()) || {};
        if (!settings.customization?.['plugin-absence']) return;

        const now = new Date();
        const currentDay = now.getDay();
        const pad = n => String(n).padStart(2, '0');
        const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        const scheduledTime = settings.absenceAlarmTime || '08:00';
        const scheduledDays = settings.absenceAlarmDays || [0, 1, 2, 3, 4];

        if (currentTime === scheduledTime &&
            scheduledDays.includes(currentDay) &&
            settings.lastAlarmSentDate !== todayStr) {

            console.log('[Lifecycle] Automated Absence Alarm Triggered');
            triggerAbsenceNotificationsNow(true);
        }
    }, 60000);
}
```

---

## 3. Specification 2: Startup & Render Deduplication

### 3.1. Admin Dashboard (`dashboard-admin.html`)

#### Flaws Identified:
1. `dashboard-admin.html:3711-3719` runs `Promise.all([ renderDailyInfo(), populateFilters(), renderReports(), renderTeachers(), renderClasses(), renderNotifications(), syncDirectoryToggles() ])`.
2. Inside `renderDailyInfo()` (line 2185) and `renderReports()` (line 2443), `DB.getCollection(DB.KEYS.RECORDS)` was called separately and directly.
3. `showFullReport(id)` (line 2506) called `DB.getCollection(DB.KEYS.RECORDS)` to locate a single record.

#### Solution & Specification:
- **Promise Coalescing Integration**: `DB.getClasses()`, `DB.getTeachers()`, and `DB.getStudents()` share in-flight promises. When parallel render functions invoke `DB.getClasses()`, exactly **one** network request occurs.
- **Canonical Method Standardization**:
  - Replace `DB.getCollection(DB.KEYS.STUDENTS)` with `DB.getStudents()`.
  - In `showFullReport(id)`, use `DB.getRecordById(id)`.
  - In `renderDailyInfo()`, use `DB.getRecentRecords(30)` or `DB.getTodayRecords()` for daily attendance and weekly trend analytics.

#### Precise Implementation Diff:

```javascript
// In dashboard-admin.html: renderDailyInfo() (Lines 2178 - 2195)
// -------------------------------------------------------------
async function renderDailyInfo() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Standardized to high-performance cached accessors with in-flight coalescing
    const [classes, allRecords, allStudents, teachers] = await Promise.all([
        DB.getClasses(),
        DB.getRecentRecords(30), // Cached 30-day window covering weekly trend + today
        DB.getStudents(),
        DB.getTeachers()
    ]);

    const todayRecs = allRecords.filter(r => r.date === todayStr);
    // ... rest of rendering logic remains unchanged ...
}

// In dashboard-admin.html: showFullReport(id) (Lines 2505 - 2512)
// -------------------------------------------------------------
async function showFullReport(id) {
    // Replaced full collection scan with targeted single-document cached lookup
    const record = await DB.getRecordById(id);
    if (!record) return;
    currentEditingReport = JSON.parse(JSON.stringify(record));
    await renderReportDetailModal();
}
```

---

### 3.2. Teacher Dashboard (`dashboard-teacher.html`)

#### Flaws Identified:
1. `renderClassSelector()` (line 533) calls `DB.getClasses()` and `DB.getRecords(today)`.
2. `selectClass(id)` (line 572) calls `DB.getClasses()` and `DB.getStudents(id)`.
3. `resetClassSelection()` (line 581) calls `renderClassSelector()`, triggering `DB.getClasses()` and `DB.getRecords(today)` repeatedly on every back button click.

#### Solution & Specification:
- Store `teacherClasses` and `todayRecordsCache` in memory.
- `selectClass(id)` looks up class metadata from `teacherClasses` without re-fetching.
- `resetClassSelection()` uses `teacherClasses` and `todayRecordsCache` directly.
- All methods leverage `DB.getTodayRecords()` and `DB.getStudents(id)`.

#### Precise Implementation Diff:

```javascript
// In dashboard-teacher.html (Lines 530 - 585)
// -------------------------------------------------------------
let teacherClassesCache = null;
let todayRecordsCache = null;

async function renderClassSelector(forceRefresh = false) {
    const grid = document.getElementById('classesGrid');
    
    // Use cached in-memory state or fetch with L1 cache coalescing
    if (!teacherClassesCache || forceRefresh) {
        teacherClassesCache = await DB.getClasses();
    }
    if (!todayRecordsCache || forceRefresh) {
        todayRecordsCache = await DB.getTodayRecords();
    }

    const classes = teacherClassesCache;
    const sentClassIds = (todayRecordsCache || []).map(r => r.classId);

    document.getElementById('classSelector').classList.remove('hidden');
    document.getElementById('attendanceView').classList.add('hidden');
    document.getElementById('classNameDisplay').innerText = 'اختر الصف';

    if (!classes || classes.length === 0) {
        grid.innerHTML = '<p class="text-center text-gray-500">لا توجد صفوف مضافة حالياً</p>';
        return;
    }

    grid.innerHTML = classes.map(c => {
        const isSent = sentClassIds.includes(c.id);
        return `
        <div onclick="${isSent ? "UI.toast('تم إرسال تقرير هذا الصف بالفعل اليوم', 'info')" : `selectClass('${c.id}')`}"
            class="liquid-glass ${isSent ? 'opacity-60 grayscale-[0.5]' : 'liquid-glass-interactive liquid-glass-tint-primary'} rounded-xl p-4 sm:p-6 flex items-center justify-between transition-all">
            <div class="flex items-center gap-3 sm:gap-4">
                <div class="liquid-glass-icon ${isSent ? 'bg-gray-200 text-gray-400' : 'icon-primary'} w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center">
                    <span class="material-symbols-outlined text-xl sm:text-2xl">${isSent ? 'lock' : 'class'}</span>
                </div>
                <div>
                    <h3 class="font-bold text-base sm:text-lg ${isSent ? 'text-gray-500' : 'text-gray-800'}">${c.name}</h3>
                    <p class="text-[10px] sm:text-xs text-gray-600">${isSent ? 'تم إرسال التقرير بنجاح ✅' : `الشعبة: ${c.section}`}</p>
                </div>
            </div>
            ${isSent ?
                '<span class="text-[10px] font-black text-gray-400 uppercase tracking-widest">مقفل</span>' :
                '<span class="material-symbols-outlined text-gray-600 text-sm sm:text-base">arrow_back_ios</span>'
            }
        </div>`;
    }).join('');
}

async function selectClass(id) {
    if (!teacherClassesCache) {
        teacherClassesCache = await DB.getClasses();
    }
    currentClass = teacherClassesCache.find(c => c.id === id);
    // getStudents(id) resolves in-memory from L1 cache if all students are cached
    students = await DB.getStudents(id);
    attendance = {};
    students.forEach(s => attendance[s.id] = 'absent');

    renderAttendanceView();
}

async function resetClassSelection() {
    currentClass = null;
    await renderClassSelector(false); // Re-renders without triggering network queries
}
```

---

## 4. Specification 3: Page Visibility & Universal Lifecycle Manager (`PageLifecycleManager`)

### 4.1. Lifecycle Manager Specification

The `PageLifecycleManager` (exposed globally as `window.PageLifecycle`) guarantees:
1. **Background Pausing**: When a tab is hidden (`document.visibilityState === 'hidden'`), background timers are suspended to save CPU, battery, and network.
2. **Clean Resumption**: When a tab becomes visible (`document.visibilityState === 'visible'`), timers restart. If a recurring interval missed an execution cycle during backgrounding, it can optionally execute immediately.
3. **Leak Prevention**: On `beforeunload` or `pagehide`, all active intervals and Firestore `onSnapshot` listeners are cleaned up and unsubscribed.

### 4.2. Universal Implementation Code

Create or embed `PageLifecycle` in `scripts/core-db.js` (or a dedicated component loaded across all pages):

```javascript
/**
 * Universal Page Visibility & Resource Lifecycle Manager
 * Handles tab visibility states, interval pausing, and listener unsubscriptions.
 */
const PageLifecycle = {
    _intervals: new Map(),     // id -> { callback, ms, runOnResume, timerId, lastRun }
    _listeners: new Set(),     // Set<Function> (unsubscribe functions)
    isPageVisible: typeof document !== 'undefined' ? !document.hidden : true,
    _initialized: false,

    init() {
        if (this._initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
        this._initialized = true;
        this.isPageVisible = !document.hidden;

        // 1. Visibility Change Listener
        document.addEventListener('visibilitychange', () => {
            const wasHidden = !this.isPageVisible;
            this.isPageVisible = !document.hidden;

            if (document.hidden) {
                this.pauseAll();
            } else if (wasHidden) {
                this.resumeAll();
            }
        });

        // 2. Teardown on Page Navigation / Unload
        const cleanup = () => this.cleanupAll();
        window.addEventListener('beforeunload', cleanup);
        window.addEventListener('pagehide', cleanup);
    },

    /**
     * Registers a recurring interval with visibility pausing.
     * @param {string} id - Unique identifier for the interval
     * @param {Function} callback - Function to execute
     * @param {number} ms - Frequency in milliseconds
     * @param {boolean} [runOnResume=false] - Whether to execute callback immediately when tab becomes visible
     */
    registerInterval(id, callback, ms, runOnResume = false) {
        this.init();
        if (this._intervals.has(id)) {
            this.clearInterval(id);
        }

        const descriptor = {
            id,
            callback,
            ms,
            runOnResume,
            timerId: null,
            lastRun: Date.now()
        };

        this._intervals.set(id, descriptor);

        if (this.isPageVisible) {
            descriptor.timerId = setInterval(async () => {
                descriptor.lastRun = Date.now();
                try {
                    await callback();
                } catch (err) {
                    console.error(`[Lifecycle] Error in interval '${id}':`, err);
                }
            }, ms);
        }
    },

    clearInterval(id) {
        if (this._intervals.has(id)) {
            const descriptor = this._intervals.get(id);
            if (descriptor.timerId) {
                clearInterval(descriptor.timerId);
                descriptor.timerId = null;
            }
            this._intervals.delete(id);
        }
    },

    /**
     * Registers an unsubscribe function for a realtime listener (e.g. Firestore onSnapshot).
     * @param {Function} unsubscribeFn
     * @returns {Function} Wrapped disposer function
     */
    registerListener(unsubscribeFn) {
        if (typeof unsubscribeFn !== 'function') return () => {};
        this.init();
        this._listeners.add(unsubscribeFn);
        return () => {
            try { unsubscribeFn(); } catch (_) {}
            this._listeners.delete(unsubscribeFn);
        };
    },

    pauseAll() {
        this._intervals.forEach(desc => {
            if (desc.timerId) {
                clearInterval(desc.timerId);
                desc.timerId = null;
            }
        });
    },

    resumeAll() {
        const now = Date.now();
        this._intervals.forEach(desc => {
            if (!desc.timerId) {
                const elapsed = now - (desc.lastRun || 0);
                if (desc.runOnResume || elapsed >= desc.ms) {
                    desc.lastRun = now;
                    try {
                        desc.callback();
                    } catch (err) {
                        console.error(`[Lifecycle] Error in resume callback '${desc.id}':`, err);
                    }
                }
                desc.timerId = setInterval(async () => {
                    desc.lastRun = Date.now();
                    try {
                        await desc.callback();
                    } catch (err) {
                        console.error(`[Lifecycle] Error in interval '${desc.id}':`, err);
                    }
                }, desc.ms);
            }
        });
    },

    cleanupAll() {
        this.pauseAll();
        this._intervals.clear();
        this._listeners.forEach(unsub => {
            try {
                if (typeof unsub === 'function') unsub();
            } catch (_) {}
        });
        this._listeners.clear();
    }
};

// Global attachment and auto-init
if (typeof window !== 'undefined') {
    window.PageLifecycle = PageLifecycle;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => PageLifecycle.init());
    } else {
        PageLifecycle.init();
    }
}
```

---

## 5. Specification 4: Targeted Login & Lookup Queries

### 5.1. Teacher & Admin Authentication (`scripts/core-auth.js`)

#### Flaw Identified:
In `scripts/core-auth.js:47-50`:
```javascript
await DB.init();
const teachers = await DB.getTeachers();
const user = teachers.find(t => t.ministryId === ministryId && t.password === password);
```
`Auth.login` pulls every teacher record across the system to find one matching username/password.

#### Solution & Specification:
1. Add a dedicated, cached targeted helper `DB.getTeacherByMinistryId(ministryId)` in `scripts/core-db.js`.
2. Execute a single-document equality query with `.limit(1)`:
   ```javascript
   const snap = await this.dbInstance.collection(this.KEYS.TEACHERS)
       .where('ministryId', '==', ministryId)
       .limit(1)
       .get();
   ```
3. Update `Auth.login` in `scripts/core-auth.js` to call `DB.getTeacherByMinistryId(ministryId)`.

#### Implementation Code in `scripts/core-db.js`:
```javascript
/**
 * Fetches a single teacher record by ministry ID using targeted equality query.
 * Replaces full collection scans during login.
 * @param {string} ministryId
 * @param {Object} [options={}]
 * @returns {Promise<Object|null>}
 */
async getTeacherByMinistryId(ministryId, options = {}) {
    if (!ministryId) return null;
    await this.init();
    const cacheKey = `${this.KEYS.TEACHERS}::ministryId_${ministryId}`;

    return this._coalesce(cacheKey, async () => {
        const snap = await this.dbInstance.collection(this.KEYS.TEACHERS)
            .where('ministryId', '==', String(ministryId).trim())
            .limit(1)
            .get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    }, options, this.KEYS.TEACHERS, 'global');
},
```

#### Implementation Code in `scripts/core-auth.js`:
```javascript
// In scripts/core-auth.js: Auth.login (Lines 26 - 64)
async login(ministryId, password) {
    const now = Date.now();
    const expiresAt = now + this.SESSION_TTL_MS;

    // Hardcoded ministry super-account
    if (ministryId === 'MOE2025' && password === 'ministry@2025') {
        const ministryUser = { 
            id: 'ministry-root', 
            name: 'وزارة التعليم', 
            role: 'ministry', 
            ministryId: 'MOE2025',
            loginAt: now,
            expiresAt: expiresAt
        };
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify(ministryUser));
        return { success: true, user: ministryUser };
    }

    // Clear previous session
    localStorage.removeItem(DB.KEYS.CURRENT_USER);
    
    await DB.init();
    // Targeted single-document query (0 full collection scan)
    const user = await DB.getTeacherByMinistryId(ministryId);
    
    if (user && user.password === password) {
        if (user.blocked) return { success: false, message: 'حسابك محظور. يرجى مراجعة الإدارة.' };
        
        const sessionUser = {
            ...user,
            loginAt: now,
            expiresAt: expiresAt
        };
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify(sessionUser));
        return { success: true, user: sessionUser };
    }
    
    return { success: false, message: 'الرقم الوزاري أو كلمة السر غير صحيحة.' };
},
```

---

### 5.2. Student & Parent Login Queries (`index.html`)

#### Flaws Identified:
1. **Parent Login (`index.html:409-412`)**:
   `const allStudents = await DB.getStudents(); const myChildren = allStudents.filter(s => s.phone === input);`
   Fetches all students across all schools to match phone number.
2. **Student Login (`index.html:446-449`)**:
   `const students = await DB.getStudents(); const student = students.find(s => s.academicId === input || s.id === input);`
   Fetches all students in the database to match one national/academic ID.

#### Solution & Specification:
1. Add `DB.getStudentsByPhone(phone)` and `DB.getStudentByAcademicId(id)` helper methods to `scripts/core-db.js`.
2. Refactor `handleStudentSearch()` in `index.html` to issue targeted equality queries.

#### Implementation Code in `scripts/core-db.js`:
```javascript
/**
 * Fetches students linked to a parent's phone number using targeted equality query.
 * @param {string} phone
 * @param {Object} [options={}]
 * @returns {Promise<Array<Object>>}
 */
async getStudentsByPhone(phone, options = {}) {
    if (!phone) return [];
    await this.init();
    const cleanPhone = String(phone).trim();
    const cacheKey = `${this.KEYS.STUDENTS}::phone_${cleanPhone}`;

    return this._coalesce(cacheKey, async () => {
        const snap = await this.dbInstance.collection(this.KEYS.STUDENTS)
            .where('phone', '==', cleanPhone)
            .get();
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }, options, this.KEYS.STUDENTS, 'global');
},

/**
 * Fetches a single student by academic ID or document ID using targeted lookup.
 * @param {string} identifier
 * @param {Object} [options={}]
 * @returns {Promise<Object|null>}
 */
async getStudentByAcademicId(identifier, options = {}) {
    if (!identifier) return null;
    await this.init();
    const cleanId = String(identifier).trim();
    const cacheKey = `${this.KEYS.STUDENTS}::academicId_${cleanId}`;

    return this._coalesce(cacheKey, async () => {
        // 1. Direct document lookup by doc ID
        const docRef = await this.dbInstance.collection(this.KEYS.STUDENTS).doc(cleanId).get();
        if (docRef.exists) {
            return { id: docRef.id, ...docRef.data() };
        }
        // 2. Targeted query on academicId field
        const snap = await this.dbInstance.collection(this.KEYS.STUDENTS)
            .where('academicId', '==', cleanId)
            .limit(1)
            .get();
        if (!snap.empty) {
            const doc = snap.docs[0];
            return { id: doc.id, ...doc.data() };
        }
        return null;
    }, options, this.KEYS.STUDENTS, 'global');
},
```

#### Implementation Code in `index.html`:
```javascript
// In index.html: handleStudentSearch() (Lines 391 - 460)
async function handleStudentSearch() {
    const input = document.getElementById("studentNationalId").value.trim();
    if (!input) {
        UI.toast("يرجى إدخال الرقم الوطني أو رقم الهاتف", "error");
        return;
    }

    const btn = document.getElementById("searchBtn");

    // Case 1: Phone Number (Parent Portal Login)
    const phoneRegex = /^07[789][0-9]{7}$/;
    if (phoneRegex.test(input)) {
        UI.setLoading(true);
        if (btn) btn.disabled = true;

        try {
            await DB.init();
            // Targeted equality query (0 full student scans)
            const myChildren = await DB.getStudentsByPhone(input);

            if (myChildren.length === 0) {
                UI.setLoading(false);
                if (btn) btn.disabled = false;
                UI.toast("لم يتم العثور على أبناء مرتبطين برقم الهاتف المدخل", "error");
                return;
            }

            const linkedChildren = myChildren.map(s => s.academicId || s.id);
            localStorage.setItem("parent_phone", input);
            localStorage.setItem("linked_children", JSON.stringify(linkedChildren));

            UI.toast("تم التعرف على رقم الهاتف، جاري توجيهك لبوابة أولياء الأمور...", "success");
            setTimeout(() => {
                window.location.href = "portal-parent.html";
            }, 1000);
        } catch (e) {
            console.error(e);
            UI.setLoading(false);
            if (btn) btn.disabled = false;
            UI.toast("حدث خطأ أثناء تسجيل الدخول", "error");
        }
        return;
    }

    // Case 2: National / Academic ID (Student Portal Login)
    UI.setLoading(true);
    if (btn) btn.disabled = true;

    try {
        await DB.init();
        // Targeted single-document query (0 full student scans)
        const student = await DB.getStudentByAcademicId(input);

        if (student) {
            UI.toast("تم العثور على بيانات الطالب، جاري التوجيه...", "success");
            setTimeout(() => {
                window.location.href = `portal-student.html?id=${student.academicId || student.id}`;
            }, 1000);
        } else {
            UI.setLoading(false);
            if (btn) btn.disabled = false;
            UI.toast("لم يتم العثور على طالب بهذا الرقم الوطني", "error");
        }
    } catch (e) {
        console.error(e);
        UI.setLoading(false);
        if (btn) btn.disabled = false;
        UI.toast("حدث خطأ أثناء البحث", "error");
    }
}
```

---

## 6. Specification 5: Scoped Realtime Notifications & Listener Management

### 6.1. Flaws Identified (`scripts/utils-notifications.js:178-218`)
1. **No School Scoping**: `DB.dbInstance.collection('v2_notifications')` receives notifications across all tenants.
2. **Discarded Unsubscribe Callback**: `return notificationsRef...onSnapshot(...)` inside `.then()` is lost, preventing teardown.
3. **Query Cascades on Event**: In `portal-student.html:278`, receiving a notification triggered `checkNotifications()`, firing 3–4 new Firestore cloud reads.

### 6.2. Solution & Technical Design
1. **School Scoping**: Apply `query.where('schoolId', '==', schoolId)` when `schoolId` is present and not `'ministry'`.
2. **Return & Manage Unsubscribe**: Store `this._activeUnsubscribe` and register with `PageLifecycle.registerListener()`. Provide explicit `unsubscribe()` method.
3. **In-Place UI Updates**: Update notification badges and array in-memory without firing follow-up Firestore queries.

### 6.3. Implementation Code in `scripts/utils-notifications.js`:

```javascript
// In scripts/utils-notifications.js: NotificationManager Refactor
const NotificationManager = {
    _activeUnsubscribe: null,

    // ... existing init(), isEligiblePageAndUser(), requestPermissionManually(), showInitialPrompt() ...

    /**
     * Subscribes to real-time notifications with schoolId tenant isolation and clean unsubscribe handling.
     * @param {Object} target - { id, classId, schoolId }
     * @returns {Promise<Function>} Unsubscribe function
     */
    async subscribeToNotifications(target = {}) {
        if (typeof DB === 'undefined') return () => {};

        // Clean up any existing subscription
        this.unsubscribe();

        await DB.init();
        const schoolId = target.schoolId || DB.getCurrentUserSchoolId();
        let query = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);

        if (schoolId && schoolId !== 'ministry' && schoolId !== 'global') {
            query = query.where('schoolId', '==', schoolId);
        }

        query = query.orderBy('timestamp', 'desc').limit(5);
        let isInitialLoad = true;

        const unsubscribe = query.onSnapshot(snapshot => {
            if (isInitialLoad) {
                isInitialLoad = false;
                return;
            }

            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const notif = { id: change.doc.id, ...change.doc.data() };
                    
                    let isForMe = false;
                    if (notif.targetType === 'all') isForMe = true;
                    else if (notif.targetType === 'class' && notif.targetId === target.classId) isForMe = true;
                    else if (notif.targetType === 'student' && notif.targetId === target.id) isForMe = true;
                    else if (notif.targetType === 'parent' && notif.targetId === target.id) isForMe = true;

                    if (isForMe) {
                        this.sendLocalNotification(notif.title, notif.message);
                        window.dispatchEvent(new CustomEvent('new_notification_received', { detail: notif }));
                    }
                }
            });
        }, err => {
            console.warn('[NotificationManager] Snapshot listener notice:', err);
        });

        this._activeUnsubscribe = unsubscribe;
        if (typeof PageLifecycle !== 'undefined') {
            PageLifecycle.registerListener(unsubscribe);
        }

        return unsubscribe;
    },

    unsubscribe() {
        if (typeof this._activeUnsubscribe === 'function') {
            try {
                this._activeUnsubscribe();
            } catch (_) {}
            this._activeUnsubscribe = null;
        }
    }
};
```

---

## 7. Comprehensive Verification & Invalidation Conditions

### 7.1. Automated Verification Checklist

| Area | Target State | Verification Method |
|---|---|---|
| **Absence Alarm Interval** | 0 cloud reads on recurring 60s ticks | Monitor Firestore read counters over 5 minutes; verify read count = 0 after initial cache load. |
| **Page Visibility** | 0 timers firing when tab is hidden | Call `document.dispatchEvent(new Event('visibilitychange'))` with `document.hidden = true`; verify `clearInterval` invoked. |
| **RenderAll Deduplication** | Exactly 1 Firestore read per collection during parallel startup | Run `Promise.all([renderDailyInfo(), renderReports(), renderTeachers(), renderClasses()])`; verify `_callCounts` = 1 per collection. |
| **Teacher Login Query** | 1 targeted query (`where('ministryId', '==', id).limit(1)`) | Call `Auth.login('100', 'admin')`; verify `v2_teachers` was queried with `where` and not scanned via `getCollection`. |
| **Student / Parent Login** | 1 targeted query for phone or academicId | Call `handleStudentSearch()` with student ID / phone; verify `v2_students` queried targeted without scanning all students. |
| **Teacher Class Switch** | 0 cloud reads when selecting and resetting class | Call `selectClass('c1')` then `resetClassSelection()`; verify 0 Firestore queries. |

### 7.2. Invalidation Conditions
This specification is invalidated if:
1. Any public method signature in `Auth`, `DB`, or `NotificationManager` is changed or broken.
2. `PageLifecycle` fails to resume timers when the tab regains focus.
3. Login queries fail to authenticate users due to missing Firestore composite indexes.
