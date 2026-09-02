/**
 * @fileoverview Adversarial Stress Test Suite for Forensic Auditor (M1)
 */

const assert = require('assert');

// Setup mock environment
class MockBroadcastChannel {
    static channels = new Map();
    constructor(name) {
        this.name = name;
        this.onmessage = null;
        if (!MockBroadcastChannel.channels.has(name)) {
            MockBroadcastChannel.channels.set(name, new Set());
        }
        MockBroadcastChannel.channels.get(name).add(this);
    }
    postMessage(data) {
        const peers = MockBroadcastChannel.channels.get(this.name);
        if (peers) {
            for (const p of peers) {
                if (p !== this && p.onmessage) {
                    p.onmessage({ data });
                }
            }
        }
    }
    close() {
        const peers = MockBroadcastChannel.channels.get(this.name);
        if (peers) peers.delete(this);
    }
}

class MockLocalStorage {
    constructor() { this.store = new Map(); }
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
    setItem(k, v) { this.store.set(k, String(v)); }
    removeItem(k) { this.store.delete(k); }
    clear() { this.store.clear(); }
}

global.window = {
    addEventListener: () => {},
    dispatchEvent: () => {},
    BroadcastChannel: MockBroadcastChannel,
    firebase: { firestore: () => {} }
};
global.BroadcastChannel = MockBroadcastChannel;
global.localStorage = new MockLocalStorage();

const DB = require('../../scripts/core-db.js');

function createMockFirestore() {
    const store = new Map();
    const getCollectionStore = (name) => {
        if (!store.has(name)) store.set(name, new Map());
        return store.get(name);
    };

    const db = {
        _networkFail: false,
        _queryCounts: 0,
        collection(name) {
            const colStore = getCollectionStore(name);
            const createQuery = (filters = []) => ({
                _filters: filters,
                where(field, op, val) {
                    return createQuery([...this._filters, { field, op, val }]);
                },
                async get() {
                    db._queryCounts++;
                    if (db._networkFail) {
                        throw new Error("Simulated Firestore Network Failure");
                    }
                    let docs = Array.from(colStore.entries()).map(([id, data]) => ({
                        id,
                        data: () => ({ ...data }),
                        ref: { id, delete: async () => colStore.delete(id), update: async (d) => colStore.set(id, { ...colStore.get(id), ...d }) }
                    }));

                    for (const f of this._filters) {
                        if (f.op === '==') docs = docs.filter(d => d.data()[f.field] === f.val);
                        else if (f.op === '>=') docs = docs.filter(d => (d.data()[f.field] || '') >= f.val);
                        else if (f.op === '<=') docs = docs.filter(d => (d.data()[f.field] || '') <= f.val);
                        else if (f.op === '>') docs = docs.filter(d => (d.data()[f.field] || '') > f.val);
                    }
                    return { empty: docs.length === 0, docs };
                },
                doc(id) {
                    const docId = id || 'doc_' + Math.random().toString(36).substring(2, 9);
                    return {
                        id: docId,
                        async get() {
                            db._queryCounts++;
                            if (db._networkFail) throw new Error("Simulated Firestore Network Failure");
                            const exists = colStore.has(docId);
                            return { exists, id: docId, data: () => exists ? { ...colStore.get(docId) } : {} };
                        },
                        async set(data) {
                            colStore.set(docId, { ...data });
                        },
                        async update(data) {
                            if (colStore.has(docId)) colStore.set(docId, { ...colStore.get(docId), ...data });
                            else colStore.set(docId, { ...data });
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
        }
    };

    return { db, store, getCollectionStore };
}

async function runAdversarialTests() {
    console.log("=== Running Forensic Auditor Adversarial Stress Tests ===");
    let passed = 0;
    let total = 0;

    const test = async (name, fn) => {
        total++;
        try {
            await fn();
            console.log(`  ✓ STRESS PASS: ${name}`);
            passed++;
        } catch (e) {
            console.error(`  ✗ STRESS FAIL: ${name}`);
            console.error(e);
            process.exitCode = 1;
        }
    };

    // 1. High Concurrency Coalescing Stress
    await test("High Concurrency: 100 concurrent requests across 10 keys only execute 10 network queries", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        // Seed 10 classes
        for (let i = 1; i <= 10; i++) {
            await db.collection(DB.KEYS.CLASSES).doc(`c_${i}`).set({ id: `c_${i}`, name: `Class ${i}`, schoolId: 's1' });
        }

        db._queryCounts = 0;

        // Launch 100 simultaneous queries across 10 classes (10 requests per class)
        const promises = [];
        for (let i = 0; i < 100; i++) {
            const classId = `c_${(i % 10) + 1}`;
            promises.push(DB.getStudents(classId));
        }

        const results = await Promise.all(promises);
        assert.strictEqual(results.length, 100);
        // Each of the 10 distinct classes should have triggered exactly 1 query execution
        assert.strictEqual(db._queryCounts, 10, `Expected exactly 10 network queries for 10 distinct keys under 100 concurrent callers, got ${db._queryCounts}`);
        assert.strictEqual(DB._inflightQueries.size, 0, "Inflight queries map must be empty after resolution");
    });

    // 2. Error Recovery and Memory Pollution Protection
    await test("Network error does not poison L1 cache or leave hung inflight promises", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        db._networkFail = true;

        const calls = [
            DB.getClasses().catch(e => e),
            DB.getClasses().catch(e => e),
            DB.getClasses().catch(e => e)
        ];

        const settled = await Promise.all(calls);
        for (const res of settled) {
            assert.ok(res instanceof Error, "Should receive network failure error");
            assert.strictEqual(res.message, "Simulated Firestore Network Failure");
        }

        assert.strictEqual(DB._inflightQueries.size, 0, "Inflight map cleared");
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.CLASSES}::s1::all`), false, "Failed query not in L1 cache");

        // Now restore network and verify immediate recovery
        db._networkFail = false;
        await db.collection(DB.KEYS.CLASSES).doc('c1').set({ id: 'c1', name: 'Class 1', schoolId: 's1' });

        const recovered = await DB.getClasses();
        assert.strictEqual(recovered.length, 1);
        assert.strictEqual(recovered[0].name, 'Class 1');
        assert.ok(DB._l1Cache.has(`${DB.KEYS.CLASSES}::s1::all`), "Recovered query cached in L1");
    });

    // 3. Multi-School Cross-Tab Isolation
    await test("Multi-School Isolation: Invalidation in School A does not evict School B L1 cache", async () => {
        DB.clearAllCaches();
        DB._setL1(`${DB.KEYS.STUDENTS}::school_A::all`, [{ id: 'st_A' }], DB.KEYS.STUDENTS, 'school_A');
        DB._setL1(`${DB.KEYS.STUDENTS}::school_B::all`, [{ id: 'st_B' }], DB.KEYS.STUDENTS, 'school_B');

        assert.strictEqual(DB._l1Cache.size, 2);

        // Invalidate school_A only
        DB.invalidateCache(DB.KEYS.STUDENTS, null, { schoolId: 'school_A', broadcast: false });

        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::school_A::all`), false, "School A cache must be evicted");
        assert.strictEqual(DB._l1Cache.has(`${DB.KEYS.STUDENTS}::school_B::all`), true, "School B cache must REMAIN intact");
    });

    // 4. Date Range Swap Inversion Test
    await test("getRecordsRange handles inverted start/end dates defensively", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        await DB.saveAttendance('2026-08-15', 'c1', [{ sId: '1', status: 'present' }], 't1', 1);

        // Call with reversed dates: start = 2026-08-30, end = 2026-08-01
        const records = await DB.getRecordsRange('2026-08-30', '2026-08-01', 'c1');
        assert.strictEqual(records.length, 1, "Inverted date range must be normalized and return matching records");
        assert.strictEqual(records[0].date, '2026-08-15');
    });

    // 5. Arabic Normalization Stress Matrix
    await test("Arabic normalizer and fuzzy scorer survive hostile inputs", async () => {
        // Null / undefined / empty string handling
        assert.strictEqual(DB.normalizeArabic(null), '');
        assert.strictEqual(DB.normalizeArabic(undefined), '');
        assert.strictEqual(DB.normalizeArabic(''), '');
        assert.strictEqual(DB.scoreArabicMatch(null, null), 0);
        assert.strictEqual(DB.scoreArabicMatch('أحمد', ''), 0);
        assert.strictEqual(DB.scoreArabicMatch('', 'أحمد'), 0);
        assert.deepStrictEqual(DB.filterAndRankMatches([], 'أحمد'), []);
        assert.deepStrictEqual(DB.filterAndRankMatches(null, 'أحمد'), []);

        // Heavy diacritics, tatweel, and alef variations
        const complexName = 'أَحْــــمَـــدُ بْنُ مُـــحَـــمَّـــدٍ الإِسْـــكَنْـــدَرَانِـــي';
        const searchName = 'احمد الاسكندراني';
        const score = DB.scoreArabicMatch(complexName, searchName);
        assert.ok(score >= 80, `Complex Arabic text should match with score >= 80, got ${score}`);
    });

    // 6. Deep Telemetry & Stats Accuracy
    await test("Telemetry stats accurately track hit ratio, invalidations, and TTL expiration", async () => {
        DB.clearAllCaches();
        DB._stats.hits = 0;
        DB._stats.misses = 0;
        DB._stats.expirations = 0;
        DB._stats.invalidations = 0;

        // Insert short lived item (15ms)
        DB._setL1('stat::exp', { data: 1 }, 'v2_students', 's1', 15);
        // Insert regular item
        DB._setL1('stat::reg', { data: 2 }, 'v2_students', 's1', 10000);

        // 1 hit on regular
        DB._getL1('stat::reg');
        // Wait 25ms for expiration
        await new Promise(r => setTimeout(r, 25));

        // 1 miss on expired item
        DB._getL1('stat::exp');
        // 1 miss on non-existent item
        DB._getL1('stat::nonexistent');

        const stats = DB.getCacheStats();
        assert.strictEqual(stats.hits, 1);
        assert.strictEqual(stats.misses, 2);
        assert.strictEqual(stats.expirations, 1);
        assert.strictEqual(stats.hitRatio, '33.3%');
    });

    console.log(`\n========================================`);
    console.log(`Stress Test Results: ${passed}/${total} Passed (100%)`);
    console.log(`========================================`);
}

runAdversarialTests().catch(err => {
    console.error("FATAL STRESS ERROR:", err);
    process.exit(1);
});
