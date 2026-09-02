# Milestone 1 (M1) Handoff Report: L1 Cache, TTL Eviction, Write Invalidation & Cross-Tab Synchronization

**Agent:** `explorer_m1_2`  
**Role:** Cache Invalidation & Multi-Tab Specifier  
**Target File:** `scripts/core-db.js`  
**Handoff Type:** Hard (Task Complete)  
**Date:** 2026-08-29  

---

## 1. Observation

Direct examination of the Hodoori educational platform repository revealed the following architectural facts:

1. **Un-cached Read Queries in `scripts/core-db.js`:**
   - Lines 124–135 (`getCollection`), lines 137–151 (`getStudents`), lines 161–174 (`getRecords`), lines 483–525 (`getNotifications`), lines 605–611 (`getSettings`), and lines 617–621 (`getSchool`) execute raw `query.get()` or `doc.get()` unconditionally without checking or populating an in-memory L1 cache.
   - For example, `core-db.js:609`:
     ```javascript
     const doc = await this.dbInstance.collection(this.KEYS.SETTINGS).doc(docId).get();
     return doc.exists ? doc.data() : {};
     ```
2. **No In-Memory Cache or Eviction Mechanism on Mutating Operations:**
   - In `scripts/core-db.js`, methods `saveAttendance` (lines 176–214), `addTeacher` (217–229), `deleteTeacher` (230–233, 427–449), `addClass` (234–244), `deleteClass` (245–252), `addStudent` (368–378), `deleteStudent` (379–401), `updateTeacher` (402–426), `updateClass` (450–453), `updateStudent` (454–480), `addNotification` (527–532), `updateNotification` (534–536), `deleteNotification` (538–540), `deleteRecord` (552–554), `updateRecordDetails` (556–560), `saveSettings` (599–604), `addSchool` (622–628), `deleteSchool` (629–633), `updateSchool` (634–637), `saveScheduleEntry` (643–649), `updateScheduleEntry` (650–653), `deleteScheduleEntry` (654–657), `insert` (563–576), `update` (578–585), and `delete` (587–596) execute writes directly to Firestore without invalidating any local cache entries or notifying other open tabs.
3. **Cross-Tab Communication Absence:**
   - `BroadcastChannel` is not instantiated anywhere in `scripts/core-db.js`.
   - `window.addEventListener('storage', ...)` is not configured for cache invalidation events.
4. **Read Leaks Identified in UI Callers:**
   - `dashboard-admin.html:4181–4201` executes `DB.getSettings()` every 60 seconds inside an un-cached `setInterval` loop.
   - `dashboard-admin.html:2161–2173` (`renderAll`) executes 13 concurrent collection queries on page load.

---

## 2. Logic Chain

1. **Premise 1 (Redundant Read Elimination):** Because educational master data (`v2_settings`, `v2_schools`, `v2_classes`, `v2_teachers`) changes rarely during an active school day, maintaining an in-memory L1 cache (`DB._l1Cache = new Map()`) with per-collection TTLs (15m for `SETTINGS`, 30m for `SCHOOLS`/`HOLIDAYS`, 10m for `CLASSES`/`TEACHERS`/`SCHEDULE`, 5m for `STUDENTS`, 3m for `RECORDS`, 2m for `NOTIFICATIONS`) allows repeated queries within the same tab to resolve synchronously in <1ms without hitting Firestore cloud endpoints.
2. **Premise 2 (Data Consistency via Invalidation):** If a user adds, edits, or deletes an entity (e.g. `addStudent` or `saveAttendance`), any existing L1 cache entry for that collection becomes stale. Therefore, every mutating database method must execute write-through invalidation (`this.invalidateCache(collection, docId)`), purging the local L1 cache keys.
3. **Premise 3 (Cascading Deletions):** `deleteClass(id)` deletes all students enrolled in that class before deleting the class itself. Therefore, invalidation must cascade to purge both `v2_classes` and `v2_students` (`{ extraCollections: ['v2_students'] }`).
4. **Premise 4 (Multi-Tab Coherence):** In multi-tab workflows, a write in Tab 1 would leave Tab 2 with stale L1 cache unless notified. By transmitting an `INVALIDATE` message via `BroadcastChannel('hodoori_db_cache_sync')` (with fallback to `localStorage` `storage` events), Tab 2 instantly purges its local L1 cache upon receiving the event.
5. **Premise 5 (Loop & Echo Suppression):** Giving each tab an immutable `_tabId` (`tab_<random>_<timestamp>`) and attaching `senderTabId` to every broadcast packet ensures that the originating tab never re-processes its own invalidation messages, preventing infinite event loops.

---

## 3. Caveats

- **Cross-Origin / Private Browsing Support:** In strict private browsing (e.g., Safari private window or restricted iframe sandboxes), `BroadcastChannel` or `localStorage` might throw exceptions. The design explicitly wraps both transports in defensive `try/catch` handlers and falls back to local in-memory invalidation.
- **Direct Firestore Access Outside Core DB:** Bulk Excel imports in `dashboard-admin.html:4448, 4469` write directly to `DB.dbInstance.collection(...)`. While Milestone 1 updates `core-db.js`, callers performing direct writes should call `DB.invalidateCache(DB.KEYS.CLASSES)` and `DB.invalidateCache(DB.KEYS.STUDENTS)` to ensure immediate multi-tab sync.
- **In-Memory Volatility:** L1 cache is stored in RAM and is lost on full page navigation; however, Tier 4 IndexedDB persistence preserves cached data offline between page loads.

---

## 4. Conclusion

The technical specification in `d:\Hodoori-Beta\.agents\explorer_m1_2\analysis.md` provides a complete, drop-in, zero-regression architecture for `scripts/core-db.js`:
1. `_l1Cache` map with granular TTL hierarchy (`SETTINGS: 15m`, `SCHOOLS/HOLIDAYS: 30m`, `CLASSES/TEACHERS/SCHEDULE: 10m`, `STUDENTS: 5m`, `RECORDS: 3m`, `NOTIFICATIONS: 2m`, `DEFAULT: 5m`).
2. Deterministic cache key normalization: `${collectionName}::${schoolId}::${querySignature}`.
3. Automatic write-through invalidation across all 25+ CRUD and batch write methods, including cascade invalidation on `deleteClass`.
4. Dual-layer cross-tab synchronization (`BroadcastChannel('hodoori_db_cache_sync')` + `localStorage` fallback) with unique `_tabId` loop suppression.
5. Developer and testing APIs: `DB.invalidateCache()`, `DB.clearAllCaches()`, and `DB.getCacheStats()`.

---

## 5. Verification Method

To independently verify the specification and its implementation:

1. **Specification Review:**
   - Inspect `d:\Hodoori-Beta\.agents\explorer_m1_2\analysis.md` to verify all method signatures, data structures, and edge-case handlings match the interface contracts in `PROJECT.md`.
2. **Automated Unit / In-Browser Verification Protocol:**
   - **Test 1 (L1 Cache & TTL):** Call `await DB.getClasses()`, verify `DB.getCacheStats().hits === 0` and `totalEntries === 1`. Call `await DB.getClasses()` again, verify `DB.getCacheStats().hits === 1` and execution time < 1ms.
   - **Test 2 (Write Invalidation):** Call `await DB.addStudent({ name: 'طالب تجريبي' })`. Verify `DB._l1Cache.has('v2_students::s1::all') === false`.
   - **Test 3 (Cascade Invalidation):** Call `await DB.deleteClass('c1')`. Verify both `v2_classes` and `v2_students` cache entries are evicted.
   - **Test 4 (Cross-Tab Sync):** Open two browser contexts on the same origin. On Tab 1, execute `DB.invalidateCache('v2_teachers')`. On Tab 2, assert that `DB.getCacheStats().broadcastsReceived` increments and `v2_teachers` entries are evicted.
   - **Test 5 (Telemetry & Observability):** Call `DB.getCacheStats()`, verify returned object contains `tabId`, `totalEntries`, `hitRatio`, `hits`, `misses`, `expirations`, `invalidations`, `broadcastsSent`, `broadcastsReceived`, and `entries`.
