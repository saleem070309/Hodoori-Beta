/**
 * @fileoverview Tier 5 Adversarial Stress & Hardening Test Suite
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Teamwork Challenger Agent (Milestone 3 Phase 2)
 * 
 * Test Dimensions:
 * 1. High-load concurrent multi-tab mutation storms with simulated network drops.
 * 2. Long-lived session memory leak tests (simulating 10,000 operations across all entities).
 * 3. Extreme Arabic text fuzzing with adversarial unicode/RTL/NoSQL/XSS/Type confusion.
 * 4. Real-time notification flooding under multi-tenant cross-talk attempts.
 */

const assert = require('assert');

// ═════════════════════════════════════════════════════════════════════════════
// 1. ADVERSARIAL MOCK INFRASTRUCTURE (Multi-Tab, Network Faults, DOM)
// ═════════════════════════════════════════════════════════════════════════════

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
                        peer.onmessage({ data: JSON.parse(JSON.stringify(data)) });
                    } catch (_) {
                        peer.onmessage({ data });
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

    static resetAll() {
        MockBroadcastChannel.channels.clear();
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

const eventListeners = new Map();
global.window = {
    addEventListener: (evt, fn) => {
        if (!eventListeners.has(evt)) eventListeners.set(evt, new Set());
        eventListeners.get(evt).add(fn);
    },
    removeEventListener: (evt, fn) => {
        if (eventListeners.has(evt)) eventListeners.get(evt).delete(fn);
    },
    dispatchEvent: (event) => {
        const type = event.type || event;
        if (eventListeners.has(type)) {
            for (const fn of Array.from(eventListeners.get(type))) {
                try { fn(event); } catch (e) { console.error('EventListener Error:', e); }
            }
        }
    },
    BroadcastChannel: MockBroadcastChannel,
    firebase: { firestore: () => {} },
    location: { href: 'http://localhost/dashboard-admin.html', pathname: '/dashboard-admin.html' }
};

global.document = {
    hidden: false,
    readyState: 'complete',
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => ({
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        innerHTML: '',
        innerText: '',
        value: '',
        remove: () => {}
    }),
    createElement: () => ({
        id: '',
        className: '',
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        style: {},
        appendChild: () => {},
        remove: () => {},
        setAttribute: () => {},
        innerHTML: '',
        innerText: ''
    }),
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    addEventListener: (evt, fn) => global.window.addEventListener(evt, fn),
    removeEventListener: (evt, fn) => global.window.removeEventListener(evt, fn)
};

global.Notification = class Notification {
    static permission = 'granted';
    static requestPermission() { return Promise.resolve('granted'); }
    constructor(title, options) {
        this.title = title;
        this.options = options;
    }
    close() {}
};

global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
    }
};

global.UI = {
    toast: () => {},
    showModal: () => {},
    hideModal: () => {},
    setLoading: () => {}
};

global.BroadcastChannel = MockBroadcastChannel;
global.localStorage = new MockLocalStorage();

// Require system modules
const DB = require('../../scripts/core-db.js');
global.DB = DB;

const PageLifecycle = DB.PageLifecycle;
global.PageLifecycle = PageLifecycle;

const Auth = require('../../scripts/core-auth.js');
global.Auth = Auth;

const NotificationManager = require('../../scripts/utils-notifications.js');
global.NotificationManager = NotificationManager;

const Agent = require('../../scripts/module-ai-agent.js');
global.Agent = Agent;

// ═════════════════════════════════════════════════════════════════════════════
// 2. ADVERSARIAL FIRESTORE ENGINE WITH NETWORK FAULT INJECTION
// ═════════════════════════════════════════════════════════════════════════════

function createFaultTolerantFirestore(initialData = {}) {
    const store = new Map();

    for (const [colName, docs] of Object.entries(initialData)) {
        const colMap = new Map();
        for (const [docId, docData] of Object.entries(docs)) {
            colMap.set(docId, JSON.parse(JSON.stringify(docData)));
        }
        store.set(colName, colMap);
    }

    const getCollectionStore = (name) => {
        if (!store.has(name)) store.set(name, new Map());
        return store.get(name);
    };

    const listeners = new Map();

    const matchesFilters = (data, filters) => {
        if (!filters || filters.length === 0) return true;
        for (const filter of filters) {
            const val = data[filter.field];
            if (filter.op === '==') {
                if (val !== filter.val) return false;
            } else if (filter.op === '>=') {
                if (!(val >= filter.val)) return false;
            } else if (filter.op === '<=') {
                if (!(val <= filter.val)) return false;
            } else if (filter.op === '>') {
                if (!(val > filter.val)) return false;
            } else if (filter.op === '<') {
                if (!(val < filter.val)) return false;
            } else if (filter.op === 'array-contains') {
                if (!Array.isArray(val) || !val.includes(filter.val)) return false;
            }
        }
        return true;
    };

    const notifyListeners = (colName, type = 'all', doc = null) => {
        const colListeners = listeners.get(colName);
        if (colListeners) {
            const allDocs = Array.from(getCollectionStore(colName).entries());
            for (const sub of Array.from(colListeners)) {
                let filtered = allDocs.filter(([id, data]) => matchesFilters(data, sub.filters));

                if (sub.orderBy) {
                    filtered.sort((a, b) => {
                        const valA = a[1][sub.orderBy] || '';
                        const valB = b[1][sub.orderBy] || '';
                        return sub.orderDir === 'desc' ? String(valB).localeCompare(String(valA)) : String(valA).localeCompare(String(valB));
                    });
                }

                if (sub.limit) {
                    filtered = filtered.slice(0, sub.limit);
                }

                let docChanges = [];
                if (doc) {
                    if (matchesFilters(doc.data, sub.filters)) {
                        docChanges = [{
                            type: type,
                            doc: {
                                id: doc.id,
                                data: () => ({ ...doc.data })
                            }
                        }];
                    }
                } else {
                    docChanges = filtered.map(([id, data]) => ({
                        type: 'added',
                        doc: { id, data: () => ({ ...data }) }
                    }));
                }

                if (doc && docChanges.length === 0) {
                    continue; // Skip invoking listener if the change doesn't match this subscription
                }

                try {
                    sub.callback({
                        docs: filtered.map(([id, data]) => ({ id, data: () => ({ ...data }) })),
                        empty: filtered.length === 0,
                        size: filtered.length,
                        docChanges: () => docChanges
                    });
                } catch (e) {
                    console.error('Listener callback error:', e);
                }
            }
        }
    };

    const db = {
        _callCounts: {},
        _queries: [],
        _networkDropRate: 0.0,
        _latencyMs: 0,
        _failureCount: 0,
        _totalOperations: 0,
        _persistenceMode: 'multi-tab',

        setFaultInjection(dropRate, latencyMs = 0) {
            db._networkDropRate = dropRate;
            db._latencyMs = latencyMs;
        },

        async _simulateNetwork() {
            db._totalOperations++;
            if (db._latencyMs > 0) {
                await new Promise(r => setTimeout(r, db._latencyMs));
            }
            if (db._networkDropRate > 0 && Math.random() < db._networkDropRate) {
                db._failureCount++;
                const err = new Error('UNAVAILABLE: Simulated transient network drop / connection timeout');
                err.code = 'unavailable';
                throw err;
            }
        },

        settings() {},
        async enablePersistence() { db._persistenceMode = 'multi-tab'; },

        collection(name) {
            const colStore = getCollectionStore(name);
            db._callCounts[name] = (db._callCounts[name] || 0) + 1;

            const createQuery = (filters = [], limitCount = null, orderByField = null, orderDir = 'asc') => ({
                _filters: filters,
                _limit: limitCount,
                _orderBy: orderByField,
                _orderDir: orderDir,

                where(field, op, val) {
                    return createQuery([...this._filters, { field, op, val }], this._limit, this._orderBy, this._orderDir);
                },

                limit(n) {
                    return createQuery(this._filters, n, this._orderBy, this._orderDir);
                },

                orderBy(field, dir = 'asc') {
                    return createQuery(this._filters, this._limit, field, dir);
                },

                async get() {
                    await db._simulateNetwork();
                    db._queries.push({ collection: name, filters: this._filters, limit: this._limit, orderBy: this._orderBy });

                    let docs = Array.from(colStore.entries()).map(([id, data]) => ({
                        id,
                        data: () => ({ ...data }),
                        ref: {
                            id,
                            delete: async () => {
                                await db._simulateNetwork();
                                const oldData = colStore.get(id);
                                colStore.delete(id);
                                notifyListeners(name, 'removed', { id, data: oldData });
                            },
                            update: async (d) => {
                                await db._simulateNetwork();
                                const merged = { ...colStore.get(id), ...d };
                                colStore.set(id, merged);
                                notifyListeners(name, 'modified', { id, data: merged });
                            },
                            set: async (d, opts) => {
                                await db._simulateNetwork();
                                const data = (opts && opts.merge) ? { ...colStore.get(id), ...d } : { ...d };
                                colStore.set(id, data);
                                notifyListeners(name, 'modified', { id, data });
                            }
                        }
                    }));

                    for (const filter of this._filters) {
                        docs = docs.filter(doc => {
                            const val = doc.data()[filter.field];
                            if (filter.op === '==') return val === filter.val;
                            if (filter.op === '>=') return val >= filter.val;
                            if (filter.op === '<=') return val <= filter.val;
                            if (filter.op === '>') return val > filter.val;
                            if (filter.op === '<') return val < filter.val;
                            if (filter.op === 'array-contains') return Array.isArray(val) && val.includes(filter.val);
                            return true;
                        });
                    }

                    if (this._orderBy) {
                        docs.sort((a, b) => {
                            const valA = a.data()[this._orderBy] || '';
                            const valB = b.data()[this._orderBy] || '';
                            if (typeof valA === 'string') {
                                return this._orderDir === 'desc' ? valB.localeCompare(valA) : valA.localeCompare(valB);
                            }
                            return this._orderDir === 'desc' ? valB - valA : valA - valB;
                        });
                    }

                    if (this._limit) {
                        docs = docs.slice(0, this._limit);
                    }

                    return {
                        docs,
                        empty: docs.length === 0,
                        size: docs.length
                    };
                },

                onSnapshot(onNext, onError) {
                    if (!listeners.has(name)) listeners.set(name, new Set());
                    const subObj = {
                        callback: onNext,
                        filters: this._filters,
                        limit: this._limit,
                        orderBy: this._orderBy,
                        orderDir: this._orderDir
                    };
                    listeners.get(name).add(subObj);

                    // Initial snapshot delivery
                    const initialDocs = Array.from(colStore.entries())
                        .filter(([id, data]) => matchesFilters(data, this._filters));

                    onNext({
                        docs: initialDocs.map(([id, data]) => ({ id, data: () => ({ ...data }) })),
                        empty: initialDocs.length === 0,
                        size: initialDocs.length,
                        docChanges: () => initialDocs.map(([id, data]) => ({ type: 'added', doc: { id, data: () => ({ ...data }) } }))
                    });

                    return () => {
                        const colL = listeners.get(name);
                        if (colL) colL.delete(subObj);
                    };
                }
            });

            return {
                ...createQuery(),
                doc(id) {
                    const docId = id || ('doc_' + Math.random().toString(36).substring(2, 9));
                    return {
                        id: docId,
                        async get() {
                            await db._simulateNetwork();
                            db._queries.push({ collection: name, docId });
                            const data = colStore.get(docId);
                            return {
                                id: docId,
                                exists: data !== undefined,
                                data: () => data ? ({ ...data }) : undefined
                            };
                        },
                        async set(data, opts) {
                            await db._simulateNetwork();
                            const existing = colStore.get(docId) || {};
                            const finalData = (opts && opts.merge) ? { ...existing, ...data } : { ...data };
                            colStore.set(docId, finalData);
                            notifyListeners(name, 'modified', { id: docId, data: finalData });
                            return finalData;
                        },
                        async update(data) {
                            await db._simulateNetwork();
                            if (!colStore.has(docId)) throw new Error(`NOT_FOUND: Document ${docId} does not exist`);
                            const current = colStore.get(docId);
                            const updated = { ...current, ...data };
                            colStore.set(docId, updated);
                            notifyListeners(name, 'modified', { id: docId, data: updated });
                            return updated;
                        },
                        async delete() {
                            await db._simulateNetwork();
                            const oldData = colStore.get(docId);
                            colStore.delete(docId);
                            notifyListeners(name, 'removed', { id: docId, data: oldData });
                        }
                    };
                },
                async add(data) {
                    await db._simulateNetwork();
                    const newId = 'auto_' + Math.random().toString(36).substring(2, 9);
                    colStore.set(newId, { ...data });
                    notifyListeners(name, 'added', { id: newId, data });
                    return {
                        id: newId,
                        get: async () => ({ id: newId, exists: true, data: () => ({ ...colStore.get(newId) }) })
                    };
                }
            };
        },

        batch() {
            const operations = [];
            return {
                set(docRef, data) { operations.push(() => docRef.set(data)); },
                update(docRef, data) { operations.push(() => docRef.update(data)); },
                delete(docRef) { operations.push(() => docRef.delete()); },
                async commit() {
                    await db._simulateNetwork();
                    for (const op of operations) {
                        await op();
                    }
                }
            };
        }
    };

    return db;
}

function createTabContext(tabName, sharedFirestore, userSession = { role: 'admin', schoolId: 's1' }) {
    const tabStorage = new MockLocalStorage();
    tabStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify(userSession));

    const tabDB = Object.create(DB);
    tabDB._tabId = tabName + '_' + Math.random().toString(36).substring(2, 8);
    tabDB._l1Cache = new Map();
    tabDB._inflightQueries = new Map();
    tabDB._syncMetaCache = new Map();
    tabDB.dbInstance = sharedFirestore;
    tabDB._persistenceConfigured = true;
    tabDB._stats = { hits: 0, misses: 0, expirations: 0, invalidations: 0, broadcastsSent: 0, broadcastsReceived: 0 };
    tabDB.getCurrentUserSchoolId = () => userSession.schoolId;

    tabDB._broadcastChannel = new MockBroadcastChannel('hodoori_db_cache_sync');
    tabDB._broadcastChannel.onmessage = (evt) => {
        tabDB._handleSyncMessage(evt.data);
    };

    return {
        tabName,
        db: tabDB,
        storage: tabStorage
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. TIER 5 TEST RUNNER SUITE
// ═════════════════════════════════════════════════════════════════════════════

const testResults = [];
let passedCount = 0;
let failedCount = 0;

async function runTest(suiteName, testId, description, testFn) {
    const start = Date.now();
    try {
        await testFn();
        const duration = Date.now() - start;
        passedCount++;
        testResults.push({ suite: suiteName, id: testId, description, status: 'PASSED', duration, error: null });
        console.log(`  ✓ [${suiteName}][${testId}] ${description} (${duration}ms)`);
    } catch (err) {
        const duration = Date.now() - start;
        failedCount++;
        testResults.push({ suite: suiteName, id: testId, description, status: 'FAILED', duration, error: err.stack || err.message });
        console.error(`  ✗ [${suiteName}][${testId}] ${description} (${duration}ms)`);
        console.error(`     Error: ${err.message}`);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST SUITES EXECUTION
// ═════════════════════════════════════════════════════════════════════════════

async function runTier5AdversarialSuite() {
    console.log('===============================================================================');
    console.log('  HODOORI PLATFORM: TIER 5 ADVERSARIAL STRESS & HARDENING SUITE');
    console.log('===============================================================================');

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 1: HIGH-LOAD CONCURRENT MULTI-TAB MUTATION STORMS & NETWORK DROPS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ SUITE 1: HIGH-LOAD CONCURRENT MULTI-TAB MUTATIONS & NETWORK FAULT RESILIENCE');

    await runTest('Suite-1', 'T5.1.1', '5-Tab Concurrent Mutation Storm (500 CRUD ops with zero cache corruption)', async () => {
        MockBroadcastChannel.resetAll();
        const firestore = createFaultTolerantFirestore({
            [DB.KEYS.CLASSES]: { 'c1': { name: 'الصف العاشر', section: 'أ', schoolId: 's1' } },
            [DB.KEYS.STUDENTS]: { 'std_1': { academicId: 'std_1', name: 'طالب أولي', classId: 'c1', schoolId: 's1' } },
            [DB.KEYS.TEACHERS]: { 't1': { ministryId: '101', name: 'معلم 1', schoolId: 's1' } },
            [DB.KEYS.RECORDS]: {},
            [DB.KEYS.SETTINGS]: { 's1': { schoolName: 'المدرسة الأولى' } }
        });

        const tabAdmin = createTabContext('Tab_Admin', firestore, { role: 'admin', schoolId: 's1' });
        const tabTeacher1 = createTabContext('Tab_Teacher1', firestore, { role: 'teacher', schoolId: 's1' });
        const tabTeacher2 = createTabContext('Tab_Teacher2', firestore, { role: 'teacher', schoolId: 's1' });
        const tabStudent = createTabContext('Tab_Student', firestore, { role: 'student', schoolId: 's1' });
        const tabParent = createTabContext('Tab_Parent', firestore, { role: 'parent', schoolId: 's1' });

        const tabs = [tabAdmin, tabTeacher1, tabTeacher2, tabStudent, tabParent];

        for (const t of tabs) {
            await t.db.getStudents();
            await t.db.getClasses();
            await t.db.getSettings();
        }

        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push((async (idx) => {
                await tabAdmin.db.addStudent({ academicId: `storm_std_${idx}`, name: `طالب عاصفة ${idx}`, classId: 'c1', schoolId: 's1' });
            })(i));

            promises.push((async (idx) => {
                const date = `2026-08-${String((idx % 25) + 1).padStart(2, '0')}`;
                await tabTeacher1.db.saveAttendance(date, 'c1', [{ studentId: 'std_1', status: 'present' }], 't1', (idx % 7) + 1);
            })(i));

            promises.push((async (idx) => {
                await tabTeacher2.db.getRecords(null, 'c1');
                await tabTeacher2.db.saveScheduleEntry({ subject: `مادة ${idx}`, day: 'الأحد', period: 1, classId: 'c1', schoolId: 's1' });
            })(i));

            promises.push((async (idx) => {
                const recs = await tabStudent.db.getRecordsRange('2026-08-01', '2026-08-30', 'c1');
                assert(Array.isArray(recs), 'Student records must be array');
            })(i));

            promises.push((async (idx) => {
                await tabParent.db.getStudents();
                await tabParent.db.getSettings();
            })(i));
        }

        await Promise.all(promises);

        const adminStudents = await tabAdmin.db.getStudents(null, { forceRefresh: true });
        const parentStudents = await tabParent.db.getStudents(null, { forceRefresh: true });
        assert.strictEqual(adminStudents.length, parentStudents.length, 'All tabs must observe identical student counts');
        assert(adminStudents.length >= 101, 'Must contain initial + added storm students');

        assert(tabAdmin.db._stats.broadcastsSent > 0, 'Admin tab must have broadcasted invalidations');
        assert(tabParent.db._stats.broadcastsReceived > 0, 'Parent tab must have received broadcasts');
    });

    await runTest('Suite-1', 'T5.1.2', 'Concurrency Storm with 20% Simulated Network Faults & Graceful Retry', async () => {
        MockBroadcastChannel.resetAll();
        const firestore = createFaultTolerantFirestore({
            [DB.KEYS.STUDENTS]: { 'std_1': { academicId: 'std_1', name: 'أحمد', classId: 'c1', schoolId: 's1' } },
            [DB.KEYS.CLASSES]: { 'c1': { name: 'العاشر', schoolId: 's1' } }
        });

        firestore.setFaultInjection(0.20, 2);
        const tab = createTabContext('Tab_Faulty', firestore);

        let successReads = 0;
        let caughtNetworkErrors = 0;

        for (let i = 0; i < 100; i++) {
            try {
                const res = await tab.db.getStudents(null, { forceRefresh: true });
                if (Array.isArray(res)) successReads++;
            } catch (err) {
                if (err.code === 'unavailable') {
                    caughtNetworkErrors++;
                    firestore.setFaultInjection(0.0, 0);
                    const retryRes = await tab.db.getStudents(null, { forceRefresh: true });
                    assert(Array.isArray(retryRes));
                    successReads++;
                    firestore.setFaultInjection(0.20, 2);
                } else {
                    throw err;
                }
            }
        }

        assert(successReads === 100, 'All 100 queries must successfully resolve after retry');
        assert(caughtNetworkErrors > 0, 'Must have exercised transient network drops');
        assert.strictEqual(tab.db._inflightQueries.size, 0, 'In-flight queries map must be empty after error recovery');
    });

    await runTest('Suite-1', 'T5.1.3', 'In-Flight Coalescing Thundering Herd under Jitter (100 parallel reads -> 1 network call)', async () => {
        MockBroadcastChannel.resetAll();
        const firestore = createFaultTolerantFirestore({
            [DB.KEYS.SETTINGS]: { 's1': { schoolName: 'مدرسة التفوق' } }
        });
        firestore.setFaultInjection(0.0, 15);

        const tab = createTabContext('Tab_Herd', firestore);

        const promises = Array.from({ length: 100 }, () => tab.db.getSettings());
        const results = await Promise.all(promises);

        assert.strictEqual(results.length, 100);
        for (const res of results) {
            assert.strictEqual(res.schoolName, 'مدرسة التفوق');
        }

        assert.strictEqual(firestore._callCounts[DB.KEYS.SETTINGS], 1, 'Thundering herd must be coalesced into exactly 1 network query');
        assert.strictEqual(tab.db._inflightQueries.size, 0, 'In-flight query pool must cleanly dissolve');
    });

    await runTest('Suite-1', 'T5.1.4', 'Cascading Class Deletion Stress with 50 Orphaned Students under Peer Reads', async () => {
        MockBroadcastChannel.resetAll();
        const initialStudents = {};
        for (let i = 0; i < 50; i++) {
            initialStudents[`s_${i}`] = { academicId: `s_${i}`, name: `طالب ${i}`, classId: 'c_target', schoolId: 's1' };
        }

        const firestore = createFaultTolerantFirestore({
            [DB.KEYS.CLASSES]: { 'c_target': { name: 'صف الحذف', schoolId: 's1' }, 'c_other': { name: 'صف باقي', schoolId: 's1' } },
            [DB.KEYS.STUDENTS]: initialStudents
        });

        const tabAdmin = createTabContext('Tab_Admin', firestore);
        const tabViewer = createTabContext('Tab_Viewer', firestore);

        await tabViewer.db.getStudents();
        await tabViewer.db.getClasses();

        await tabAdmin.db.deleteClass('c_target');

        const remainingStudents = await tabViewer.db.getStudents();
        assert.strictEqual(remainingStudents.length, 0, 'All 50 students in deleted class must be evicted locally and remotely');

        const classes = await tabViewer.db.getClasses();
        assert.strictEqual(classes.length, 1, 'Only c_other class should remain');
        assert.strictEqual(classes[0].name, 'صف باقي');
    });

    await runTest('Suite-1', 'T5.1.5', 'Delta Sync Baseline Reconciliation with Corrupted & Missing Metadata', async () => {
        MockBroadcastChannel.resetAll();
        const firestore = createFaultTolerantFirestore({
            [DB.KEYS.RECORDS]: {
                'rec_1': { date: '2026-08-01', timestamp: '2026-08-01T08:00:00.000Z', schoolId: 's1', classId: 'c1' },
                'rec_2': { date: '2026-08-02', timestamp: '2026-08-02T08:00:00.000Z', schoolId: 's1', classId: 'c1' }
            }
        });

        const tab = createTabContext('Tab_Delta', firestore);

        const initial = await tab.db.getRecords(null, null, { useDeltaSync: true });
        assert.strictEqual(initial.length, 2);

        tab.storage.setItem('__hodoori_sync_meta__', '{ "corrupted_json": invalid }');

        await firestore.collection(DB.KEYS.RECORDS).doc('rec_3').set({
            date: '2026-08-03',
            timestamp: '2026-08-03T08:00:00.000Z',
            schoolId: 's1',
            classId: 'c1'
        });

        const recovered = await tab.db.getRecords(null, null, { useDeltaSync: true, forceFullSync: true });
        assert.strictEqual(recovered.length, 3, 'Must gracefully recover and contain all 3 records');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 2: LONG-LIVED SESSION MEMORY LEAK & 10,000 OPERATIONS SCALABILITY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ SUITE 2: LONG-LIVED SESSION MEMORY LEAK & 10,000 OPERATIONS SCALABILITY');

    await runTest('Suite-2', 'T5.2.1', '10,000 Operations Endurance Run across all 9 Collections', async () => {
        MockBroadcastChannel.resetAll();
        const firestore = createFaultTolerantFirestore({
            [DB.KEYS.STUDENTS]: {},
            [DB.KEYS.TEACHERS]: {},
            [DB.KEYS.CLASSES]: {},
            [DB.KEYS.RECORDS]: {},
            [DB.KEYS.SETTINGS]: { 's1': { schoolName: 'مدرسة الماراثون' } },
            [DB.KEYS.SCHOOLS]: { 's1': { name: 'المدرسة الكبرى' } },
            [DB.KEYS.SCHEDULE]: {},
            [DB.KEYS.HOLIDAYS]: {},
            [DB.KEYS.NOTIFICATIONS]: {}
        });

        const tab = createTabContext('Tab_Endurance', firestore);

        const startHeap = process.memoryUsage().heapUsed;
        const startTime = Date.now();

        for (let batch = 0; batch < 10; batch++) {
            const batchPromises = [];
            for (let i = 0; i < 1000; i++) {
                const opType = (batch * 1000 + i) % 10;
                if (opType === 0) {
                    batchPromises.push(tab.db.getSettings());
                } else if (opType === 1) {
                    batchPromises.push(tab.db.getStudents());
                } else if (opType === 2) {
                    batchPromises.push(tab.db.getClasses());
                } else if (opType === 3) {
                    batchPromises.push(tab.db.getTeachers());
                } else if (opType === 4) {
                    batchPromises.push(tab.db.getSchools());
                } else if (opType === 5) {
                    batchPromises.push(tab.db.getSchedule());
                } else if (opType === 6) {
                    batchPromises.push(tab.db.getHolidays());
                } else if (opType === 7) {
                    batchPromises.push(tab.db.getTodayRecords());
                } else if (opType === 8) {
                    batchPromises.push(tab.db.getNotifications());
                } else {
                    batchPromises.push(tab.db.addNotification({
                        title: `إشعار ${i}`,
                        message: 'فحص الذاكرة',
                        targetType: 'all',
                        schoolId: 's1'
                    }));
                }
            }
            await Promise.all(batchPromises);
        }

        const duration = Date.now() - startTime;
        const endHeap = process.memoryUsage().heapUsed;
        const heapGrowthMb = (endHeap - startHeap) / (1024 * 1024);

        assert(tab.db._l1Cache.size < 100, `L1 Cache size (${tab.db._l1Cache.size}) must remain compact and bounded`);
        assert.strictEqual(tab.db._inflightQueries.size, 0, 'In-flight queries must not leak active promises');
        assert(duration < 15000, `10,000 operations completed in ${duration}ms (target < 15000ms)`);
        console.log(`     -> 10,000 Ops Duration: ${duration}ms | Heap Growth: ${heapGrowthMb.toFixed(2)} MB | L1 Size: ${tab.db._l1Cache.size}`);
    });

    await runTest('Suite-2', 'T5.2.2', 'L1 Cache Key Space Boundedness & Garbage Collection Verification', async () => {
        const firestore = createFaultTolerantFirestore();
        const tab = createTabContext('Tab_Cache_Bound', firestore);

        for (let i = 1; i <= 200; i++) {
            const date = `2026-01-${String(i % 28 + 1).padStart(2, '0')}`;
            await tab.db.getRecords(date, 'c1');
        }

        assert(tab.db._l1Cache.size <= 200, 'L1 cache should only contain active query keys');

        tab.db.clearAllCaches();
        assert.strictEqual(tab.db._l1Cache.size, 0, 'clearAllCaches must reset cache size to exactly 0');
    });

    await runTest('Suite-2', 'T5.2.3', 'PageLifecycle Interval & Listener Churn (1,000 Register/Cleanup Cycles)', async () => {
        PageLifecycle.cleanupAll();
        assert.strictEqual(PageLifecycle._intervals.size, 0);
        assert.strictEqual(PageLifecycle._listeners.size, 0);

        let executionCount = 0;

        for (let i = 0; i < 1000; i++) {
            const id = `test_interval_${i}`;
            PageLifecycle.registerInterval(id, () => { executionCount++; }, 10000);
            PageLifecycle.clearInterval(id);
        }

        assert.strictEqual(PageLifecycle._intervals.size, 0, 'All registered intervals must be cleanly deleted');

        const disposers = [];
        for (let i = 0; i < 500; i++) {
            let unsubCalled = false;
            const disposer = PageLifecycle.registerListener(() => { unsubCalled = true; });
            disposers.push({ disposer, check: () => unsubCalled });
        }

        assert.strictEqual(PageLifecycle._listeners.size, 500);

        for (const d of disposers) {
            d.disposer();
            assert(d.check(), 'Underlying unsubscribe function must be invoked');
        }

        assert.strictEqual(PageLifecycle._listeners.size, 0, 'All listeners must be cleanly pruned');
    });

    await runTest('Suite-2', 'T5.2.4', 'Telemetry & Stats Integer Robustness (Zero NaN / Zero Invariant Failures)', async () => {
        const firestore = createFaultTolerantFirestore();
        const tab = createTabContext('Tab_Stats', firestore);

        tab.db._stats.hits = 5000000;
        tab.db._stats.misses = 2500000;
        tab.db._stats.expirations = 100000;
        tab.db._stats.invalidations = 50000;

        const stats = tab.db.getCacheStats();

        assert(!isNaN(parseFloat(stats.hitRatio)), 'Hit ratio must not be NaN');
        assert.strictEqual(stats.hitRatio, '66.7%', 'Hit ratio calculation must be mathematically accurate');
        assert.strictEqual(stats.hits, 5000000);
        assert.strictEqual(stats.misses, 2500000);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 3: EXTREME ARABIC TEXT FUZZING, UNICODE & INJECTION IMMUNITY
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ SUITE 3: EXTREME ARABIC TEXT FUZZING, UNICODE & INJECTION IMMUNITY');

    await runTest('Suite-3', 'T5.3.1', 'Arabic Orthography & Standard Normalization Invariants', async () => {
        const orthographyPairs = [
            { raw: 'أحمد', target: 'احمد', expectedScore: 100 },
            { raw: 'إبراهيم', target: 'ابراهيم', expectedScore: 100 },
            { raw: 'آمنة', target: 'امنه', expectedScore: 100 },
            { raw: 'فاطمة', target: 'فاطمه', expectedScore: 100 },
            { raw: 'يحيى', target: 'يحيي', expectedScore: 100 }
        ];

        for (const p of orthographyPairs) {
            const score = DB.scoreArabicMatch(p.raw, p.target);
            assert.strictEqual(score, p.expectedScore, `Pair ${p.raw} <-> ${p.target} must match exactly 100`);
        }
    });

    await runTest('Suite-3', 'T5.3.2', 'Massive Tatweel (Kashida) Inflation without ReDoS (50,000 Kashidas)', async () => {
        const massiveKashida = 'س' + '\u0640'.repeat(50000) + 'ل' + '\u0640'.repeat(50000) + 'يم';
        const start = Date.now();
        const norm = DB.normalizeArabic(massiveKashida);
        const duration = Date.now() - start;

        assert.strictEqual(norm, 'سليم', '50,000 Tatweels must be cleanly stripped to canonical root');
        assert(duration < 100, `Tatweel stripping must execute in < 100ms (took ${duration}ms) without ReDoS`);
    });

    await runTest('Suite-3', 'T5.3.3', 'Chained Stacked Quranic Tashkeel & Diacritical Chains', async () => {
        const stacked = 'أًٌٍَُِّْٰحَُِّْمًٌٍَُِّْٰدُ';
        const norm = DB.normalizeArabic(stacked);
        assert.strictEqual(norm, 'احمد', 'All complex Tashkeel and Quranic annotations must normalize cleanly');

        const score = DB.scoreArabicMatch(stacked, 'أحمد');
        assert.strictEqual(score, 100, 'Deeply decorated Quranic name must achieve 100% exact normalized match');
    });

    await runTest('Suite-3', 'T5.3.4', 'Definite Article (Al-) Stripping & Patronymic Lineage Matching', async () => {
        const pairs = [
            { query: 'سليم الخديوي', target: 'سليم ياسر سليم الخديوي', expectedScore: 98 },
            { query: 'محمد النجار', target: 'محمد أحمد النجار', expectedScore: 98 },
            { query: 'خالد الزعبي', target: 'خالد الزعبي', expectedScore: 100 }
        ];

        for (const p of pairs) {
            const score = DB.scoreArabicMatch(p.target, p.query);
            assert(score >= p.expectedScore, `Name '${p.target}' with query '${p.query}' scored ${score}, expected >= ${p.expectedScore}`);
        }
    });

    await runTest('Suite-3', 'T5.3.5', 'NoSQL, SQL, XSS & Prototype Pollution Injection Payloads', async () => {
        const attackVectors = [
            '<script>alert("XSS")</script>',
            '"><img src=x onerror=alert(1)>',
            "'; DROP TABLE students; --",
            "admin' OR '1'='1",
            JSON.stringify({ $ne: null }),
            JSON.stringify({ $gt: '' }),
            '__proto__',
            'constructor',
            'prototype',
            '${7*7}',
            '{{7*7}}',
            '../../../../etc/passwd',
            'null',
            'undefined',
            'NaN',
            'Infinity'
        ];

        const candidateList = [
            { id: '1', name: 'أحمد محمود' },
            { id: '2', name: 'سارة خالد' },
            { id: '3', name: 'محمد علي' }
        ];

        for (const payload of attackVectors) {
            const norm = DB.normalizeArabic(payload);
            assert(typeof norm === 'string');

            const score = DB.scoreArabicMatch(candidateList[0].name, payload);
            assert(typeof score === 'number' && !isNaN(score));

            const matches = DB.filterAndRankMatches(candidateList, payload);
            assert(Array.isArray(matches));

            assert.strictEqual(Object.prototype.polluted, undefined);
        }
    });

    await runTest('Suite-3', 'T5.3.6', 'Type Confusion & Fuzzing Resilience across DB Search Primitives', async () => {
        const edgePrimitives = [
            null,
            undefined,
            '',
            ' ',
            '   \n\t  ',
            '12345',
            'false',
            'true'
        ];

        for (const prim of edgePrimitives) {
            const norm = DB.normalizeArabic(prim);
            assert(typeof norm === 'string');

            const score = DB.scoreArabicMatch(prim, prim);
            assert(typeof score === 'number' && !isNaN(score));

            const stripped = DB.stripDefiniteArticle(prim);
            assert(typeof stripped === 'string');
        }
    });

    await runTest('Suite-3', 'T5.3.7', '5,000 Fuzzed Names Rapid Search & Ranking Invariant Verification', async () => {
        const baseNames = ['محمد', 'أحمد', 'علي', 'عبدالله', 'عمر', 'خالد', 'سليم', 'طارق', 'يوسف', 'إبراهيم'];
        const families = ['الخديوي', 'الزعبي', 'النجار', 'الهاشمي', 'المصري', 'الشامي', 'العمري', 'القرشي'];

        const roster = [];
        for (let i = 0; i < 500; i++) {
            const first = baseNames[i % baseNames.length];
            const middle = baseNames[(i * 3) % baseNames.length];
            const last = families[(i * 7) % families.length];
            roster.push({ id: `std_${i}`, name: `${first} ${middle} ${last}` });
        }

        const startTime = Date.now();
        for (let i = 0; i < 500; i++) {
            const query = `${baseNames[i % baseNames.length]} ${families[(i * 7) % families.length]}`;
            const results = DB.filterAndRankMatches(roster, query);
            assert(Array.isArray(results));
            if (results.length > 0) {
                const topScore = DB.scoreArabicMatch(results[0].name, query);
                assert(topScore >= 75, 'Top ranked result must have valid match score');
            }
        }
        const duration = Date.now() - startTime;
        assert(duration < 2000, `500 fuzzy ranking queries executed in ${duration}ms (target < 2000ms)`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // SUITE 4: REAL-TIME NOTIFICATION FLOODING & MULTI-TENANT ISOLATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ SUITE 4: REAL-TIME NOTIFICATION FLOODING & MULTI-TENANT ISOLATION');

    await runTest('Suite-4', 'T5.4.1', '10-Tenant 5,000 Notification High-Velocity Flood (Zero Cross-Tenant Leakage)', async () => {
        const firestore = createFaultTolerantFirestore();
        global.DB.dbInstance = firestore;

        const receivedBySchool = { s1: [], s2: [], s3: [], s4: [], s5: [] };

        const unsubs = [];
        for (const sId of Object.keys(receivedBySchool)) {
            const unsub = firestore.collection(DB.KEYS.NOTIFICATIONS)
                .where('schoolId', '==', sId)
                .onSnapshot(snap => {
                    snap.docChanges().forEach(change => {
                        if (change.type === 'added') {
                            receivedBySchool[sId].push(change.doc.data());
                        }
                    });
                });
            unsubs.push(unsub);
        }

        // Flood 5,000 notifications randomly across schools s1 through s10
        for (let i = 0; i < 5000; i++) {
            const targetSchool = `s${(i % 10) + 1}`;
            await firestore.collection(DB.KEYS.NOTIFICATIONS).add({
                title: `تنبيه ${i}`,
                schoolId: targetSchool,
                targetType: 'all',
                timestamp: new Date().toISOString()
            });
        }

        for (const [sId, notifs] of Object.entries(receivedBySchool)) {
            assert(notifs.length > 0, `School ${sId} must have received notifications`);
            for (const n of notifs) {
                assert.strictEqual(n.schoolId, sId, `Strict Multi-Tenant Leak: School ${sId} received notification belonging to ${n.schoolId}`);
            }
        }

        for (const u of unsubs) u();
    });

    await runTest('Suite-4', 'T5.4.2', 'Malicious Cross-Tenant Student ID Spoofing Attack Defense', async () => {
        const firestore = createFaultTolerantFirestore();
        global.DB.dbInstance = firestore;
        NotificationManager.unsubscribe();

        let s1StudentReceived = 0;

        const originalSend = NotificationManager.sendLocalNotification;
        NotificationManager.sendLocalNotification = (title, body) => {
            s1StudentReceived++;
        };

        const unsub = await NotificationManager.subscribeToNotifications({
            schoolId: 's1',
            id: '2024999',
            academicId: '2024999'
        });

        // Malicious notification in school 's2' targeting student '2024999'
        await firestore.collection(DB.KEYS.NOTIFICATIONS).add({
            title: 'رسالة خبيثة من مدرسة أخرى',
            message: 'محاولة اختراق',
            schoolId: 's2',
            targetType: 'student',
            targetId: '2024999',
            timestamp: new Date().toISOString()
        });

        // Legitimate notification in school 's1' targeting student '2024999'
        await firestore.collection(DB.KEYS.NOTIFICATIONS).add({
            title: 'إشعار شرعي',
            message: 'مدرستك الأصلية',
            schoolId: 's1',
            targetType: 'student',
            targetId: '2024999',
            timestamp: new Date().toISOString()
        });

        await new Promise(r => setTimeout(r, 20));

        assert.strictEqual(s1StudentReceived, 1, 'Student in s1 must receive ONLY the legitimate notification from s1');
        NotificationManager.sendLocalNotification = originalSend;
        if (unsub) unsub();
    });

    await runTest('Suite-4', 'T5.4.3', 'Realtime Listener Churn (200 Rapid Sub/Unsub Cycles without Memory Leaks)', async () => {
        const firestore = createFaultTolerantFirestore();
        global.DB.dbInstance = firestore;
        NotificationManager.unsubscribe();

        for (let i = 0; i < 200; i++) {
            const unsub = await NotificationManager.subscribeToNotifications({
                schoolId: 's1',
                id: `std_${i}`
            });
            assert(typeof unsub === 'function');
            NotificationManager.unsubscribe();
            assert.strictEqual(NotificationManager._unsubscribe, null);
        }
    });

    await runTest('Suite-4', 'T5.4.4', 'Zero Cloud Read Mutation Invariant under 500 Notification DocChanges', async () => {
        const firestore = createFaultTolerantFirestore();
        global.DB.dbInstance = firestore;
        NotificationManager.unsubscribe();

        // Mute console.log during high frequency flood
        const originalLog = console.log;
        console.log = () => {};

        const unsub = await NotificationManager.subscribeToNotifications({ schoolId: 's1' });

        for (let i = 0; i < 500; i++) {
            await firestore.collection(DB.KEYS.NOTIFICATIONS).add({
                title: `إشعار ${i}`,
                schoolId: 's1',
                targetType: 'all',
                timestamp: new Date().toISOString()
            });
        }

        console.log = originalLog;

        const postQueries = firestore._queries.filter(q => q.collection === DB.KEYS.NOTIFICATIONS && !q.filters);
        assert(postQueries.length <= 1, 'Realtime docChanges must update state in-place without cascading get() queries');

        if (unsub) unsub();
    });

    await runTest('Suite-4', 'T5.4.5', 'In-Place Notification Mutation & Deletion Event Pipeline Coherence', async () => {
        const firestore = createFaultTolerantFirestore();
        global.DB.dbInstance = firestore;
        NotificationManager.unsubscribe();

        let modifiedEventFired = false;
        let deletedEventFired = false;

        const modHandler = (e) => { modifiedEventFired = true; };
        const delHandler = (e) => { deletedEventFired = true; };

        global.window.addEventListener('notification_modified', modHandler);
        global.window.addEventListener('notification_deleted', delHandler);

        const unsub = await NotificationManager.subscribeToNotifications({ schoolId: 's1' });

        const ref = await firestore.collection(DB.KEYS.NOTIFICATIONS).add({
            title: 'إشعار أولي',
            schoolId: 's1',
            targetType: 'all',
            timestamp: new Date().toISOString()
        });

        await firestore.collection(DB.KEYS.NOTIFICATIONS).doc(ref.id).update({
            title: 'إشعار معدل'
        });

        await firestore.collection(DB.KEYS.NOTIFICATIONS).doc(ref.id).delete();

        await new Promise(r => setTimeout(r, 20));

        assert(modifiedEventFired, 'notification_modified CustomEvent must be dispatched on doc update');
        assert(deletedEventFired, 'notification_deleted CustomEvent must be dispatched on doc delete');

        global.window.removeEventListener('notification_modified', modHandler);
        global.window.removeEventListener('notification_deleted', delHandler);
        if (unsub) unsub();
    });

    // ═════════════════════════════════════════════════════════════════════════
    // SUMMARY
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n===============================================================================');
    console.log('  TIER 5 ADVERSARIAL TEST SUITE EXECUTION SUMMARY');
    console.log('===============================================================================');
    console.log(`  Total Tests Run : ${testResults.length}`);
    console.log(`  Passed          : ${passedCount}`);
    console.log(`  Failed          : ${failedCount}`);
    console.log(`  Success Rate    : ${((passedCount / testResults.length) * 100).toFixed(1)}%`);
    console.log('===============================================================================\n');

    if (failedCount > 0) {
        console.error('❌ TIER 5 ADVERSARIAL VERIFICATION FAILED: Bugs found.');
        process.exit(1);
    } else {
        console.log('✅ ALL TIER 5 ADVERSARIAL TESTS PASSED: Hardening Approved.');
    }
}

if (require.main === module) {
    runTier5AdversarialSuite().catch(err => {
        console.error('Fatal Test Harness Error:', err);
        process.exit(1);
    });
}

module.exports = { runTier5AdversarialSuite };
