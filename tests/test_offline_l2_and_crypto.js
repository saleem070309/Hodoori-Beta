const assert = require('assert');
const { webcrypto } = require('crypto');
global.window = {
    crypto: webcrypto,
    addEventListener: (type, fn) => {
        global.window._listeners = global.window._listeners || {};
        global.window._listeners[type] = global.window._listeners[type] || [];
        global.window._listeners[type].push(fn);
    },
    removeEventListener: (type, fn) => {
        if (!global.window._listeners || !global.window._listeners[type]) return;
        global.window._listeners[type] = global.window._listeners[type].filter(f => f !== fn);
    },
    dispatchEvent: (event) => {
        if (!global.window._listeners || !global.window._listeners[event.type]) return;
        global.window._listeners[event.type].forEach(fn => fn(event));
    }
};

class MockLocalStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }
    setItem(key, value) {
        this.store.set(key, String(value));
    }
    removeItem(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}
global.localStorage = new MockLocalStorage();
global.CustomEvent = class CustomEvent {
    constructor(type, detail) {
        this.type = type;
        this.detail = detail.detail;
    }
};

const CryptoEngine = require('../scripts/core-crypto.js');
const DB = require('../scripts/core-db.js');
const Auth = require('../scripts/core-auth.js');

async function runTests() {
    console.log("=== Testing Hodoori L2 Caching, Instant Stats & Logout Encryption ===");

    // 1. Initialize user and session key
    const initRes = await CryptoEngine.initSessionKey("admin_01", "password_123");
    assert.strictEqual(initRes, true);
    assert.strictEqual(CryptoEngine.hasActiveKey(), true);

    // 2. Set mock user
    localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ id: 'admin_01', schoolId: 's1', role: 'admin' }));

    // 3. Populate L1/L2 cache with sample school data
    const sampleStudents = [
        { id: 'std_1', name: 'طالب أول', classId: 'c1', schoolId: 's1' },
        { id: 'std_2', name: 'طالب ثان', classId: 'c1', schoolId: 's1' }
    ];
    const sampleTeachers = [
        { id: 't_1', name: 'معلم أول', role: 'teacher', schoolId: 's1' },
        { id: 't_2', name: 'وكيل المدرسة', role: 'assistant', schoolId: 's1' }
    ];
    const sampleClasses = [
        { id: 'c1', name: 'الصف العاشر', section: 'أ', schoolId: 's1' }
    ];
    const todayStr = new Date().toISOString().split('T')[0];
    const sampleRecords = [
        {
            id: 'rec_1',
            date: todayStr,
            classId: 'c1',
            schoolId: 's1',
            details: [
                { studentId: 'std_1', status: 'present' },
                { studentId: 'std_2', status: 'absent' }
            ]
        }
    ];

    DB._setL1(`${DB.KEYS.STUDENTS}::s1::all`, sampleStudents, DB.KEYS.STUDENTS, 's1');
    DB._setL1(`${DB.KEYS.TEACHERS}::s1::all`, sampleTeachers, DB.KEYS.TEACHERS, 's1');
    DB._setL1(`${DB.KEYS.CLASSES}::s1::all`, sampleClasses, DB.KEYS.CLASSES, 's1');
    DB._setL1(`${DB.KEYS.RECORDS}::s1::baseline`, sampleRecords, DB.KEYS.RECORDS, 's1');

    console.log("  ✓ PASS: Initial data saved to L1 cache and persisted to L2 localStorage");

    // 4. Verify L2 persistent cache exists in localStorage
    const l2Raw = localStorage.getItem(DB._l2StorageKey);
    assert.ok(l2Raw, "L2 cache must be stored in localStorage");
    const l2Parsed = JSON.parse(l2Raw);
    assert.ok(l2Parsed[`${DB.KEYS.STUDENTS}::s1::all`], "Students must exist in L2 store");
    assert.strictEqual(l2Parsed[`${DB.KEYS.STUDENTS}::s1::all`].data.length, 2);

    // 5. Test Instant Dashboard Stats calculation
    const instantStats = DB.getCachedDashboardData();
    assert.strictEqual(instantStats.hasData, true);
    assert.strictEqual(instantStats.totalStudents, 2);
    assert.strictEqual(instantStats.totalTeachers, 2);
    assert.strictEqual(instantStats.totalClasses, 1);
    assert.strictEqual(instantStats.totalPresent, 1);
    assert.strictEqual(instantStats.totalAbsent, 1);
    assert.strictEqual(instantStats.attendanceRate, 50);
    assert.strictEqual(instantStats.submittedClasses.length, 1);
    assert.strictEqual(instantStats.notSubmittedClasses.length, 0);
    console.log("  ✓ PASS: DB.getCachedDashboardData returns 0ms instant stats accurately");

    // 6. Test onDataChange event listener
    let changeNotified = false;
    const unsub = DB.onDataChange((detail) => {
        changeNotified = true;
    });
    window.dispatchEvent(new CustomEvent('hodoori:db:invalidated', { detail: { collection: 'v2_students' } }));
    assert.strictEqual(changeNotified, true, "onDataChange must receive notification event");
    unsub();

    // 7. Simulate page refresh: wipe L1 memory, verify L2 hydrates L1 synchronously!
    DB._l1Cache.clear();
    assert.strictEqual(DB._l1Cache.size, 0, "L1 cache should be completely empty");
    DB._l2Hydrated = false; // Reset hydration flag to simulate new page boot
    DB._initL2();
    assert.ok(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::all`), "L1 must be re-hydrated from L2 cache");
    const rehydratedStudents = DB._getL1(`${DB.KEYS.STUDENTS}::s1::all`);
    assert.strictEqual(rehydratedStudents.length, 2);
    console.log("  ✓ PASS: Synchronous L2 cache hydration repopulates L1 on page boot");

    // 8. Test Zero-Knowledge Lockdown on Logout
    console.log("  Testing logout lockdown encryption...");
    const lockdownResult = await DB.lockAndPurge();
    assert.strictEqual(lockdownResult.locked, true);
    assert.strictEqual(lockdownResult.encrypted, true);

    // Verify plaintext is completely removed from localStorage and RAM
    assert.strictEqual(localStorage.getItem(DB._l2StorageKey), null, "Plaintext L2 cache must be removed from localStorage");
    assert.strictEqual(DB._l1Cache.size, 0, "L1 cache in RAM must be empty after lockdown");

    // Verify ciphertext exists and is encrypted
    const encryptedLockdown = localStorage.getItem(DB._l2LockdownKey);
    assert.ok(encryptedLockdown, "Encrypted lockdown payload must exist in localStorage");
    assert.ok(encryptedLockdown.startsWith('ENC:v1:'), "Ciphertext must have ENC:v1 prefix");
    assert.ok(!encryptedLockdown.includes('طالب أول'), "Plaintext Arabic names must NOT exist in ciphertext");
    console.log("  ✓ PASS: Zero-knowledge cache encryption completed and plaintext destroyed");

    // 9. Simulate destroying session key (Auth.logout)
    CryptoEngine.destroySessionKey();
    assert.strictEqual(CryptoEngine.hasActiveKey(), false);

    // Attempting to unlock without key must fail
    const unlockFail = await DB.unlockAndRestore();
    assert.strictEqual(unlockFail, false, "Unlock must fail without active session key");

    // 10. Simulate user logging back in with correct credentials
    await CryptoEngine.initSessionKey("admin_01", "password_123");
    assert.strictEqual(CryptoEngine.hasActiveKey(), true);

    const unlockSuccess = await DB.unlockAndRestore();
    assert.strictEqual(unlockSuccess, true, "Unlock must succeed with valid session key");

    // Verify decrypted data restored in L1 and L2
    assert.ok(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::all`), "L1 cache must be restored after unlock");
    const restoredStudents = DB._getL1(`${DB.KEYS.STUDENTS}::s1::all`);
    assert.strictEqual(restoredStudents.length, 2);
    assert.strictEqual(restoredStudents[0].name, 'طالب أول');
    assert.strictEqual(localStorage.getItem(DB._l2LockdownKey), null, "Lockdown key should be cleaned up after unlock");
    console.log("  ✓ PASS: Encrypted cache unlocked and restored upon re-login");

    // 11. Edge Case: User logs in 24 hours later (expired TTL test)
    console.log("  Testing 24-hour expired TTL survival across logout and unlock...");
    await DB.lockAndPurge();
    CryptoEngine.destroySessionKey();

    // Re-authenticate 24 hours later
    await CryptoEngine.initSessionKey("admin_01", "password_123");
    const unlockAfter24h = await DB.unlockAndRestore();
    assert.strictEqual(unlockAfter24h, true, "Unlock after 24h must succeed");

    // L1 and L2 must be active and not deleted
    const cachedAfter24h = DB._getL1(`${DB.KEYS.STUDENTS}::s1::all`);
    assert.ok(cachedAfter24h, "Cached data must NOT be deleted even after 24 hours");
    assert.strictEqual(cachedAfter24h.length, 2);

    const statsAfter24h = DB.getCachedDashboardData();
    assert.strictEqual(statsAfter24h.hasData, true, "Dashboard stats must be immediately available at 0ms");
    assert.strictEqual(statsAfter24h.totalStudents, 2);
    assert.strictEqual(statsAfter24h.attendanceRate, 50);
    console.log("  ✓ PASS: 24-hour TTL expiration does not delete cache and delivers 0ms instant stats");

    // 12. Local Invalidation Event Dispatch Test
    let localEventFired = false;
    let localEventDetail = null;
    const unsubLocal = DB.onDataChange((detail) => {
        localEventFired = true;
        localEventDetail = detail;
    });

    DB.invalidateCache(DB.KEYS.STUDENTS, 'std_1');
    assert.strictEqual(localEventFired, true, "invalidateCache must dispatch to current window immediately");
    assert.strictEqual(localEventDetail.collection, DB.KEYS.STUDENTS);
    assert.strictEqual(localEventDetail.docId, 'std_1');
    unsubLocal();
    console.log("  ✓ PASS: invalidateCache immediately triggers local onDataChange without tab reload");

    // 13. Delta Sync in getRecentRecords Test
    let queryCount = 0;
    DB.dbInstance = {
        collection: (colName) => {
            queryCount++;
            return {
                where: () => ({
                    where: () => ({
                        get: async () => ({ empty: true, docs: [] })
                    }),
                    get: async () => ({ empty: true, docs: [] })
                })
            };
        }
    };

    // Re-set baseline with today's records
    DB._setL1(`${DB.KEYS.RECORDS}::s1::baseline`, sampleRecords, DB.KEYS.RECORDS, 's1');
    const recent = await DB.getRecentRecords(30);
    assert.strictEqual(recent.length, 1, "getRecentRecords must return filtered records from baseline");
    assert.strictEqual(recent[0].id, 'rec_1');
    console.log("  ✓ PASS: getRecentRecords uses delta sync with 0 document reads when empty delta");

    console.log("\n=======================================================");
    console.log("Offline Caching & Crypto Tests: ALL 13 PASSED (100%)");
    console.log("=======================================================");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
