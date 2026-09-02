# Production Technical Specification: Firestore Offline Persistence & In-Flight Request Coalescing (M1)

**Role:** Core DB Implementation Planner  
**Agent Directory:** `d:\Hodoori-Beta\.agents\explorer_m1_1`  
**Target Module:** `scripts/core-db.js`  
**Milestone:** Milestone 1 (M1)  
**Date:** 2026-08-29  

---

## 1. Executive Overview & Problem Statement

In the existing implementation of `scripts/core-db.js`, the platform interacts with Firebase Firestore (v10 Compat) without offline persistence configuration or query deduplication. This architectural gap causes two severe problems:

1. **Unnecessary Cloud Network Roundtrips & Lack of Offline Resilience:**
   - `firebase.firestore()` is instantiated at `scripts/core-db.js:69` without calling `enablePersistence({ synchronizeTabs: true })`.
   - In browser environments (both single-tab and multi-tab), every document or collection read triggers an expensive cloud network roundtrip, consuming Firestore read quotas and rendering the application completely non-functional when offline.
   - When users open multiple tabs (e.g. Admin Dashboard in Tab 1, Teacher Dashboard in Tab 2), uncoordinated network reads multiply cloud consumption.

2. **In-Flight Query Explosion (Concurrent Read Amplification):**
   - During page initialization across dashboards (notably `dashboard-admin.html:2161–2173` `window.renderAll()`), multiple independent UI components mount in parallel within the same JavaScript event tick (~5–10ms).
   - `window.renderAll()` triggers `renderDailyInfo()`, `populateFilters()`, `renderReports()`, `renderTeachers()`, `renderClasses()`, `renderNotifications()`, and `renderSchedule()`.
   - This fires **4 parallel `DB.getClasses()` calls, 4 parallel `DB.getTeachers()` calls, and 2 full `DB.getCollection(DB.KEYS.RECORDS)` calls** concurrently.
   - Because all calls fire before the first network response arrives, an in-memory L1 cache alone is insufficient: all 4 calls miss the cache simultaneously and spawn 4 distinct cloud network queries.

This technical specification details the complete, production-grade implementation of:
1. **Tier 4 / Foundation: Multi-Tab IndexedDB Offline Persistence** with an automated multi-tier fallback mechanism (Multi-Tab -> Single-Tab -> In-Memory).
2. **Tier 1: In-Flight Promise Coalescing Pool (`_inflightQueries = new Map()`)** to deduplicate concurrent identical queries in real time.
3. **Seamless Query Entry Point Integration** across all `DB` read methods (`init`, `getCollection`, `getStudents`, `getTeachers`, `getClasses`, `getSettings`, `getSchedule`, `getSchools`, `getSchool`, `getHolidays`, `isHoliday`, `getRecords`, `getNotifications`), preserving 100% backward compatibility.

---

## 2. Architecture & Design Specification

### 2.1 Multi-Tab Offline Persistence Architecture

#### 2.1.1 Timing & Lifecycle Rules for `enablePersistence`
Under Firebase Web SDK (v9/v10 Compat Mode):
- `this.dbInstance.settings()` and `this.dbInstance.enablePersistence()` **MUST** be executed immediately after `firebase.firestore()` is created and **BEFORE** any document reference, collection reference, or query is evaluated.
- If any Firestore read/write/listener executes before `enablePersistence()`, Firestore permanently locks its internal persistence state to memory mode and throws a `failed-precondition` exception if `enablePersistence()` is called later.
- Therefore, persistence initialization must be tightly integrated into `DB.init()` and completed before the default seed/ministry check query (`scripts/core-db.js:73–80`) runs.

#### 2.1.2 Persistence Fallback Cascade
The persistence initializer follows a 3-tier cascade:

```
[Start Persistence Init]
       │
       ▼
[Attempt 1: Multi-Tab Persistence]
this.dbInstance.enablePersistence({ synchronizeTabs: true })
       │
       ├─► Success: Set _persistenceState = 'multi-tab' (Done)
       │
       └─► Catch Error:
             │
             ├─► 'failed-precondition'
             │     │
             │     ▼
             │   [Attempt 2: Single-Tab Persistence Fallback]
             │   this.dbInstance.enablePersistence()
             │     │
             │     ├─► Success: Set _persistenceState = 'single-tab' (Done)
             │     │
             │     └─► Catch: Set _persistenceState = 'memory' (Fallback to L1/memory)
             │
             ├─► 'unimplemented' (Private Browsing / IndexedDB disabled)
             │     │
             │     ▼
             │   Set _persistenceState = 'unsupported' (Proceed in memory mode)
             │
             └─► Any Other Error
                   │
                   ▼
                 Set _persistenceState = 'memory' (Log warning, do not crash)
```

#### 2.1.3 Cache Size Configuration
Configure Firestore's internal disk cache size to unlimited (allowing the browser to utilize available disk quota up to browser limits, with automatic LRU garbage collection):
```javascript
if (typeof this.dbInstance.settings === 'function') {
    this.dbInstance.settings({
        cacheSizeBytes: (firebase.firestore && firebase.firestore.CACHE_SIZE_UNLIMITED) 
            ? firebase.firestore.CACHE_SIZE_UNLIMITED 
            : -1
    });
}
```

---

### 2.2 In-Flight Request Coalescing (`_inflightQueries = new Map()`)

#### 2.2.1 Data Structure & Mechanics
- **Map Definition:** `_inflightQueries = new Map()` where `key` is a deterministic string signature and `value` is the currently executing `Promise<any>`.
- **Atomic Registration:** When a caller invokes a read method:
  1. Generate normalized `cacheKey`.
  2. If `options.bypassCache !== true && options.forceRefresh !== true`, check L1 memory cache via `this._getL1(cacheKey)`. If cache hit, return immediately.
  3. Check if `this._inflightQueries.has(cacheKey)`:
     - If `true`: Return the existing shared `Promise`.
  4. If `false`:
     - Create an async task executing the query.
     - Store the promise in `this._inflightQueries.set(cacheKey, promise)`.
     - In a `finally` block attached to the promise, ensure `this._inflightQueries.delete(cacheKey)` is called immediately when the promise settles (resolved or rejected).
     - On successful resolution, if `options.bypassCache !== true`, store the result into the L1 cache (`this._setL1(cacheKey, result)`).
     - Return the promise.

#### 2.2.2 Lifecycle & Error Propagation
- **Concurrency Safety:** JavaScript's single-threaded event loop ensures that synchronous checks and insertions into `_inflightQueries` are atomic. Multiple microtasks calling `DB.getClasses()` in the same event tick will all receive the exact same promise reference.
- **Error Propagation:** If the network fails or Firestore throws an error:
  - The promise rejects.
  - All awaiting callers receive the error (rejection).
  - The `finally` block deletes the key from `_inflightQueries`.
  - The failed result is **not** written to L1 cache.
  - The next caller will start a fresh query attempt rather than being permanently blocked by a stale rejected promise.

#### 2.2.3 Cache Key Normalization Specification
Every query entry point must construct a unique, deterministic cache key following this standard schema:

| Operation | Standard Cache Key Schema | Example |
|---|---|---|
| `getCollection(name, filterBySchool=true)` | `${name}::${schoolId}::all` | `v2_classes::s1::all` |
| `getCollection(name, filterBySchool=false)` | `${name}::global::all` | `v2_schools::global::all` |
| `getStudents(classId=null)` | `v2_students::${schoolId}::class:all` | `v2_students::s1::class:all` |
| `getStudents(classId='c1')` | `v2_students::${schoolId}::class:${classId}` | `v2_students::s1::class:c1` |
| `getTeachers()` | `v2_teachers::${schoolId}::all` | `v2_teachers::s1::all` |
| `getClasses()` | `v2_classes::${schoolId}::all` | `v2_classes::s1::all` |
| `getSettings()` | `v2_settings::${schoolId || 'global'}::doc:${docId}` | `v2_settings::s1::doc:s1` |
| `getSchools()` | `v2_schools::global::all` | `v2_schools::global::all` |
| `getSchool(id)` | `v2_schools::global::doc:${id}` | `v2_schools::global::doc:s1` |
| `getSchedule()` | `v2_schedule::${schoolId}::all` | `v2_schedule::s1::all` |
| `getHolidays()` | `v2_holidays::${schoolId || 'global'}::all` | `v2_holidays::s1::all` |
| `getRecords(date, classId)` | `v2_records::${schoolId}::date:${date || 'all'}::class:${classId || 'all'}` | `v2_records::s1::date:2026-08-29::class:all` |
| `getRecordsRange(start, end, classId)` | `v2_records_range::${schoolId}::${start}_${end}::class:${classId || 'all'}` | `v2_records_range::s1::2026-08-01_2026-08-31::class:all` |
| `getNotifications(target)` | `v2_notifications::${schoolId}::target:${targetId}_${targetClass}_${isParent}` | `v2_notifications::s1::target:2024001_c1_true` |

---

## 3. Detailed Implementation Specification for `scripts/core-db.js`

### 3.1 Object State & Properties
Add the following properties to the `DB` object in `scripts/core-db.js`:

```javascript
const DB = {
    KEYS: {
        STUDENTS: 'v2_students',
        TEACHERS: 'v2_teachers',
        CLASSES: 'v2_classes',
        RECORDS: 'v2_records',
        REPORTS: 'v2_records', // AI Alias
        HOLIDAYS: 'v2_holidays',
        NOTIFICATIONS: 'v2_notifications',
        SETTINGS: 'v2_settings',
        SCHOOLS: 'v2_schools',
        SCHEDULE: 'v2_schedule',
        CURRENT_USER: 'attendance_current_user'
    },

    // Collection Default TTL Policies (Milliseconds)
    TTL: {
        SETTINGS: 15 * 60 * 1000,     // 15 Minutes
        SCHOOLS: 30 * 60 * 1000,      // 30 Minutes
        HOLIDAYS: 30 * 60 * 1000,     // 30 Minutes
        CLASSES: 10 * 60 * 1000,      // 10 Minutes
        TEACHERS: 10 * 60 * 1000,     // 10 Minutes
        SCHEDULE: 10 * 60 * 1000,     // 10 Minutes
        STUDENTS: 5 * 60 * 1000,      // 5 Minutes
        RECORDS: 3 * 60 * 1000,       // 3 Minutes
        NOTIFICATIONS: 2 * 60 * 1000, // 2 Minutes
        DEFAULT: 5 * 60 * 1000        // 5 Minutes
    },

    dbInstance: null,
    _initPromise: null,
    _persistenceConfigured: false,
    _persistenceState: 'none', // 'none' | 'multi-tab' | 'single-tab' | 'memory' | 'unsupported'
    _l1Cache: new Map(),         // Key -> { data: any, expiresAt: number, cachedAt: number }
    _inflightQueries: new Map(), // Key -> Promise<any>
    _broadcastChannel: null,

    // ... methods ...
};
```

---

### 3.2 Offline Persistence Implementation

```javascript
    /**
     * Initializes Firestore offline persistence with multi-tab support and cascade fallbacks.
     * Must be invoked before any Firestore queries or listeners are initiated.
     * @private
     */
    async _initPersistence() {
        if (this._persistenceConfigured) return;
        this._persistenceConfigured = true;

        // 1. Configure cache size
        try {
            if (typeof this.dbInstance.settings === 'function') {
                const unlimitedCache = (firebase.firestore && firebase.firestore.CACHE_SIZE_UNLIMITED) 
                    ? firebase.firestore.CACHE_SIZE_UNLIMITED 
                    : -1;
                this.dbInstance.settings({
                    cacheSizeBytes: unlimitedCache
                });
            }
        } catch (settingsErr) {
            console.warn("Hodoori DB: Firestore settings configuration notice:", settingsErr.message);
        }

        // 2. Enable multi-tab persistence
        try {
            await this.dbInstance.enablePersistence({ synchronizeTabs: true });
            this._persistenceState = 'multi-tab';
            console.log("Hodoori DB: Multi-tab IndexedDB persistence enabled successfully.");
            return;
        } catch (err) {
            if (err.code === 'failed-precondition') {
                // Multiple tabs open without synchronizeTabs support, or locked by another session
                console.warn("Hodoori DB: Multi-tab persistence failed-precondition. Attempting single-tab fallback...");
                try {
                    await this.dbInstance.enablePersistence();
                    this._persistenceState = 'single-tab';
                    console.log("Hodoori DB: Single-tab IndexedDB persistence enabled.");
                    return;
                } catch (singleTabErr) {
                    this._persistenceState = 'memory';
                    console.warn("Hodoori DB: Persistence unavailable across tabs. Running in memory-only mode.", singleTabErr.message);
                }
            } else if (err.code === 'unimplemented') {
                // Browser does not support IndexedDB offline persistence (e.g. private browsing)
                this._persistenceState = 'unsupported';
                console.warn("Hodoori DB: Browser does not support IndexedDB persistence (Private Browsing / Restricted). Using L1 memory cache.");
            } else {
                this._persistenceState = 'memory';
                console.warn("Hodoori DB: Offline persistence initialization notice:", err.message);
            }
        }
    },
```

---

### 3.3 Integration in `DB.init()`

```javascript
    async init() {
        if (this.dbInstance && this._persistenceConfigured) return;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            await this.loadFirebaseScripts();

            const firebaseConfig = {
                apiKey: "AIzaSyAaQoVd3vvpg0i49HkUEuWk0erabK6DhCY",
                authDomain: "school-attendance-c0fdb.firebaseapp.com",
                projectId: "school-attendance-c0fdb",
                storageBucket: "school-attendance-c0fdb.firebasestorage.app",
                messagingSenderId: "338402675234",
                appId: "1:338402675234:web:a7f24874c4623db67d987b",
                measurementId: "G-0S67KPSC3N"
            };

            if (!firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            this.dbInstance = firebase.firestore();

            // Initialize multi-tab persistence BEFORE any Firestore queries
            await this._initPersistence();

            // Initialize Cross-Tab Invalidation Listener (BroadcastChannel + storage event)
            this._initBroadcast();

            try {
                // Check if ministry admin exists
                const ministrySnap = await this.dbInstance.collection(this.KEYS.TEACHERS)
                    .where('ministryId', '==', '000')
                    .get();

                if (ministrySnap.empty) {
                    console.log("Ministry account missing. Seeding essential data...");
                    await this.seedData();
                }
            } catch (error) {
                console.error("Firebase init/seed error:", error);
            }
        })();

        return this._initPromise;
    },
```

---

### 3.4 In-Flight Request Coalescing Engine (`_coalesce`)

```javascript
    /**
     * Resolves default TTL duration for a given collection name.
     * @param {string} collectionName
     * @returns {number} TTL in milliseconds
     */
    _getTTL(collectionName) {
        if (!collectionName) return this.TTL.DEFAULT;
        for (const [key, val] of Object.entries(this.KEYS)) {
            if (val === collectionName && this.TTL[key]) {
                return this.TTL[key];
            }
        }
        return this.TTL.DEFAULT;
    },

    /**
     * Reads from L1 in-memory cache.
     * @param {string} cacheKey
     * @returns {any|null}
     */
    _getL1(cacheKey) {
        const entry = this._l1Cache.get(cacheKey);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this._l1Cache.delete(cacheKey);
            return null;
        }
        return entry.data;
    },

    /**
     * Writes to L1 in-memory cache.
     * @param {string} cacheKey
     * @param {any} data
     * @param {number} [customTTL=null]
     */
    _setL1(cacheKey, data, customTTL = null) {
        const collectionName = cacheKey.split('::')[0];
        const ttl = customTTL !== null ? customTTL : this._getTTL(collectionName);
        this._l1Cache.set(cacheKey, {
            data,
            cachedAt: Date.now(),
            expiresAt: Date.now() + ttl
        });
    },

    /**
     * Core In-Flight Request Coalescing & Caching Wrapper.
     * Ensures identical simultaneous queries share the same executing Promise.
     * 
     * @param {string} cacheKey - Standardized query cache key
     * @param {Function} fetcherFn - Async function executing the underlying Firestore query
     * @param {Object} [options={}] - Query options: { forceRefresh: false, bypassCache: false, ttl: null }
     * @returns {Promise<any>}
     */
    async _coalesce(cacheKey, fetcherFn, options = {}) {
        const forceRefresh = Boolean(options && options.forceRefresh);
        const bypassCache = Boolean(options && options.bypassCache);

        // 1. Return fresh L1 cache result if available
        if (!forceRefresh && !bypassCache) {
            const cached = this._getL1(cacheKey);
            if (cached !== null && cached !== undefined) {
                return cached;
            }
        }

        // 2. Return existing in-flight Promise if identical query is currently executing
        if (this._inflightQueries.has(cacheKey)) {
            return this._inflightQueries.get(cacheKey);
        }

        // 3. Initiate single query execution
        const queryPromise = (async () => {
            try {
                const data = await fetcherFn();
                if (!bypassCache) {
                    const customTTL = options && typeof options.ttl === 'number' ? options.ttl : null;
                    this._setL1(cacheKey, data, customTTL);
                }
                return data;
            } finally {
                // Ensure in-flight map is always cleared for this key upon settlement
                this._inflightQueries.delete(cacheKey);
            }
        })();

        this._inflightQueries.set(cacheKey, queryPromise);
        return queryPromise;
    },
```

---

### 3.5 Query Entry Point Integrations

#### 3.5.1 `getCollection`
```javascript
    /**
     * Fetches an entire collection with L1 caching and in-flight promise coalescing.
     * @param {string} collectionName
     * @param {boolean} [filterBySchool=true]
     * @param {Object} [options={}] - { forceRefresh: false, bypassCache: false }
     * @returns {Promise<Array<Object>>}
     */
    async getCollection(collectionName, filterBySchool = true, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (filterBySchool && schoolId && schoolId !== 'ministry') ? schoolId : 'all';
        const cacheKey = `${collectionName}::${effectiveSchool}::all`;

        return this._coalesce(cacheKey, async () => {
            let query = this.dbInstance.collection(collectionName);
            if (filterBySchool && schoolId && schoolId !== 'ministry') {
                query = query.where('schoolId', '==', schoolId);
            }
            const snap = await query.get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }, options);
    },
```

#### 3.5.2 `getStudents`
```javascript
    /**
     * Fetches students with class scoping, smart memory filter optimization, and request coalescing.
     * @param {string|null} [classId=null]
     * @param {Object} [options={}] - { forceRefresh: false, bypassCache: false }
     * @returns {Promise<Array<Object>>}
     */
    async getStudents(classId = null, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'all';

        // Memory optimization: If classId is specified and we already have all students in L1 cache, filter in memory
        if (classId && !options.forceRefresh && !options.bypassCache) {
            const allCached = this._getL1(`${this.KEYS.STUDENTS}::${effectiveSchool}::class:all`);
            if (allCached && Array.isArray(allCached)) {
                return allCached.filter(s => s.classId === classId || s.classid === classId);
            }
        }

        const cacheKey = `${this.KEYS.STUDENTS}::${effectiveSchool}::class:${classId || 'all'}`;

        return this._coalesce(cacheKey, async () => {
            let query = this.dbInstance.collection(this.KEYS.STUDENTS);
            if (schoolId && schoolId !== 'ministry') {
                query = query.where('schoolId', '==', schoolId);
            }
            if (classId) {
                query = query.where('classId', '==', classId);
            }
            const snap = await query.get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }, options);
    },
```

#### 3.5.3 `getTeachers`, `getClasses`, `getSchedule`, `getSchools`
```javascript
    async getTeachers(options = {}) {
        return await this.getCollection(this.KEYS.TEACHERS, true, options);
    },

    async getClasses(options = {}) {
        return await this.getCollection(this.KEYS.CLASSES, true, options);
    },

    async getSchedule(options = {}) {
        return await this.getCollection(this.KEYS.SCHEDULE, true, options);
    },

    async getSchools(options = {}) {
        return await this.getCollection(this.KEYS.SCHOOLS, false, options);
    },
```

#### 3.5.4 `getSettings` & `getSchool` (Document-Level Reads)
```javascript
    /**
     * Fetches school settings with 15-minute L1 TTL caching and request coalescing.
     * Eliminates 60s background polling cloud reads entirely.
     * @param {Object} [options={}]
     * @returns {Promise<Object>}
     */
    async getSettings(options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const docId = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        const cacheKey = `${this.KEYS.SETTINGS}::${docId}::doc:${docId}`;

        return this._coalesce(cacheKey, async () => {
            const doc = await this.dbInstance.collection(this.KEYS.SETTINGS).doc(docId).get();
            return doc.exists ? doc.data() : {};
        }, options);
    },

    /**
     * Fetches single school master record with L1 caching and request coalescing.
     * @param {string} id
     * @param {Object} [options={}]
     * @returns {Promise<Object|null>}
     */
    async getSchool(id, options = {}) {
        if (!id) return null;
        await this.init();
        const cacheKey = `${this.KEYS.SCHOOLS}::global::doc:${id}`;

        return this._coalesce(cacheKey, async () => {
            const doc = await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : null;
        }, options);
    },
```

#### 3.5.5 `getHolidays` & `isHoliday`
```javascript
    async getHolidays(options = {}) {
        return await this.getCollection(this.KEYS.HOLIDAYS, true, options);
    },

    async isHoliday(dateString, options = {}) {
        const date = new Date(dateString);
        const day = date.getDay();
        if (day === 5 || day === 6) return true; // Friday / Saturday weekend

        const holidays = await this.getHolidays(options);
        return holidays.some(h => h.date === dateString);
    },
```

#### 3.5.6 `getRecords`
```javascript
    /**
     * Fetches attendance records with date and class scoping, L1 caching, and request coalescing.
     * @param {string|null} [date=null]
     * @param {string|null} [classId=null]
     * @param {Object} [options={}]
     * @returns {Promise<Array<Object>>}
     */
    async getRecords(date = null, classId = null, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'all';
        const cacheKey = `${this.KEYS.RECORDS}::${effectiveSchool}::date:${date || 'all'}::class:${classId || 'all'}`;

        return this._coalesce(cacheKey, async () => {
            let q = this.dbInstance.collection(this.KEYS.RECORDS);
            if (schoolId && schoolId !== 'ministry') {
                q = q.where('schoolId', '==', schoolId);
            }
            if (date) q = q.where('date', '==', date);
            if (classId) q = q.where('classId', '==', classId);
            const snap = await q.get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }, options);
    },
```

#### 3.5.7 `getNotifications`
```javascript
    /**
     * Fetches targeted or broadcast notifications with L1 caching and request coalescing.
     * @param {Object} [target={}] - { id, classId, isParent }
     * @param {Object} [options={}]
     * @returns {Promise<Array<Object>>}
     */
    async getNotifications(target = {}, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'all';
        const targetKey = (target.id || target.classId) 
            ? `${target.id || ''}_${target.classId || ''}_${target.isParent ? 'parent' : ''}` 
            : 'all';
        const cacheKey = `${this.KEYS.NOTIFICATIONS}::${effectiveSchool}::target:${targetKey}`;

        return this._coalesce(cacheKey, async () => {
            let q = this.dbInstance.collection(this.KEYS.NOTIFICATIONS);
            if (schoolId && schoolId !== 'ministry') {
                q = q.where('schoolId', '==', schoolId);
            }

            if (target.id || target.classId) {
                // Fetch broadcast notifications
                const q1 = await q.where('targetType', '==', 'all').get();
                let results = q1.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Fetch class specific
                if (target.classId) {
                    const q2 = await q.where('targetType', '==', 'class').where('targetId', '==', target.classId).get();
                    results = [...results, ...q2.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
                }

                // Fetch student / parent specific
                if (target.id) {
                    const q3 = await q.where('targetType', '==', 'student').where('targetId', '==', target.id).get();
                    results = [...results, ...q3.docs.map(doc => ({ id: doc.id, ...doc.data() }))];

                    if (target.isParent) {
                        const q4 = await q.where('targetType', '==', 'parent').where('targetId', '==', target.id).get();
                        results = [...results, ...q4.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
                    }
                }

                // Deduplicate by ID and sort descending by timestamp
                const uniqueMap = new Map(results.map(item => [item.id, item]));
                return Array.from(uniqueMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }

            const snap = await q.get();
            const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }, options);
    },
```

---

## 4. Cache Purging, Invalidation & Multi-Tab Sync Hooks

To ensure that in-flight coalescing and L1 memory caches stay 100% consistent when write mutations happen:

```javascript
    /**
     * Purges entries from local L1 cache matching a collection name or pattern.
     * @private
     */
    _purgeL1Local(collectionName, schoolId = null) {
        if (!collectionName) {
            this._l1Cache.clear();
            return;
        }
        for (const key of this._l1Cache.keys()) {
            const [col, sId] = key.split('::');
            if (col === collectionName) {
                if (!schoolId || !sId || sId === 'all' || sId === 'global' || sId === schoolId) {
                    this._l1Cache.delete(key);
                }
            }
        }
    },

    /**
     * Initializes Cross-Tab synchronization using BroadcastChannel with localStorage fallback.
     * @private
     */
    _initBroadcast() {
        if (typeof window === 'undefined') return;
        try {
            if ('BroadcastChannel' in window && !this._broadcastChannel) {
                this._broadcastChannel = new BroadcastChannel('hodoori_db_cache_sync');
                this._broadcastChannel.onmessage = (event) => {
                    if (event && event.data && event.data.type === 'INVALIDATE') {
                        this._purgeL1Local(event.data.collection, event.data.schoolId);
                    }
                };
            }
        } catch (_) {}

        try {
            window.addEventListener('storage', (event) => {
                if (event.key === '__hodoori_cache_inval__' && event.newValue) {
                    try {
                        const payload = JSON.parse(event.newValue);
                        if (payload && payload.collection) {
                            this._purgeL1Local(payload.collection, payload.schoolId);
                        }
                    } catch (_) {}
                }
            });
        } catch (_) {}
    },

    /**
     * Public API to invalidate cache locally and broadcast to other open tabs.
     * Called automatically by all mutation operations (add*, update*, delete*, save*).
     * @param {string} collectionName
     * @param {string|null} [schoolId=null]
     */
    invalidateCache(collectionName, schoolId = null) {
        const effectiveSchool = schoolId || this.getCurrentUserSchoolId();

        // 1. Purge local memory
        this._purgeL1Local(collectionName, effectiveSchool);

        // 2. Broadcast via BroadcastChannel
        try {
            if (this._broadcastChannel) {
                this._broadcastChannel.postMessage({
                    type: 'INVALIDATE',
                    collection: collectionName,
                    schoolId: effectiveSchool,
                    timestamp: Date.now()
                });
            }
        } catch (_) {}

        // 3. Fallback broadcast via localStorage storage event
        try {
            localStorage.setItem('__hodoori_cache_inval__', JSON.stringify({
                collection: collectionName,
                schoolId: effectiveSchool,
                timestamp: Date.now()
            }));
        } catch (_) {}
    },

    /**
     * Clears all in-memory caches and in-flight query trackers.
     */
    clearAllCaches() {
        this._l1Cache.clear();
        this._inflightQueries.clear();
    },
```

---

## 5. Backward Compatibility & Safety Verification

1. **Method Signatures & Return Types:**
   - All existing method signatures (`getCollection(name, filterBySchool)`, `getStudents(classId)`, `getTeachers()`, `getClasses()`, `getRecords(date, classId)`, `getSettings()`, `getSchools()`, `getSchool(id)`, `getSchedule()`, `isHoliday(date)`) remain 100% identical.
   - The returned data structures (plain JS objects and arrays of `{ id: doc.id, ...doc.data() }`) are identical.
   - Optional `options` parameter is additive and non-breaking (`{ forceRefresh: false, bypassCache: false }`).

2. **Arabic Name Normalization & Fuzzy Search:**
   - Methods `normalizeArabic`, `stripDefiniteArticle`, `scoreArabicMatch`, `filterAndRankMatches`, and `matchArabicNames` remain untouched and preserved verbatim.

3. **Defensive Field Normalization:**
   - Normalizations like `ministryNumber -> ministryId` and `classid -> classId` in `addStudent`, `updateStudent`, `addTeacher`, `updateTeacher`, `addClass` remain preserved.

---

## 6. Implementation Checklist for Milestone 1 Implementer

- [ ] Add `_persistenceConfigured`, `_persistenceState`, `_l1Cache`, `_inflightQueries`, and `_broadcastChannel` properties to `DB`.
- [ ] Implement `_initPersistence()` with multi-tab `enablePersistence({ synchronizeTabs: true })`, single-tab fallback, and memory mode handler.
- [ ] Ensure `_initPersistence()` is invoked inside `DB.init()` before the ministry seed check.
- [ ] Implement `_coalesce(cacheKey, fetcherFn, options)` with in-flight Promise tracking and atomic cleanup in `finally`.
- [ ] Wrap all query methods (`getCollection`, `getStudents`, `getTeachers`, `getClasses`, `getSettings`, `getSchedule`, `getSchools`, `getSchool`, `getHolidays`, `isHoliday`, `getRecords`, `getNotifications`) with `_coalesce`.
- [ ] Integrate `invalidateCache(collectionName, schoolId)` inside all mutation methods (`add*`, `update*`, `delete*`, `save*`, `insert`, `update`, `delete`).
- [ ] Preserve all Arabic fuzzy matching and data normalization helper routines.
