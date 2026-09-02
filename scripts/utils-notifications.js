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
        if (typeof window === 'undefined' || !('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return;
        }

        // Increment visit counter
        let visits = parseInt(localStorage.getItem('notif_visits') || '0');
        visits++;
        localStorage.setItem('notif_visits', visits);

        // Bind auto-cleanup on window unload
        window.addEventListener('beforeunload', () => this.unsubscribe());
        window.addEventListener('pagehide', () => this.unsubscribe());

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
        if (typeof window === 'undefined') return false;
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
            return (typeof window !== 'undefined' && 'Notification' in window) && Notification.permission === 'granted';
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
        if (typeof document === 'undefined') return;
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
            if (typeof window === 'undefined' || !('Notification' in window)) return false;
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch (e) {
            console.error('Permission request failed', e);
            return false;
        }
    },

    async sendLocalNotification(title, body, url = '/') {
        console.log('📢 Notification Triggered:', title);
        
        // Show internal toast as primary/fallback UI alert
        if (typeof UI !== 'undefined') {
            UI.toast('🔔 ' + title + ': ' + body);
        }

        if (typeof window === 'undefined' || !('Notification' in window)) {
            return;
        }
        
        if (Notification.permission !== 'granted') {
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

        // Method 1: Standard Window Notification (Faster on Localhost)
        try {
            const n = new Notification(title, options);
            n.onclick = function(e) {
                e.preventDefault();
                window.focus();
                this.close();
            };
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

            const schoolId = target.schoolId || (typeof DB.getCurrentUserSchoolId === 'function' ? DB.getCurrentUserSchoolId() : null);
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
                    const docData = (typeof change.doc.data === 'function') ? (change.doc.data() || {}) : {};
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

            if (typeof PageLifecycle !== 'undefined' && typeof PageLifecycle.registerListener === 'function') {
                PageLifecycle.registerListener(unsubscribeFn);
            }

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

if (typeof window !== 'undefined') {
    window.NotificationManager = NotificationManager;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => NotificationManager.init());
    } else {
        NotificationManager.init();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationManager;
}
