/**
 * @fileoverview Empirical Challenger Stress Test Harness for Milestone 2 (M2)
 * Adversarial Verification: AI Agent Context Caching, Realtime Listeners & Tenant Isolation
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Challenger Agent (Realtime Listener & AI Context Challenger)
 */

const assert = require('assert');

// ==========================================
// 1. Browser & DOM Environment Mock
// ==========================================

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
            for (const peer of peers) {
                if (peer !== this && peer.onmessage) {
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
            for (const fn of eventListeners.get(type)) {
                try {
                    fn(event);
                } catch (e) {
                    console.error("Error in event listener:", e);
                }
            }
        }
    },
    BroadcastChannel: MockBroadcastChannel,
    firebase: { firestore: () => {} },
    location: { href: 'http://localhost/agent.html', pathname: '/agent.html' },
    studentNotifications: []
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

global.document = {
    hidden: false,
    readyState: 'complete',
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => ({
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        innerHTML: '',
        innerText: '',
        value: ''
    }),
    createElement: () => ({
        id: '',
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        style: {},
        appendChild: () => {},
        remove: () => {}
    }),
    head: { appendChild: () => {} },
    body: { appendChild: () => {} },
    addEventListener: (evt, fn) => global.window.addEventListener(evt, fn),
    removeEventListener: (evt, fn) => global.window.removeEventListener(evt, fn)
};

global.BroadcastChannel = MockBroadcastChannel;
global.localStorage = new MockLocalStorage();

// Load modules under test
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

// ==========================================
// 2. High-Fidelity Reactive Mock Firestore
// ==========================================

function createMockFirestoreEngine() {
    const store = new Map(); // collectionName -> Map(docId -> data)
    const activeListeners = new Set(); // Set of listener descriptors

    const getCollectionStore = (name) => {
        if (!store.has(name)) store.set(name, new Map());
        return store.get(name);
    };

    const notifyListeners = (colName, type, docId, docData) => {
        for (const l of activeListeners) {
            if (l.colName === colName) {
                let matches = true;
                for (const f of l.filters) {
                    if (f.op === '==' && docData[f.field] !== f.val) matches = false;
                }
                if (matches) {
                    l.callback({
                        docs: [{ id: docId, data: () => ({ ...docData }) }],
                        docChanges: () => [{
                            type: type,
                            doc: { id: docId, data: () => ({ ...docData }) }
                        }]
                    });
                }
            }
        }
    };

    const db = {
        _queries: [],
        _callCounts: {},

        resetMetrics() {
            this._queries = [];
            this._callCounts = {};
        },

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
                    db._queries.push({
                        type: 'get',
                        collection: name,
                        filters: this._filters,
                        limit: this._limit,
                        orderBy: this._orderBy
                    });

                    let docs = Array.from(colStore.entries()).map(([id, data]) => ({
                        id,
                        data: () => ({ ...data }),
                        ref: {
                            id,
                            delete: async () => {
                                const old = colStore.get(id);
                                colStore.delete(id);
                                notifyListeners(name, 'removed', id, old);
                            },
                            update: async (d) => {
                                const merged = { ...colStore.get(id), ...d };
                                colStore.set(id, merged);
                                notifyListeners(name, 'modified', id, merged);
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

                    if (this._orderBy) {
                        docs.sort((a, b) => {
                            const valA = a.data()[this._orderBy] || '';
                            const valB = b.data()[this._orderBy] || '';
                            if (this._orderDir === 'desc') return valA < valB ? 1 : (valA > valB ? -1 : 0);
                            return valA > valB ? 1 : (valA < valB ? -1 : 0);
                        });
                    }

                    if (this._limit !== null && this._limit > 0) {
                        docs = docs.slice(0, this._limit);
                    }

                    return {
                        empty: docs.length === 0,
                        size: docs.length,
                        docs
                    };
                },

                onSnapshot(onNext, onError) {
                    db._queries.push({
                        type: 'onSnapshot',
                        collection: name,
                        filters: this._filters,
                        limit: this._limit
                    });

                    const listenerDesc = {
                        colName: name,
                        filters: this._filters,
                        limit: this._limit,
                        callback: onNext
                    };
                    activeListeners.add(listenerDesc);

                    // Execute initial snapshot synchronously / immediately to establish baseline
                    Promise.resolve().then(() => {
                        let docs = Array.from(colStore.entries()).map(([id, data]) => ({
                            id,
                            data: () => ({ ...data })
                        }));
                        for (const f of this._filters) {
                            if (f.op === '==') {
                                docs = docs.filter(d => d.data()[f.field] === f.val);
                            }
                        }
                        const changes = docs.map(doc => ({
                            type: 'added',
                            doc: { id: doc.id, data: () => doc.data() }
                        }));
                        onNext({
                            docs,
                            docChanges: () => changes
                        });
                    });

                    return () => {
                        activeListeners.delete(listenerDesc);
                    };
                },

                doc(id) {
                    const docId = id || 'doc_' + Math.random().toString(36).substring(2, 9);
                    return {
                        id: docId,
                        async get() {
                            db._queries.push({ type: 'doc.get', collection: name, docId });
                            const exists = colStore.has(docId);
                            return {
                                exists,
                                id: docId,
                                data: () => exists ? { ...colStore.get(docId) } : {}
                            };
                        },
                        async set(data, opts) {
                            const isMerge = opts && opts.merge && colStore.has(docId);
                            const finalData = isMerge ? { ...colStore.get(docId), ...data } : { ...data };
                            const type = colStore.has(docId) ? 'modified' : 'added';
                            colStore.set(docId, finalData);
                            notifyListeners(name, type, docId, finalData);
                        },
                        async update(data) {
                            const merged = { ...colStore.get(docId), ...data };
                            colStore.set(docId, merged);
                            notifyListeners(name, 'modified', docId, merged);
                        },
                        async delete() {
                            const old = colStore.get(docId);
                            colStore.delete(docId);
                            notifyListeners(name, 'removed', docId, old);
                        }
                    };
                },

                async add(data) {
                    const id = 'gen_' + Math.random().toString(36).substring(2, 9);
                    colStore.set(id, { ...data });
                    notifyListeners(name, 'added', id, { ...data });
                    return { id };
                }
            });

            return createQuery();
        },

        batch() {
            const ops = [];
            return {
                set(ref, data, opts) { ops.push(() => ref.set(data, opts)); },
                update(ref, data) { ops.push(() => ref.update(data)); },
                delete(ref) { ops.push(() => ref.delete()); },
                async commit() {
                    for (const op of ops) await op();
                }
            };
        }
    };

    return { db, store, getCollectionStore, activeListeners };
}

// ==========================================
// 3. Test Runner & Reporting Structure
// ==========================================

const testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
};

async function challengeTest(section, name, fn) {
    testResults.total++;
    const start = process.hrtime.bigint();
    try {
        console.log(`\n▶ [${section}] ${name}...`);
        await fn();
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1e6;
        console.log(`  ✔ PASS (${durationMs.toFixed(2)} ms)`);
        testResults.passed++;
        testResults.details.push({ section, name, status: 'PASS', durationMs, error: null });
    } catch (err) {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1e6;
        console.error(`  ✖ FAIL (${durationMs.toFixed(2)} ms): ${err.message}`);
        console.error(err.stack);
        testResults.failed++;
        testResults.details.push({ section, name, status: 'FAIL', durationMs, error: err });
    }
}

// Helper to suppress noisy internal loggers during storm tests
function runSilenced(fn) {
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    try {
        const res = fn();
        if (res && typeof res.then === 'function') {
            return res.finally(() => {
                console.log = origLog;
                console.warn = origWarn;
            });
        }
        console.log = origLog;
        console.warn = origWarn;
        return res;
    } catch (err) {
        console.log = origLog;
        console.warn = origWarn;
        throw err;
    }
}

// ==========================================
// 4. Test Execution
// ==========================================

async function runAdversarialVerification() {
    console.log("================================================================================");
    console.log("  HODOORI MILESTONE 2 (M2) EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE");
    console.log("  Target: AI Agent Context Caching, Realtime Notification Isolation & Burst Storm");
    console.log("================================================================================");

    // =========================================================================
    // SECTION 1: AI Agent Context Generation (50 Consecutive Turns Stress Test)
    // =========================================================================
    await challengeTest("AI-Agent-Context", "50 consecutive prompt turns with EXACT 0 Firestore cache misses on warm cache", async () => {
        const { db, getCollectionStore } = createMockFirestoreEngine();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({
            schoolId: 'school_alpha',
            role: 'admin',
            name: 'أستاذ سامي الزعبي - مدير المدرسة'
        }));

        // Populate realistic school data
        const clsStore = getCollectionStore(DB.KEYS.CLASSES);
        for (let i = 1; i <= 10; i++) {
            clsStore.set(`cls_${i}`, {
                name: `الصف العاشر - شعبة ${i}`,
                section: `${i}`,
                schoolId: 'school_alpha'
            });
        }

        const stuStore = getCollectionStore(DB.KEYS.STUDENTS);
        for (let i = 1; i <= 50; i++) {
            stuStore.set(`stu_${i}`, {
                name: `طالب رقم ${i} سليم الخديوي`,
                academicId: `2026${String(i).padStart(3, '0')}`,
                phone: `07900000${String(i).padStart(2, '0')}`,
                classId: `cls_${(i % 10) + 1}`,
                schoolId: 'school_alpha'
            });
        }

        const tchStore = getCollectionStore(DB.KEYS.TEACHERS);
        for (let i = 1; i <= 15; i++) {
            tchStore.set(`tch_${i}`, {
                name: `معلم رقم ${i}`,
                ministryId: `100${String(i).padStart(2, '0')}`,
                role: 'teacher',
                schoolId: 'school_alpha'
            });
        }

        const recStore = getCollectionStore(DB.KEYS.RECORDS);
        const today = new Date();
        for (let d = 0; d < 30; d++) {
            const dateObj = new Date(today);
            dateObj.setDate(dateObj.getDate() - d);
            const dateStr = dateObj.toISOString().split('T')[0];

            recStore.set(`rec_${d}`, {
                date: dateStr,
                classId: 'cls_1',
                teacherId: 'tch_1',
                schoolId: 'school_alpha',
                timestamp: dateObj.toISOString(),
                details: [
                    { studentId: 'stu_1', status: d % 7 === 0 ? 'absent' : 'present' },
                    { studentId: 'stu_2', status: 'present' },
                    { studentId: 'stu_3', status: d % 5 === 0 ? 'absent' : 'present' }
                ]
            });
        }

        // --- Warmup Turn (Cold Start: Fetches data into L1 Cache) ---
        const coldStartContext = await Agent.getSystemContext();
        assert.ok(coldStartContext.length > 500, "Cold start context must generate complete system prompt");
        assert.ok(coldStartContext.includes("سليم الخديوي") || coldStartContext.includes("الصف العاشر") || coldStartContext.includes("سامي"), "Context must contain school metadata");

        const queriesColdStart = db._queries.length;
        assert.ok(queriesColdStart > 0, "Cold start should query database to populate cache");

        // Reset query log and record initial cache stats
        db.resetMetrics();
        const initialStats = DB.getCacheStats();
        const initialHits = initialStats.hits;
        const initialMisses = initialStats.misses;

        // --- 50 Consecutive Prompt Turns ---
        const turnDurations = [];
        for (let turn = 1; turn <= 50; turn++) {
            const turnStart = process.hrtime.bigint();
            const context = await Agent.getSystemContext();
            const turnEnd = process.hrtime.bigint();
            const turnMs = Number(turnEnd - turnStart) / 1e6;
            turnDurations.push(turnMs);

            // Assert output integrity on each turn
            assert.ok(typeof context === 'string' && context.length > 500, `Turn ${turn}: Context string must be non-empty and well-formed`);
            assert.ok(context.includes("المساعد الإداري الذكي") || context.includes("حضوري"), `Turn ${turn}: Must contain core AI system instructions`);
        }

        const statsAfter50 = DB.getCacheStats();
        const totalQueriesDuring50 = db._queries.length;
        const totalMissesDuring50 = statsAfter50.misses - initialMisses;
        const totalHitsDuring50 = statsAfter50.hits - initialHits;
        const avgTurnDuration = turnDurations.reduce((a, b) => a + b, 0) / turnDurations.length;

        console.log(`    📊 Results after 50 consecutive turns:`);
        console.log(`       - Firestore Network Queries Issued: ${totalQueriesDuring50} (Target: 0)`);
        console.log(`       - Cache Misses on Warm Cache: ${totalMissesDuring50} (Target: 0)`);
        console.log(`       - Cache Hits Recorded: ${totalHitsDuring50} (Target: >= 200)`);
        console.log(`       - Average Context Build Time: ${avgTurnDuration.toFixed(3)} ms/turn`);

        // EMPIRICAL ASSERTIONS
        assert.strictEqual(totalQueriesDuring50, 0, `CRITICAL VIOLATION: Expected exactly 0 Firestore queries across 50 turns, got ${totalQueriesDuring50}`);
        assert.strictEqual(totalMissesDuring50, 0, `CRITICAL VIOLATION: Expected exactly 0 cache misses on warm cache, got ${totalMissesDuring50}`);
        assert.ok(totalHitsDuring50 >= 200, `Expected at least 200 cache hits across 50 turns (4 queries x 50 turns), got ${totalHitsDuring50}`);
        assert.ok(avgTurnDuration < 5.0, `Context generation must run in sub-millisecond memory speed (< 5ms), got ${avgTurnDuration.toFixed(2)} ms`);
    });

    // =========================================================================
    // SECTION 2: Realtime Notification Multi-Tenant Isolation
    // =========================================================================
    await challengeTest("Realtime-Multi-Tenant-Isolation", "Tenant isolation: School A listener receives ZERO events from School B notifications", async () => {
        const { db } = createMockFirestoreEngine();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        const schoolAEvents = [];
        const schoolBEvents = [];

        // Setup Listener A (School Alpha Student 1)
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 'school_alpha' }));
        const unsubA = await NotificationManager.subscribeToNotifications({
            id: 'stu_alpha_1',
            academicId: '2026001',
            classId: 'cls_alpha_1',
            schoolId: 'school_alpha'
        });

        // Allow initial snapshot to settle
        await new Promise(r => setTimeout(r, 20));

        const handleNotifA = (e) => {
            schoolAEvents.push(e.detail);
        };
        window.addEventListener('new_notification_received', handleNotifA);

        // Verify query scoping for School A
        const snapQueryA = db._queries.find(q => q.collection === DB.KEYS.NOTIFICATIONS && q.type === 'onSnapshot');
        assert.ok(snapQueryA, "Snapshot query for School A must be registered");
        const filterA = snapQueryA.filters.find(f => f.field === 'schoolId');
        assert.ok(filterA, "Firestore query must include where('schoolId', '==', 'school_alpha')");
        assert.strictEqual(filterA.val, 'school_alpha');

        // Let's create an independent subscription for School Beta
        const notifCol = db.collection(DB.KEYS.NOTIFICATIONS);
        const queryB = notifCol.where('schoolId', '==', 'school_beta').orderBy('timestamp', 'desc').limit(10);
        let isInitialB = true;
        const unsubB = queryB.onSnapshot(snap => {
            if (isInitialB) { isInitialB = false; return; }
            snap.docChanges().forEach(c => {
                if (c.type === 'added') {
                    const data = { id: c.doc.id, ...c.doc.data() };
                    if (NotificationManager._isTargetMatch(data, { id: 'stu_beta_1', classId: 'cls_beta_1', schoolId: 'school_beta' })) {
                        schoolBEvents.push(data);
                    }
                }
            });
        });

        // Allow listener B initial snapshot to settle
        await new Promise(r => setTimeout(r, 20));

        // --- ATTACK VECTOR 1: Fire 25 Notifications Targeted to School B ---
        await runSilenced(async () => {
            for (let i = 1; i <= 25; i++) {
                await notifCol.add({
                    title: `إشعار مدرسة بيتا #${i}`,
                    message: `تنبيه خاص بمدرسة بيتا`,
                    targetType: (i % 3 === 0) ? 'all' : (i % 3 === 1 ? 'class' : 'student'),
                    targetId: (i % 3 === 1) ? 'cls_beta_1' : 'stu_beta_1',
                    schoolId: 'school_beta',
                    timestamp: new Date().toISOString()
                });
            }
        });

        await new Promise(r => setTimeout(r, 20));

        console.log(`    📊 Tenant Isolation Verification:`);
        console.log(`       - School B Events Received by School B: ${schoolBEvents.length}`);
        console.log(`       - School B Events Leaked to School A: ${schoolAEvents.length} (Target: 0)`);

        // Assert 0 cross-tenant leaks to School A
        assert.strictEqual(schoolAEvents.length, 0, `CRITICAL SECURITY LEAK: School A received ${schoolAEvents.length} notifications belonging to School B!`);
        assert.strictEqual(schoolBEvents.length, 25, `School B should have received all 25 targeted notifications, got ${schoolBEvents.length}`);

        // --- ATTACK VECTOR 2: Fire 20 Notifications Targeted to School A ---
        schoolBEvents.length = 0; // reset School B counter

        await runSilenced(async () => {
            for (let i = 1; i <= 20; i++) {
                await notifCol.add({
                    title: `إشعار مدرسة ألفا #${i}`,
                    message: `تنبيه خاص بمدرسة ألفا`,
                    targetType: (i % 2 === 0) ? 'all' : 'student',
                    targetId: 'stu_alpha_1',
                    schoolId: 'school_alpha',
                    timestamp: new Date().toISOString()
                });
            }
        });

        await new Promise(r => setTimeout(r, 20));

        console.log(`       - School A Events Received by School A: ${schoolAEvents.length}`);
        console.log(`       - School A Events Leaked to School B: ${schoolBEvents.length} (Target: 0)`);

        assert.strictEqual(schoolBEvents.length, 0, `CRITICAL SECURITY LEAK: School B received ${schoolBEvents.length} notifications belonging to School A!`);
        assert.strictEqual(schoolAEvents.length, 20, `School A should have received all 20 targeted notifications, got ${schoolAEvents.length}`);

        // Cleanup
        window.removeEventListener('new_notification_received', handleNotifA);
        unsubA();
        unsubB();
    });

    // =========================================================================
    // SECTION 3: Notification Burst Storm (500 Rapid Notifications)
    // =========================================================================
    await challengeTest("Notification-Burst-Storm", "500 rapid notification burst storm: in-place state mutation without query cascade", async () => {
        const { db } = createMockFirestoreEngine();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 'school_alpha' }));

        // Setup client UI state matching portal-student.html / portal-parent.html
        window.studentNotifications = [];
        let uiRenderCount = 0;

        const notifHandler = (e) => {
            const newNotif = e.detail;
            if (!newNotif || !newNotif.id) return;
            const idx = window.studentNotifications.findIndex(n => n.id === newNotif.id);
            if (idx >= 0) {
                window.studentNotifications[idx] = newNotif;
            } else {
                window.studentNotifications.unshift(newNotif);
            }
            if (window.studentNotifications.length > 50) {
                window.studentNotifications = window.studentNotifications.slice(0, 50);
            }
            uiRenderCount++;
        };

        window.addEventListener('new_notification_received', notifHandler);

        // Subscribe to School Alpha notifications
        await NotificationManager.subscribeToNotifications({
            id: 'stu_burst_target',
            classId: 'cls_burst_1',
            schoolId: 'school_alpha'
        });

        await new Promise(r => setTimeout(r, 20));

        // Reset query counter before storm
        db.resetMetrics();

        const notifCol = db.collection(DB.KEYS.NOTIFICATIONS);
        const burstPromises = [];
        const burstStartTime = process.hrtime.bigint();

        await runSilenced(async () => {
            for (let i = 1; i <= 500; i++) {
                const isMatch = (i <= 250);
                const targetType = isMatch ? (i % 2 === 0 ? 'all' : 'student') : 'student';
                const targetId = isMatch ? (i % 2 === 0 ? null : 'stu_burst_target') : `other_student_${i}`;

                burstPromises.push(notifCol.add({
                    title: `تنبيه عاصفة #${i}`,
                    message: `محتوى التنبيه رقم ${i}`,
                    targetType: targetType,
                    targetId: targetId,
                    schoolId: 'school_alpha',
                    timestamp: new Date(Date.now() + i * 10).toISOString()
                }));
            }
            await Promise.all(burstPromises);
        });

        await new Promise(r => setTimeout(r, 50)); // Allow microtasks

        const burstEndTime = process.hrtime.bigint();
        const totalStormMs = Number(burstEndTime - burstStartTime) / 1e6;
        const throughput = (500 / (totalStormMs / 1000)).toFixed(0);

        // Count read queries executed during burst storm
        const queriesDuringStorm = db._queries.filter(q => q.type === 'get' || q.type === 'doc.get').length;

        console.log(`    📊 Burst Storm Results:`);
        console.log(`       - Total Burst Ingested: 500 notifications in ${totalStormMs.toFixed(2)} ms (${throughput} notif/sec)`);
        console.log(`       - Matching Notifications Filtered & Rendered: ${uiRenderCount} times`);
        console.log(`       - Client Array State Length (Capped at 50): ${window.studentNotifications.length}`);
        console.log(`       - Cascading Firestore Read Queries Issued: ${queriesDuringStorm} (Target: 0)`);

        // EMPIRICAL ASSERTIONS
        assert.strictEqual(queriesDuringStorm, 0, `CRITICAL PERFORMANCE BUG: Burst storm triggered ${queriesDuringStorm} cascading Firestore queries! Must be 0.`);
        assert.strictEqual(uiRenderCount, 250, `Expected exactly 250 matching notifications to trigger in-place UI updates, got ${uiRenderCount}`);
        assert.strictEqual(window.studentNotifications.length, 50, `UI State array must maintain capped window of 50 items, got ${window.studentNotifications.length}`);
        assert.ok(window.studentNotifications[0].title.includes('تنبيه عاصفة'), "UI state must hold well-formed notification records");

        // Cleanup
        window.removeEventListener('new_notification_received', notifHandler);
        NotificationManager.unsubscribe();
    });

    // =========================================================================
    // SECTION 4: Targeted Lookups with Malicious & Corrupted Inputs
    // =========================================================================
    await challengeTest("Malicious-Inputs-Hardening", "Targeted lookups & auth with SQL/NoSQL injection tokens, unicode diacritics & nulls", async () => {
        const { db, getCollectionStore } = createMockFirestoreEngine();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        const tchStore = getCollectionStore(DB.KEYS.TEACHERS);
        tchStore.set('t_legit', { name: 'المعلم الشرعي', ministryId: '12345', password: 'correct_password', role: 'teacher', schoolId: 's1' });

        const stuStore = getCollectionStore(DB.KEYS.STUDENTS);
        stuStore.set('s_legit', { name: 'سَلِيمْ يَاسِرْ سَلِيمْ الخَدِيوِي', academicId: '2026111', phone: '0799999999', classId: 'c1', schoolId: 's1' });

        // --- SUBTEST 4.1: Nullish & Type Incoercion Tests ---
        console.log("    [Subtest 4.1: Nullish & Malformed Types]");
        const nullishVectors = [null, undefined, '', '   ', 0, false, NaN, {}, [], () => {}];
        for (const input of nullishVectors) {
            const t = await DB.getTeacherByMinistryId(input);
            assert.strictEqual(t, null, `getTeacherByMinistryId must return null for ${typeof input} (${input})`);

            const sPhone = await DB.getStudentsByPhone(input);
            assert.deepStrictEqual(sPhone, [], `getStudentsByPhone must return [] for ${typeof input} (${input})`);

            const sAcad = await DB.getStudentByAcademicId(input);
            assert.strictEqual(sAcad, null, `getStudentByAcademicId must return null for ${typeof input} (${input})`);

            const authRes = await Auth.login(input, 'pass');
            assert.strictEqual(authRes.success, false, `Auth.login must reject ${typeof input} username`);
        }

        // --- SUBTEST 4.2: SQL & NoSQL Injection Vectors ---
        console.log("    [Subtest 4.2: SQL/NoSQL Injection Probes]");
        const injectionPayloads = [
            "' OR '1'='1",
            "admin' --",
            "' UNION SELECT * FROM teachers --",
            "12345' OR '1'='1",
            "'; DROP TABLE v2_students; --",
            '{"$gt": ""}',
            '{"$ne": null}',
            '{"$regex": ".*"}',
            "__proto__",
            "constructor",
            "prototype"
        ];

        for (const payload of injectionPayloads) {
            const loginInjection = await Auth.login(payload, payload);
            assert.strictEqual(loginInjection.success, false, `SECURITY BREACH: Injection payload '${payload}' authenticated successfully!`);

            const teacherLookup = await DB.getTeacherByMinistryId(payload);
            assert.strictEqual(teacherLookup, null, `SECURITY BREACH: Teacher lookup injection '${payload}' leaked data!`);

            const phoneLookup = await DB.getStudentsByPhone(payload);
            assert.strictEqual(phoneLookup.length, 0, `SECURITY BREACH: Phone lookup injection '${payload}' leaked records!`);

            const acadLookup = await DB.getStudentByAcademicId(payload);
            assert.strictEqual(acadLookup, null, `SECURITY BREACH: Academic ID lookup injection '${payload}' leaked data!`);
        }

        // Verify Prototype Pollution Immunity
        assert.strictEqual(Object.prototype.isAdmin, undefined, "Object.prototype must not be polluted");
        assert.strictEqual(Object.prototype.role, undefined, "Object.prototype must not be polluted");

        // --- SUBTEST 4.3: Unicode Diacritics, RTL Overrides & Massive Payloads ---
        console.log("    [Subtest 4.3: Unicode Diacritics, RTL Overrides & Massive Payloads]");
        const unicodeVectors = [
            "سَلِيمْ", // Arabic Harakat / Tashkeel
            "\u202E12345\u202D", // Right-to-Left Override
            "\u200E12345\u200F", // Left-to-Right & Right-to-Left Marks
            "12345\u200B\u200C\u200D", // Zero-width spaces and joiners
            "A".repeat(20000), // Massive 20KB string probe
            ".*+?^${}()|[]\\" // Regex control character bomb
        ];

        for (const uv of unicodeVectors) {
            const resTeacher = await DB.getTeacherByMinistryId(uv);
            const resPhone = await DB.getStudentsByPhone(uv);
            const resAcad = await DB.getStudentByAcademicId(uv);
            const resAuth = await Auth.login(uv, uv);

            assert.strictEqual(typeof resPhone, 'object');
            assert.strictEqual(resAuth.success, false);
        }

        // --- SUBTEST 4.4: Legitimate Targeted Lookups & Cache Invalidation ---
        console.log("    [Subtest 4.4: Legitimate Targeted Lookups & Cache Invalidation]");
        const teacher = await DB.getTeacherByMinistryId('12345');
        assert.strictEqual(teacher.name, 'المعلم الشرعي');

        const students = await DB.getStudentsByPhone('0799999999');
        assert.strictEqual(students.length, 1);
        assert.strictEqual(students[0].name, 'سَلِيمْ يَاسِرْ سَلِيمْ الخَدِيوِي');

        const student = await DB.getStudentByAcademicId('2026111');
        assert.strictEqual(student.academicId, '2026111');

        // Mutating student should safely purge targeted cache
        await DB.updateStudent('s_legit', { name: 'سليم الخديوي المعدل' });
        const refreshedStudent = await DB.getStudentByAcademicId('2026111');
        assert.strictEqual(refreshedStudent.name, 'سليم الخديوي المعدل');
    });

    // ==========================================
    // 5. Final Report & Verdict
    // ==========================================
    console.log("\n================================================================================");
    console.log(`  VERIFICATION RESULTS: ${testResults.passed}/${testResults.total} Passed (${((testResults.passed / testResults.total) * 100).toFixed(1)}%)`);
    console.log("================================================================================");

    if (testResults.failed > 0) {
        console.error(`\n❌ VERDICT: REJECT - ${testResults.failed} challenge tests failed!`);
        process.exit(1);
    } else {
        console.log(`\n✅ VERDICT: APPROVE - All adversarial challenge tests passed with zero violations.`);
        process.exit(0);
    }
}

runAdversarialVerification().catch(err => {
    console.error("FATAL ERROR IN CHALLENGE HARNESS:", err);
    process.exit(1);
});
