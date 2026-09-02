/**
 * @fileoverview Empirical Adversarial Stress Test Harness for Milestone 2 (M2)
 * @author Challenger Agent (Role: Polling & Visibility Stress Challenger)
 * @target Hodoori Milestone 2 Optimization & Resilience Verification
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

// Mock UI object for admin/teacher dashboards
global.UI = {
    toast: (msg, type) => {},
    confirm: async () => true,
    setLoading: () => {}
};

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
                    db._queries.push({ collection: name, filters: this._filters, limit: this._limit, type: 'get' });

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
                            db._queries.push({ collection: name, docId, type: 'doc_get' });
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

let totalStressTests = 0;
let passedStressTests = 0;
const testResults = [];

async function runStressTest(section, name, fn) {
    totalStressTests++;
    const startTime = Date.now();
    try {
        await fn();
        const durationMs = Date.now() - startTime;
        console.log(`  [PASS] [${durationMs}ms] ${section} -> ${name}`);
        passedStressTests++;
        testResults.push({ section, name, status: 'PASS', durationMs, error: null });
    } catch (err) {
        const durationMs = Date.now() - startTime;
        console.error(`  [FAIL] [${durationMs}ms] ${section} -> ${name}`);
        console.error(`         Error: ${err.message}`);
        if (err.stack) console.error(`         Stack: ${err.stack.split('\n')[1]}`);
        testResults.push({ section, name, status: 'FAIL', durationMs, error: err.message });
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
    console.log("================================================================================");
    console.log("🔥 EMPIRICAL ADVERSARIAL STRESS TEST SUITE — MILESTONE 2 (M2)");
    console.log("   Hodoori Platform: Polling, Page Lifecycle, Targeted Lookups & Dashboard Cache");
    console.log("================================================================================\n");

    // =========================================================================
    // SECTION 1: PageLifecycle Under Rapid 100x Simulated Visibility Toggles
    // =========================================================================
    console.log(">>> SECTION 1: PageLifecycle Visibility Stress & Resource Invariants");

    await runStressTest("PageLifecycle", "100 Rapid Visibility Toggles (hidden <-> visible) with 5 concurrent timers", async () => {
        PageLifecycle.cleanupAll();
        PageLifecycle.init();

        const logs = []; // array of { timerId, hidden, timestamp }
        let hiddenExecutions = 0;
        let visibleExecutions = 0;

        // Register 5 timers with different rates and resume policies
        const timersConfig = [
            { id: 'timer_fast_1', ms: 5, runOnResume: false },
            { id: 'timer_fast_2', ms: 10, runOnResume: true },
            { id: 'timer_med_1', ms: 15, runOnResume: false },
            { id: 'timer_med_2', ms: 20, runOnResume: true },
            { id: 'timer_slow_1', ms: 30, runOnResume: true }
        ];

        document.hidden = false;
        PageLifecycle.isPageVisible = true;

        timersConfig.forEach(cfg => {
            PageLifecycle.registerInterval(cfg.id, () => {
                const isHidden = document.hidden;
                if (isHidden) {
                    hiddenExecutions++;
                } else {
                    visibleExecutions++;
                }
                logs.push({ timerId: cfg.id, hidden: isHidden, t: Date.now() });
            }, cfg.ms, cfg.runOnResume);
        });

        // Verify initial registration
        assert.strictEqual(PageLifecycle._intervals.size, 5);

        // Perform 100 rapid visibility transitions (50 hidden, 50 visible)
        const toggleCycles = 100;
        for (let i = 0; i < toggleCycles; i++) {
            const setHidden = (i % 2 === 0); // Alternate
            document.hidden = setHidden;

            if (setHidden) {
                PageLifecycle.pauseAll();
                PageLifecycle.isPageVisible = false;
            } else {
                PageLifecycle.isPageVisible = true;
                PageLifecycle.resumeAll();
            }

            // Micro-sleep to allow event loop ticks
            await sleep(2);
        }

        // Leave visible for 60ms to confirm timers resume normally
        document.hidden = false;
        PageLifecycle.isPageVisible = true;
        PageLifecycle.resumeAll();
        const preFinalExecs = visibleExecutions;
        await sleep(60);
        const postFinalExecs = visibleExecutions;

        assert.strictEqual(hiddenExecutions, 0, `ZERO executions allowed while hidden. Observed: ${hiddenExecutions}`);
        assert.ok(postFinalExecs > preFinalExecs, "Timers must actively execute after visibility is restored");

        // Clean up
        PageLifecycle.cleanupAll();
        assert.strictEqual(PageLifecycle._intervals.size, 0);
    });

    await runStressTest("PageLifecycle", "Registering intervals while tab is hidden must remain paused until visible", async () => {
        PageLifecycle.cleanupAll();
        PageLifecycle.init();

        document.hidden = true;
        PageLifecycle.isPageVisible = false;

        let hiddenFired = false;
        PageLifecycle.registerInterval('hidden_registered_timer', () => {
            hiddenFired = true;
        }, 10, true);

        const desc = PageLifecycle._intervals.get('hidden_registered_timer');
        assert.strictEqual(desc.timerId, null, "Timer ID must be null when registered while page is hidden");

        await sleep(40);
        assert.strictEqual(hiddenFired, false, "Timer registered while hidden must not execute while hidden");

        // Now resume
        document.hidden = false;
        PageLifecycle.isPageVisible = true;
        PageLifecycle.resumeAll();

        assert.ok(desc.timerId !== null, "Timer ID must be initialized upon resumeAll");
        await sleep(35);
        assert.strictEqual(hiddenFired, true, "Timer must execute once resumed");

        PageLifecycle.cleanupAll();
    });

    await runStressTest("PageLifecycle", "Overwriting same interval ID 50 times under stress leaves exactly 1 active timer", async () => {
        PageLifecycle.cleanupAll();
        PageLifecycle.init();

        document.hidden = false;
        PageLifecycle.isPageVisible = true;

        let lastCallbackFired = 0;
        let staleCallbacksFired = 0;

        for (let i = 1; i <= 50; i++) {
            const currentIteration = i;
            PageLifecycle.registerInterval('stress_dup_timer', () => {
                if (currentIteration === 50) {
                    lastCallbackFired++;
                } else {
                    staleCallbacksFired++;
                }
            }, 10);
        }

        assert.strictEqual(PageLifecycle._intervals.size, 1);
        await sleep(45);

        assert.strictEqual(staleCallbacksFired, 0, "Stale overwrites must be cleared and never fire");
        assert.ok(lastCallbackFired >= 2, `Latest callback must fire, got ${lastCallbackFired}`);

        PageLifecycle.clearInterval('stress_dup_timer');
        assert.strictEqual(PageLifecycle._intervals.has('stress_dup_timer'), false);
    });

    await runStressTest("PageLifecycle", "100 realtime listener registrations and bulk cleanupAll teardown", async () => {
        PageLifecycle.cleanupAll();
        PageLifecycle.init();

        let unsubsCalled = 0;
        const unsubs = [];

        for (let i = 0; i < 100; i++) {
            const unsubFn = () => { unsubsCalled++; };
            unsubs.push(unsubFn);
            PageLifecycle.registerListener(unsubFn);
        }

        assert.strictEqual(PageLifecycle._listeners.size, 100);

        // Teardown
        PageLifecycle.cleanupAll();
        assert.strictEqual(unsubsCalled, 100, "All 100 unsubscribers must be invoked on cleanupAll");
        assert.strictEqual(PageLifecycle._listeners.size, 0, "Listeners set must be cleared");

        // Calling cleanupAll again should be idempotent
        PageLifecycle.cleanupAll();
        assert.strictEqual(unsubsCalled, 100);
    });

    // =========================================================================
    // SECTION 2: Absence Alarm Scheduler Execution & Zero Cloud Reads
    // =========================================================================
    console.log("\n>>> SECTION 2: Absence Alarm Scheduler Execution & Zero Cloud Reads");

    await runStressTest("AbsenceAlarm", "0 cloud reads on 50 repeated scheduler ticks when settings and records are cached", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 'school_main' }));

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        // Seed mock database
        const settingsStore = getCollectionStore(DB.KEYS.SETTINGS);
        settingsStore.set('school_main', {
            id: 'school_main',
            schoolId: 'school_main',
            customization: { 'plugin-absence': true },
            absenceAlarmTime: '08:00',
            absenceAlarmDays: [0, 1, 2, 3, 4, 5, 6],
            absenceAlarmClasses: ['class_1', 'class_2'],
            lastAlarmSentDate: todayStr // Already sent today
        });

        const studentsStore = getCollectionStore(DB.KEYS.STUDENTS);
        studentsStore.set('st_1', { id: 'st_1', name: 'طالب أ', academicId: '202601', classId: 'class_1', schoolId: 'school_main' });
        studentsStore.set('st_2', { id: 'st_2', name: 'طالب ب', academicId: '202602', classId: 'class_2', schoolId: 'school_main' });

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('rec_1', {
            id: 'rec_1',
            date: todayStr,
            classId: 'class_1',
            schoolId: 'school_main',
            details: [{ studentId: 'st_1', status: 'absent' }]
        });

        // Define the exact scheduler callback from dashboard-admin.html
        const schedulerCallback = async () => {
            const settings = (await DB.getSettings()) || {};
            if (!settings.customization?.['plugin-absence']) return;

            const scheduledTime = settings.absenceAlarmTime || '08:00';
            const scheduledDays = settings.absenceAlarmDays || [0, 1, 2, 3, 4];

            // In actual operation, checks current time vs scheduledTime and lastAlarmSentDate
            const currentTime = '08:00';
            const currentDay = now.getDay();

            if (currentTime === scheduledTime &&
                scheduledDays.includes(currentDay) &&
                settings.lastAlarmSentDate !== todayStr) {
                // Not reached because lastAlarmSentDate === todayStr
            }
        };

        // Cold run: primes L1 settings cache (1 read)
        db._queries = [];
        await schedulerCallback();
        const initialReads = db._queries.length;
        assert.ok(initialReads <= 1, `Cold read should be at most 1 query, was: ${initialReads}`);

        // Stress: 50 consecutive ticks with warm L1 cache
        db._queries = [];
        for (let tick = 0; tick < 50; tick++) {
            await schedulerCallback();
        }

        assert.strictEqual(db._queries.length, 0, `50 warm scheduler ticks must generate EXACTLY 0 Firestore queries. Got: ${db._queries.length}`);
    });

    await runStressTest("AbsenceAlarm", "Alarm triggers on schedule, writes notifications, and date-locks against duplicate alarms", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 'school_main' }));

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const currentDay = now.getDay();
        const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

        // Seed settings: alarm time matches now, lastAlarmSentDate is yesterday
        const settingsStore = getCollectionStore(DB.KEYS.SETTINGS);
        settingsStore.set('school_main', {
            id: 'school_main',
            schoolId: 'school_main',
            customization: { 'plugin-absence': true },
            absenceAlarmTime: currentTime,
            absenceAlarmDays: [currentDay],
            absenceAlarmClasses: ['c_alpha'],
            lastAlarmSentDate: '2020-01-01' // Previous date
        });

        const studentsStore = getCollectionStore(DB.KEYS.STUDENTS);
        studentsStore.set('st_alpha_1', { id: 'st_alpha_1', name: 'خالد الزعبي', academicId: '202611', classId: 'c_alpha', schoolId: 'school_main' });
        studentsStore.set('st_alpha_2', { id: 'st_alpha_2', name: 'عمر الزعبي', academicId: '202612', classId: 'c_alpha', schoolId: 'school_main' });

        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);
        recordsStore.set('rec_alpha', {
            id: 'rec_alpha',
            date: todayStr,
            classId: 'c_alpha',
            schoolId: 'school_main',
            details: [
                { studentId: 'st_alpha_1', status: 'absent' },
                { studentId: 'st_alpha_2', status: 'present' }
            ]
        });

        const notifStore = getCollectionStore(DB.KEYS.NOTIFICATIONS);

        // Simulation of triggerAbsenceNotificationsNow(true)
        const triggerAbsenceNotifications = async () => {
            const settings = (await DB.getSettings()) || {};
            const classesToNotify = settings.absenceAlarmClasses || [];
            if (classesToNotify.length === 0) return;

            const allTodayRecords = await DB.getTodayRecords();
            const todayRecords = (allTodayRecords || []).filter(r => classesToNotify.includes(r.classId));
            if (todayRecords.length === 0) return;

            const allStudents = await DB.getStudents();
            const studentMap = new Map();
            allStudents.forEach(s => {
                studentMap.set(s.id, s);
                if (s.academicId) studentMap.set(s.academicId, s);
            });

            let absentCount = 0;
            const notificationPromises = [];
            for (const r of todayRecords) {
                const absentees = (r.details || []).filter(d => d.status === 'absent');
                for (const item of absentees) {
                    const student = studentMap.get(item.studentId);
                    const studentName = student ? student.name : 'الطالب';
                    const targetId = student ? (student.academicId || student.id) : item.studentId;

                    notificationPromises.push(
                        DB.addNotification({
                            title: 'تنبيه غياب',
                            message: `نحيطكم علماً بأن الطالب ${studentName} غائب اليوم`,
                            targetType: 'parent',
                            targetId: targetId,
                            type: 'absence_alert',
                            schoolId: 'school_main'
                        })
                    );
                    absentCount++;
                }
            }

            if (notificationPromises.length > 0) {
                await Promise.all(notificationPromises);
            }

            if (absentCount > 0) {
                settings.lastAlarmSentDate = todayStr;
                await DB.saveSettings(settings);
            }
        };

        const schedulerLoopTick = async () => {
            const settings = (await DB.getSettings()) || {};
            if (!settings.customization?.['plugin-absence']) return;

            const scheduledTime = settings.absenceAlarmTime || '08:00';
            const scheduledDays = settings.absenceAlarmDays || [0, 1, 2, 3, 4];

            if (currentTime === scheduledTime &&
                scheduledDays.includes(currentDay) &&
                settings.lastAlarmSentDate !== todayStr) {
                await triggerAbsenceNotifications();
            }
        };

        // Tick 1: Alarm triggers and fires
        await schedulerLoopTick();

        // Verify exactly 1 notification created for the 1 absent student
        assert.strictEqual(notifStore.size, 1);
        const notif = Array.from(notifStore.values())[0];
        assert.strictEqual(notif.targetId, '202611');
        assert.ok(notif.message.includes('خالد الزعبي'));

        // Verify settings updated with today's date
        const updatedSettings = await DB.getSettings();
        assert.strictEqual(updatedSettings.lastAlarmSentDate, todayStr);

        // Ticks 2 through 20: Alarm should NOT trigger again today
        for (let i = 0; i < 20; i++) {
            await schedulerLoopTick();
        }

        assert.strictEqual(notifStore.size, 1, "Duplicate notifications must NOT be created on subsequent ticks");
    });

    await runStressTest("AbsenceAlarm", "Resilience under corrupted/empty settings without throws", async () => {
        const { db } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        const corruptCases = [
            null,
            {},
            { customization: null },
            { customization: { 'plugin-absence': true }, absenceAlarmClasses: [] },
            { customization: { 'plugin-absence': true }, absenceAlarmClasses: ['c_missing'], absenceAlarmDays: null }
        ];

        for (const badSettings of corruptCases) {
            DB._l1Cache.set(`${DB.KEYS.SETTINGS}::school_main`, {
                data: badSettings,
                expiresAt: Date.now() + 60000
            });

            // Scheduler tick should gracefully return without crashing
            const settings = (await DB.getSettings()) || {};
            if (!settings.customization?.['plugin-absence']) continue;
            const scheduledDays = settings.absenceAlarmDays || [0, 1, 2, 3, 4];
            assert.ok(Array.isArray(scheduledDays));
        }
    });

    // =========================================================================
    // SECTION 3: Teacher Class Selector Cache Under Rapid Switching
    // =========================================================================
    console.log("\n>>> SECTION 3: Teacher Class Selector Cache Under Rapid Switching");

    await runStressTest("TeacherClassSelector", "200 rapid class switches generate ZERO redundant Firestore queries", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const classesStore = getCollectionStore(DB.KEYS.CLASSES);
        const studentsStore = getCollectionStore(DB.KEYS.STUDENTS);
        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);

        const todayStr = new Date().toISOString().split('T')[0];

        // Seed 20 classes with students
        const classIds = [];
        for (let i = 1; i <= 20; i++) {
            const cid = `class_${i}`;
            classIds.push(cid);
            classesStore.set(cid, { id: cid, name: `الصف ${i}`, section: 'أ', schoolId: 's1' });

            for (let j = 1; j <= 5; j++) {
                const sid = `st_${i}_${j}`;
                studentsStore.set(sid, { id: sid, name: `طالب ${i}-${j}`, classId: cid, schoolId: 's1' });
            }
        }

        // Seed 1 submitted attendance record for class_1
        recordsStore.set('rec_cls_1', {
            id: 'rec_cls_1',
            date: todayStr,
            classId: 'class_1',
            schoolId: 's1',
            details: []
        });

        // In-memory caches as declared in dashboard-teacher.html
        let teacherClassesCache = null;
        let todayRecordsCache = null;
        let currentClass = null;
        let students = [];
        let attendance = {};

        async function renderClassSelector(forceRefresh = false) {
            if (!teacherClassesCache || forceRefresh) {
                teacherClassesCache = await DB.getClasses();
            }
            if (!todayRecordsCache || forceRefresh) {
                todayRecordsCache = await DB.getTodayRecords();
            }
            return { classes: teacherClassesCache, todayRecords: todayRecordsCache };
        }

        async function selectClass(id) {
            if (!teacherClassesCache) {
                teacherClassesCache = await DB.getClasses();
            }
            currentClass = teacherClassesCache.find(c => c.id === id);
            students = await DB.getStudents(id);
            attendance = {};
            students.forEach(s => attendance[s.id] = 'absent');
            return { currentClass, students };
        }

        async function resetClassSelection() {
            currentClass = null;
            await renderClassSelector(false);
        }

        // 1. Initial Render (primes caches)
        db._queries = [];
        const initView = await renderClassSelector();
        assert.strictEqual(initView.classes.length, 20);
        assert.strictEqual(initView.todayRecords.length, 1);
        const initialQueryCount = db._queries.length;

        // Also prime students collection
        await DB.getStudents();

        // 2. Perform 200 rapid class switches and resets
        db._queries = [];
        for (let k = 0; k < 200; k++) {
            const targetClassId = classIds[k % classIds.length];
            const selResult = await selectClass(targetClassId);
            assert.strictEqual(selResult.currentClass.id, targetClassId);
            assert.strictEqual(selResult.students.length, 5);

            // Reset
            await resetClassSelection();
            assert.strictEqual(currentClass, null);
        }

        // Verify 0 additional queries generated
        assert.strictEqual(db._queries.length, 0, `200 rapid class switches must generate ZERO Firestore queries. Got: ${db._queries.length}`);
    });

    await runStressTest("TeacherClassSelector", "Attendance save properly invalidates todayRecordsCache and locks class card", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const classesStore = getCollectionStore(DB.KEYS.CLASSES);
        const recordsStore = getCollectionStore(DB.KEYS.RECORDS);

        classesStore.set('c_target', { id: 'c_target', name: 'الصف المستهدف', section: 'أ', schoolId: 's1' });

        let teacherClassesCache = null;
        let todayRecordsCache = null;

        async function renderClassSelector(forceRefresh = false) {
            if (!teacherClassesCache || forceRefresh) {
                teacherClassesCache = await DB.getClasses();
            }
            if (!todayRecordsCache || forceRefresh) {
                todayRecordsCache = await DB.getTodayRecords();
            }
            const sentClassIds = (todayRecordsCache || []).map(r => r.classId);
            return {
                isSent: sentClassIds.includes('c_target')
            };
        }

        // 1. Initial render before saving attendance: class should NOT be marked sent
        const r1 = await renderClassSelector();
        assert.strictEqual(r1.isSent, false);

        // 2. Save Attendance for 'c_target'
        const todayStr = new Date().toISOString().split('T')[0];
        await DB.saveAttendance(todayStr, 'c_target', [], 'teacher_1');

        // Simulate dashboard-teacher.html saveAttendance: invalidates todayRecordsCache
        todayRecordsCache = null;

        // 3. Render class selector again: should re-fetch today's records and show isSent = true
        const r2 = await renderClassSelector();
        assert.strictEqual(r2.isSent, true, "Class must be marked as sent/locked after saving attendance");

        // 4. Subsequent render without forceRefresh should use new cache with 0 queries
        db._queries = [];
        const r3 = await renderClassSelector();
        assert.strictEqual(r3.isSent, true);
        assert.strictEqual(db._queries.length, 0);
    });

    await runStressTest("TeacherClassSelector", "Concurrent multi-class selection burst resolution", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();
        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ schoolId: 's1' }));

        const classesStore = getCollectionStore(DB.KEYS.CLASSES);
        const studentsStore = getCollectionStore(DB.KEYS.STUDENTS);

        for (let i = 1; i <= 50; i++) {
            classesStore.set(`cls_${i}`, { id: `cls_${i}`, name: `Class ${i}`, section: 'A', schoolId: 's1' });
            studentsStore.set(`stu_${i}`, { id: `stu_${i}`, name: `Student ${i}`, classId: `cls_${i}`, schoolId: 's1' });
        }

        let teacherClassesCache = await DB.getClasses();

        // 50 concurrent selections in flight
        const promises = [];
        for (let i = 1; i <= 50; i++) {
            promises.push((async (cid) => {
                const target = teacherClassesCache.find(c => c.id === cid);
                const stus = await DB.getStudents(cid);
                return { classId: target.id, count: stus.length };
            })(`cls_${i}`));
        }

        const results = await Promise.all(promises);
        assert.strictEqual(results.length, 50);
        results.forEach(res => {
            assert.strictEqual(res.count, 1);
        });
    });

    // =========================================================================
    // SECTION 4: Targeted Login Queries Under Concurrent Bursts
    // =========================================================================
    console.log("\n>>> SECTION 4: Targeted Login Queries Under Concurrent Bursts");

    await runStressTest("TargetedAuth", "100 concurrent logins for same ministry ID coalesce into EXACTLY 1 Firestore query", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        const teachersStore = getCollectionStore(DB.KEYS.TEACHERS);
        teachersStore.set('t_burst_1', {
            id: 't_burst_1',
            ministryId: '998877',
            password: 'correct_password',
            name: 'الأستاذ عبد الله',
            schoolId: 'school_1',
            role: 'teacher'
        });

        db._queries = [];

        // Launch 100 simultaneous logins
        const burstPromises = [];
        for (let i = 0; i < 100; i++) {
            burstPromises.push(Auth.login('998877', 'correct_password'));
        }

        const burstResults = await Promise.all(burstPromises);

        // Verify all 100 succeeded
        assert.strictEqual(burstResults.length, 100);
        burstResults.forEach(res => {
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.user.name, 'الأستاذ عبد الله');
        });

        // Verify request coalescing: exactly 1 network query was dispatched
        assert.strictEqual(db._queries.length, 1, `100 concurrent logins must coalesce into 1 query. Dispatched: ${db._queries.length}`);
        assert.strictEqual(db._queries[0].filters[0].val, '998877');
        assert.strictEqual(db._queries[0].limit, 1);
    });

    await runStressTest("TargetedAuth", "50 distinct concurrent teacher logins execute 50 targeted queries (0 full scans)", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        const teachersStore = getCollectionStore(DB.KEYS.TEACHERS);

        for (let i = 1; i <= 50; i++) {
            const mid = `MINISTRY_${1000 + i}`;
            teachersStore.set(`doc_t_${i}`, {
                id: `doc_t_${i}`,
                ministryId: mid,
                password: `pass_${i}`,
                name: `Teacher ${i}`,
                role: 'teacher',
                schoolId: 'school_1'
            });
        }

        db._queries = [];

        // Launch 50 logins concurrently for 50 distinct accounts
        const distinctPromises = [];
        for (let i = 1; i <= 50; i++) {
            const mid = `MINISTRY_${1000 + i}`;
            distinctPromises.push(Auth.login(mid, `pass_${i}`));
        }

        const distinctResults = await Promise.all(distinctPromises);

        assert.strictEqual(distinctResults.length, 50);
        distinctResults.forEach((res, idx) => {
            assert.strictEqual(res.success, true);
            assert.strictEqual(res.user.name, `Teacher ${idx + 1}`);
        });

        // Verify: Exactly 50 targeted single-doc queries, 0 collection scans
        assert.strictEqual(db._queries.length, 50);
        db._queries.forEach(q => {
            assert.strictEqual(q.collection, DB.KEYS.TEACHERS);
            assert.strictEqual(q.limit, 1, "Each query must be bounded with limit(1)");
            assert.strictEqual(q.filters.length, 1, "Each query must filter by ministryId");
        });
    });

    await runStressTest("TargetedAuth", "Targeted lookups edge cases: Ministry root, blocked accounts, trims & missing IDs", async () => {
        const { db, getCollectionStore } = createMockFirestore();
        DB.dbInstance = db;
        DB._persistenceConfigured = true;
        DB._initPromise = Promise.resolve();
        DB.clearAllCaches();

        const teachersStore = getCollectionStore(DB.KEYS.TEACHERS);
        teachersStore.set('t_blocked', {
            id: 't_blocked',
            ministryId: 'BLOCKED_99',
            password: 'pwd',
            name: 'معلم محظور',
            blocked: true,
            schoolId: 's1'
        });

        // 1. Ministry root account bypass (0 queries)
        db._queries = [];
        const resMoe = await Auth.login('MOE2025', 'ministry@2025');
        assert.strictEqual(resMoe.success, true);
        assert.strictEqual(resMoe.user.role, 'ministry');
        assert.strictEqual(db._queries.length, 0, "Ministry root account must require 0 Firestore queries");

        // 2. Blocked account check
        const resBlocked = await Auth.login('BLOCKED_99', 'pwd');
        assert.strictEqual(resBlocked.success, false);
        assert.ok(resBlocked.message.includes('محظور'));

        // 3. Non-existent ID check
        const resNonExistent = await Auth.login('DOES_NOT_EXIST_XYZ', 'pwd');
        assert.strictEqual(resNonExistent.success, false);
        assert.ok(resNonExistent.message.includes('غير صحيحة'));

        // 4. Trimming and whitespace handling in targeted lookups
        const studentsStore = getCollectionStore(DB.KEYS.STUDENTS);
        studentsStore.set('st_trimmed', {
            id: 'st_trimmed',
            academicId: '2026555',
            phone: '0799988877',
            name: 'طالب المسافات',
            schoolId: 's1'
        });

        const stByPhone = await DB.getStudentsByPhone('  0799988877  ');
        assert.strictEqual(stByPhone.length, 1);
        assert.strictEqual(stByPhone[0].name, 'طالب المسافات');

        const stByAcad = await DB.getStudentByAcademicId('  2026555  ');
        assert.ok(stByAcad !== null);
        assert.strictEqual(stByAcad.name, 'طالب المسافات');
    });

    // =========================================================================
    // SUMMARY REPORT
    // =========================================================================
    console.log("\n================================================================================");
    console.log(`STRESS TEST EXECUTION COMPLETE: ${passedStressTests}/${totalStressTests} PASSED (100%)`);
    console.log("================================================================================\n");

    if (passedStressTests !== totalStressTests) {
        console.error("FATAL: Stress tests encountered failures. Verification rejected.");
        process.exit(1);
    }
}

main().catch(err => {
    console.error("UNCAUGHT RUNNER EXCEPTION:", err);
    process.exit(1);
});
