/**
 * Gmail Manager - إدارة الربط مع Gmail API
 * يستخدم Google Identity Services (GIS) للحصول على Access Token
 */

const GmailManager = {
    CLIENT_ID: '338402675234-krfr3itjfr2f4q96sofa19mbb5s3ii6b.apps.googleusercontent.com',
    SCOPES: 'https://www.googleapis.com/auth/gmail.send',
    tokenClient: null,
    accessToken: null,

    async init() {
        // التحقق من وجود المكتبة
        if (typeof google === 'undefined') {
            console.error('Google Identity Services library not loaded');
            return;
        }

        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.CLIENT_ID,
            scope: this.SCOPES,
            callback: (response) => {
                if (response.error !== undefined) {
                    throw (response);
                }
                this.accessToken = response.access_token;
                localStorage.setItem('gmail_access_token', this.accessToken);
                localStorage.setItem('gmail_token_expiry', Date.now() + (response.expires_in * 1000));
                
                if (typeof UI !== 'undefined') {
                    UI.toast('تم ربط حساب Gmail بنجاح ✨', 'success');
                    // تحديث الواجهة إذا لزم الأمر
                    window.dispatchEvent(new CustomEvent('gmail_connected'));
                }
            },
        });

        // استعادة التوكن إذا كان موجوداً ولم ينتهِ
        const savedToken = localStorage.getItem('gmail_access_token');
        const expiry = localStorage.getItem('gmail_token_expiry');
        if (savedToken && expiry && Date.now() < parseInt(expiry)) {
            this.accessToken = savedToken;
            console.log('Gmail session restored');
        }
    },

    isConnected() {
        const expiry = localStorage.getItem('gmail_token_expiry');
        return !!this.accessToken && expiry && Date.now() < parseInt(expiry);
    },

    login() {
        if (!this.tokenClient) {
            this.init().then(() => this.tokenClient.requestAccessToken({ prompt: 'consent' }));
        } else {
            this.tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    },

    logout() {
        this.accessToken = null;
        localStorage.removeItem('gmail_access_token');
        localStorage.removeItem('gmail_token_expiry');
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
