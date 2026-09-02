## 2026-08-29T17:55:36Z
You are a Worker agent (Role: Polling, Listener & Module Implementation Specialist).
Your working directory is: d:\Hodoori-Beta\.agents\worker_m2_1
Original user request path: d:\Hodoori-Beta\.agents\ORIGINAL_REQUEST.md
Scope document: d:\Hodoori-Beta\PROJECT.md

Explorer Technical Specifications:
- d:\Hodoori-Beta\.agents\explorer_m2_1\analysis.md
- d:\Hodoori-Beta\.agents\explorer_m2_2\analysis.md
- d:\Hodoori-Beta\.agents\explorer_m2_3\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Write Ownership:
- `dashboard-admin.html`
- `dashboard-teacher.html`
- `portal-student.html`
- `portal-parent.html`
- `scripts/module-ai-agent.js`
- `scripts/utils-notifications.js`
- `scripts/core-auth.js`
- `scripts/core-db.js` (adding targeted lookup helpers with L1 cache)
- `index.html`
- `tests/test_milestone2.js`

Mission for Milestone 2 (M2):
Implement all Requirement R3 and M2 optimizations across the codebase:
1. `dashboard-admin.html`:
   - Replace 60s absence alarm polling (`lines 4181-4201`) to use cached `DB.getSettings()`, `DB.getTodayRecords()`, and in-memory student lookup to eliminate recurring cloud reads and O(N) historical scans.
   - Update `renderDailyInfo`, `renderReports`, `showFullReport(id)` to use `DB.getRecentRecords(30)` and `DB.getRecordById(id)`.
   - Add `PageLifecycleManager` to pause intervals when `document.hidden === true` and resume when visible, with clean listener cleanup on `beforeunload`.
2. `dashboard-teacher.html`:
   - Add in-memory class caching (`teacherClassesCache`, `todayRecordsCache`) so selecting and switching classes does not trigger redundant Firestore collection scans.
   - Integrate with `PageLifecycleManager`.
3. `portal-student.html` & `portal-parent.html`:
   - Eliminate notification query cascades on push notifications; mutate local state in-place and activate badge without firing new Firestore reads.
   - Use `DB.getTodayRecords()` or date-bounded helpers for attendance tabs.
4. `scripts/module-ai-agent.js`:
   - Update `getSystemContext()` (lines 539–683) to use `DB.getStudents()`, `DB.getClasses()`, `DB.getRecentRecords(30)`, `DB.getTeachers()`, and `DB.getSettings()` from L1 cache (0 cloud reads on prompts).
   - Update `_verifyDatabaseState()` to utilize cached lookups.
   - Preserve 100% Arabic NLP, fuzzy matching, tool schemas, and command loop logic.
5. `scripts/utils-notifications.js`:
   - Add multi-tenant `where('schoolId', '==', schoolId)` query filter in `subscribeToNotifications`.
   - Store and return the `unsubscribe` closure (`NotificationManager._unsubscribe` and `NotificationManager.unsubscribe()`).
   - Clean up on `beforeunload` / `pagehide`.
6. `scripts/core-auth.js` & `index.html`:
   - Replace full teacher/student scans on login with targeted single-doc or equality queries (`where('ministryId', '==', id).limit(1)`, `where('phone', '==', phone)`, etc.).
7. `scripts/core-db.js`:
   - Add helper methods `getTeacherByMinistryId`, `getStudentByAcademicId`, `getStudentsByPhone` with L1 caching and coalescing to support targeted login queries while preserving all existing methods.
8. Create and run automated verification tests in `tests/test_milestone2.js` covering all M2 features, and ensure `tests/test_core_db.js` continues to pass (100%).
9. Document your changes in `d:\Hodoori-Beta\.agents\worker_m2_1\changes.md` and complete handoff in `d:\Hodoori-Beta\.agents\worker_m2_1\handoff.md`.
10. Send a message to your parent with a concise summary and path to your handoff report when complete.
