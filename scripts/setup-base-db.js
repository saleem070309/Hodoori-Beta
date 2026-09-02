/**
 * @fileoverview Base Database Initialization Script (Clean Foundation Setup)
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * 
 * Usage:
 * 1. Open tools-init-db.html in your browser, or
 * 2. Run via Node: node scripts/setup-base-db.js
 */

const BaseDatabaseInitializer = {
    /**
     * The core essential default settings and metadata
     */
    CORE_SETTINGS: {
        systemName: 'نظام حضوري الذكي لإدارة الحضور المدرسي والذكاء الاصطناعي',
        systemVersion: '3.0.0',
        eodAttendanceAction: 'absent', // الافتراضي: اعتبار غير المسجلين غياب بنهاية الدوام
        workingDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
        officialHours: {
            morningStart: '07:30',
            schoolEnd: '14:30'
        },
        aiSettings: {
            faceDetectionThreshold: 0.55,
            modelSource: 'cdn_jsdelivr',
            autoAuditEnabled: true
        },
        privacySettings: {
            zeroKnowledgeLockdown: true,
            localEncryptionAlgorithm: 'AES-GCM-256',
            sessionTtlHours: 8,
            biometricOnDeviceOnly: true
        },
        notificationDefaults: {
            sendParentAbsenceAlert: true,
            whatsappDirectLinkEnabled: true,
            channel: 'internal_and_whatsapp'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },

    /**
     * Initializes the base foundation in Firestore using existing DB connection
     * @param {Object} [customDBInstance=null]
     * @returns {Promise<{success: boolean, message: string, seededCollections: Array<string>}>}
     */
    async initializeBase(customDBInstance = null) {
        try {
            console.log('🚀 Hodoori DB Initializer: Starting base foundation setup...');

            const db = customDBInstance || (typeof DB !== 'undefined' ? DB : null);
            if (!db) {
                throw new Error('Database instance (DB) not found or not initialized.');
            }

            await db.init();
            const firestore = db.dbInstance;
            const seededCollections = [];

            // 1. Seed Global Settings (v2_settings)
            console.log('📌 Seeding Global System Configuration (v2_settings)...');
            await firestore.collection('v2_settings').doc('global_config').set(this.CORE_SETTINGS, { merge: true });
            seededCollections.push('v2_settings');

            // 2. Seed Ministry / Central Directorate Placeholder (v2_schools)
            console.log('📌 Seeding Central Directorate Meta Document (v2_schools)...');
            await firestore.collection('v2_schools').doc('moe_central').set({
                id: 'moe_central',
                name: 'وزارة التربية والتعليم - الإدارة العامة',
                code: 'MOE-CENTRAL',
                directorate: 'المملكة الأردنية الهاشمية',
                type: 'headquarters',
                status: 'active',
                isTemplate: true,
                createdAt: new Date().toISOString()
            }, { merge: true });
            seededCollections.push('v2_schools');

            // 3. Seed Initial System Audit Log (v2_logs)
            console.log('📌 Recording System Initialization Audit Log (v2_logs)...');
            await firestore.collection('v2_logs').doc('bootstrap_init').set({
                type: 'SYSTEM_BOOTSTRAP',
                event: 'BASE_DATABASE_INITIALIZED',
                version: '3.0.0',
                details: 'Base foundation, security rules metadata, and default system configurations initialized.',
                timestamp: new Date().toISOString()
            }, { merge: true });
            seededCollections.push('v2_logs');

            console.log('✅ Hodoori DB Initializer: Base foundation initialized successfully!');
            return {
                success: true,
                message: 'تم تجهيز البنية الأساسية لقاعدة البيانات وإعدادات النظام بنجاح تام وبدون أي بيانات مدارس وهمية.',
                seededCollections
            };

        } catch (error) {
            console.error('❌ Base DB Init Error:', error);
            return {
                success: false,
                message: error.message || 'فشل تجهيز قاعدة البيانات',
                error
            };
        }
    }
};

if (typeof window !== 'undefined') {
    window.BaseDatabaseInitializer = BaseDatabaseInitializer;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BaseDatabaseInitializer;
}
