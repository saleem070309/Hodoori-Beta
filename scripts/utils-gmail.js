/**
 * Gmail Manager - إدارة الربط مع Gmail API
 * يستخدم Google Identity Services (GIS) للحصول على Access Token
 */

const GmailManager = {
    CLIENT_ID: '338402675234-krfr3itjfr2f4q96sofa19mbb5s3ii6b.apps.googleusercontent.com',
    SCOPES: 'https://www.googleapis.com/auth/gmail.send',
    tokenClient: null,
    accessToken: null,

    getStorageKey(suffix) {
        const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
        const prefix = user ? `user_${user.id || user.ministryId}` : 'global';
        return `gmail_${prefix}_${suffix}`;
    },

    async init() {
        // التحقق من وجود المكتبة
        if (typeof google === 'undefined') {
            console.error('Google Identity Services library not loaded');
            return;
        }

        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: async (response) => {
                if (response.error !== undefined) {
                    throw (response);
                }
                this.accessToken = response.access_token;
                
                const expiryTime = Date.now() + (response.expires_in * 1000);
                localStorage.setItem(this.getStorageKey('access_token'), this.accessToken);
                localStorage.setItem(this.getStorageKey('token_expiry'), expiryTime);
                
                // حفظ التوكن في قاعدة البيانات ليكون متاحاً عبر جميع الأجهزة وبشكل دائم
                try {
                    if (typeof DB !== 'undefined') {
                        const settings = await DB.getSettings();
                        settings.gmail_session = {
                            access_token: this.accessToken,
                            token_expiry: expiryTime,
                            saved_at: Date.now()
                        };
                        await DB.saveSettings(settings);
                        console.log('Gmail session saved to Firebase');
                    }
                } catch (dbErr) {
                    console.error('Failed to save Gmail session to Firebase:', dbErr);
                }

                if (typeof UI !== 'undefined') {
                    UI.toast('تم ربط حساب Gmail بنجاح ✨', 'success');
                    // تحديث الواجهة إذا لزم الأمر
                    window.dispatchEvent(new CustomEvent('gmail_connected'));
                }
            },
        });

        // استعادة التوكن من LocalStorage أو من قاعدة البيانات (Firebase)
        let savedToken = localStorage.getItem(this.getStorageKey('access_token'));
        let expiry = localStorage.getItem(this.getStorageKey('token_expiry'));
        
        if (!savedToken || !expiry || Date.now() >= parseInt(expiry)) {
            // محاولة جلب الجلسة المحفوظة من Firebase إذا لم تكن موجودة محلياً أو انتهت محلياً
            try {
                if (typeof DB !== 'undefined') {
                    const settings = await DB.getSettings();
                    if (settings.gmail_session && settings.gmail_session.access_token) {
                        const dbExpiry = settings.gmail_session.token_expiry;
                        if (dbExpiry && Date.now() < parseInt(dbExpiry)) {
                            savedToken = settings.gmail_session.access_token;
                            expiry = dbExpiry;
                            
                            // تحديث التخزين المحلي
                            localStorage.setItem(this.getStorageKey('access_token'), savedToken);
                            localStorage.setItem(this.getStorageKey('token_expiry'), expiry);
                            console.log('Gmail session restored from Firebase');
                        }
                    }
                }
            } catch (dbErr) {
                console.error('Failed to restore Gmail session from Firebase:', dbErr);
            }
        }
 
        if (savedToken && expiry && Date.now() < parseInt(expiry)) {
            this.accessToken = savedToken;
            console.log('Gmail session restored');
        } else {
            this.accessToken = null;
            localStorage.removeItem(this.getStorageKey('access_token'));
            localStorage.removeItem(this.getStorageKey('token_expiry'));
        }
    },
 
    isConnected() {
        const savedToken = localStorage.getItem(this.getStorageKey('access_token'));
        const expiry = localStorage.getItem(this.getStorageKey('token_expiry'));
        
        if (!savedToken || !expiry || Date.now() >= parseInt(expiry)) {
            this.accessToken = null;
            return false;
        }
        
        if (savedToken !== this.accessToken) {
            this.accessToken = savedToken;
        }
        return !!this.accessToken;
    },

    login() {
        if (!this.tokenClient) {
            this.init().then(() => this.tokenClient.requestAccessToken({ prompt: 'consent' }));
        } else {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    },

    async logout() {
        this.accessToken = null;
        localStorage.removeItem(this.getStorageKey('access_token'));
        localStorage.removeItem(this.getStorageKey('token_expiry'));
        
        // حذف الجلسة من قاعدة البيانات أيضاً
        try {
            if (typeof DB !== 'undefined') {
                const settings = await DB.getSettings();
                delete settings.gmail_session;
                await DB.saveSettings(settings);
                console.log('Gmail session deleted from Firebase');
            }
        } catch (dbErr) {
            console.error('Failed to delete Gmail session from Firebase:', dbErr);
        }

        UI.toast('تم فصل حساب Gmail', 'info');
    },

    /**
     * إرسال إيميل
     * @param {string} to - البريد المستلم
     * @param {string} subject - العنوان
     * @param {string} message - محتوى الرسالة (HTML أو نص)
     */
    async sendEmail(to, subject, message) {
        if (!this.isConnected()) {
            this.login();
            throw new Error('يرجى تسجيل الدخول وربط الحساب أولاً');
        }

        // تحويل الرسالة إلى تنسيق MIME المشفر بـ Base64URL
        const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
        const emailContent = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            '',
            message
        ].join('\n');

        const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                raw: base64EncodedEmail
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            if (response.status === 401) {
                this.logout();
                throw new Error('انتهت صلاحية الجلسة، يرجى إعادة الربط');
            }
            throw new Error(errorData.error?.message || 'فشل إرسال الإيميل');
        }

        return await response.json();
    }
};
