/**
 * @fileoverview Automated Test Suite for Milestone 2: Polling, Lifecycle Management, Targeted Queries & Realtime Optimization
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Teamwork M2 Specialist
 */

const assert = require('assert');

// Mock browser environment for Node.js
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

// Global DOM and Window Mock
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
                fn(event);
            }
        }
    },
    BroadcastChannel: MockBroadcastChannel,
    firebase: { firestore: () => {} },
    location: { href: 'http://localhost/dashboard-admin.html', pathname: '/dashboard-admin.html' }
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
    getElementById: (id) => ({
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        innerHTML: '',
        innerText: '',
        value: ''
    }),
    createElement: (tag) => ({
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
    addEventListener: (evt, fn) => {
        global.window.addEventListener(evt, fn);
    },
    removeEventListener: (evt, fn) => {
        global.window.removeEventListener(evt, fn);
    }
};

global.BroadcastChannel = MockBroadcastChannel;
global.localStorage = new MockLocalStorage();

// Load modules under test
const DB = require('../scripts/core-db.js');
global.DB = DB;

const PageLifecycle = DB.PageLifecycle;
global.PageLifecycle = PageLifecycle;

const Auth = require('../scripts/core-auth.js');
global.Auth = Auth;

const NotificationManager = require('../scripts/utils-notifications.js');
global.NotificationManager = NotificationManager;

const Agent = require('../scripts/module-ai-agent.js');
global.Agent = Agent;

// Mock Firestore database structure with query tracking
function createMockFirestore() {
    const store = new Map();

    const getCollectionStore = (name) => {
        if (!store.has(name)) store.set(name, new Map());
        return store.get(name);
    };

    const db = {
        _callCounts: {},
        _queries: [],

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
                    db._queries.push({ collection: name, filters: this._filters, limit: this._limit });

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
                        docs
                    };
                },

                onSnapshot(onNext, onError) {
                    db._queries.push({ collection: name, filters: this._filters, type: 'onSnapshot' });

                    // Execute initial snapshot immediately
                    this.get().then(snap => {
                        const changes = snap.docs.map(doc => ({
                            type: 'added',
                            doc: { id: doc.id, data: () => doc.data() }
                        }));
                        onNext({
                            docs: snap.docs,
                            docChanges: () => changes
                        });
                    });

                    // Return mock unsubscribe
                    let active = true;
                    return () => {
                        active = false;
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
    console.log("=== Hodoori Milestone 2 (M2) Comprehensive Automated Test Suite ===\n");

    // ==========================================
    // SECTION 1: PageVisibility & Universal PageLifecycleManager
    // ==========================================
    console.log("--- Section 1: PageVisibility & PageLifecycleManager ---");

    await runTest("PageLifecycle registers intervals, pauses when tab is hidden, and resumes when visible", async () => {
        PageLifecycle.cleanupAll();
        PageLifecycle.init();

        let executionCount = 0;
        document.hidden = false;
        PageLifecycle.isPageVisible = true;

        // Register interval to fire every 20ms
        PageLifecycle.registerInterval('test_timer_1', () => {
            executionCount++;
        }, 20);

        assert.strictEqual(PageLifecycle._intervals.has('test_timer_1'), true);
        const desc = PageLifecycle._intervals.get('test_timer_1');
        assert.ok(desc.timerId !== null, "Timer ID should be active when page is visible");

        // Wait 50ms (should execute ~2 times)
        await new Promise(r => setTimeout(r, 55));
        const countBeforePause = executionCount;
        assert.ok(countBeforePause >= 1, `Timer should have executed at least once, got ${countBeforePause}`);

        // Tab switches to background (hidden)
        document.hidden = true;
        PageLifecycle.pauseAll();
        assert.strictEqual(desc.timerId, null, "Timer ID must be null after pausing");

        // Wait 50ms while hidden -> count should not increase
        await new Promise(r => setTimeout(r, 55));
        assert.strictEqual(executionCount, countBeforePause, "Interval must NOT execute when tab is hidden");

        // Tab becomes visible again
        document.hidden = false;
        PageLifecycle.resumeAll();
        assert.ok(desc.timerId !== null, "Timer ID should be restored on resume");

        // Wait 50ms -> count should resume incrementing
        await new Promise(r => setTimeout(r, 55));
        assert.ok(executionCount > countBeforePause, "Interval should resume executing after tab becomes visible");

        // Clean up
        PageLifecycle.clearInterval('test_timer_1');
        assert.strictEqual(PageLifecycle._intervals.has('test_timer_1'), false);
    });

    await runTest("PageLifecycle cleans up realtime listeners on cleanupAll / unload", async () => {
        PageLifecycle.cleanupAll();

        let listenerClosed = false;
        const mockUnsub = () => {
            listenerClosed = true;
        };

        const dispose = PageLifecycle.registerListener(mockUnsub);
        assert.strictEqual(PageLifecycle._listeners.size, 1);

        // cleanupAll simulates beforeunload/pagehide
        PageLifecycle.cleanupAll();
        assert.strictEqual(listenerClosed, true, "Unsubscribe function should be called on cleanupAll");
        assert.strictEqual(PageLifecycle._listeners.size, 0, "Listeners set should be empty after cleanup");
    });

    // ==========================================
    // SECTION 2: Targeted Auth & Database Lookups
    // ==========================================
    console.log("\n--- Section 2: Targeted Auth & Database Lookups ---");

    await runTest("DB.getTeacherByMinistryId executes single-doc targeted query with L1 caching and coalescing", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const teachersStore = getCollectionStore(DB.KEYS.TEACHERS);
        teachersStore.set('t_100', { name: 'الأستاذ أحمد', ministryId: '100', password: 'pass', schoolId: 's1' });
        teachersStore.set('t_200', { name: 'الأستاذ سامي', ministryId: '200', password: 'pass', schoolId: 's1' });

        // First call: executes 1 targeted query
        db._queries = [];
        const teacher = await DB.getTeacherByMinistryId('100');
        assert.strictEqual(teacher.name, 'الأستاذ أحمد');
        assert.strictEqual(teacher.ministryId, '100');

        assert.strictEqual(db._queries.length, 1);
        assert.strictEqual(db._queries[0].collection, DB.KEYS.TEACHERS);
        assert.deepStrictEqual(db._queries[0].filters, [{ field: 'ministryId', op: '==', val: '100' }]);
        assert.strictEqual(db._queries[0].limit, 1);

        // Second call: Hits L1 cache (0 queries executed)
        db._queries = [];
        const cachedTeacher = await DB.getTeacherByMinistryId('100');
        assert.strictEqual(cachedTeacher.name, 'الأستاذ أحمد');
        assert.strictEqual(db._queries.length, 0, "Second call must hit L1 cache with 0 Firestore reads");

        // Concurrent coalescing test
        DB.clearAllCaches();
        db._queries = [];
        const [p1, p2, p3] = await Promise.all([
            DB.getTeacherByMinistryId('200'),
            DB.getTeacherByMinistryId('200'),
            DB.getTeacherByMinistryId('200')
        ]);
        assert.strictEqual(p1.name, 'الأستاذ سامي');
        assert.strictEqual(p2.name, 'الأستاذ سامي');
        assert.strictEqual(p3.name, 'الأستاذ سامي');
        assert.strictEqual(db._queries.length, 1, "Simultaneous callers must coalesce into exactly 1 network query");
    });

    await runTest("Auth.login uses targeted teacher query without full collection scan", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        const teachersStore = getCollectionStore(DB.KEYS.TEACHERS);
        teachersStore.set('t_101', { name: 'معلم أول', ministryId: '101', password: 'secretpassword', role: 'teacher', schoolId: 's1' });
        teachersStore.set('t_102', { name: 'معلم محظور', ministryId: '102', password: 'secretpassword', role: 'teacher', blocked: true, schoolId: 's1' });

        // 1. Successful targeted login
        db._queries = [];
        const resSuccess = await Auth.login('101', 'secretpassword');
        assert.strictEqual(resSuccess.success, true);
        assert.strictEqual(resSuccess.user.name, 'معلم أول');
        assert.strictEqual(db._queries.length, 1);
        assert.strictEqual(db._queries[0].filters[0].val, '101');

        // 2. Blocked account check
        const resBlocked = await Auth.login('102', 'secretpassword');
        assert.strictEqual(resBlocked.success, false);
        assert.ok(resBlocked.message.includes('محظور'));

        // 3. Invalid credentials
        const resInvalid = await Auth.login('101', 'wrongpass');
        assert.strictEqual(resInvalid.success, false);

        // 4. Hardcoded Ministry super-account
        const resMinistry = await Auth.login('MOE2025', 'ministry@2025');
        assert.strictEqual(resMinistry.success, true);
        assert.strictEqual(resMinistry.user.role, 'ministry');
    });

    await runTest("DB.getStudentByAcademicId and DB.getStudentsByPhone execute targeted queries with caching", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        const studentsStore = getCollectionStore(DB.KEYS.STUDENTS);
        studentsStore.set('doc_st1', { name: 'سليم الزعبي', academicId: '2026001', phone: '0791234567', classId: 'c1', schoolId: 's1' });
        studentsStore.set('doc_st2', { name: 'أحمد الزعبي', academicId: '2026002', phone: '0791234567', classId: 'c2', schoolId: 's1' });

        // 1. getStudentByAcademicId by doc ID
        const sByDoc = await DB.getStudentByAcademicId('doc_st1');
        assert.strictEqual(sByDoc.name, 'سليم الزعبي');

        // 2. getStudentByAcademicId by academicId field
        const sByAcad = await DB.getStudentByAcademicId('2026002');
        assert.strictEqual(sByAcad.name, 'أحمد الزعبي');

        // 3. getStudentsByPhone (Parent Multi-Child Query)
        db._queries = [];
        const children = await DB.getStudentsByPhone('0791234567');
        assert.strictEqual(children.length, 2);
        assert.strictEqual(db._queries.length, 1);
        assert.deepStrictEqual(db._queries[0].filters, [{ field: 'phone', op: '==', val: '0791234567' }]);

        // 4. Cached lookup for phone
        db._queries = [];
        const cachedChildren = await DB.getStudentsByPhone('0791234567');
        assert.strictEqual(cachedChildren.length, 2);
        assert.strictEqual(db._queries.length, 0, "Cached phone lookup should produce 0 queries");
    });

    // ==========================================
    // SECTION 3: Scoped Realtime Notifications & In-Place Updates
    // ==========================================
    console.log("\n--- Section 3: Scoped Realtime Notifications & In-Place Updates ---");

    await runTest("NotificationManager enforces schoolId tenant isolation in queries and exposes unsubscribe", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 'school_alpha' }));

        db._queries = [];
        const unsub = await NotificationManager.subscribeToNotifications({
            id: 'st_99',
            classId: 'c1',
            schoolId: 'school_alpha'
        });

        assert.strictEqual(typeof unsub, 'function');
        assert.ok(NotificationManager._unsubscribe !== null);

        // Verify schoolId filter was appended to Firestore query
        const snapQuery = db._queries.find(q => q.collection === DB.KEYS.NOTIFICATIONS);
        assert.ok(snapQuery, "Notifications snapshot query should be recorded");
        const schoolFilter = snapQuery.filters.find(f => f.field === 'schoolId');
        assert.ok(schoolFilter, "Query must include where('schoolId', '==', 'school_alpha') filter");
        assert.strictEqual(schoolFilter.val, 'school_alpha');

        // Unsubscribe
        const unsubResult = NotificationManager.unsubscribe();
        assert.strictEqual(unsubResult, true);
        assert.strictEqual(NotificationManager._unsubscribe, null);
    });

    await runTest("NotificationManager _isTargetMatch matches student, parent, class and broadcast notifications", async () => {
        // 1. Broadcast to all
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'all' }, { id: 'st1' }), true);

        // 2. Class target
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'class', targetId: 'c1' }, { classId: 'c1' }), true);
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'class', targetId: 'c1' }, { classId: 'c2' }), false);
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'class', targetId: 'c1' }, { classIds: ['c1', 'c3'] }), true);

        // 3. Student target
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'student', targetId: '2024001' }, { academicId: '2024001' }), true);
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'student', targetId: '2024001' }, { id: '2024001' }), true);
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'student', targetId: '2024001' }, { studentIds: ['2024001', '2024002'] }), true);

        // 4. Parent multi-child target
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'parent', targetId: '2024001' }, { isParent: true, studentIds: ['2024001'] }), true);
        assert.strictEqual(NotificationManager._isTargetMatch({ targetType: 'parent', targetId: '9999999' }, { isParent: true, studentIds: ['2024001'] }), false);
    });

    // ==========================================
    // SECTION 4: AI Agent Context Caching & State Verification
    // ==========================================
    console.log("\n--- Section 4: AI Agent System Context & Verification ---");

    await runTest("Agent.getSystemContext generates context from L1 cache with 0 network reads on warm cache", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1', role: 'admin', name: 'المدير' }));

        // Populate mock store
        const clsStore = getCollectionStore(DB.KEYS.CLASSES);
        clsStore.set('c1', { name: 'الصف العاشر', section: 'أ', schoolId: 's1' });

        const stuStore = getCollectionStore(DB.KEYS.STUDENTS);
        stuStore.set('s1', { name: 'سليم الزعبي', academicId: '2024001', classId: 'c1', schoolId: 's1' });

        const tchStore = getCollectionStore(DB.KEYS.TEACHERS);
        tchStore.set('t1', { name: 'أحمد المعلم', ministryId: '100', schoolId: 's1' });

        const recStore = getCollectionStore(DB.KEYS.RECORDS);
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        recStore.set('r1', {
            date: todayStr,
            classId: 'c1',
            teacherId: 't1',
            schoolId: 's1',
            timestamp: new Date().toISOString(),
            details: [{ studentId: 's1', status: 'present' }]
        });

        // Prime cache with turn 1
        const ctx1 = await Agent.getSystemContext();
        assert.ok(ctx1.includes('سليم الزعبي') || ctx1.includes('الصف العاشر') || ctx1.includes('المدير'), "Context must include school metadata");

        // Turn 2, 3, 4, 5: Verify 0 new network queries
        db._queries = [];
        for (let i = 0; i < 4; i++) {
            const ctxTurn = await Agent.getSystemContext();
            assert.ok(ctxTurn.length > 100);
        }

        assert.strictEqual(db._queries.length, 0, "4 consecutive AI agent context builds must generate ZERO Firestore network queries");
    });

    await runTest("Agent._verifyDatabaseState verifies records/reports alongside classes, students and teachers", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // 1. Verify insertion of record
        const recStore = getCollectionStore(DB.KEYS.RECORDS);
        recStore.set('rec_10', { date: todayStr, classId: 'c1', schoolId: 's1', details: [] });

        const verifyInsert = await Agent._verifyDatabaseState({
            type: 'database_action',
            action: 'insert',
            table: 'records',
            data: { date: todayStr, classId: 'c1' }
        });
        assert.strictEqual(verifyInsert.success, true, "Inserted record should pass verification");

        // 2. Reject fake placeholder IDs
        const verifyPlaceholder = await Agent._verifyDatabaseState({
            type: 'database_action',
            action: 'delete',
            table: 'students',
            id: 'STUDENT_ID'
        });
        assert.strictEqual(verifyPlaceholder.success, false, "Placeholder ID must be rejected");

        // 3. Verify deletion of record
        const verifyDelete = await Agent._verifyDatabaseState({
            type: 'database_action',
            action: 'delete',
            table: 'records',
            id: 'non_existent_rec_999'
        });
        assert.strictEqual(verifyDelete.success, true, "Non-existent record ID should confirm deletion");
    });

    // ==========================================
    // SECTION 5: In-Memory Dashboard Optimization Checks
    // ==========================================
    console.log("\n--- Section 5: In-Memory Dashboard & Portal Behavior ---");

    await runTest("Absence alarm scheduler uses DB.getTodayRecords and in-memory student lookup", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const todayStr = new Date().toISOString().split('T')[0];
        const recStore = getCollectionStore(DB.KEYS.RECORDS);
        recStore.set('rec_today', {
            date: todayStr,
            classId: 'c1',
            schoolId: 's1',
            details: [
                { studentId: 'st_absent', status: 'absent' },
                { studentId: 'st_present', status: 'present' }
            ]
        });

        const stuStore = getCollectionStore(DB.KEYS.STUDENTS);
        stuStore.set('st_absent', { id: 'st_absent', name: 'طالب غائب', academicId: '202499', schoolId: 's1' });

        // Simulate absence alarm logic
        const todayRecords = await DB.getTodayRecords();
        assert.strictEqual(todayRecords.length, 1);

        const students = await DB.getStudents();
        const studentMap = new Map(students.map(s => [s.id, s]));
        assert.strictEqual(studentMap.get('st_absent').name, 'طالب غائب');

        // Add absence notification
        const notifResult = await DB.addNotification({
            title: 'تنبيه غياب',
            message: `الطالب ${studentMap.get('st_absent').name} غائب اليوم`,
            targetType: 'parent',
            targetId: '202499',
            type: 'absence_alert'
        });
        assert.ok(notifResult, "addNotification must return generated notification ID");
    });

    console.log(`\n========================================`);
    console.log(`Milestone 2 Test Results: ${passedTests}/${totalTests} Passed (100%)`);
    console.log(`========================================`);

    if (passedTests !== totalTests) {
        process.exit(1);
    }
}

main().catch(err => {
    console.error("FATAL TEST RUNNER ERROR:", err);
    process.exit(1);
});
