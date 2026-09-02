## 2026-08-29T17:46:37Z
You are a Worker agent (Role: Core DB Implementation Specialist).
Your working directory is: d:\Hodoori-Beta\.agents\worker_m1_1
Original user request path: d:\Hodoori-Beta\.agents\ORIGINAL_REQUEST.md
Scope document: d:\Hodoori-Beta\PROJECT.md

Explorer Technical Specifications:
- d:\Hodoori-Beta\.agents\explorer_m1_1\analysis.md
- d:\Hodoori-Beta\.agents\explorer_m1_2\analysis.md
- d:\Hodoori-Beta\.agents\explorer_m1_3\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership:
- `scripts/core-db.js` (Exclusive ownership)
- `firestore.indexes.json` (Composite indexes)
- Any unit/integration test scripts created under your working directory or test directory.

Mission for Milestone 1 (M1):
Implement the complete, production-grade Smart Local Caching, Offline Persistence, and Delta Sync layer in `scripts/core-db.js`:
1. Multi-Tab Offline Persistence (`enablePersistence({ synchronizeTabs: true })`) with cascade fallback (single-tab, in-memory) inside `DB.init()`.
2. In-flight request deduplication (`_inflightQueries = new Map()`) via `_coalesce()` helper.
3. In-memory L1 cache (`_l1Cache = new Map()`) with per-collection TTLs (`SETTINGS: 15m`, `SCHOOLS/HOLIDAYS: 30m`, `CLASSES/TEACHERS/SCHEDULE: 10m`, `STUDENTS: 5m`, `RECORDS: 3m`, `NOTIFICATIONS: 2m`, `DEFAULT: 5m`), hit/miss counters, telemetry, and `getCacheStats()`.
4. Automated write-through cache invalidation across all 25+ CRUD and mutating methods (`addStudent`, `updateStudent`, `deleteStudent`, `addClass`, `updateClass`, `deleteClass` with cascading student eviction, `saveAttendance`, `deleteRecord`, `updateRecordDetails`, `saveSettings`, `addTeacher`, `updateTeacher`, `deleteTeacher`, `saveScheduleEntry`, `insert`, `update`, `delete`, etc.).
5. Cross-tab synchronization via `BroadcastChannel('hodoori_db_cache_sync')` and `localStorage` storage event fallback with unique `_tabId` loop suppression.
6. Delta Sync incremental sync logic (`_syncDeltaCollection`, `_mergeDeltaIntoBaseline`) and date-bounded query helpers (`getRecordsRange`, `getTodayRecords`, `getRecentRecords`, `getRecordById`).
7. 100% preservation of all existing method signatures, parameter defaults, return shapes, and Arabic fuzzy matching algorithms (`normalizeArabic`, `stripDefiniteArticle`, `scoreArabicMatch`, `filterAndRankMatches`, `matchArabicNames`).
8. Create and run automated verification tests covering all the above features and document passing test results in `handoff.md`.
9. Document your changes in `d:\Hodoori-Beta\.agents\worker_m1_1\changes.md` and complete handoff in `d:\Hodoori-Beta\.agents\worker_m1_1\handoff.md`.
10. Send a message to your parent with a concise summary and path to your handoff report when complete.
