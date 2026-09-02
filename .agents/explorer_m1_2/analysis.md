# Technical Specification: In-Memory L1 Caching, TTL Eviction, Write Invalidation & Cross-Tab Synchronization

**Module Target:** `scripts/core-db.js`  
**Milestone:** Milestone 1 (M1)  
**Role:** Cache Invalidation & Multi-Tab Specifier  
**Author:** Teamwork Explorer (`explorer_m1_2`)  
**Date:** 2026-08-29  

---

## 1. Executive Summary & Objective

The primary objective of Milestone 1 is transforming `scripts/core-db.js` into an intelligent, high-performance data abstraction layer that eliminates redundant Firestore cloud reads and prevents quota exhaustion. 

This specification defines the complete technical design for:
1. **In-Memory L1 Cache Structure & Per-Collection TTLs**: High-speed RAM caching of query results with collection-specific expiration policies (ranging from 2 to 30 minutes) and deterministic, collision-free cache keys.
2. **Automatic Write Invalidation**: Instant, automated eviction of stale cache entries upon any mutating operation (`add*`, `update*`, `delete*`, `save*`, `insert`, `delete`), including cascading entity invalidations.
3. **Cross-Tab Synchronization**: Real-time cross-tab cache eviction using a dual-layer transport: modern `BroadcastChannel('hodoori_db_cache_sync')` backed by an automated `localStorage` `storage` event fallback with loop/echo suppression.
4. **Manual Eviction & Observability API**: Developer-facing APIs (`DB.invalidateCache(collection, docId)`, `DB.clearAllCaches()`, and `DB.getCacheStats()`) with options for forced refresh (`forceRefresh`, `bypassCache`).

---

## 2. In-Memory L1 Cache Architecture

### 2.1 Storage Format & Cache Entry Schema

The L1 cache is maintained in memory on the `DB` singleton as a high-performance JavaScript `Map`: `DB._l1Cache = new Map()`.

Each entry in `_l1Cache` follows this strict structural interface:

```typescript
interface L1CacheEntry<T = any> {
    data: T;                     // Cached payload (cloned or structured representation)
    cachedAt: number;           // Unix epoch timestamp (ms) when stored
    expiresAt: number;          // Unix epoch timestamp (ms) when entry expires (cachedAt + ttlMs)
    ttlMs: number;              // Time-to-live duration applied in milliseconds
    collection: string;         // Base Firestore collection name (e.g., 'v2_students')
    schoolId: string;           // Associated tenant schoolId ('s1', 'global', 'ministry')
    key: string;                // Canonical normalized cache key
    hits: number;               // Access counter for telemetry and cache hit ratio profiling
}
```

### 2.2 Configurable Per-Collection TTL Matrix

Different educational entities exhibit widely distinct volatility profiles. Static institutional settings rarely mutate, whereas morning attendance captures change frequently during school arrival. Applying a uniform TTL leads to either stale attendance data or excessive configuration queries.

The L1 cache enforces a granular TTL hierarchy defined under `DB.TTL`:

| Collection Key | Firestore Collection Name | Volatility Profile | Configured TTL | Duration (ms) | Rationale |
|---|---|---|---|---|---|
| `SETTINGS` | `v2_settings` | Extremely Low | **15 Minutes** | `900,000` | Eliminates the continuous 60s background interval cloud polling leak in `dashboard-admin.html:4181`. |
| `SCHOOLS` | `v2_schools` | Extremely Low | **30 Minutes** | `1,800,000` | Institutional master directory; remains constant throughout normal school operation. |
| `HOLIDAYS` | `v2_holidays` | Extremely Low | **30 Minutes** | `1,800,000` | National/academic calendar dates rarely update during daily portal usage. |
| `CLASSES` | `v2_classes` | Low | **10 Minutes** | `600,000` | Classroom sections update only during term setup or periodic structural reorganization. |
| `TEACHERS` | `v2_teachers` | Low | **10 Minutes** | `600,000` | Faculty roster is static during daily school sessions. |
| `SCHEDULE` | `v2_schedule` | Low | **10 Minutes** | `600,000` | Weekly timetable entries change infrequently. |
| `STUDENTS` | `v2_students` | Moderate | **5 Minutes** | `300,000` | Student roster and biometric face descriptors. |
| `RECORDS` | `v2_records` | High | **3 Minutes** | `180,000` | Morning/hourly attendance captures; invalidates on write, refreshed every 3m otherwise. |
| `NOTIFICATIONS`| `v2_notifications` | High | **2 Minutes** | `120,000` | Notification history queries (real-time alerts stream via Firestore listener). |
| `DEFAULT` | *Custom AI Agent / Fallback* | Normal | **5 Minutes** | `300,000` | Safe fallback for custom AI tables (`v2_agentic_logs`, `v2_system_logs`, etc.). |

#### TTL Policy Definition in Code:
```javascript
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

_getTTL(collectionName) {
    if (!collectionName) return this.TTL.DEFAULT;
    const clean = String(collectionName).replace(/^v2_/, '').toUpperCase();
    return this.TTL[clean] || this.TTL.DEFAULT;
}
```

---

### 2.3 Deterministic Cache Key Normalization

To ensure complete isolation between tenants (schools), classes, dates, and query parameters, all L1 cache keys follow a strict canonical format:

$$\text{Key} = \text{collectionName} \mathrel{::} \text{schoolId} \mathrel{::} \text{querySignature}$$

```
`${collectionName}::${schoolId || 'global'}::${querySignature}`
```

#### Canonical Key Generation Rules:

| Query Method | Canonical Cache Key Pattern | Examples |
|---|---|---|
| `DB.getCollection(name, filterBySchool)` | `${name}::${schoolId}::all` | `v2_classes::s1::all`<br>`v2_schools::global::all` |
| `DB.getStudents(classId)` | `${KEYS.STUDENTS}::${schoolId}::${classId ? 'class_' + classId : 'all'}` | `v2_students::s1::all`<br>`v2_students::s1::class_c1` |
| `DB.getTeachers()` | `${KEYS.TEACHERS}::${schoolId}::all` | `v2_teachers::s1::all` |
| `DB.getClasses()` | `${KEYS.CLASSES}::${schoolId}::all` | `v2_classes::s1::all` |
| `DB.getRecords(date, classId)` | `${KEYS.RECORDS}::${schoolId}::date_${date || 'all'}__class_${classId || 'all'}` | `v2_records::s1::date_2026-08-29__class_all`<br>`v2_records::s1::date_all__class_c1` |
| `DB.getRecordsRange(startDate, endDate, classId)` | `${KEYS.RECORDS}::${schoolId}::range_${startDate}_to_${endDate}__class_${classId || 'all'}` | `v2_records::s1::range_2026-08-01_to_2026-08-31__class_all` |
| `DB.getSettings()` | `${KEYS.SETTINGS}::${schoolId}::doc_${docId}` | `v2_settings::s1::doc_s1`<br>`v2_settings::global::doc_global` |
| `DB.getSchools()` | `${KEYS.SCHOOLS}::global::all` | `v2_schools::global::all` |
| `DB.getSchool(id)` | `${KEYS.SCHOOLS}::global::doc_${id}` | `v2_schools::global::doc_s1` |
| `DB.getSchedule()` | `${KEYS.SCHEDULE}::${schoolId}::all` | `v2_schedule::s1::all` |
| `DB.getNotifications(target)` | `${KEYS.NOTIFICATIONS}::${schoolId}::${targetSignature}` | `v2_notifications::s1::all`<br>`v2_notifications::s1::target_id_2024001_class_c1_parent_true` |
| `DB.isHoliday(dateString)` | `${KEYS.HOLIDAYS}::global::all` | `v2_holidays::global::all` |

---

### 2.4 L1 Cache Core Operations & Defensive Cloning

To prevent accidental data corruption caused by UI components mutating returned objects in-place (e.g., sorting arrays or adding temporary UI flags), the L1 cache implements shallow/defensive cloning on output.

```javascript
_getL1(key) {
    if (!this._l1Cache.has(key)) {
        this._stats.misses++;
        return null;
    }

    const entry = this._l1Cache.get(key);
    const now = Date.now();

    // Verify TTL Expiration
    if (now > entry.expiresAt) {
        this._l1Cache.delete(key);
        this._stats.misses++;
        this._stats.expirations++;
        return null;
    }

    entry.hits++;
    this._stats.hits++;

    // Defensive clone on read to prevent consumer mutation of cached arrays
    if (Array.isArray(entry.data)) {
        return entry.data.map(item => (typeof item === 'object' && item !== null ? { ...item } : item));
    }
    if (typeof entry.data === 'object' && entry.data !== null) {
        return { ...entry.data };
    }
    return entry.data;
},

_setL1(key, data, collectionName, schoolId = null, customTTL = null) {
    const ttl = customTTL || this._getTTL(collectionName);
    const now = Date.now();
    const effectiveSchoolId = schoolId || this.getCurrentUserSchoolId() || 'global';

    // Store cloned snapshot
    let clonedData;
    if (Array.isArray(data)) {
        clonedData = data.map(item => (typeof item === 'object' && item !== null ? { ...item } : item));
    } else if (typeof data === 'object' && data !== null) {
        clonedData = { ...data };
    } else {
        clonedData = data;
    }

    const entry = {
        data: clonedData,
        cachedAt: now,
        expiresAt: now + ttl,
        ttlMs: ttl,
        collection: collectionName,
        schoolId: effectiveSchoolId,
        key: key,
        hits: 0
    };

    this._l1Cache.set(key, entry);
    return data;
}
```

---

## 3. Automatic Write Invalidation

### 3.1 Invalidation Policy & Entity Cascading Rules

Every mutating database method must automatically purge all corresponding L1 cache keys locally and emit a synchronization broadcast to all other open tabs.

#### Invalidation Scope Rules:
1. **Collection-Level Invalidation**: When any item in a collection is added, modified, or deleted, all cached queries for that collection within the affected tenant/school must be evicted. For example, adding a student must invalidate `v2_students::s1::all` as well as any class-specific queries (`v2_students::s1::class_c1`).
2. **Cascade Invalidation**:
   - `deleteClass(id)` deletes all students enrolled in that class prior to deleting the class document itself. Therefore, it must invalidate **both** `v2_classes` and `v2_students`.
   - `seedData()` creates schools, teachers, classes, and students in batch; it must invalidate all collections simultaneously.
3. **Cross-Tenant Safety**:
   - Mutations in school `s1` only invalidate cache entries matching `schoolId === 's1'` or `global`. Cache entries belonging to other schools (e.g., in a ministry dashboard context) remain intact.
   - Global mutations (or ministry operations where `schoolId === 'ministry'`) purge all tenant entries for that collection.

### 3.2 Exhaustive Mutation Invalidation Matrix

| Mutating Method in `core-db.js` | Target Collection | Cascading Collections | Invalidation Keys Purged |
|---|---|---|---|
| `addStudent(student)` | `KEYS.STUDENTS` (`v2_students`) | None | `v2_students::${schoolId}::*` |
| `updateStudent(id, updatedData)` | `KEYS.STUDENTS` (`v2_students`) | None | `v2_students::${schoolId}::*` |
| `deleteStudent(id)` | `KEYS.STUDENTS` (`v2_students`) | None | `v2_students::${schoolId}::*` |
| `addClass(cls)` | `KEYS.CLASSES` (`v2_classes`) | None | `v2_classes::${schoolId}::*` |
| `updateClass(id, updatedData)` | `KEYS.CLASSES` (`v2_classes`) | None | `v2_classes::${schoolId}::*` |
| `deleteClass(id)` | `KEYS.CLASSES` (`v2_classes`) | `KEYS.STUDENTS` (`v2_students`) | `v2_classes::${schoolId}::*`<br>`v2_students::${schoolId}::*` |
| `addTeacher(teacher)` | `KEYS.TEACHERS` (`v2_teachers`) | None | `v2_teachers::${schoolId}::*` |
| `updateTeacher(id, updatedData)` | `KEYS.TEACHERS` (`v2_teachers`) | None | `v2_teachers::${schoolId}::*` |
| `deleteTeacher(id)` | `KEYS.TEACHERS` (`v2_teachers`) | None | `v2_teachers::${schoolId}::*` |
| `saveAttendance(...)` | `KEYS.RECORDS` (`v2_records`) | None | `v2_records::${schoolId}::*` |
| `deleteRecord(id)` | `KEYS.RECORDS` (`v2_records`) | None | `v2_records::${schoolId}::*` |
| `updateRecordDetails(id, newDetails)` | `KEYS.RECORDS` (`v2_records`) | None | `v2_records::${schoolId}::*` |
| `saveSettings(settings)` | `KEYS.SETTINGS` (`v2_settings`) | None | `v2_settings::${schoolId}::*` |
| `addSchool(school)` | `KEYS.SCHOOLS` (`v2_schools`) | None | `v2_schools::*` |
| `updateSchool(id, data)` | `KEYS.SCHOOLS` (`v2_schools`) | None | `v2_schools::*` |
| `deleteSchool(id)` | `KEYS.SCHOOLS` (`v2_schools`) | None | `v2_schools::*` |
| `saveScheduleEntry(entry)` | `KEYS.SCHEDULE` (`v2_schedule`) | None | `v2_schedule::${schoolId}::*` |
| `updateScheduleEntry(id, data)` | `KEYS.SCHEDULE` (`v2_schedule`) | None | `v2_schedule::${schoolId}::*` |
| `deleteScheduleEntry(id)` | `KEYS.SCHEDULE` (`v2_schedule`) | None | `v2_schedule::${schoolId}::*` |
| `addNotification(notification)` | `KEYS.NOTIFICATIONS` (`v2_notifications`) | None | `v2_notifications::${schoolId}::*` |
| `updateNotification(id, data)` | `KEYS.NOTIFICATIONS` (`v2_notifications`) | None | `v2_notifications::${schoolId}::*` |
| `deleteNotification(id)` | `KEYS.NOTIFICATIONS` (`v2_notifications`) | None | `v2_notifications::${schoolId}::*` |
| `insert(table, data)` | Dynamic mapped collection | Determined by table | `${mappedCollection}::${schoolId}::*` |
| `update(table, id, data)` | Dynamic mapped collection | Determined by table | `${mappedCollection}::${schoolId}::*` |
| `delete(table, id)` | Dynamic mapped collection | Determined by table | `${mappedCollection}::${schoolId}::*` |
| `seedData()` | Batch initial seed | All Collections | Purges **ALL** keys across all collections |

---

## 4. Cross-Tab Synchronization via BroadcastChannel & LocalStorage Fallback

### 4.1 Transport Architecture & Redundancy Design

When a user operates across multiple browser tabs (e.g., Admin dashboard in Tab 1, Teacher portal in Tab 2, and AI Agent in Tab 3), a write mutation in Tab 1 must immediately evict the stale L1 cache in Tab 2 and Tab 3 without requiring manual reloads.

To guarantee 100% cross-browser reliability, Hodoori implements a **Dual-Layer Synchronization Bus**:
1. **Primary Layer: `BroadcastChannel` API**  
   - Dedicated channel: `'hodoori_db_cache_sync'`
   - Ultra-low latency (<2ms) IPC between same-origin browsing contexts.
2. **Secondary Layer: `window` `storage` Event Fallback**  
   - Key: `'__hodoori_cache_inval__'`
   - Standard HTML5 storage event triggers across all other tabs when `localStorage.setItem()` is updated.
   - Provides resilience for environments with restricted channel access or older browser engines.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TAB 1 (Writer Context)                             │
│  Executes: DB.saveAttendance(...) or DB.addStudent(...)                     │
│  1. Invalidate Tab 1 Local L1 Cache: _purgeL1Local('v2_students')           │
│  2. Post to BroadcastChannel: postMessage({ type: 'INVALIDATE', ... })      │
│  3. Fallback write to localStorage: setItem('__hodoori_cache_inval__', ...) │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │ (BroadcastChannel)          │ (Storage Event)
                        ▼                             ▼
┌─────────────────────────────────────────┐   ┌───────────────────────────────┐
│         TAB 2 (Admin Portal)            │   │      TAB 3 (Teacher Portal)   │
│  • Matches senderTabId !== myTabId      │   │  • Matches senderTabId !== my │
│  • Evicts local L1 cache for collection │   │  • Evicts local L1 cache      │
│  • Dispatches DOM CustomEvent           │   │  • Dispatches DOM CustomEvent │
└─────────────────────────────────────────┘   └───────────────────────────────┘
```

### 4.2 Message Protocol & Payload Schema

```typescript
interface CacheSyncPayload {
    type: 'INVALIDATE' | 'CLEAR_ALL';
    collection?: string;             // Target collection, e.g. 'v2_students'
    schoolId?: string | null;        // Target school or null for all schools
    docId?: string | null;           // Target document ID (if single-doc mutation)
    senderTabId: string;             // Unique tab ID of originating window
    timestamp: number;               // Unix epoch timestamp (Date.now())
    extraCollections?: string[];     // Array of cascading collections (e.g. ['v2_students'])
}
```

### 4.3 Tab Identification & Loop/Echo Suppression

To prevent self-invalidation cycles and redundant CPU cycles:
1. Every tab initializes a unique tab identifier upon script evaluation:
   ```javascript
   _tabId: 'tab_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36),
   ```
2. When handling messages from `BroadcastChannel`:
   - If `payload.senderTabId === this._tabId`, the message is an echo from self and is immediately discarded.
3. When handling `window` `storage` events:
   - `storage` events are natively dispatched only to *other* windows/tabs by browser specification.
   - An additional check `if (data.senderTabId === this._tabId) return;` guarantees absolute loop safety.

### 4.4 Lifecycle & Transport Implementation Specification

```javascript
_tabId: 'tab_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36),
_broadcastChannel: null,
_broadcastInitialized: false,

_initBroadcast() {
    if (this._broadcastInitialized || typeof window === 'undefined') return;
    this._broadcastInitialized = true;

    // 1. Initialize BroadcastChannel if supported
    try {
        if ('BroadcastChannel' in window) {
            this._broadcastChannel = new BroadcastChannel('hodoori_db_cache_sync');
            this._broadcastChannel.onmessage = (event) => {
                this._handleSyncMessage(event.data);
            };
            this._broadcastChannel.onmessageerror = (err) => {
                console.warn("Hodoori DB: BroadcastChannel error:", err);
            };
        }
    } catch (e) {
        console.warn("Hodoori DB: BroadcastChannel initialization failed. Relying on storage fallback.", e);
    }

    // 2. Storage event listener (secondary / fallback)
    window.addEventListener('storage', (event) => {
        if (event.key === '__hodoori_cache_inval__' && event.newValue) {
            try {
                const payload = JSON.parse(event.newValue);
                this._handleSyncMessage(payload);
            } catch (_) {}
        }
    });
},

_handleSyncMessage(payload) {
    if (!payload || typeof payload !== 'object') return;
    // Suppress loopback / echoes from self
    if (payload.senderTabId === this._tabId) return;

    this._stats.broadcastsReceived++;

    if (payload.type === 'CLEAR_ALL') {
        this._purgeL1Local(null);
    } else if (payload.type === 'INVALIDATE') {
        this._purgeL1Local(payload.collection, payload.schoolId);
        if (Array.isArray(payload.extraCollections)) {
            for (const col of payload.extraCollections) {
                this._purgeL1Local(col, payload.schoolId);
            }
        }
    }

    // Dispatch DOM CustomEvent for UI reactivity if dashboards wish to subscribe
    try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('hodoori:db:invalidated', { detail: payload }));
        }
    } catch (_) {}
}
```

---

## 5. Manual Eviction API & Observability

### 5.1 Public Invalidation Methods

#### A. `DB.invalidateCache(collectionName, docId = null, options = {})`
Evicts cached entries for a specific collection (or doc) from local L1 memory and broadcasts the eviction to other open tabs.

**Parameters:**
- `collectionName` *(string, optional)*: Collection name (e.g. `DB.KEYS.STUDENTS`, `'v2_students'`, or `'students'`). If omitted, all caches are invalidated.
- `docId` *(string, optional)*: Specific document ID to target.
- `options` *(object, optional)*:
  - `schoolId` *(string)*: Specific schoolId (defaults to active user school).
  - `extraCollections` *(string[])*: Additional collections to invalidate in cascade.
  - `broadcast` *(boolean)*: Whether to broadcast to other tabs (defaults to `true`).

**Returns:** `number` — Count of evicted cache entries.

#### B. `DB.clearAllCaches(options = {})`
Completely empties all in-memory L1 cache entries and clears active in-flight query promises.

**Parameters:**
- `options` *(object, optional)*:
  - `broadcast` *(boolean)*: Whether to broadcast `CLEAR_ALL` across tabs (defaults to `true`).

**Returns:** `true`

---

### 5.2 Cache Observability & Telemetry API (`DB.getCacheStats()`)

To allow instant verification during automated testing and developer inspection in browser DevTools:

```javascript
_stats: {
    hits: 0,
    misses: 0,
    expirations: 0,
    invalidations: 0,
    broadcastsSent: 0,
    broadcastsReceived: 0
},

getCacheStats() {
    const now = Date.now();
    const entries = [];
    for (const [key, entry] of this._l1Cache.entries()) {
        entries.push({
            key: key,
            collection: entry.collection,
            schoolId: entry.schoolId,
            ageMs: now - entry.cachedAt,
            remainingTtlMs: Math.max(0, entry.expiresAt - now),
            isExpired: now > entry.expiresAt,
            hits: entry.hits,
            itemCount: Array.isArray(entry.data) ? entry.data.length : 1
        });
    }

    const totalRequests = this._stats.hits + this._stats.misses;
    const hitRatio = totalRequests > 0 ? ((this._stats.hits / totalRequests) * 100).toFixed(1) + '%' : '0.0%';

    return {
        tabId: this._tabId,
        totalEntries: this._l1Cache.size,
        hitRatio: hitRatio,
        hits: this._stats.hits,
        misses: this._stats.misses,
        expirations: this._stats.expirations,
        invalidations: this._stats.invalidations,
        broadcastsSent: this._stats.broadcastsSent,
        broadcastsReceived: this._stats.broadcastsReceived,
        entries: entries
    };
}
```

---

## 6. Complete Blueprint: `scripts/core-db.js` Method-by-Method Implementation

The following complete architectural blueprint details how every read, write, query, and administrative function in `scripts/core-db.js` integrates with L1 caching, write invalidation, and multi-tab synchronization while preserving 100% backward compatibility.

```javascript
/**
 * @fileoverview High-Performance Data Layer, Multi-Tab Offline Persistence & Smart L1 Caching
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

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
        CURRENT_USER: 'attendance_current_user' // Keep local for session
    },

    // Configurable TTL Matrix (Milliseconds)
    TTL: {
        SETTINGS: 15 * 60 * 1000,     // 15 Minutes (Eliminates 60s background interval cloud polling)
        SCHOOLS: 30 * 60 * 1000,      // 30 Minutes
        HOLIDAYS: 30 * 60 * 1000,     // 30 Minutes
        CLASSES: 10 * 60 * 1000,      // 10 Minutes
        TEACHERS: 10 * 60 * 1000,     // 10 Minutes
        SCHEDULE: 10 * 60 * 1000,     // 10 Minutes
        STUDENTS: 5 * 60 * 1000,      // 5 Minutes
        RECORDS: 3 * 60 * 1000,       // 3 Minutes
        NOTIFICATIONS: 2 * 60 * 1000, // 2 Minutes
        DEFAULT: 5 * 60 * 1000        // 5 Minutes Default Fallback
    },

    dbInstance: null,
    _initPromise: null,
    _tabId: 'tab_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36),
    _broadcastChannel: null,
    _broadcastInitialized: false,
    _l1Cache: new Map(),           // CacheKey -> L1CacheEntry
    _inflightQueries: new Map(),   // CacheKey -> Promise

    _stats: {
        hits: 0,
        misses: 0,
        expirations: 0,
        invalidations: 0,
        broadcastsSent: 0,
        broadcastsReceived: 0
    },

    // ==========================================
    // 1. Script Loading & Initialization
    // ==========================================

    async loadFirebaseScripts() {
        if (window.firebase && typeof window.firebase.firestore === 'function') return;
        const loadScript = (src) => new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (window.firebase && typeof window.firebase.firestore === 'function') return resolve();
            }
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });

        if (!window.firebase) {
            await loadScript("https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js");
        }
        if (!window.firebase || typeof window.firebase.firestore !== 'function') {
            await loadScript("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-compat.js");
        }
    },

    async init() {
        this._initBroadcast();

        if (this.dbInstance) return;
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

            // Multi-tab offline persistence initialization
            try {
                if (typeof this.dbInstance.settings === 'function') {
                    this.dbInstance.settings({
                        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
                    });
                }
                await this.dbInstance.enablePersistence({ synchronizeTabs: true });
                console.log("Hodoori DB: Multi-tab IndexedDB persistence active.");
            } catch (err) {
                if (err.code === 'failed-precondition') {
                    try {
                        await this.dbInstance.enablePersistence();
                        console.log("Hodoori DB: Single-tab IndexedDB persistence active.");
                    } catch (_) {}
                }
            }

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

    // ==========================================
    // 2. BroadcastChannel & Multi-Tab Sync Bus
    // ==========================================

    _initBroadcast() {
        if (this._broadcastInitialized || typeof window === 'undefined') return;
        this._broadcastInitialized = true;

        try {
            if ('BroadcastChannel' in window) {
                this._broadcastChannel = new BroadcastChannel('hodoori_db_cache_sync');
                this._broadcastChannel.onmessage = (event) => {
                    this._handleSyncMessage(event.data);
                };
            }
        } catch (e) {
            console.warn("Hodoori DB: BroadcastChannel error:", e);
        }

        window.addEventListener('storage', (event) => {
            if (event.key === '__hodoori_cache_inval__' && event.newValue) {
                try {
                    const payload = JSON.parse(event.newValue);
                    this._handleSyncMessage(payload);
                } catch (_) {}
            }
        });
    },

    _handleSyncMessage(payload) {
        if (!payload || typeof payload !== 'object') return;
        if (payload.senderTabId === this._tabId) return; // Prevent echo loop

        this._stats.broadcastsReceived++;

        if (payload.type === 'CLEAR_ALL') {
            this._purgeL1Local(null);
        } else if (payload.type === 'INVALIDATE') {
            this._purgeL1Local(payload.collection, payload.schoolId);
            if (Array.isArray(payload.extraCollections)) {
                for (const col of payload.extraCollections) {
                    this._purgeL1Local(col, payload.schoolId);
                }
            }
        }

        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('hodoori:db:invalidated', { detail: payload }));
            }
        } catch (_) {}
    },

    // ==========================================
    // 3. L1 In-Memory Cache Core Engine
    // ==========================================

    _getTTL(collectionName) {
        if (!collectionName) return this.TTL.DEFAULT;
        const clean = String(collectionName).replace(/^v2_/, '').toUpperCase();
        return this.TTL[clean] || this.TTL.DEFAULT;
    },

    _getL1(key) {
        if (!this._l1Cache.has(key)) {
            this._stats.misses++;
            return null;
        }

        const entry = this._l1Cache.get(key);
        const now = Date.now();

        if (now > entry.expiresAt) {
            this._l1Cache.delete(key);
            this._stats.misses++;
            this._stats.expirations++;
            return null;
        }

        entry.hits++;
        this._stats.hits++;

        // Defensive clone on output
        if (Array.isArray(entry.data)) {
            return entry.data.map(item => (typeof item === 'object' && item !== null ? { ...item } : item));
        }
        if (typeof entry.data === 'object' && entry.data !== null) {
            return { ...entry.data };
        }
        return entry.data;
    },

    _setL1(key, data, collectionName, schoolId = null, customTTL = null) {
        const ttl = customTTL || this._getTTL(collectionName);
        const now = Date.now();
        const effectiveSchoolId = schoolId || this.getCurrentUserSchoolId() || 'global';

        let clonedData;
        if (Array.isArray(data)) {
            clonedData = data.map(item => (typeof item === 'object' && item !== null ? { ...item } : item));
        } else if (typeof data === 'object' && data !== null) {
            clonedData = { ...data };
        } else {
            clonedData = data;
        }

        const entry = {
            data: clonedData,
            cachedAt: now,
            expiresAt: now + ttl,
            ttlMs: ttl,
            collection: collectionName,
            schoolId: effectiveSchoolId,
            key: key,
            hits: 0
        };

        this._l1Cache.set(key, entry);
        return data;
    },

    _purgeL1Local(collectionName = null, schoolId = null) {
        let count = 0;
        if (!collectionName) {
            count = this._l1Cache.size;
            this._l1Cache.clear();
            this._stats.invalidations += count;
            return count;
        }

        const canonicalCol = this.KEYS[String(collectionName).toUpperCase()] || collectionName;
        const prefix = `${canonicalCol}::`;

        for (const [key, entry] of this._l1Cache.entries()) {
            if (key.startsWith(prefix)) {
                if (!schoolId || schoolId === 'global' || schoolId === 'ministry' || entry.schoolId === schoolId || entry.schoolId === 'global') {
                    this._l1Cache.delete(key);
                    count++;
                }
            }
        }

        this._stats.invalidations += count;
        return count;
    },

    // ==========================================
    // 4. Invalidation & Eviction API
    // ==========================================

    invalidateCache(collectionName = null, docId = null, options = {}) {
        const schoolId = options.schoolId || this.getCurrentUserSchoolId() || null;
        const extraCollections = options.extraCollections || [];
        const broadcast = options.broadcast !== false;

        const canonicalCol = collectionName ? (this.KEYS[String(collectionName).toUpperCase()] || collectionName) : null;

        // 1. Purge locally
        const evictedCount = this._purgeL1Local(canonicalCol, schoolId);
        for (const col of extraCollections) {
            this._purgeL1Local(col, schoolId);
        }

        // 2. Broadcast to other tabs
        if (broadcast) {
            const payload = {
                type: 'INVALIDATE',
                collection: canonicalCol,
                docId: docId,
                schoolId: schoolId,
                extraCollections: extraCollections,
                senderTabId: this._tabId,
                timestamp: Date.now()
            };

            this._stats.broadcastsSent++;

            try {
                if (this._broadcastChannel) {
                    this._broadcastChannel.postMessage(payload);
                }
            } catch (_) {}

            try {
                localStorage.setItem('__hodoori_cache_inval__', JSON.stringify(payload));
            } catch (_) {}
        }

        return evictedCount;
    },

    clearAllCaches(options = {}) {
        const broadcast = options.broadcast !== false;
        this._l1Cache.clear();
        this._inflightQueries.clear();

        if (broadcast) {
            const payload = {
                type: 'CLEAR_ALL',
                senderTabId: this._tabId,
                timestamp: Date.now()
            };

            this._stats.broadcastsSent++;

            try {
                if (this._broadcastChannel) {
                    this._broadcastChannel.postMessage(payload);
                }
            } catch (_) {}

            try {
                localStorage.setItem('__hodoori_cache_inval__', JSON.stringify(payload));
            } catch (_) {}
        }

        return true;
    },

    getCacheStats() {
        const now = Date.now();
        const entries = [];
        for (const [key, entry] of this._l1Cache.entries()) {
            entries.push({
                key: key,
                collection: entry.collection,
                schoolId: entry.schoolId,
                ageMs: now - entry.cachedAt,
                remainingTtlMs: Math.max(0, entry.expiresAt - now),
                hits: entry.hits,
                count: Array.isArray(entry.data) ? entry.data.length : 1
            });
        }

        const totalReq = this._stats.hits + this._stats.misses;
        return {
            tabId: this._tabId,
            totalEntries: this._l1Cache.size,
            hitRatio: totalReq > 0 ? ((this._stats.hits / totalReq) * 100).toFixed(1) + '%' : '0.0%',
            hits: this._stats.hits,
            misses: this._stats.misses,
            expirations: this._stats.expirations,
            invalidations: this._stats.invalidations,
            broadcastsSent: this._stats.broadcastsSent,
            broadcastsReceived: this._stats.broadcastsReceived,
            entries: entries
        };
    },

    // ==========================================
    // 5. In-Flight Request Coalescing Helper
    // ==========================================

    async _coalesce(cacheKey, collectionName, schoolId, fetcherFn, options = {}) {
        const forceRefresh = options && options.forceRefresh === true;
        const bypassCache = options && options.bypassCache === true;

        if (!forceRefresh && !bypassCache) {
            const cached = this._getL1(cacheKey);
            if (cached !== null) {
                return cached;
            }
        }

        if (this._inflightQueries.has(cacheKey)) {
            return this._inflightQueries.get(cacheKey);
        }

        const promise = (async () => {
            try {
                const data = await fetcherFn();
                if (!bypassCache) {
                    this._setL1(cacheKey, data, collectionName, schoolId);
                }
                return data;
            } finally {
                this._inflightQueries.delete(cacheKey);
            }
        })();

        this._inflightQueries.set(cacheKey, promise);
        return promise;
    },

    // ==========================================
    // 6. Data Reading Methods (L1 Cached + Coalesced)
    // ==========================================

    getCurrentUserSchoolId() {
        try {
            const user = JSON.parse(localStorage.getItem(this.KEYS.CURRENT_USER) || '{}');
            return user.schoolId || null;
        } catch (_) {
            return null;
        }
    },

    async getCollection(collectionName, filterBySchool = true, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (filterBySchool && schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        const cacheKey = `${collectionName}::${effectiveSchool}::all`;

        return this._coalesce(cacheKey, collectionName, effectiveSchool, async () => {
            let query = this.dbInstance.collection(collectionName);
            if (filterBySchool && schoolId && schoolId !== 'ministry') {
                query = query.where('schoolId', '==', schoolId);
            }
            const snap = await query.get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }, options);
    },

    async getStudents(classId = null, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        const cacheKey = `${this.KEYS.STUDENTS}::${effectiveSchool}::${classId ? 'class_' + classId : 'all'}`;

        return this._coalesce(cacheKey, this.KEYS.STUDENTS, effectiveSchool, async () => {
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

    async getTeachers(options = {}) {
        return await this.getCollection(this.KEYS.TEACHERS, true, options);
    },

    async getClasses(options = {}) {
        return await this.getCollection(this.KEYS.CLASSES, true, options);
    },

    async getRecords(date = null, classId = null, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        const cacheKey = `${this.KEYS.RECORDS}::${effectiveSchool}::date_${date || 'all'}__class_${classId || 'all'}`;

        return this._coalesce(cacheKey, this.KEYS.RECORDS, effectiveSchool, async () => {
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

    async getSettings(options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const docId = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        const cacheKey = `${this.KEYS.SETTINGS}::${docId}::doc_${docId}`;

        return this._coalesce(cacheKey, this.KEYS.SETTINGS, docId, async () => {
            const doc = await this.dbInstance.collection(this.KEYS.SETTINGS).doc(docId).get();
            return doc.exists ? doc.data() : {};
        }, options);
    },

    async getSchools(options = {}) {
        return await this.getCollection(this.KEYS.SCHOOLS, false, options);
    },

    async getSchool(id, options = {}) {
        await this.init();
        const cacheKey = `${this.KEYS.SCHOOLS}::global::doc_${id}`;

        return this._coalesce(cacheKey, this.KEYS.SCHOOLS, 'global', async () => {
            const doc = await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : null;
        }, options);
    },

    async getSchedule(options = {}) {
        return await this.getCollection(this.KEYS.SCHEDULE, true, options);
    },

    async getNotifications(target = {}, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        
        const targetKey = (target.id || target.classId) 
            ? `target_id_${target.id || ''}_class_${target.classId || ''}_parent_${!!target.isParent}` 
            : 'all';
        const cacheKey = `${this.KEYS.NOTIFICATIONS}::${effectiveSchool}::${targetKey}`;

        return this._coalesce(cacheKey, this.KEYS.NOTIFICATIONS, effectiveSchool, async () => {
            let q = this.dbInstance.collection(this.KEYS.NOTIFICATIONS);
            if (schoolId && schoolId !== 'ministry') {
                q = q.where('schoolId', '==', schoolId);
            }

            if (target.id || target.classId) {
                const q1 = await q.where('targetType', '==', 'all').get();
                let results = q1.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (target.classId) {
                    const q2 = await q.where('targetType', '==', 'class').where('targetId', '==', target.classId).get();
                    results = [...results, ...q2.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
                }

                if (target.id) {
                    const q3 = await q.where('targetType', '==', 'student').where('targetId', '==', target.id).get();
                    results = [...results, ...q3.docs.map(doc => ({ id: doc.id, ...doc.data() }))];

                    if (target.isParent) {
                        const q4 = await q.where('targetType', '==', 'parent').where('targetId', '==', target.id).get();
                        results = [...results, ...q4.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
                    }
                }

                const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());
                return uniqueResults.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }

            const snap = await q.get();
            const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }, options);
    },

    async isHoliday(dateString, options = {}) {
        const date = new Date(dateString);
        const day = date.getDay();
        if (day === 5 || day === 6) return true;

        const holidays = await this.getCollection(this.KEYS.HOLIDAYS, false, options);
        return holidays.some(h => h.date === dateString);
    },

    // ==========================================
    // 7. Write Operations (Auto-Invalidating)
    // ==========================================

    async saveAttendance(date, classId, attendanceList, teacherId, periodNumber = null, image = null, notes = null) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();

        let query = this.dbInstance.collection(this.KEYS.RECORDS)
            .where('date', '==', date)
            .where('classId', '==', classId)
            .where('schoolId', '==', schoolId);

        const existing = await query.get();

        let docRef;
        if (periodNumber !== null) {
            const periodDoc = existing.docs.find(d => d.data().periodNumber === periodNumber);
            docRef = periodDoc ? periodDoc.ref : this.dbInstance.collection(this.KEYS.RECORDS).doc();
        } else {
            if (!existing.empty) {
                docRef = existing.docs[0].ref;
            } else {
                docRef = this.dbInstance.collection(this.KEYS.RECORDS).doc();
            }
        }

        const report = {
            date,
            classId,
            teacherId,
            schoolId,
            details: attendanceList,
            image,
            notes,
            timestamp: new Date().toISOString()
        };

        if (periodNumber !== null) report.periodNumber = periodNumber;

        await docRef.set(report);
        this.invalidateCache(this.KEYS.RECORDS, docRef.id);
    },

    async deleteRecord(id) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.RECORDS).doc(id).delete();
        this.invalidateCache(this.KEYS.RECORDS, id);
    },

    async updateRecordDetails(id, newDetails) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.RECORDS).doc(id).update({
            details: newDetails
        });
        this.invalidateCache(this.KEYS.RECORDS, id);
    },

    async addStudent(student) {
        await this.init();
        const id = student.academicId || Date.now().toString();
        student.academicId = id;
        student.name = student.name || 'طالب مجهول';
        student.schoolId = this.getCurrentUserSchoolId();

        if (student.classid && !student.classId) student.classId = student.classid;

        await this.dbInstance.collection(this.KEYS.STUDENTS).doc(id).set(student);
        this.invalidateCache(this.KEYS.STUDENTS, id);
    },

    async deleteStudent(id) {
        await this.init();
        const ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.delete();
            this.invalidateCache(this.KEYS.STUDENTS, id);
            return;
        }

        const snap = await this.dbInstance.collection(this.KEYS.STUDENTS).where('academicId', '==', id).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await d.ref.delete();
            }
            this.invalidateCache(this.KEYS.STUDENTS, id);
            return;
        }

        const all = await this.getStudents();
        const matched = all.filter(s => s.name && this.matchArabicNames(s.name, id));
        for (const m of matched) {
            await this.dbInstance.collection(this.KEYS.STUDENTS).doc(m.id).delete();
        }
        this.invalidateCache(this.KEYS.STUDENTS);
    },

    async updateStudent(id, updatedData) {
        await this.init();
        if (updatedData.classid && !updatedData.classId) updatedData.classId = updatedData.classid;

        const ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.update(updatedData);
            this.invalidateCache(this.KEYS.STUDENTS, id);
            return;
        }

        const snap = await this.dbInstance.collection(this.KEYS.STUDENTS).where('academicId', '==', id).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await d.ref.update(updatedData);
            }
            this.invalidateCache(this.KEYS.STUDENTS, id);
            return;
        }

        const all = await this.getStudents();
        const matched = all.filter(s => s.name && this.matchArabicNames(s.name, id));
        for (const m of matched) {
            await this.dbInstance.collection(this.KEYS.STUDENTS).doc(m.id).update(updatedData);
        }
        this.invalidateCache(this.KEYS.STUDENTS);
    },

    async addTeacher(teacher) {
        await this.init();
        const id = Date.now().toString();

        if (teacher.ministryNumber && !teacher.ministryId) teacher.ministryId = teacher.ministryNumber;
        if (!teacher.schoolId) {
            teacher.schoolId = this.getCurrentUserSchoolId();
        }

        await this.dbInstance.collection(this.KEYS.TEACHERS).doc(id).set(teacher);
        this.invalidateCache(this.KEYS.TEACHERS, id);
    },

    async deleteTeacher(id) {
        await this.init();
        const ref = this.dbInstance.collection(this.KEYS.TEACHERS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.delete();
            this.invalidateCache(this.KEYS.TEACHERS, id);
            return;
        }

        const snap = await this.dbInstance.collection(this.KEYS.TEACHERS).where('ministryId', '==', id).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await d.ref.delete();
            }
            this.invalidateCache(this.KEYS.TEACHERS, id);
            return;
        }

        const all = await this.getTeachers();
        const matched = all.filter(t => t.name && this.matchArabicNames(t.name, id));
        for (const m of matched) {
            await this.dbInstance.collection(this.KEYS.TEACHERS).doc(m.id).delete();
        }
        this.invalidateCache(this.KEYS.TEACHERS);
    },

    async updateTeacher(id, updatedData) {
        await this.init();
        if (updatedData.ministryNumber && !updatedData.ministryId) updatedData.ministryId = updatedData.ministryNumber;

        const ref = this.dbInstance.collection(this.KEYS.TEACHERS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.update(updatedData);
            this.invalidateCache(this.KEYS.TEACHERS, id);
            return;
        }

        const snap = await this.dbInstance.collection(this.KEYS.TEACHERS).where('ministryId', '==', id).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await d.ref.update(updatedData);
            }
            this.invalidateCache(this.KEYS.TEACHERS, id);
            return;
        }

        const all = await this.getTeachers();
        const matched = all.filter(t => t.name && this.matchArabicNames(t.name, id));
        for (const m of matched) {
            await this.dbInstance.collection(this.KEYS.TEACHERS).doc(m.id).update(updatedData);
        }
        this.invalidateCache(this.KEYS.TEACHERS);
    },

    async addClass(cls) {
        await this.init();
        const id = 'c' + Date.now();
        const normalized = {
            name: cls.name || cls.className || cls.title || 'صف جديد',
            section: cls.section || cls.group || '-',
            schoolId: this.getCurrentUserSchoolId()
        };
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).set(normalized);
        this.invalidateCache(this.KEYS.CLASSES, id);
    },

    async deleteClass(id) {
        await this.init();
        const students = await this.getStudents(id);
        for (const s of students) {
            await this.deleteStudent(s.id);
        }
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).delete();
        // Cascade invalidation: classes AND students
        this.invalidateCache(this.KEYS.CLASSES, id, { extraCollections: [this.KEYS.STUDENTS] });
    },

    async updateClass(id, updatedData) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).update(updatedData);
        this.invalidateCache(this.KEYS.CLASSES, id);
    },

    async saveSettings(settings) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const docId = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        await this.dbInstance.collection(this.KEYS.SETTINGS).doc(docId).set(settings, { merge: true });
        this.invalidateCache(this.KEYS.SETTINGS, docId);
    },

    async addSchool(school) {
        await this.init();
        const id = 's' + Date.now();
        school.timestamp = new Date().toISOString();
        await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).set(school);
        this.invalidateCache(this.KEYS.SCHOOLS, id);
        return id;
    },

    async deleteSchool(id) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).delete();
        this.invalidateCache(this.KEYS.SCHOOLS, id);
    },

    async updateSchool(id, data) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).update(data);
        this.invalidateCache(this.KEYS.SCHOOLS, id);
    },

    async saveScheduleEntry(entry) {
        await this.init();
        const id = 'sch_' + Date.now();
        entry.schoolId = this.getCurrentUserSchoolId();
        await this.dbInstance.collection(this.KEYS.SCHEDULE).doc(id).set(entry);
        this.invalidateCache(this.KEYS.SCHEDULE, id);
        return id;
    },

    async updateScheduleEntry(id, data) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.SCHEDULE).doc(id).update(data);
        this.invalidateCache(this.KEYS.SCHEDULE, id);
    },

    async deleteScheduleEntry(id) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.SCHEDULE).doc(id).delete();
        this.invalidateCache(this.KEYS.SCHEDULE, id);
    },

    async addNotification(notification) {
        await this.init();
        notification.timestamp = new Date().toISOString();
        notification.schoolId = this.getCurrentUserSchoolId();
        const ref = await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).add(notification);
        this.invalidateCache(this.KEYS.NOTIFICATIONS, ref.id);
        return ref.id;
    },

    async updateNotification(id, data) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).doc(id).update(data);
        this.invalidateCache(this.KEYS.NOTIFICATIONS, id);
    },

    async deleteNotification(id) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).doc(id).delete();
        this.invalidateCache(this.KEYS.NOTIFICATIONS, id);
    },

    async insert(table, data) {
        if (table === 'students') return await this.addStudent(data);
        if (table === 'teachers') return await this.addTeacher(data);
        if (table === 'classes') return await this.addClass(data);

        await this.init();
        if (!data.schoolId) data.schoolId = this.getCurrentUserSchoolId();
        if (!data.timestamp) data.timestamp = new Date().toISOString();
        if (table === 'records' && !data.date) data.date = new Date().toISOString().split('T')[0];

        const col = this.KEYS[table.toUpperCase()] || table;
        const ref = await this.dbInstance.collection(col).add(data);
        this.invalidateCache(col, ref.id);
        return ref.id;
    },

    async update(table, id, data) {
        if (table === 'students') return await this.updateStudent(id, data);
        if (table === 'teachers') return await this.updateTeacher(id, data);
        if (table === 'classes') return await this.updateClass(id, data);

        await this.init();
        const col = this.KEYS[table.toUpperCase()] || table;
        const res = await this.dbInstance.collection(col).doc(id).update(data);
        this.invalidateCache(col, id);
        return res;
    },

    async delete(table, id) {
        if (table === 'students') return await this.deleteStudent(id);
        if (table === 'teachers') return await this.deleteTeacher(id);
        if (table === 'classes') return await this.deleteClass(id);
        if (table === 'records') return await this.deleteRecord(id);
        if (table === 'notifications') return await this.deleteNotification(id);

        await this.init();
        const col = this.KEYS[table.toUpperCase()] || table;
        const res = await this.dbInstance.collection(col).doc(id).delete();
        this.invalidateCache(col, id);
        return res;
    },

    async seedData() {
        const batch = this.dbInstance.batch();

        const schoolRef = this.dbInstance.collection(this.KEYS.SCHOOLS).doc('s1');
        batch.set(schoolRef, { name: 'المدرسة النموذجية', address: 'عمان', principal: 'د. أحمد', timestamp: new Date().toISOString() });

        const mRef = this.dbInstance.collection(this.KEYS.TEACHERS).doc('ministry_1');
        batch.set(mRef, { name: 'مسؤول الوزارة', ministryId: '000', password: 'admin', role: 'ministry', schoolId: 'ministry' });

        const tRef = this.dbInstance.collection(this.KEYS.TEACHERS).doc('1');
        batch.set(tRef, { name: 'مدير المدرسة', ministryId: '100', password: 'admin', role: 'admin', schoolId: 's1' });

        const c1Ref = this.dbInstance.collection(this.KEYS.CLASSES).doc('c1');
        batch.set(c1Ref, { name: 'الصف العاشر', section: 'أ', schoolId: 's1' });

        const c2Ref = this.dbInstance.collection(this.KEYS.CLASSES).doc('c2');
        batch.set(c2Ref, { name: 'الصف الحادي عشر', section: 'ب', schoolId: 's1' });

        const s1Ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc('2024001');
        batch.set(s1Ref, { academicId: '2024001', name: 'أحمد المحمدي', classId: 'c1', schoolId: 's1', avatar: 'https://i.pravatar.cc/150?u=1' });

        const s2Ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc('2024042');
        batch.set(s2Ref, { academicId: '2024042', name: 'سارة خالد', classId: 'c1', schoolId: 's1', avatar: 'https://i.pravatar.cc/150?u=2' });

        await batch.commit();
        this.clearAllCaches();
    },

    // ==========================================
    // 8. Arabic Search & Matching Helpers (Verbatim Preserved)
    // ==========================================

    normalizeArabic(str) {
        if (!str) return '';
        return String(str)
            .replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')
            .replace(/\u0640/g, '')
            .replace(/[إأآاٱ]/g, 'ا')
            .replace(/[يى]/g, 'ي')
            .replace(/[ةه]/g, 'ه')
            .replace(/[ؤئء]/g, '')
            .toLowerCase()
            .trim();
    },

    stripDefiniteArticle(word) {
        if (!word) return '';
        if (word.startsWith('ال') && word.length > 3) {
            return word.slice(2);
        }
        return word;
    },

    scoreArabicMatch(targetName, query) {
        if (!targetName || !query) return 0;
        const targetNorm = this.normalizeArabic(targetName);
        const queryNorm = this.normalizeArabic(query);

        if (targetNorm === queryNorm) return 100;

        const queryTokens = queryNorm.split(/\s+/).filter(Boolean);
        const targetTokens = targetNorm.split(/\s+/).filter(Boolean);

        if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

        const firstQ = this.stripDefiniteArticle(queryTokens[0]);
        const firstT = this.stripDefiniteArticle(targetTokens[0]);
        const lastQ = this.stripDefiniteArticle(queryTokens[queryTokens.length - 1]);
        const lastT = this.stripDefiniteArticle(targetTokens[targetTokens.length - 1]);

        const isFirstMatch = (firstQ === firstT);
        const isLastMatch = (lastQ === lastT);

        if (queryTokens.length >= 2 && isFirstMatch && isLastMatch) {
            return 98;
        }

        if (targetNorm.includes(queryNorm)) {
            if (isFirstMatch) return 96;
            return 80;
        }

        let targetIdx = 0;
        let strictOrderedMatches = 0;

        for (const qTok of queryTokens) {
            const qRoot = this.stripDefiniteArticle(qTok);
            let found = false;
            while (targetIdx < targetTokens.length) {
                const tTok = targetTokens[targetIdx];
                const tRoot = this.stripDefiniteArticle(tTok);
                targetIdx++;

                if (tTok === qTok || tRoot === qRoot) {
                    found = true;
                    strictOrderedMatches++;
                    break;
                }
            }
            if (!found) break;
        }

        if (strictOrderedMatches === queryTokens.length) {
            if (isFirstMatch) return 94;
            return 82;
        }

        const allStrictFound = queryTokens.every(qTok => {
            const qRoot = this.stripDefiniteArticle(qTok);
            return targetTokens.some(tTok => {
                const tRoot = this.stripDefiniteArticle(tTok);
                return tTok === qTok || tRoot === qRoot;
            });
        });

        if (allStrictFound) {
            if (isFirstMatch) return 90;
            return 75;
        }

        return 0;
    },

    filterAndRankMatches(list, query) {
        if (!query || !list || list.length === 0) return [];
        const scored = list.map(item => ({
            item,
            score: this.scoreArabicMatch(item.name, query)
        })).filter(x => x.score > 0);

        scored.sort((a, b) => b.score - a.score);

        const topScore = scored.length > 0 ? scored[0].score : 0;
        if (topScore >= 90) {
            return scored.filter(x => x.score >= 90).map(x => x.item);
        }
        if (topScore >= 80) {
            return scored.filter(x => x.score >= 80).map(x => x.item);
        }
        return scored.map(x => x.item);
    },

    matchArabicNames(targetName, query) {
        return this.scoreArabicMatch(targetName, query) >= 75;
    }
};
```

---

## 7. Edge-Case Analysis & Defensive Resiliency

### 7.1 Cross-Origin / Iframe & Private Browsing Environments
- In restricted iframe sandboxes or Safari private browsing, `BroadcastChannel` instantiation may throw a `SecurityError` or `TypeError`.
- **Mitigation:** The `_initBroadcast()` routine wraps `BroadcastChannel` creation in a `try/catch` block. If unavailable, it seamlessly degrades to `localStorage` `storage` events. If `localStorage` is also disabled, memory-only local cache invalidation functions without crashing.

### 7.2 Cache Stampede Prevention During Forced Refresh
- When `forceRefresh: true` is passed, the caller intentionally invalidates and bypasses the current L1 cache.
- To prevent stampedes when multiple concurrent components request a forced refresh simultaneously, `_coalesce()` ensures only a single cloud query promise executes, and its fresh result populates the L1 cache for all waiting callers.

### 7.3 Multi-Tenant Isolation
- In ministry portals where the user inspects multiple schools, cache keys strictly namespace each collection under the specific `schoolId` (e.g. `v2_students::s1::all` vs `v2_students::s2::all`).
- Purging cache in `s1` leaves `s2` cache intact, preventing unnecessary cache evictions across unrelated schools.

---

## 8. Verification & Test Plan

1. **L1 Cache Retention & Hit Verification:**
   - Call `DB.getClasses()` twice consecutively.
   - Assert that the second call returns synchronously within 0–1ms and `DB.getCacheStats().hits` increments.
2. **TTL Expiration Verification:**
   - Artificially advance time or configure test TTL to 50ms for `NOTIFICATIONS`.
   - Wait 100ms and call `DB.getNotifications()`. Assert that `DB.getCacheStats().expirations` increments and a new query is dispatched.
3. **Write Invalidation Verification:**
   - Call `DB.getStudents()`, observe cache entry exists in `DB._l1Cache`.
   - Call `DB.addStudent({ name: 'طالب تجريبي', classId: 'c1' })`.
   - Assert that `_l1Cache` entries for `v2_students` are evicted (`_l1Cache.has('v2_students::s1::all') === false`).
4. **Cross-Tab BroadcastChannel Verification:**
   - Instantiate two instances of `DB` (or test channels) sharing `BroadcastChannel('hodoori_db_cache_sync')`.
   - Call `DB.invalidateCache('v2_classes')` on Instance 1.
   - Assert Instance 2 receives the sync message and purges its local `_l1Cache` for `v2_classes`.
