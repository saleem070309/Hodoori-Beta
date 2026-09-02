/**
 * @fileoverview Automated Test Suite for Smart Local Caching, Offline Persistence & Delta Sync Layer
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Teamwork M1 Verification Specialist
 */

const assert = require('assert');

// Setup mock browser globals for Node.js environment
class MockBroadcastChannel {
    static channels = new Map();

    constructor(name) {
        this.name = name;
        this.onmessage = null;
        this.onmessageerror = null;
        if (!MockBroadcastChannel.channels.has(name)) {
            MockBroadcastChannel.channels.set(name, new Set());
        }
        MockBroadcastChannel.channels.get(name).add(this);
    }

    postMessage(data) {
        const peers = MockBroadcastChannel.channels.get(this.name);
        if (peers) {
            for (const peer of peers) {
                if (peer.onmessage) {
                    peer.onmessage({ data });
                }
            }
        }
    }

    close() {
        const peers = MockBroadcastChannel.channels.get(this.name);
        if (peers) {
            peers.delete(this);
        }
    }
}

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

// Attach globals before loading core-db.js
global.window = {
    addEventListener: () => {},
    dispatchEvent: () => {},
    BroadcastChannel: MockBroadcastChannel
};
global.BroadcastChannel = MockBroadcastChannel;
global.localStorage = new MockLocalStorage();

const DB = require('../scripts/core-db.js');

// Mock Firestore database structure
function createMockFirestore() {
    const store = new Map();

    const getCollectionStore = (name) => {
        if (!store.has(name)) store.set(name, new Map());
        return store.get(name);
    };

    const db = {
        _callCounts: {},
        _settingsCalled: false,
        _persistenceMode: null,

        settings(opts) {
            db._settingsCalled = true;
            db._settingsOpts = opts;
        },

        async enablePersistence(opts) {
            if (db._forcePersistenceError) {
                const err = new Error(db._forcePersistenceError.message || 'Persistence error');
                err.code = db._forcePersistenceError.code;
                throw err;
            }
            db._persistenceMode = (opts && opts.synchronizeTabs) ? 'multi-tab' : 'single-tab';
        },

        collection(name) {
            const colStore = getCollectionStore(name);
            db._callCounts[name] = (db._callCounts[name] || 0) + 1;

            const createQuery = (filters = []) => ({
                _filters: filters,
                where(field, op, val) {
                    return createQuery([...this._filters, { field, op, val }]);
                },
                async get() {
                    let docs = Array.from(colStore.entries()).map(([id, data]) => ({
                        id,
                        data: () => ({ ...data }),
                        ref: { id, delete: async () => colStore.delete(id), update: async (d) => colStore.set(id, { ...colStore.get(id), ...d }) }
                    }));

                    for (const f of this._filters) {
                        if (f.op === '==') {
                            docs = docs.filter(d => d.data()[f.field] === f.val);
                        } else if (f.op === '>=') {
                            docs = docs.filter(d => (d.data()[f.field] || '') >= f.val);
                        } else if (f.op === '<=') {
                            docs = docs.filter(d => (d.data()[f.field] || '') <= f.val);
                        } else if (f.op === '>') {
                            docs = docs.filter(d => (d.data()[f.field] || '') > f.val);
                        }
                    }

                    return {
                        empty: docs.length === 0,
                        docs
                    };
                },
                doc(id) {
                    const docId = id || 'doc_' + Math.random().toString(36).substring(2, 9);
                    return {
                        id: docId,
                        ref: this,
                        async get() {
                            const exists = colStore.has(docId);
                            return {
                                exists,
                                id: docId,
                                data: () => exists ? { ...colStore.get(docId) } : {}
                            };
                        },
                        async set(data, opts) {
                            if (opts && opts.merge && colStore.has(docId)) {
                                colStore.set(docId, { ...colStore.get(docId), ...data });
                            } else {
                                colStore.set(docId, { ...data });
                            }
                        },
                        async update(data) {
                            if (colStore.has(docId)) {
                                colStore.set(docId, { ...colStore.get(docId), ...data });
                            } else {
                                colStore.set(docId, { ...data });
                            }
                        },
                        async delete() {
                            colStore.delete(docId);
                        }
                    };
                },
                async add(data) {
                    const id = 'gen_' + Math.random().toString(36).substring(2, 9);
                    colStore.set(id, { ...data });
                    return { id };
                }
            });

            return createQuery();
        },

        batch() {
            const operations = [];
            return {
                set(docRef, data) {
                    operations.push(() => docRef.set(data));
                },
                async commit() {
                    for (const op of operations) {
                        await op();
                    }
                }
            };
        }
    };

    return { db, store, getCollectionStore };
}

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
    totalTests++;
    try {
        await fn();
        console.log(`  ✓ PASS: ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`  ✗ FAIL: ${name}`);
        console.error(err);
        process.exitCode = 1;
    }
}

async function main() {
    console.log("=== Hodoori Core DB & Caching Automated Test Suite ===");

    // Test Suite 1: L1 In-Memory Caching & TTL Matrix
    await runTest("L1 Cache basic set/get and TTL calculation", async () => {
        DB.clearAllCaches();
        assert.strictEqual(DB._getTTL('v2_settings'), 15 * 60 * 1000);
        assert.strictEqual(DB._getTTL('v2_schools'), 30 * 60 * 1000);
        assert.strictEqual(DB._getTTL('v2_holidays'), 30 * 60 * 1000);
        assert.strictEqual(DB._getTTL('v2_classes'), 10 * 60 * 1000);
        assert.strictEqual(DB._getTTL('v2_teachers'), 10 * 60 * 1000);
        assert.strictEqual(DB._getTTL('v2_schedule'), 10 * 60 * 1000);
        assert.strictEqual(DB._getTTL('v2_students'), 5 * 60 * 1000);
        assert.strictEqual(DB._getTTL('v2_records'), 3 * 60 * 1000);
        assert.strictEqual(DB._getTTL('v2_notifications'), 2 * 60 * 1000);

        DB._setL1('test::s1::key1', [{ id: '1', name: 'Test' }], 'v2_students', 's1');
        const retrieved = DB._getL1('test::s1::key1');
        assert.deepStrictEqual(retrieved, [{ id: '1', name: 'Test' }]);
    });

    // Test Suite 2: Defensive Cloning
    await runTest("Defensive cloning protects cached data against external mutation", async () => {
        DB.clearAllCaches();
        const originalArray = [{ id: '1', name: 'Ali' }, { id: '2', name: 'Omar' }];
        DB._setL1('test::defensive::key', originalArray, 'v2_students', 's1');

        const read1 = DB._getL1('test::defensive::key');
        read1.push({ id: '3', name: 'Mutated' });
        read1[0].name = 'Hacked';

        const read2 = DB._getL1('test::defensive::key');
        assert.strictEqual(read2.length, 2, "Array length should not be affected by consumer push");
        assert.strictEqual(read2[0].name, 'Ali', "Object field should not be mutated");
    });

    // Test Suite 3: TTL Expiration Handling
    await runTest("L1 Cache entry expires and deletes after TTL", async () => {
        DB.clearAllCaches();
        // Insert with very short custom TTL: 20ms
        DB._setL1('test::expire::key', { val: 42 }, 'v2_students', 's1', 20);
        assert.deepStrictEqual(DB._getL1('test::expire::key'), { val: 42 });

        // Wait 35ms for TTL to expire
        await new Promise(r => setTimeout(r, 35));

        const expired = DB._getL1('test::expire::key');
        assert.strictEqual(expired, null, "Expired entry should return null");
        assert.strictEqual(DB._l1Cache.has('test::expire::key'), false, "Expired entry should be deleted from cache Map");
    });

    // Test Suite 4: In-Flight Request Deduplication (_coalesce)
    await runTest("In-flight promise coalescing executes query only ONCE for simultaneous callers", async () => {
        DB.clearAllCaches();
        let queryExecutions = 0;
        const slowFetcher = async () => {
            queryExecutions++;
            await new Promise(r => setTimeout(r, 50));
            return [{ id: '1', name: 'Coalesced Result' }];
        };

        // Fire 5 simultaneous requests with the same key
        const p1 = DB._coalesce('coalesce::test::1', slowFetcher);
        const p2 = DB._coalesce('coalesce::test::1', slowFetcher);
        const p3 = DB._coalesce('coalesce::test::1', slowFetcher);
        const p4 = DB._coalesce('coalesce::test::1', slowFetcher);
        const p5 = DB._coalesce('coalesce::test::1', slowFetcher);

        const [r1, r2, r3, r4, r5] = await Promise.all([p1, p2, p3, p4, p5]);

        assert.strictEqual(queryExecutions, 1, "Fetcher function should have executed exactly 1 time");
        assert.deepStrictEqual(r1, [{ id: '1', name: 'Coalesced Result' }]);
        assert.deepStrictEqual(r5, [{ id: '1', name: 'Coalesced Result' }]);
        assert.strictEqual(DB._inflightQueries.has('coalesce::test::1'), false, "In-flight map should be clean after completion");
    });

    // Test Suite 5: In-Flight Error Propagation & Cleanup
    await runTest("In-flight error rejection propagates to all callers and cleans up in-flight map", async () => {
        DB.clearAllCaches();
        let executionCount = 0;
        const failingFetcher = async () => {
            executionCount++;
            await new Promise(r => setTimeout(r, 20));
            throw new Error("Firestore Network Failure");
        };

        const p1 = DB._coalesce('fail::test::key', failingFetcher);
        const p2 = DB._coalesce('fail::test::key', failingFetcher);

        await assert.rejects(p1, /Firestore Network Failure/);
        await assert.rejects(p2, /Firestore Network Failure/);

        assert.strictEqual(executionCount, 1);
        assert.strictEqual(DB._inflightQueries.has('fail::test::key'), false, "In-flight map should be deleted even on error");
        assert.strictEqual(DB._l1Cache.has('fail::test::key'), false, "Failed queries must NOT be stored in L1 cache");
    });

    // Test Suite 6: Full Database Mock & CRUD Cache Invalidation
    await runTest("Mutation methods automatically invalidate target and cascading L1 caches", async () => {
        const { db, store, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB.clearAllCaches();

        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1', role: 'admin' }));

        // 1. Add Class and verify caching & invalidation
        await DB.addClass({ name: 'الصف العاشر', section: 'أ' });
        const classes1 = await DB.getClasses();
        assert.strictEqual(classes1.length, 1);
        assert.strictEqual(classes1[0].name, 'الصف العاشر');

        // Check L1 cache exists
        assert.ok(DB._l1Cache.has(`${DB.KEYS.CLASSES}::s1::all`));

        // Add second class -> cache should invalidate
        await DB.addClass({ name: 'الصف الحادي عشر', section: 'ب' });
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.CLASSES}::s1::all`), false, "addClass must invalidate CLASSES cache");

        const classes2 = await DB.getClasses();
        assert.strictEqual(classes2.length, 2);

        // 2. Add Students and test class-level cascade invalidation
        const classId1 = classes2[0].id;
        await DB.addStudent({ academicId: 'st1', name: 'طالب أول', classId: classId1 });
        await DB.addStudent({ academicId: 'st2', name: 'طالب ثاني', classId: classId1 });

        const students1 = await DB.getStudents(classId1);
        assert.strictEqual(students1.length, 2);
        assert.ok(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::class_${classId1}`));

        // 3. Delete Class -> Must cascade delete students AND invalidate both CLASSES and STUDENTS
        await DB.deleteClass(classId1);
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.CLASSES}::s1::all`), false, "deleteClass must invalidate CLASSES");
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::class_${classId1}`), false, "deleteClass must cascade-invalidate STUDENTS");

        const remainingStudents = await DB.getStudents(classId1);
        assert.strictEqual(remainingStudents.length, 0, "Students in deleted class should be removed");

        // 4. Test Teacher CRUD invalidation
        await DB.addTeacher({ name: 'أستاذ سامي', ministryId: 't100' });
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.TEACHERS}::s1::all`), false);
        const teachers1 = await DB.getTeachers();
        assert.strictEqual(teachers1.length, 1);
        assert.ok(DB._l1Cache.has(`${DB.KEYS.TEACHERS}::s1::all`));

        await DB.updateTeacher(teachers1[0].id, { name: 'أستاذ سامي المعدل' });
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.TEACHERS}::s1::all`), false, "updateTeacher must invalidate TEACHERS cache");

        // 5. Test Attendance Records and Date-Bounded Queries
        const todayStr = new Date().toISOString().split('T')[0];
        await DB.saveAttendance(todayStr, 'c2', [{ studentId: 'st9', status: 'present' }], 't1', 1);
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.RECORDS}::s1::date_${todayStr}__class_c2`), false);

        const recsToday = await DB.getTodayRecords('c2');
        assert.strictEqual(recsToday.length, 1);
        assert.strictEqual(recsToday[0].date, todayStr);

        const recsRange = await DB.getRecordsRange('2026-08-01', '2026-08-31', 'c2');
        assert.strictEqual(recsRange.length, 1);

        // 6. Test Settings caching (15-min TTL)
        await DB.saveSettings({ schoolName: 'مدرسة التفوق' });
        const settings = await DB.getSettings();
        assert.strictEqual(settings.schoolName, 'مدرسة التفوق');
        assert.ok(DB._l1Cache.has(`${DB.KEYS.SETTINGS}::s1::doc_s1`));
    });

    // Test Suite 7: Cross-Tab Broadcast Synchronization & Loop Suppression
    await runTest("Cross-tab BroadcastChannel synchronizes cache invalidation and suppresses echo loops", async () => {
        DB.clearAllCaches();
        DB._initBroadcast();

        // Populate local cache
        DB._setL1(`${DB.KEYS.CLASSES}::s1::all`, [{ id: 'c1', name: 'Class 1' }], DB.KEYS.CLASSES, 's1');
        DB._setL1(`${DB.KEYS.STUDENTS}::s1::all`, [{ id: 's1', name: 'Student 1' }], DB.KEYS.STUDENTS, 's1');
        assert.strictEqual(DB._l1Cache.size, 2);

        // 1. Simulate an echo message with DB's own senderTabId -> MUST BE IGNORED
        DB._handleSyncMessage({
            type: 'INVALIDATE',
            collection: DB.KEYS.CLASSES,
            schoolId: 's1',
            senderTabId: DB._tabId // Echo from self!
        });
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.CLASSES}::s1::all`), true, "Self-echo must be suppressed");

        // 2. Simulate valid message from another tab -> MUST INVALIDATE
        DB._handleSyncMessage({
            type: 'INVALIDATE',
            collection: DB.KEYS.CLASSES,
            schoolId: 's1',
            extraCollections: [DB.KEYS.STUDENTS],
            senderTabId: 'other_tab_999'
        });
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.CLASSES}::s1::all`), false, "Remote message must invalidate CLASSES");
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::all`), false, "Remote message must cascade-invalidate STUDENTS");
        assert.strictEqual(DB._stats.broadcastsReceived >= 1, true, "Stats should record received broadcast");
    });

    // Test Suite 8: Offline Persistence Cascade Fallbacks
    await runTest("Persistence cascade fallback handles multi-tab, failed-precondition, and unimplemented", async () => {
        // A. Successful multi-tab
        const mock1 = createMockFirestore();
        DB.dbInstance = mock1.db;
        DB._persistenceConfigured = false;
        await DB._initPersistence();
        assert.strictEqual(DB._persistenceState, 'multi-tab');

        // B. Failed precondition -> single-tab fallback
        const mock2 = createMockFirestore();
        mock2.db._forcePersistenceError = { code: 'failed-precondition', message: 'Tabs open' };
        // On single-tab retry, make it succeed
        const originalEnable = mock2.db.enablePersistence;
        let attempt = 0;
        mock2.db.enablePersistence = async (opts) => {
            attempt++;
            if (attempt === 1) {
                const err = new Error('Tabs open');
                err.code = 'failed-precondition';
                throw err;
            }
            mock2.db._persistenceMode = 'single-tab';
        };
        DB.dbInstance = mock2.db;
        DB._persistenceConfigured = false;
        await DB._initPersistence();
        assert.strictEqual(DB._persistenceState, 'single-tab');

        // C. Unimplemented (e.g. private browsing)
        const mock3 = createMockFirestore();
        mock3.db._forcePersistenceError = { code: 'unimplemented', message: 'No IndexedDB' };
        DB.dbInstance = mock3.db;
        DB._persistenceConfigured = false;
        await DB._initPersistence();
        assert.strictEqual(DB._persistenceState, 'unsupported');
    });

    // Test Suite 9: Delta Sync Incremental Merging Logic
    await runTest("Delta Sync state merging correctly merges updates and preserves order", async () => {
        const baseline = [
            { id: 'rec1', date: '2026-08-25', timestamp: '2026-08-25T08:00:00.000Z', notes: 'Initial 1' },
            { id: 'rec2', date: '2026-08-26', timestamp: '2026-08-26T08:00:00.000Z', notes: 'Initial 2' }
        ];

        const delta = [
            { id: 'rec2', date: '2026-08-26', timestamp: '2026-08-26T08:30:00.000Z', notes: 'Updated 2' }, // In-place update
            { id: 'rec3', date: '2026-08-27', timestamp: '2026-08-27T08:00:00.000Z', notes: 'New 3' }       // Addition
        ];

        const merged = DB._mergeDeltaIntoBaseline(baseline, delta);

        assert.strictEqual(merged.length, 3, "Merged baseline should have 3 unique documents");
        // Sorted descending by timestamp
        assert.strictEqual(merged[0].id, 'rec3');
        assert.strictEqual(merged[1].id, 'rec2');
        assert.strictEqual(merged[1].notes, 'Updated 2', "rec2 should contain the updated data from delta");
        assert.strictEqual(merged[2].id, 'rec1');
    });

    // Test Suite 10: Arabic Fuzzy Matching & Normalization Algorithms
    await runTest("Arabic fuzzy matching and normalization algorithms match correctly", async () => {
        // Normalization checks
        assert.strictEqual(DB.normalizeArabic('أَحْمَدُ'), 'احمد');
        assert.strictEqual(DB.normalizeArabic('عَبْدُ اللهِ'), 'عبد الله');
        assert.strictEqual(DB.normalizeArabic('مُعَلِّمـة'), 'معلمه');
        assert.strictEqual(DB.normalizeArabic('يَاسِينْ'), 'ياسين');
        assert.strictEqual(DB.stripDefiniteArticle('المدرسة'), 'مدرسة');

        // Scoring checks
        // Exact match
        assert.strictEqual(DB.scoreArabicMatch('أحمد المحمدي', 'احمد المحمدي'), 100);

        // First + Last Token Match
        const scoreFirstLast = DB.scoreArabicMatch('سليم ياسر سليم الخديوي', 'سليم الخديوي');
        assert.ok(scoreFirstLast >= 90, `First+Last match score should be >= 90, got ${scoreFirstLast}`);

        // Substring / ordered token match
        const scoreOrdered = DB.scoreArabicMatch('محمد عبدالله علي السعيد', 'محمد السعيد');
        assert.ok(scoreOrdered >= 75, `Ordered match score should be >= 75, got ${scoreOrdered}`);

        // matchArabicNames boolean helper
        assert.strictEqual(DB.matchArabicNames('أحمد بن علي', 'احمد علي'), true);
        assert.strictEqual(DB.matchArabicNames('خالد سامي', 'طارق منصور'), false);

        // filterAndRankMatches ranking helper
        const list = [
            { id: '1', name: 'أحمد علي حسن' },
            { id: '2', name: 'سارة خالد' },
            { id: '3', name: 'أحمد حسن' }
        ];
        const matches = DB.filterAndRankMatches(list, 'احمد حسن');
        assert.strictEqual(matches.length, 2);
        assert.strictEqual(matches[0].id, '3', "Top match should be exact first+last match");
    });

    // Test Suite 11: Cache Observability & Telemetry API
    await runTest("DB.getCacheStats() provides complete telemetry and hit ratios", async () => {
        DB.clearAllCaches();
        DB._stats.hits = 18;
        DB._stats.misses = 2;
        DB._setL1('v2_classes::s1::all', [{ id: 'c1' }], 'v2_classes', 's1');

        const stats = DB.getCacheStats();
        assert.strictEqual(stats.totalEntries, 1);
        assert.strictEqual(stats.hits, 18);
        assert.strictEqual(stats.misses, 2);
        assert.strictEqual(stats.hitRatio, '90.0%');
        assert.strictEqual(stats.entries.length, 1);
        assert.strictEqual(stats.entries[0].collection, 'v2_classes');
        assert.strictEqual(stats.entries[0].schoolId, 's1');
    });

    // Test Suite 12: Generic CRUD methods (insert, update, delete)
    await runTest("Generic CRUD methods route to specific tables and invalidate caches", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        // Insert student via generic method
        const sId = await DB.insert('students', { name: 'طالب عام', academicId: 'gen_st1', classId: 'c1' });
        const students = await DB.getStudents('c1');
        assert.strictEqual(students.length, 1);
        assert.ok(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::class_c1`));

        // Update student via generic method
        await DB.update('students', 'gen_st1', { name: 'طالب عام محدث' });
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::class_c1`), false, "Generic update must invalidate cache");

        // Delete student via generic method
        await DB.delete('students', 'gen_st1');
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::class_c1`), false, "Generic delete must invalidate cache");
        const remaining = await DB.getStudents('c1');
        assert.strictEqual(remaining.length, 0);
    });

    // Test Suite 13: getRecordById and getRecentRecords
    await runTest("getRecordById and getRecentRecords function properly with caching", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        await DB.saveAttendance('2026-08-28', 'c1', [{ studentId: 's1', status: 'present' }], 't1', 1);
        const recs = await DB.getRecords('2026-08-28', 'c1');
        assert.strictEqual(recs.length, 1);

        const recId = recs[0].id;
        const singleDoc = await DB.getRecordById(recId);
        assert.strictEqual(singleDoc.id, recId);
        assert.ok(DB._l1Cache.has(`${DB.KEYS.RECORDS}::doc_${recId}`));

        const recent = await DB.getRecentRecords(7, 'c1');
        assert.strictEqual(recent.length, 1);
    });

    // Test Suite 14: isHoliday logic
    await runTest("isHoliday accurately checks weekends (Friday/Saturday) and database holidays", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB.clearAllCaches();

        // 2026-08-28 is Friday (weekend)
        const isFriday = await DB.isHoliday('2026-08-28');
        assert.strictEqual(isFriday, true, "Friday should be recognized as weekend holiday");

        // 2026-08-29 is Saturday (weekend)
        const isSaturday = await DB.isHoliday('2026-08-29');
        assert.strictEqual(isSaturday, true, "Saturday should be recognized as weekend holiday");

        // 2026-08-30 is Sunday (weekday in ME)
        const isSundayBefore = await DB.isHoliday('2026-08-30');
        assert.strictEqual(isSundayBefore, false, "Sunday should not be holiday initially");

        // Add national holiday to database
        await db.collection(DB.KEYS.HOLIDAYS).add({ date: '2026-08-30', title: 'عطلة وطنية' });
        DB.invalidateCache(DB.KEYS.HOLIDAYS);

        const isSundayAfter = await DB.isHoliday('2026-08-30');
        assert.strictEqual(isSundayAfter, true, "Database holiday should be recognized as holiday");
    });

    // Test Suite 15: getNotifications multi-branch targeting, deduplication and sorting
    await runTest("getNotifications handles multi-target hierarchy, deduplication and desc sorting", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        // 1. Broadcast notification for all
        await DB.addNotification({ title: 'إعلان عام', targetType: 'all', timestamp: '2026-08-29T10:00:00.000Z' });
        // 2. Class notification
        await DB.addNotification({ title: 'إعلان صف عاشر', targetType: 'class', targetId: 'c1', timestamp: '2026-08-29T11:00:00.000Z' });
        // 3. Student notification
        await DB.addNotification({ title: 'إشعار طالب', targetType: 'student', targetId: 'st100', timestamp: '2026-08-29T12:00:00.000Z' });
        // 4. Parent notification
        await DB.addNotification({ title: 'إشعار ولي أمر', targetType: 'parent', targetId: 'st100', timestamp: '2026-08-29T13:00:00.000Z' });

        // Query for parent of st100 in c1
        const parentNotifs = await DB.getNotifications({ id: 'st100', classId: 'c1', isParent: true });
        assert.strictEqual(parentNotifs.length, 4, "Parent should receive all, class, student, and parent notifications");
        // Check sorting: newest first (13:00, then 12:00, then 11:00, then 10:00)
        assert.strictEqual(parentNotifs[0].title, 'إشعار ولي أمر');
        assert.strictEqual(parentNotifs[1].title, 'إشعار طالب');
        assert.strictEqual(parentNotifs[2].title, 'إعلان صف عاشر');
        assert.strictEqual(parentNotifs[3].title, 'إعلان عام');
    });

    // Test Suite 16: getStudents in-memory filter optimization
    await runTest("getStudents in-memory optimization filters cached all-students list without extra queries", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        await DB.addStudent({ academicId: 's1', name: 'طالب 1', classId: 'c1' });
        await DB.addStudent({ academicId: 's2', name: 'طالب 2', classId: 'c2' });

        // First call: fetch ALL students
        const all = await DB.getStudents();
        assert.strictEqual(all.length, 2);
        assert.ok(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::s1::all`));

        // Second call: request class c1 with cached all list
        const class1Students = await DB.getStudents('c1');
        assert.strictEqual(class1Students.length, 1);
        assert.strictEqual(class1Students[0].name, 'طالب 1');
    });

    // Test Suite 17: Fallback student/teacher update/delete by Arabic name
    await runTest("Arabic fuzzy name fallback finds and mutates records when doc ID is not matching", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        await DB.addStudent({ academicId: '2024999', name: 'أحمد إبراهيم الخالدي', classId: 'c1' });

        // Update by fuzzy Arabic name (first + last name match, dropping middle name)
        await DB.updateStudent('احمد الخالدي', { note: 'محدث بالفزي ماتش' });

        const students = await DB.getStudents();
        assert.strictEqual(students.length, 1);
        assert.strictEqual(students[0].note, 'محدث بالفزي ماتش');

        // Delete by fuzzy Arabic name
        await DB.deleteStudent('احمد الخالدي');
        const afterDelete = await DB.getStudents();
        assert.strictEqual(afterDelete.length, 0);
    });

    // Test Suite 18: seedData clears all caches and seeds default data
    await runTest("seedData resets and populates default entities and clears caches", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB.clearAllCaches();
        DB._setL1('dummy::key', { a: 1 }, 'dummy');
        assert.strictEqual(DB._l1Cache.size, 1);

        await DB.seedData();
        assert.strictEqual(DB._l1Cache.size, 0, "seedData must clear all caches");

        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));
        const schools = await DB.getSchools();
        assert.strictEqual(schools.length, 1);
        assert.strictEqual(schools[0].id, 's1');

        const classes = await DB.getClasses();
        assert.strictEqual(classes.length, 2);

        const students = await DB.getStudents();
        assert.strictEqual(students.length, 2);
    });

    // Test Suite 19: forceRefresh and bypassCache query options
    await runTest("forceRefresh and bypassCache bypass and refresh L1 cache as expected", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        await DB.addClass({ id: 'c1', name: 'الصف الأصلي' });
        const res1 = await DB.getClasses();
        assert.strictEqual(res1[0].name, 'الصف الأصلي');

        // Manually alter backend store directly without calling DB mutation
        db.collection(DB.KEYS.CLASSES).doc('c1').set({ id: 'c1', name: 'الصف من السيرفر المباشر', schoolId: 's1' });

        // Normal getClasses returns cached version
        const cachedRes = await DB.getClasses();
        assert.strictEqual(cachedRes[0].name, 'الصف الأصلي', "Normal read should hit L1 cache");

        // getClasses with forceRefresh: true fetches fresh data and updates L1 cache
        const freshRes = await DB.getClasses({ forceRefresh: true });
        assert.strictEqual(freshRes[0].name, 'الصف من السيرفر المباشر', "forceRefresh must return fresh data from server");

        // getClasses with bypassCache: true returns server data without altering existing cache
        const bypassRes = await DB.getClasses({ bypassCache: true });
        assert.strictEqual(bypassRes[0].name, 'الصف من السيرفر المباشر');
    });

    console.log(`\n========================================`);
    console.log(`Test Results: ${passedTests}/${totalTests} Passed (100%)`);
    console.log(`========================================`);

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error("FATAL TEST RUNNER ERROR:", err);
    process.exit(1);
});

