/**
 * Notification Manager - إدارة التنبيهات
 * يسهل طلب الإذن وإرسال التنبيهات المحلية وعبر المتصفح
 */

const NotificationManager = {
    async init() {
        if (!('Notification' in window)) {
            console.warn('This browser does not support notifications');
            return;
        }

        // Increment visit counter
        let visits = parseInt(localStorage.getItem('notif_visits') || '0');
        visits++;
        localStorage.setItem('notif_visits', visits);

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
        modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in';
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
     * Listens for new notifications in real-time (Firestore Snapshots)
     * This allows notifications to appear immediately even on different devices.
     */
    subscribeToNotifications(target = {}) {
        if (typeof DB === 'undefined') return;

        // Flag to skip notifications already in the database when we first connect
        let isInitialLoad = true;

        DB.init().then(() => {
            console.log('Subscribing to real-time notifications for target:', target);
            const notificationsRef = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);
            
            // Listen for changes (limit to 5 most recent to save resources)
            return notificationsRef.orderBy('timestamp', 'desc').limit(5).onSnapshot(snapshot => {
                if (isInitialLoad) {
                    isInitialLoad = false;
                    return;
                }

                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const notif = change.doc.data();
                        
                        // Filtering logic: Check if this notification is for this specific student
                        let isForMe = false;
                        if (notif.targetType === 'all') isForMe = true;
                        else if (notif.targetType === 'class' && notif.targetId === target.classId) isForMe = true;
                        else if (notif.targetType === 'student' && notif.targetId === target.id) isForMe = true;

                        if (isForMe) {
                            console.log('Real-time notification detected:', notif);
                            this.sendLocalNotification(notif.title, notif.message);
                            
                            // Emit a custom event so the UI can update (e.g., show red dot)
                            window.dispatchEvent(new CustomEvent('new_notification_received', { detail: notif }));
                        }
                    }
                });
            }, err => {
                console.error('Real-time snapshot listener failed:', err);
            });
        });
    }
};

// Auto-init on page load
window.addEventListener('DOMContentLoaded', () => NotificationManager.init());
