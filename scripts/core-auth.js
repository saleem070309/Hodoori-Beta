/**
 * @fileoverview Authentication & Session Management Module
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

if (typeof window !== 'undefined' && !window.__HODOORI_META__) {
    Object.defineProperty(window, '__HODOORI_META__', {
        value: Object.freeze({
            system: 'Hodoori Smart Attendance System',
            author: 'Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)',
            developer: 'سليم ياسر سليم الخديوي',
            copyright: '© 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All Rights Reserved.'
        }),
        writable: false,
        enumerable: false,
        configurable: false
    });
}

const Auth = {
    SESSION_TTL_MS: 8 * 60 * 60 * 1000, // 8 Hours Session TTL (for legal & privacy compliance)

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
            
            // Initialize in-memory session encryption key
            if (typeof CryptoEngine !== 'undefined') {
                await CryptoEngine.initSessionKey(ministryUser.id, ministryUser.loginAt);
            }

            return { success: true, user: ministryUser };
        }

        // Clear previous session
        localStorage.removeItem(DB.KEYS.CURRENT_USER);
        
        await DB.init();
        // Targeted single-document equality query (0 full collection scans)
        const user = await DB.getTeacherByMinistryId(ministryId);
        
        if (user && user.password === password) {
            if (user.blocked) return { success: false, message: 'حسابك محظور. يرجى مراجعة الإدارة.' };
            
            const sessionUser = {
                ...user,
                loginAt: now,
                expiresAt: expiresAt
            };
            localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify(sessionUser));

            // Initialize in-memory session encryption key
            if (typeof CryptoEngine !== 'undefined') {
                await CryptoEngine.initSessionKey(sessionUser.id, sessionUser.password || sessionUser.loginAt);
            }

            return { success: true, user: sessionUser };
        }
        
        return { success: false, message: 'الرقم الوزاري أو كلمة السر غير صحيحة.' };
    },

    async logout() {
        console.log("🔒 Hodoori Auth: Initiating secure logout protocol...");

        // 1. Clear session key from localStorage
        localStorage.removeItem(DB.KEYS.CURRENT_USER);

        // 2. Perform complete database lockdown, L1 cache wipe, and broadcast lockdown
        if (typeof DB !== 'undefined' && DB.lockAndPurge) {
            try {
                await DB.lockAndPurge();
            } catch (_) {}
        }

        // 3. Destroy session cryptographic key (Locks all encrypted data on disk)
        if (typeof CryptoEngine !== 'undefined') {
            CryptoEngine.destroySessionKey();
        }

        // 4. Clear sensitive temporary biometric & offline caches
        try {
            if (typeof FaceDetection !== 'undefined' && FaceDetection.descriptorCache) {
                FaceDetection.descriptorCache = [];
            }
        } catch (_) {}

        // 5. Clear AI agent history & prompt drafts
        try {
            if (typeof Agent !== 'undefined') {
                Agent.chatHistory = [];
                Agent.lastIdentifyResult = null;
            }
        } catch (_) {}

        window.location.href = 'index.html';
    },

    getCurrentUser() {
        const val = localStorage.getItem(DB.KEYS.CURRENT_USER);
        if (!val) {
            if (typeof CryptoEngine !== 'undefined' && CryptoEngine.hasActiveKey()) {
                CryptoEngine.destroySessionKey();
            }
            return null;
        }
        try {
            const user = JSON.parse(val);
            // Verify session expiration
            if (user.expiresAt && Date.now() > user.expiresAt) {
                console.warn("Hodoori: User session expired due to TTL policy.");
                this.logout();
                return null;
            }

            // Ensure crypto session key is initialized if user is active
            if (typeof CryptoEngine !== 'undefined' && !CryptoEngine.hasActiveKey()) {
                CryptoEngine.initSessionKey(user.id || user.ministryId, user.password || user.loginAt);
            }

            return user;
        } catch (_) {
            return null;
        }
    },

    checkAuth(requiredRole = null) {
        const user = this.getCurrentUser();
        if (!user) {
            if (typeof DB !== 'undefined' && DB.lockAndPurge) {
                DB.lockAndPurge();
            }
            window.location.href = 'index.html';
            return null;
        }
        
        // Ministry role has access to everything
        if (user.role === 'ministry') return user;

        if (requiredRole) {
            // Admin & Assistant roles can access admin and teacher pages
            if (requiredRole === 'admin' && (user.role === 'admin' || user.role === 'assistant')) return user;
            if (requiredRole === 'teacher' && (user.role === 'admin' || user.role === 'assistant' || user.role === 'teacher')) return user;
            
            // Exact role match
            if (user.role !== requiredRole) {
                alert('ليس لديك صلاحية للوصول إلى هذه الصفحة');
                window.location.href = 'index.html';
                return null;
            }
        }
        return user;
    }
};

if (typeof window !== 'undefined') {
    window.Auth = Auth;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Auth;
}
