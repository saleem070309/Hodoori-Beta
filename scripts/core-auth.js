/**
 * Authentication and Session Management
 */

const Auth = {
    async login(ministryId, password) {
        // Clear previous session to ensure getTeachers() doesn't filter by old schoolId
        localStorage.removeItem(DB.KEYS.CURRENT_USER);
        
        await DB.init();
        const teachers = await DB.getTeachers();
        const user = teachers.find(t => t.ministryId === ministryId && t.password === password);
        
        if (user) {
            if (user.blocked) return { success: false, message: 'حسابك محظور. يرجى مراجعة الإدارة.' };
            
            localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify(user));
            return { success: true, user };
        }
        
        return { success: false, message: 'الرقم الوزاري أو كلمة السر غير صحيحة.' };
    },

    logout() {
        localStorage.removeItem(DB.KEYS.CURRENT_USER);
        window.location.href = 'index.html';
    },

    getCurrentUser() {
        const val = localStorage.getItem(DB.KEYS.CURRENT_USER);
        return val ? JSON.parse(val) : null;
    },

    checkAuth(requiredRole = null) {
        const user = this.getCurrentUser();
        if (!user) {
            window.location.href = 'index.html';
            return null;
        }
        
        // Ministry role has access to everything
        if (user.role === 'ministry') return user;

        if (requiredRole) {
            // Admin role can access teacher pages
            if (requiredRole === 'teacher' && user.role === 'admin') return user;
            
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
