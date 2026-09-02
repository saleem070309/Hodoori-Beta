## 2026-08-29T17:41:05Z
Analyze `scripts/core-db.js` (and any related database scripts/modules in d:\Hodoori-Beta) to design the smart local caching, multi-tab persistence, in-memory TTL caching with write invalidation, and delta sync layer required by R2.

Tasks:
1. Thoroughly analyze `scripts/core-db.js` and all database utility functions currently in place.
2. Identify how Firestore SDK is initialized, configured, and whether offline persistence (`enableIndexedDbPersistence` / `persistentLocalCache` / `initializeFirestore`) is currently enabled or configured.
3. Design the architectural specifications for R2:
   - Offline cache / IndexedDB multi-tab persistence setup and fallbacks.
   - In-memory L1 cache with TTL (Time To Live) and configurable expiry per collection.
   - Cache invalidation on write (`dbSet`, `dbUpdate`, `dbDelete`, batch writes).
   - Delta Sync & Date-bounded query support (e.g. tracking `lastUpdated` or timestamp boundaries to query only changed records).
   - Query deduplication (in-flight promise sharing) to prevent identical concurrent reads.
   - Backward compatibility / Zero breaking changes for all callers of `core-db.js`.
4. Document all findings, current code analysis, and detailed implementation design in `d:\Hodoori-Beta\.agents\explorer_survey_2\analysis.md` and complete handoff in `d:\Hodoori-Beta\.agents\explorer_survey_2\handoff.md`.
5. When complete, send a message to your parent with a concise summary and path to your handoff report.
