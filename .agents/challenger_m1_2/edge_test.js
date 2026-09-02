/**
 * @fileoverview Adversarial Edge-Case Verification Suite for Hodoori Core DB & Delta Sync
 * @role Empirical Challenger (critic, specialist)
 * @target scripts/core-db.js
 */

const assert = require('assert');

// Mock browser environment for Node.js
class MockBroadcastChannel {
    static channels = new Map();
    static _throwOnPostMessage = false;

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
        if (MockBroadcastChannel._throwOnPostMessage) {
            throw new Error("BroadcastChannel IPC Quota Exhausted");
        }
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
        this._throwOnSet = false;
    }
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }
    setItem(key, value) {
        if (this._throwOnSet) {
            throw new Error("QuotaExceededError: DOM Exception 22");
        }
        this.store.set(key, String(value));
    }
    removeItem(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}

global.document = {
    querySelector: () => null,
    createElement: () => ({ src: '', onload: () => {}, onerror: () => {} }),
    head: { appendChild: () => {} }
};

global.window = {
    addEventListener: (event, handler) => {
        if (!global.window._listeners) global.window._listeners = {};
        if (!global.window._listeners[event]) global.window._listeners[event] = [];
        global.window._listeners[event].push(handler);
    },
    dispatchEvent: (evt) => {
        if (!global.window._listeners || !global.window._listeners[evt.type]) return;
        for (const h of global.window._listeners[evt.type]) {
            try { h(evt); } catch (_) {}
        }
    },
    BroadcastChannel: MockBroadcastChannel
};
global.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
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
        _callCounts: {},
        _getCounts: {},
        _settingsCalled: false,
        _persistenceMode: null,
        _failNextQuery: null,
        _queryDelayMs: 0,

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
                    db._getCounts[name] = (db._getCounts[name] || 0) + 1;
                    if (db._queryDelayMs > 0) {
                        await new Promise(r => setTimeout(r, db._queryDelayMs));
                    }
                    if (db._failNextQuery) {
                        const err = db._failNextQuery;
                        db._failNextQuery = null;
                        throw err;
                    }
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

let totalStressTests = 0;
let passedStressTests = 0;
let failedStressTests = 0;
const results = [];

async function test(category, description, fn) {
    totalStressTests++;
    const testRecord = { category, description, status: 'RUNNING', error: null };
    try {
        await fn();
        testRecord.status = 'PASS';
        passedStressTests++;
        console.log(`  ✓ [${category}] ${description}`);
    } catch (err) {
        testRecord.status = 'FAIL';
        testRecord.error = err.message || String(err);
        failedStressTests++;
        console.error(`  ✗ [${category}] ${description}`);
        console.error(`    Error: ${err.message}`);
    }
    results.push(testRecord);
}

function setupMockDB() {
    const mock = createMockFirestore();
    DB.dbInstance = mock.db;
    DB._persistenceConfigured = true;
    DB.clearAllCaches();
    return mock;
}

async function runAdversarialSuite() {
    console.log("==================================================================");
    console.log("   HODOORI CORE DB & DELTA SYNC ADVERSARIAL STRESS TEST SUITE     ");
    console.log("==================================================================");

    // =========================================================================
    // SECTION 1: CLOCK SKEW & DELTA SYNC STRESS TESTING
    // =========================================================================
    console.log("\n[1/5] Stress Testing: Clock Skew & Delta Sync Scenarios...");

    await test("CLOCK_SKEW", "Negative time difference in _computeSafeTimestamp near epoch 1970", async () => {
        const epochIso = "1970-01-01T00:00:01.000Z";
        const result = DB._computeSafeTimestamp(epochIso, 5000);
        assert.strictEqual(result, "1970-01-01T00:00:00.000Z", "Must clamp to epoch zero and not produce negative epoch string");
    });

    await test("CLOCK_SKEW", "Extreme margin in _computeSafeTimestamp (1 year skew)", async () => {
        const dateIso = "2026-08-29T12:00:00.000Z";
        const oneYearMs = 365 * 24 * 60 * 60 * 1000;
        const result = DB._computeSafeTimestamp(dateIso, oneYearMs);
        const expected = new Date(new Date(dateIso).getTime() - oneYearMs).toISOString();
        assert.strictEqual(result, expected);
    });

    await test("CLOCK_SKEW", "Corrupted or non-date strings in _computeSafeTimestamp fall back gracefully", async () => {
        assert.strictEqual(DB._computeSafeTimestamp("NOT_A_DATE"), "NOT_A_DATE");
        assert.strictEqual(DB._computeSafeTimestamp(null), "1970-01-01T00:00:00.000Z");
        assert.strictEqual(DB._computeSafeTimestamp(undefined), undefined);
        assert.strictEqual(DB._computeSafeTimestamp(""), "");
    });

    await test("CLOCK_SKEW", "Forward clock jump in document timestamps during Delta Sync", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.clear();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);

        // 1. Baseline sync with normal timestamp
        recordsStore.set('rec1', { schoolId: 's1', timestamp: '2026-08-29T10:00:00.000Z', notes: 'Normal 1' });
        const initial = await DB.getRecords(null, null, { useDeltaSync: true });
        assert.strictEqual(initial.length, 1);

        // 2. Future document inserted (Clock jumped forward to year 2030 on a misconfigured client)
        recordsStore.set('rec_future', { schoolId: 's1', timestamp: '2030-01-01T00:00:00.000Z', notes: 'Future' });

        // Delta sync should pick up the future document
        const syncedWithFuture = await DB.getRecords(null, null, { useDeltaSync: true });
        assert.strictEqual(syncedWithFuture.length, 2);
        assert.strictEqual(syncedWithFuture[0].id, 'rec_future');

        // Check that sync metadata holds the max timestamp
        const meta = DB._getSyncMeta(`${DB.KEYS.RECORDS}::s1`);
        assert.strictEqual(meta.lastSync, '2030-01-01T00:00:00.000Z');

        // 3. Normal document arrives after future document: Server receives doc with 2026-08-29T10:30:00.000Z
        recordsStore.set('rec2', { schoolId: 's1', timestamp: '2026-08-29T10:30:00.000Z', notes: 'Normal 2' });

        // Using forceFullSync recovers complete state
        const recovered = await DB.getRecords(null, null, { useDeltaSync: true, forceFullSync: true });
        assert.strictEqual(recovered.length, 3);
    });

    await test("CLOCK_SKEW", "Backward clock skew on client (Client clock behind server)", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.clear();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('r1', { schoolId: 's1', timestamp: '2026-08-29T10:00:00.000Z', notes: 'R1' });
        await DB.getRecords(null, null, { useDeltaSync: true });

        // Server gets document stamped at 10:00:02 (within the 5000ms safety window)
        recordsStore.set('r2', { schoolId: 's1', timestamp: '2026-08-29T10:00:02.000Z', notes: 'R2 in safety margin' });

        // Delta sync with 5s safety margin queries timestamp > 09:59:55 and catches r2
        const delta = await DB.getRecords(null, null, { useDeltaSync: true });
        assert.strictEqual(delta.length, 2, "Safety window margin must capture documents within 5s clock skew");
        assert.strictEqual(delta.some(d => d.id === 'r2'), true);
    });

    await test("CLOCK_SKEW", "Delta merging with missing, empty, or malformed doc timestamps", async () => {
        const baseline = [
            { id: 'b1', notes: 'No timestamp' },
            { id: 'b2', date: '2026-08-20', notes: 'Only date' },
            { id: 'b3', timestamp: '2026-08-25T00:00:00.000Z' }
        ];
        const delta = [
            { id: 'd1', timestamp: null, date: null, notes: 'Null timestamps' },
            { id: 'd2', timestamp: '2026-08-28T00:00:00.000Z' },
            { id: 'b1', timestamp: '2026-08-29T00:00:00.000Z', notes: 'Updated b1 with timestamp' }
        ];

        const merged = DB._mergeDeltaIntoBaseline(baseline, delta);
        assert.strictEqual(merged.length, 5);
        assert.strictEqual(merged[0].id, 'b1', "b1 has newest timestamp 2026-08-29");
        assert.strictEqual(merged[1].id, 'd2');
        assert.strictEqual(merged[2].id, 'b3');
    });

    await test("CLOCK_SKEW", "_extractMaxTimestamp with heterogeneous timestamp/date fields", async () => {
        const docs = [
            { id: '1' },
            { id: '2', date: '2026-08-20' },
            { id: '3', timestamp: '2026-08-25T12:00:00.000Z' },
            { id: '4', timestamp: '2026-08-21T08:00:00.000Z', date: '2026-08-21' }
        ];
        const max = DB._extractMaxTimestamp(docs, 'FALLBACK');
        assert.strictEqual(max, '2026-08-25T12:00:00.000Z');

        assert.strictEqual(DB._extractMaxTimestamp([], 'FALLBACK'), 'FALLBACK');
        assert.strictEqual(DB._extractMaxTimestamp(null, 'FALLBACK'), 'FALLBACK');
        assert.strictEqual(DB._extractMaxTimestamp([{ id: 'no_time' }], 'FALLBACK'), 'FALLBACK');
    });

    // =========================================================================
    // SECTION 2: CORRUPTED OR PARTIAL CACHE & RECOVERY TESTING
    // =========================================================================
    console.log("\n[2/5] Stress Testing: Corrupted & Partial Cache Recovery...");

    await test("CACHE_CORRUPTION", "Corrupted JSON in localStorage __hodoori_sync_meta__ handled safely", async () => {
        DB._syncMetaCache.clear();
        localStorage.setItem('__hodoori_sync_meta__', '{{INVALID_JSON_CORRUPTED');
        
        const meta = DB._getSyncMeta('v2_records::s1');
        assert.strictEqual(meta, null);

        DB._setSyncMeta('v2_records::s1', { lastSync: '2026-08-29', version: 1 });
        const retrieved = DB._getSyncMeta('v2_records::s1');
        assert.deepStrictEqual(retrieved, { lastSync: '2026-08-29', version: 1 });
    });

    await test("CACHE_CORRUPTION", "Corrupted JSON in localStorage attendance_current_user", async () => {
        localStorage.setItem(DB.KEYS.CURRENT_USER, '{CORRUPTED_USER_JSON');
        const schoolId = DB.getCurrentUserSchoolId();
        assert.strictEqual(schoolId, null, "Corrupted user session JSON must safely return null without throwing");
    });

    await test("CACHE_CORRUPTION", "Corrupted storage event payload from another tab", async () => {
        DB.clearAllCaches();
        DB._setL1('test::key', { data: 1 }, 'v2_classes');

        if (global.window._listeners && global.window._listeners['storage']) {
            for (const handler of global.window._listeners['storage']) {
                handler({ key: '__hodoori_cache_inval__', newValue: '{CORRUPTED_EVENT_JSON' });
            }
        }
        assert.strictEqual(DB._l1Cache.has('test::key'), true);
    });

    await test("CACHE_CORRUPTION", "Malicious or malformed payloads to _handleSyncMessage", async () => {
        DB.clearAllCaches();
        DB._setL1('v2_classes::s1::all', [{ id: 'c1' }], 'v2_classes', 's1');

        DB._handleSyncMessage(null);
        DB._handleSyncMessage(undefined);
        DB._handleSyncMessage("invalid string");
        DB._handleSyncMessage(12345);
        DB._handleSyncMessage([]);
        DB._handleSyncMessage({});
        DB._handleSyncMessage({ type: 'UNKNOWN_TYPE' });

        assert.strictEqual(DB._l1Cache.has('v2_classes::s1::all'), true);

        DB._handleSyncMessage({
            type: 'INVALIDATE',
            collection: 'v2_classes',
            extraCollections: [null, undefined, 123, 'v2_students'],
            senderTabId: 'other_tab'
        });
        assert.strictEqual(DB._l1Cache.has('v2_classes::s1::all'), false);
    });

    await test("CACHE_CORRUPTION", "Defensive cloning handles primitive and null cache contents", async () => {
        DB.clearAllCaches();
        DB._setL1('test::null', null);
        DB._setL1('test::number', 42);
        DB._setL1('test::string', 'hello');
        DB._setL1('test::bool', true);
        DB._setL1('test::empty_array', []);
        DB._setL1('test::array_nulls', [null, undefined, { a: 1 }]);

        assert.strictEqual(DB._getL1('test::null'), null);
        assert.strictEqual(DB._getL1('test::number'), 42);
        assert.strictEqual(DB._getL1('test::string'), 'hello');
        assert.strictEqual(DB._getL1('test::bool'), true);
        assert.deepStrictEqual(DB._getL1('test::empty_array'), []);
        assert.deepStrictEqual(DB._getL1('test::array_nulls'), [null, undefined, { a: 1 }]);
    });

    await test("CACHE_CORRUPTION", "LocalStorage quota exhaustion resilience on invalidateCache & clearAllCaches", async () => {
        global.localStorage._throwOnSet = true;

        try {
            const evicted = DB.invalidateCache('v2_students', 's1');
            assert.strictEqual(typeof evicted, 'number');

            const cleared = DB.clearAllCaches();
            assert.strictEqual(cleared, true);
        } finally {
            global.localStorage._throwOnSet = false;
        }
    });

    await test("CACHE_CORRUPTION", "BroadcastChannel postMessage failure resilience", async () => {
        MockBroadcastChannel._throwOnPostMessage = true;

        try {
            DB.invalidateCache('v2_teachers');
            DB.clearAllCaches();
        } finally {
            MockBroadcastChannel._throwOnPostMessage = false;
        }
    });

    await test("CACHE_CORRUPTION", "In-flight coalesce handles non-Error exception types (string, object, null)", async () => {
        DB.clearAllCaches();

        const throwString = async () => { throw "String error from legacy library"; };
        await assert.rejects(DB._coalesce('coalesce::string_err', throwString), /String error/);
        assert.strictEqual(DB._inflightQueries.has('coalesce::string_err'), false);

        const throwNull = async () => { throw null; };
        await assert.rejects(DB._coalesce('coalesce::null_err', throwNull));
        assert.strictEqual(DB._inflightQueries.has('coalesce::null_err'), false);
    });

    await test("CACHE_CORRUPTION", "Delta Sync handles network error and gracefully falls back to cached baseline", async () => {
        const { db, getCollectionStore } = setupMockDB();
        localStorage.clear();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('rec1', { schoolId: 's1', timestamp: '2026-08-29T10:00:00.000Z', notes: 'Baseline' });

        const base = await DB.getRecords(null, null, { useDeltaSync: true });
        assert.strictEqual(base.length, 1);

        db._failNextQuery = new Error("UNAVAILABLE: network connection broken");

        const fallback = await DB.getRecords(null, null, { useDeltaSync: true });
        assert.strictEqual(fallback.length, 1, "Must return cached baseline when delta query fails");
        assert.strictEqual(fallback[0].id, 'rec1');
    });

    // =========================================================================
    // SECTION 3: ARABIC FUZZY MATCHING STRESS & ADVERSARIAL INPUTS
    // =========================================================================
    console.log("\n[3/5] Stress Testing: Arabic Fuzzy Matching Edge Cases...");

    await test("ARABIC_FUZZY", "Extreme stacked diacritics and Harakat variations", async () => {
        const heavilyDiacritic = "أَحْــــمَـــدُ بْنُ مُـــحَــــمَّـــــدٍ";
        const normalized = DB.normalizeArabic(heavilyDiacritic);
        assert.strictEqual(normalized, "احمد بن محمد");

        const target = "أحمد محمد";
        const query = "احمد بن محمد";
        assert.ok(DB.scoreArabicMatch(target, query) >= 90);
    });

    await test("ARABIC_FUZZY", "Extensive Tatweel (Kashida) repetition", async () => {
        const longTatweel = "ســـــــــــــلـــــــــــــيـــــــــــــم";
        assert.strictEqual(DB.normalizeArabic(longTatweel), "سليم");
        assert.strictEqual(DB.scoreArabicMatch("سليم الخديوي", longTatweel + " الخديوي"), 100);
    });

    await test("ARABIC_FUZZY", "Quranic annotation symbols and dagger alif normalization", async () => {
        const quranic = "إِسْمَٰعِيلَۖ";
        const normalized = DB.normalizeArabic(quranic);
        assert.strictEqual(normalized, "اسمعيل");
    });

    await test("ARABIC_FUZZY", "Alif Wasla (ٱ) and all Hamza forms (ؤ, ئ, ء, إ, أ, آ)", async () => {
        const wasla = "ٱبْتِسَام";
        assert.strictEqual(DB.normalizeArabic(wasla), "ابتسام");

        const hamzas = "مُؤْمِنْ عِئْشَة سَمَاء آيَة إِيمَان أَمَل";
        const normHamzas = DB.normalizeArabic(hamzas);
        assert.strictEqual(normHamzas, "ممن عشه سما ايه ايمان امل");
    });

    await test("ARABIC_FUZZY", "Ta Marbuta (ة) vs Ha (ه) and Alef Maksura (ى) vs Yeh (ي)", async () => {
        const str1 = "فاطمة الهدى";
        const str2 = "فاطمه الهدي";
        assert.strictEqual(DB.normalizeArabic(str1), DB.normalizeArabic(str2));
        assert.strictEqual(DB.scoreArabicMatch(str1, str2), 100);
    });

    await test("ARABIC_FUZZY", "Empty, null, undefined, numeric, and boolean inputs to all Arabic matchers", async () => {
        // normalizeArabic
        assert.strictEqual(DB.normalizeArabic(""), "");
        assert.strictEqual(DB.normalizeArabic(null), "");
        assert.strictEqual(DB.normalizeArabic(undefined), "");
        assert.strictEqual(DB.normalizeArabic(12345), "12345");
        assert.strictEqual(DB.normalizeArabic(true), "true");

        // stripDefiniteArticle
        assert.strictEqual(DB.stripDefiniteArticle(""), "");
        assert.strictEqual(DB.stripDefiniteArticle(null), "");
        assert.strictEqual(DB.stripDefiniteArticle(undefined), "");
        assert.strictEqual(DB.stripDefiniteArticle("ال"), "ال");
        assert.strictEqual(DB.stripDefiniteArticle("الي"), "الي");
        assert.strictEqual(DB.stripDefiniteArticle("الكتاب"), "كتاب");

        // scoreArabicMatch
        assert.strictEqual(DB.scoreArabicMatch(null, null), 0);
        assert.strictEqual(DB.scoreArabicMatch("", ""), 0);
        assert.strictEqual(DB.scoreArabicMatch("احمد", null), 0);
        assert.strictEqual(DB.scoreArabicMatch(null, "احمد"), 0);

        // matchArabicNames
        assert.strictEqual(DB.matchArabicNames(null, null), false);
        assert.strictEqual(DB.matchArabicNames("", "احمد"), false);

        // filterAndRankMatches
        assert.deepStrictEqual(DB.filterAndRankMatches(null, "احمد"), []);
        assert.deepStrictEqual(DB.filterAndRankMatches([], "احمد"), []);
        assert.deepStrictEqual(DB.filterAndRankMatches([{ name: "علي" }], null), []);
        assert.deepStrictEqual(DB.filterAndRankMatches([{ name: null }, { id: 2 }], "احمد"), []);
    });

    await test("ARABIC_FUZZY", "Arabic definite article 'ال' fuzzy matching with multi-token names", async () => {
        const fullWithAl = "سليم ياسر الخديوي";
        const queryWithoutAl = "سليم خديوي";
        const score = DB.scoreArabicMatch(fullWithAl, queryWithoutAl);
        assert.ok(score >= 75, `Expected score >= 75 when stripping 'ال', got ${score}`);
    });

    await test("ARABIC_FUZZY", "Multi-word lineage and token permutation matching", async () => {
        const full = "سليم ياسر سليم أحمد الخديوي";
        
        // First + Last match
        assert.strictEqual(DB.scoreArabicMatch(full, "سليم الخديوي"), 98);

        // Substring match
        assert.ok(DB.scoreArabicMatch(full, "ياسر سليم") >= 80);

        // Completely disjoint
        assert.strictEqual(DB.scoreArabicMatch(full, "خالد طارق"), 0);
    });

    // =========================================================================
    // SECTION 4: DATE RANGE BOUNDARIES & QUERY HELPERS
    // =========================================================================
    console.log("\n[4/5] Stress Testing: Date Range Boundaries & Parsing...");

    await test("DATE_BOUNDARIES", "Inverted start and end dates in getRecordsRange (start > end)", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('r1', { schoolId: 's1', date: '2026-08-10', periodNumber: 1 });
        recordsStore.set('r2', { schoolId: 's1', date: '2026-08-20', periodNumber: 2 });
        recordsStore.set('r3', { schoolId: 's1', date: '2026-08-30', periodNumber: 1 });

        const res = await DB.getRecordsRange('2026-08-25', '2026-08-05');
        assert.strictEqual(res.length, 2, "Inverted dates must be automatically swapped and return r1 & r2");
        assert.strictEqual(res[0].id, 'r2', "Results must be sorted descending by date");
        assert.strictEqual(res[1].id, 'r1');
    });

    await test("DATE_BOUNDARIES", "Inclusive boundary dates in getRecordsRange (exact start/end match)", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('r_start', { schoolId: 's1', date: '2026-08-01', periodNumber: 1 });
        recordsStore.set('r_mid', { schoolId: 's1', date: '2026-08-15', periodNumber: 1 });
        recordsStore.set('r_end', { schoolId: 's1', date: '2026-08-31', periodNumber: 1 });
        recordsStore.set('r_out', { schoolId: 's1', date: '2026-09-01', periodNumber: 1 });

        const res = await DB.getRecordsRange('2026-08-01', '2026-08-31');
        assert.strictEqual(res.length, 3, "Range query must be strictly inclusive of start and end boundaries");
        assert.strictEqual(res.some(r => r.id === 'r_out'), false);
    });

    await test("DATE_BOUNDARIES", "Single date boundary (startDate only or endDate only)", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('r1', { schoolId: 's1', date: '2026-08-15', periodNumber: 1 });
        recordsStore.set('r2', { schoolId: 's1', date: '2026-08-16', periodNumber: 1 });

        const resStartOnly = await DB.getRecordsRange('2026-08-15', null);
        assert.strictEqual(resStartOnly.length, 1);
        assert.strictEqual(resStartOnly[0].id, 'r1');

        const resEndOnly = await DB.getRecordsRange(null, '2026-08-16');
        assert.strictEqual(resEndOnly.length, 1);
        assert.strictEqual(resEndOnly[0].id, 'r2');
    });

    await test("DATE_BOUNDARIES", "Both null/undefined dates in getRecordsRange fall back to all records", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('r1', { schoolId: 's1', date: '2026-08-01' });
        recordsStore.set('r2', { schoolId: 's1', date: '2026-08-02' });

        const res = await DB.getRecordsRange(null, null);
        assert.strictEqual(res.length, 2);
    });

    await test("DATE_BOUNDARIES", "Secondary sorting by periodNumber and timestamp when date is identical", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('p1', { schoolId: 's1', date: '2026-08-29', periodNumber: 1 });
        recordsStore.set('p3', { schoolId: 's1', date: '2026-08-29', periodNumber: 3 });
        recordsStore.set('p2', { schoolId: 's1', date: '2026-08-29', periodNumber: 2 });
        recordsStore.set('p_yesterday', { schoolId: 's1', date: '2026-08-28', periodNumber: 5 });

        const res = await DB.getRecordsRange('2026-08-28', '2026-08-29');
        assert.strictEqual(res.length, 4);
        assert.strictEqual(res[0].id, 'p3', "Period 3 on 2026-08-29 should be first");
        assert.strictEqual(res[1].id, 'p2');
        assert.strictEqual(res[2].id, 'p1');
        assert.strictEqual(res[3].id, 'p_yesterday');
    });

    await test("DATE_BOUNDARIES", "Leap year boundary (2028-02-28 to 2028-03-01)", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('leap_day', { schoolId: 's1', date: '2028-02-29', periodNumber: 1 });
        recordsStore.set('march_1', { schoolId: 's1', date: '2028-03-01', periodNumber: 1 });

        const res = await DB.getRecordsRange('2028-02-28', '2028-03-01');
        assert.strictEqual(res.length, 2);
        assert.strictEqual(res[0].id, 'march_1');
        assert.strictEqual(res[1].id, 'leap_day');
    });

    await test("DATE_BOUNDARIES", "getRecentRecords boundary handling for 0, negative, and large day counts", async () => {
        const { getCollectionStore } = setupMockDB();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const res0 = await DB.getRecentRecords(0);
        assert.ok(Array.isArray(res0));

        const resNeg = await DB.getRecentRecords(-10);
        assert.ok(Array.isArray(resNeg));

        const res365 = await DB.getRecentRecords(365);
        assert.ok(Array.isArray(res365));
    });

    // =========================================================================
    // SECTION 5: ADVANCED CONCURRENCY, MULTI-TENANT ISOLATION & COMPOSITE INDEXES
    // =========================================================================
    console.log("\n[5/5] Stress Testing: Concurrency, Tenant Isolation & Index Alignment...");

    await test("CONCURRENCY_TENANCY", "50 simultaneous coalesced requests with artificial query latency", async () => {
        const { db, getCollectionStore } = setupMockDB();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const studentsStore = getCollectionStore(DB.KEYS.STUDENTS);
        studentsStore.set('st1', { schoolId: 's1', name: 'Student 1', classId: 'c1' });

        db._queryDelayMs = 30; // simulate 30ms network round-trip

        // Fire 50 simultaneous getStudents calls for class c1
        const promises = [];
        for (let i = 0; i < 50; i++) {
            promises.push(DB.getStudents('c1'));
        }

        const results50 = await Promise.all(promises);
        assert.strictEqual(results50.length, 50);
        const getCount = db._getCounts[DB.KEYS.STUDENTS] || 0;
        assert.strictEqual(getCount, 1, `50 concurrent requests must coalesce into exactly 1 Firestore get(), got ${getCount}`);
        assert.strictEqual(results50[0].length, 1);
        assert.strictEqual(results50[49][0].name, 'Student 1');
    });

    await test("CONCURRENCY_TENANCY", "Strict Multi-School Tenant Data Isolation", async () => {
        const { getCollectionStore } = setupMockDB();

        const studentsStore = getCollectionStore(DB.KEYS.STUDENTS);
        studentsStore.set('s1_st1', { id: 's1_st1', schoolId: 'school_alpha', name: 'Alpha Student' });
        studentsStore.set('s2_st1', { id: 's2_st1', schoolId: 'school_beta', name: 'Beta Student' });

        // Session 1: Alpha
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 'school_alpha' }));
        const alphaStudents = await DB.getStudents();
        assert.strictEqual(alphaStudents.length, 1);
        assert.strictEqual(alphaStudents[0].name, 'Alpha Student');

        // Session 2: Beta
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 'school_beta' }));
        const betaStudents = await DB.getStudents();
        assert.strictEqual(betaStudents.length, 1);
        assert.strictEqual(betaStudents[0].name, 'Beta Student');

        // Session 3: Ministry Super Admin (Can see across all schools)
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 'ministry', role: 'ministry' }));
        const allStudents = await DB.getStudents();
        assert.strictEqual(allStudents.length, 2, "Ministry user must have un-scoped cross-school visibility");
    });

    await test("CONCURRENCY_TENANCY", "Verify firestore.indexes.json alignment with query shapes", async () => {
        const fs = require('fs');
        const path = require('path');
        const indexPath = path.resolve(__dirname, '../../firestore.indexes.json');
        
        assert.ok(fs.existsSync(indexPath), "firestore.indexes.json must exist");
        const indexesConfig = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

        assert.ok(Array.isArray(indexesConfig.indexes), "indexes array must exist");
        
        // Find v2_records indexes
        const recordIndexes = indexesConfig.indexes.filter(idx => idx.collectionGroup === 'v2_records');
        assert.ok(recordIndexes.length >= 3, "v2_records must have at least 3 composite indexes");

        // Verify (schoolId ASC, date ASC)
        const hasDateIndex = recordIndexes.some(idx => 
            idx.fields.some(f => f.fieldPath === 'schoolId' && f.order === 'ASCENDING') &&
            idx.fields.some(f => f.fieldPath === 'date' && f.order === 'ASCENDING')
        );
        assert.ok(hasDateIndex, "Must have composite index for (schoolId ASC, date ASC)");

        // Verify (schoolId ASC, classId ASC, date ASC)
        const hasClassDateIndex = recordIndexes.some(idx => 
            idx.fields.some(f => f.fieldPath === 'schoolId' && f.order === 'ASCENDING') &&
            idx.fields.some(f => f.fieldPath === 'classId' && f.order === 'ASCENDING') &&
            idx.fields.some(f => f.fieldPath === 'date' && f.order === 'ASCENDING')
        );
        assert.ok(hasClassDateIndex, "Must have composite index for (schoolId ASC, classId ASC, date ASC)");

        // Verify (schoolId ASC, timestamp ASC)
        const hasDeltaIndex = recordIndexes.some(idx => 
            idx.fields.some(f => f.fieldPath === 'schoolId' && f.order === 'ASCENDING') &&
            idx.fields.some(f => f.fieldPath === 'timestamp' && f.order === 'ASCENDING')
        );
        assert.ok(hasDeltaIndex, "Must have composite index for (schoolId ASC, timestamp ASC)");
    });

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log("\n==================================================================");
    console.log(`STRESS TEST SUMMARY: ${passedStressTests}/${totalStressTests} Passed (${((passedStressTests/totalStressTests)*100).toFixed(1)}%)`);
    console.log(`Failed: ${failedStressTests}`);
    console.log("==================================================================");

    return { totalStressTests, passedStressTests, failedStressTests, results };
}

runAdversarialSuite().then(({ failedStressTests }) => {
    if (failedStressTests > 0) {
        process.exit(1);
    }
}).catch(err => {
    console.error("FATAL RUNNER ERROR:", err);
    process.exit(1);
});
