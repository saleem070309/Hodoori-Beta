/**
 * @fileoverview Independent Adversarial Stress Test Suite for scripts/core-db.js
 * @milestone Milestone 1 (M1) Adversarial Verification
 * @author Core DB Concurrency & Stress Challenger
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
                if (peer !== this && peer.onmessage) {
                    try {
                        peer.onmessage({ data });
                    } catch (e) {
                        if (peer.onmessageerror) peer.onmessageerror(e);
                    }
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
    addEventListener: (event, handler) => {
        global.window._handlers = global.window._handlers || {};
        global.window._handlers[event] = global.window._handlers[event] || [];
        global.window._handlers[event].push(handler);
    },
    dispatchEvent: (event) => {
        const handlers = (global.window._handlers && global.window._handlers[event.type]) || [];
        for (const h of handlers) {
            try { h(event); } catch (_) {}
        }
    },
    BroadcastChannel: MockBroadcastChannel
};
global.document = {
    querySelector: () => null,
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    head: { appendChild: (el) => { if (el && el.onload) setTimeout(el.onload, 1); } }
};
global.BroadcastChannel = MockBroadcastChannel;
global.localStorage = new MockLocalStorage();
global.CustomEvent = class CustomEvent {
    constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict ? eventInitDict.detail : null;
    }
};

const DB = require('../../scripts/core-db.js');

// Mock Firestore database structure with latency simulation
function createMockFirestore(options = {}) {
    const latencyMs = options.latencyMs || 0;
    const store = new Map();

    const getCollectionStore = (name) => {
        if (!store.has(name)) store.set(name, new Map());
        return store.get(name);
    };

    const sleep = (ms) => ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve();

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
                    if (latencyMs > 0) await sleep(latencyMs);
                    let docs = Array.from(colStore.entries()).map(([id, data]) => ({
                        id,
                        data: () => ({ ...data }),
                        ref: {
                            id,
                            delete: async () => {
                                if (latencyMs > 0) await sleep(latencyMs);
                                colStore.delete(id);
                            },
                            update: async (d) => {
                                if (latencyMs > 0) await sleep(latencyMs);
                                colStore.set(id, { ...colStore.get(id), ...d });
                            }
                        }
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
                            if (latencyMs > 0) await sleep(latencyMs);
                            const exists = colStore.has(docId);
                            return {
                                exists,
                                id: docId,
                                data: () => exists ? { ...colStore.get(docId) } : {}
                            };
                        },
                        async set(data, opts) {
                            if (latencyMs > 0) await sleep(latencyMs);
                            if (opts && opts.merge && colStore.has(docId)) {
                                colStore.set(docId, { ...colStore.get(docId), ...data });
                            } else {
                                colStore.set(docId, { ...data });
                            }
                        },
                        async update(data) {
                            if (latencyMs > 0) await sleep(latencyMs);
                            if (colStore.has(docId)) {
                                colStore.set(docId, { ...colStore.get(docId), ...data });
                            } else {
                                colStore.set(docId, { ...data });
                            }
                        },
                        async delete() {
                            if (latencyMs > 0) await sleep(latencyMs);
                            colStore.delete(docId);
                        }
                    };
                },
                async add(data) {
                    if (latencyMs > 0) await sleep(latencyMs);
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
                    if (latencyMs > 0) await sleep(latencyMs);
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
const resultsLog = [];

async function runTest(name, fn) {
    totalTests++;
    const start = Date.now();
    try {
        await fn();
        const duration = Date.now() - start;
        const msg = `  ✓ PASS [${duration}ms]: ${name}`;
        console.log(msg);
        resultsLog.push({ name, status: 'PASS', duration, error: null });
        passedTests++;
    } catch (err) {
        const duration = Date.now() - start;
        const msg = `  ✗ FAIL [${duration}ms]: ${name}`;
        console.error(msg);
        console.error(err);
        resultsLog.push({ name, status: 'FAIL', duration, error: err.message });
    }
}

async function runAllStressTests() {
    console.log("===================================================================");
    console.log("  HODOORI CORE-DB M1 EMPIRICAL ADVERSARIAL STRESS TEST HARNESS    ");
    console.log("===================================================================\n");

    // =========================================================================
    // SECTION 1: High-Concurrency Coalescing Stress Test
    // =========================================================================
    console.log("--- Section 1: High-Concurrency Coalescing Stress ---");

    await runTest("1.1: 100 simultaneous concurrent calls with 5 distinct keys -> exactly 5 underlying query executions", async () => {
        DB.clearAllCaches();
        const executionCounts = {};
        const fetcherLatencyMs = 40;

        const makeFetcher = (key) => async () => {
            executionCounts[key] = (executionCounts[key] || 0) + 1;
            await new Promise(r => setTimeout(r, fetcherLatencyMs));
            return [{ key, data: `Payload for ${key}`, ts: Date.now() }];
        };

        const keys = ['key_A', 'key_B', 'key_C', 'key_D', 'key_E'];
        const calls = [];

        for (let i = 0; i < 100; i++) {
            const key = keys[i % keys.length];
            calls.push(DB._coalesce(`test::s1::${key}`, makeFetcher(key), {}, 'v2_students', 's1'));
        }

        const results = await Promise.all(calls);

        assert.strictEqual(results.length, 100, "All 100 calls must settle");

        for (const k of keys) {
            assert.strictEqual(executionCounts[k], 1, `Key ${k} should have executed exactly 1 time, got ${executionCounts[k]}`);
        }

        for (let i = 0; i < 100; i++) {
            const expectedKey = keys[i % keys.length];
            assert.strictEqual(results[i][0].key, expectedKey);
            assert.strictEqual(results[i][0].data, `Payload for ${expectedKey}`);
        }

        assert.strictEqual(DB._inflightQueries.size, 0, "In-flight query map must be empty");
        assert.strictEqual(DB._l1Cache.size, 5, "L1 Cache should contain all 5 unique entries");
    });

    await runTest("1.2: Mixed success and rejection concurrent coalescing (50 concurrent calls)", async () => {
        DB.clearAllCaches();
        let successRuns = 0;
        let failRuns = 0;

        const successFetcher = async () => {
            successRuns++;
            await new Promise(r => setTimeout(r, 30));
            return { status: 'OK' };
        };

        const failingFetcher = async () => {
            failRuns++;
            await new Promise(r => setTimeout(r, 30));
            throw new Error("Simulated Firestore Quota / Connection Reset");
        };

        const goodCalls = Array.from({ length: 25 }, () => DB._coalesce('good_key', successFetcher));
        const badCalls = Array.from({ length: 25 }, () => DB._coalesce('fail_key', failingFetcher));

        const goodResults = await Promise.all(goodCalls);
        assert.strictEqual(goodResults.length, 25);
        assert.strictEqual(successRuns, 1);
        assert.deepStrictEqual(goodResults[0], { status: 'OK' });

        const badResults = await Promise.allSettled(badCalls);
        assert.strictEqual(badResults.length, 25);
        assert.strictEqual(failRuns, 1);
        for (const res of badResults) {
            assert.strictEqual(res.status, 'rejected');
            assert.ok(res.reason.message.includes('Simulated Firestore Quota'));
        }

        assert.strictEqual(DB._inflightQueries.has('good_key'), false);
        assert.strictEqual(DB._inflightQueries.has('fail_key'), false);
        assert.strictEqual(DB._l1Cache.has('good_key'), true);
        assert.strictEqual(DB._l1Cache.has('fail_key'), false, "Failed queries must never enter L1 cache");
    });

    // =========================================================================
    // SECTION 2: Race Conditions During Rapid Invalidation & Parallel Reads/Writes
    // =========================================================================
    console.log("\n--- Section 2: Race Conditions During Rapid Invalidation & Parallel Read/Write ---");

    await runTest("2.1: In-flight read resolution vs mutation invalidation timing analysis", async () => {
        const { db } = createMockFirestore({ latencyMs: 25 });
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        await db.collection(DB.KEYS.STUDENTS).doc('st_init').set({
            academicId: 'st_init',
            name: 'طالب أولي',
            classId: 'c1',
            schoolId: 's1'
        });

        let readResolved = false;
        const readPromise = DB.getStudents('c1').then(res => {
            readResolved = true;
            return res;
        });

        await new Promise(r => setTimeout(r, 10));
        assert.strictEqual(readResolved, false, "Read should still be in flight");

        // Write new student
        await DB.addStudent({ academicId: 'st_new', name: 'طالب مضاف جديد', classId: 'c1' });

        // Wait for initial read to settle
        const initialReadRes = await readPromise;

        // Verify fresh read
        const nextRead = await DB.getStudents('c1', { forceRefresh: true });
        assert.strictEqual(nextRead.length, 2, "Fresh read should find both students in database");
    });

    await runTest("2.2: Interleaved parallel writes and reads stress (50 parallel operations)", async () => {
        const { db } = createMockFirestore({ latencyMs: 5 });
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const operations = [];
        let addedStudentsCount = 0;

        for (let i = 0; i < 50; i++) {
            if (i % 2 === 0) {
                const stId = `stress_st_${i}`;
                addedStudentsCount++;
                operations.push(DB.addStudent({ academicId: stId, name: `طالب إجهاد ${i}`, classId: 'c_stress' }));
            } else {
                operations.push(DB.getStudents('c_stress'));
            }
        }

        await Promise.all(operations);

        const finalStudents = await DB.getStudents('c_stress', { forceRefresh: true });
        assert.strictEqual(finalStudents.length, addedStudentsCount, `Database should contain all ${addedStudentsCount} added students`);
    });

    await runTest("2.3: [Race Condition Investigation] In-flight stale read caching after mutation invalidation", async () => {
        const { db } = createMockFirestore({ latencyMs: 40 });
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        await db.collection(DB.KEYS.STUDENTS).doc('st_1').set({
            academicId: 'st_1',
            name: 'طالب 1',
            classId: 'c_race',
            schoolId: 's1'
        });

        // T=0: Client A initiates read (snapshot will see only st_1)
        const clientAPromise = DB.getStudents('c_race');

        // T=15ms: Client B adds st_2 (writes DB, executes invalidateCache)
        await new Promise(r => setTimeout(r, 15));
        await DB.addStudent({ academicId: 'st_2', name: 'طالب 2', classId: 'c_race' });

        // T=50ms: Client A's read resolves with [st_1] and caches [st_1] in L1
        const resA = await clientAPromise;
        assert.strictEqual(resA.length, 1);

        // T=60ms: Client C does a standard read without forceRefresh
        const resC = await DB.getStudents('c_race');
        
        console.log(`     [Race Observation] Client C received ${resC.length} student(s) from L1 cache (DB has 2 students).`);
        // If resC.length is 1, it demonstrates stale L1 cache poisoning due to out-of-order write-then-read-settlement
    });

    // =========================================================================
    // SECTION 3: Cross-Tab Broadcast Stress & Malformed Message Ingestion
    // =========================================================================
    console.log("\n--- Section 3: Cross-Tab Broadcast Stress & Malformed Message Ingestion ---");

    await runTest("3.1: Burst flood of 1,000 cross-tab invalidation events across multiple tabs", async () => {
        DB.clearAllCaches();
        DB._initBroadcast();

        for (let i = 0; i < 10; i++) {
            DB._setL1(`${DB.KEYS.STUDENTS}::s1::class_${i}`, [{ id: `s_${i}` }], DB.KEYS.STUDENTS, 's1');
        }
        assert.strictEqual(DB._l1Cache.size, 10);

        const initialReceived = DB._stats.broadcastsReceived;

        for (let i = 0; i < 1000; i++) {
            const senderTab = `peer_tab_${i % 10}`;
            DB._handleSyncMessage({
                type: 'INVALIDATE',
                collection: DB.KEYS.STUDENTS,
                schoolId: 's1',
                senderTabId: senderTab,
                timestamp: Date.now()
            });
        }

        assert.strictEqual(DB._stats.broadcastsReceived, initialReceived + 1000);
        assert.strictEqual(DB._l1Cache.size, 0, "All student cache entries should be evicted by peer broadcasts");
    });

    await runTest("3.2: Malformed payload crash resilience (does not throw or corrupt runtime)", async () => {
        DB.clearAllCaches();
        DB._initBroadcast();

        const hostilePayloads = [
            null,
            undefined,
            '',
            12345,
            [],
            {},
            { type: 'UNKNOWN_ACTION', senderTabId: 'attacker' },
            { type: 'INVALIDATE' },
            { type: 'INVALIDATE', collection: null, schoolId: null, senderTabId: 'attacker' },
            { type: 'INVALIDATE', collection: DB.KEYS.STUDENTS, extraCollections: "NOT_AN_ARRAY", senderTabId: 'attacker' },
            { type: 'INVALIDATE', collection: DB.KEYS.STUDENTS, extraCollections: [null, undefined, 123], senderTabId: 'attacker' },
            { type: 'INVALIDATE', collection: DB.KEYS.STUDENTS, docId: { nested: 'object' }, senderTabId: 'attacker' },
            { type: 'CLEAR_ALL', senderTabId: DB._tabId }
        ];

        for (const payload of hostilePayloads) {
            assert.doesNotThrow(() => {
                DB._handleSyncMessage(payload);
            }, `Should not throw on payload: ${JSON.stringify(payload)}`);
        }
    });

    await runTest("3.3: Invalidate message with null/missing collection side-effect investigation", async () => {
        DB.clearAllCaches();
        DB._initBroadcast();

        // Seed classes and teachers
        DB._setL1(`${DB.KEYS.CLASSES}::s1::all`, [{ id: 'c1' }], DB.KEYS.CLASSES, 's1');
        DB._setL1(`${DB.KEYS.TEACHERS}::s1::all`, [{ id: 't1' }], DB.KEYS.TEACHERS, 's1');
        assert.strictEqual(DB._l1Cache.size, 2);

        // Receive invalidation with undefined/null collection
        DB._handleSyncMessage({
            type: 'INVALIDATE',
            collection: null,
            senderTabId: 'peer_tab_x'
        });

        console.log(`     [Broadcast Observation] After INVALIDATE with collection=null, L1 cache size is ${DB._l1Cache.size} (was 2).`);
        // If size is 0, it indicates _purgeL1Local(null) was executed, clearing all caches indiscriminately
    });

    // =========================================================================
    // SECTION 4: Memory Leak & Cache Footprint Analysis
    // =========================================================================
    console.log("\n--- Section 4: Memory Leak & Cache Footprint Analysis ---");

    await runTest("4.1: High-volume cache ingestion (10,000 distinct entries) & cleanup", async () => {
        DB.clearAllCaches();
        const memBefore = process.memoryUsage().heapUsed;

        for (let i = 0; i < 10000; i++) {
            DB._setL1(`v2_records::s1::rec_${i}`, { id: `rec_${i}`, val: `data_${i}`, index: i }, 'v2_records', 's1', 10000);
        }

        assert.strictEqual(DB._l1Cache.size, 10000, "Cache should hold exactly 10,000 entries");
        const memAfter = process.memoryUsage().heapUsed;
        const memGrowthMb = (memAfter - memBefore) / (1024 * 1024);
        console.log(`     [Metric] Memory for 10,000 L1 entries: ~${memGrowthMb.toFixed(2)} MB`);

        DB.clearAllCaches({ broadcast: false });
        assert.strictEqual(DB._l1Cache.size, 0, "L1 Cache must be completely empty after clearAllCaches()");
        assert.strictEqual(DB._inflightQueries.size, 0, "Inflight map must be empty");
        assert.strictEqual(DB._syncMetaCache.size, 0, "Sync meta map must be empty");
    });

    await runTest("4.2: In-flight map leak test after 1,000 concurrent settled queries", async () => {
        DB.clearAllCaches();
        const promises = [];

        for (let i = 0; i < 1000; i++) {
            const key = `query_${i % 50}`;
            promises.push(DB._coalesce(key, async () => {
                await new Promise(r => setTimeout(r, 2));
                return { id: key };
            }));
        }

        await Promise.all(promises);
        assert.strictEqual(DB._inflightQueries.size, 0, "In-flight query Map must have zero remaining entries after completion");
    });

    // =========================================================================
    // SECTION 5: Delta Synchronization Stress & Edge Cases
    // =========================================================================
    console.log("\n--- Section 5: Delta Sync Edge Cases & High-Volume Divergence Stress ---");

    await runTest("5.1: Delta sync timestamp margin & deduplication with 1,000 records", async () => {
        const safeTs = DB._computeSafeTimestamp('2026-08-29T12:00:05.000Z', 5000);
        assert.strictEqual(safeTs, '2026-08-29T12:00:00.000Z', "Safe timestamp should subtract 5000ms margin");
        assert.strictEqual(DB._computeSafeTimestamp('invalid-date'), 'invalid-date');

        const baseline = [];
        for (let i = 0; i < 500; i++) {
            baseline.push({
                id: `rec_${i}`,
                timestamp: new Date(Date.UTC(2026, 7, 20, 10, i % 60)).toISOString(),
                status: 'present'
            });
        }

        const delta = [];
        for (let i = 400; i < 600; i++) {
            delta.push({
                id: `rec_${i}`,
                timestamp: new Date(Date.UTC(2026, 7, 21, 10, i % 60)).toISOString(),
                status: 'updated_status'
            });
        }
        for (let i = 600; i < 800; i++) {
            delta.push({
                id: `rec_${i}`,
                timestamp: new Date(Date.UTC(2026, 7, 22, 10, i % 60)).toISOString(),
                status: 'new_status'
            });
        }

        const merged = DB._mergeDeltaIntoBaseline(baseline, delta);
        assert.strictEqual(merged.length, 800, "Merged array should contain exactly 800 unique records");

        const rec450 = merged.find(r => r.id === 'rec_450');
        assert.strictEqual(rec450.status, 'updated_status', "Existing document should be updated by delta");

        for (let i = 0; i < merged.length - 1; i++) {
            const tsA = merged[i].timestamp || '';
            const tsB = merged[i + 1].timestamp || '';
            assert.ok(tsA >= tsB, `Descending order violation at index ${i}: ${tsA} < ${tsB}`);
        }
    });

    // =========================================================================
    // SECTION 6: Arabic Fuzzy Matching Stress & Adversarial Inputs
    // =========================================================================
    console.log("\n--- Section 6: Arabic Fuzzy Matching Stress & Adversarial Inputs ---");

    await runTest("6.1: Arabic fuzzy matching resilience across 2,000 diverse combinations & edge cases", async () => {
        const testPairs = [
            { target: 'مُحَمَّدٌ عَبْدُ الرَّحْمَنِ', query: 'محمد عبد الرحمن', expectedMin: 90 },
            { target: 'إِبْرَاهِيمُ عَلِيّ', query: 'ابراهيم علي', expectedMin: 90 },
            { target: 'أَحْمَدُ بْنُ مُحَمَّدِ بْنِ سَالِمٍ الخَدِيوِيّ', query: 'احمد الخديوي', expectedMin: 90 },
            { target: 'فَاطِمَةُ الزَّهْرَاءِ', query: 'فاطمه الزهراء', expectedMin: 90 },
            { target: 'يَحْيَى بْنُ زَكَرِيَّا', query: 'يحيى زكريا', expectedMin: 90 },
            { target: 'عَمْرُو بْنُ العَاصِ', query: 'عمرو العاص', expectedMin: 90 },
            { target: 'سَارَةُ خَالِدْ', query: 'ساره خالد', expectedMin: 90 },
            { target: '', query: 'احمد', expectedMin: 0, expectedMax: 0 },
            { target: 'احمد', query: '', expectedMin: 0, expectedMax: 0 },
            { target: null, query: 'احمد', expectedMin: 0, expectedMax: 0 },
            { target: 'احمد', query: null, expectedMin: 0, expectedMax: 0 },
            { target: undefined, query: undefined, expectedMin: 0, expectedMax: 0 },
            { target: 'John Doe', query: 'John', expectedMin: 0 },
            { target: '12345', query: '12345', expectedMin: 100 }
        ];

        for (const pair of testPairs) {
            const score = DB.scoreArabicMatch(pair.target, pair.query);
            if (pair.expectedMin !== undefined) {
                assert.ok(score >= pair.expectedMin, `Score for target="${pair.target}", query="${pair.query}" was ${score}, expected >= ${pair.expectedMin}`);
            }
            if (pair.expectedMax !== undefined) {
                assert.ok(score <= pair.expectedMax, `Score for target="${pair.target}", query="${pair.query}" was ${score}, expected <= ${pair.expectedMax}`);
            }
        }

        const baseNames = ['محمد', 'أحمد', 'عبدالله', 'محمود', 'علي', 'سالم', 'إبراهيم', 'سليم', 'خالد', 'طارق'];
        const familyNames = ['الخديوي', 'المحمدي', 'الغامدي', 'العتيبي', 'السعيد', 'النجار', 'الحربي', 'الشريف'];

        for (let i = 0; i < 2000; i++) {
            const first = baseNames[i % baseNames.length];
            const last = familyNames[i % familyNames.length];
            const fullName = `${first} بن فلان ${last}`;
            const queryName = `${first} ${last}`;
            const score = DB.scoreArabicMatch(fullName, queryName);
            assert.ok(score >= 75, `Expected score >= 75 for ${fullName} vs ${queryName}, got ${score}`);
        }
    });

    // =========================================================================
    // SECTION 7: API Boundary & Defensive Cloning Analysis
    // =========================================================================
    console.log("\n--- Section 7: API Boundary & Defensive Cloning Analysis ---");

    await runTest("7.1: Top-level and 1st-level array element defensive cloning verification", async () => {
        DB.clearAllCaches();
        const testArray = [
            { id: 1, name: 'طالب 1' },
            { id: 2, name: 'طالب 2' }
        ];

        DB._setL1('test::array::mutation', testArray, 'v2_students', 's1');

        const read1 = DB._getL1('test::array::mutation');
        read1.push({ id: 3, name: 'طالب 3' });
        read1[0].name = 'اسم معدل';

        const read2 = DB._getL1('test::array::mutation');
        assert.strictEqual(read2.length, 2, "Cached array length should be unchanged by consumer push");
        assert.strictEqual(read2[0].name, 'طالب 1', "Cached item field should be unchanged by consumer edit");
    });

    await runTest("7.2: Nested object defensive cloning boundary analysis", async () => {
        DB.clearAllCaches();
        const nestedSettings = {
            schoolName: 'مدرسة التفوق',
            levels: ['ابتدائي', 'متوسط', 'ثانوي']
        };

        DB._setL1('test::nested::settings', nestedSettings, 'v2_settings', 's1');

        const read1 = DB._getL1('test::nested::settings');
        read1.schoolName = 'مدرسة تم اختراقها';
        read1.levels.push('جامعي');

        const read2 = DB._getL1('test::nested::settings');
        assert.strictEqual(read2.schoolName, 'مدرسة التفوق', "Top-level property should be protected");
        
        console.log(`     [Cloning Observation] read2.levels length is ${read2.levels.length} (was 3).`);
        // Demonstrates that shallow spread { ...entry.data } preserves nested array reference
    });

    console.log("\n===================================================================");
    console.log(`  STRESS TEST SUMMARY: ${passedTests}/${totalTests} Passed (${((passedTests/totalTests)*100).toFixed(1)}%)`);
    console.log("===================================================================");

    return {
        total: totalTests,
        passed: passedTests,
        failed: totalTests - passedTests,
        results: resultsLog
    };
}

runAllStressTests().then(summary => {
    if (summary.failed > 0) {
        process.exit(1);
    }
}).catch(err => {
    console.error("FATAL SUITE EXECUTION ERROR:", err);
    process.exit(1);
});
