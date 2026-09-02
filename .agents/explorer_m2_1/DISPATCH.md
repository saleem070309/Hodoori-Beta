## 2026-08-29T17:53:08Z
You are an Explorer agent (Role: Dashboard Polling & Lifecycle Specifier).
Your working directory is: d:\Hodoori-Beta\.agents\explorer_m2_1
Original user request path: d:\Hodoori-Beta\.agents\ORIGINAL_REQUEST.md
Scope document: d:\Hodoori-Beta\PROJECT.md
Survey analysis: d:\Hodoori-Beta\.agents\explorer_survey_3\analysis.md
Core DB implementation: d:\Hodoori-Beta\scripts\core-db.js

Mission for Milestone 2 (M2):
Develop the complete technical specification for optimizing background intervals, rendering routines, lifecycle management, and login queries across:
- `dashboard-admin.html`
- `dashboard-teacher.html`
- `portal-student.html`
- `portal-parent.html`
- `scripts/core-auth.js`
- `index.html`

Your tasks:
1. Absence Alarm Interval (`dashboard-admin.html:4181-4201`): Specify conversion from direct Firestore calls to local cached settings (`DB.getSettings()`) and date-bounded attendance queries (`DB.getTodayRecords(r.classId)`), eliminating recurring cloud reads.
2. Render Deduplication & Startup (`dashboard-admin.html`, `dashboard-teacher.html`): Specify clean integration with `core-db.js` caching so `renderAll` and tab switches reuse cached data without re-fetching.
3. Page Visibility & Lifecycle (`PageLifecycleManager`): Specify lifecycle management to pause background intervals/timers when `document.hidden === true`, resume when visible, and clean up listeners on page unload.
4. Login & Search Queries (`scripts/core-auth.js`, `index.html`): Specify replacing full collection scans on login with targeted single-doc or equality queries (`where('ministryId', '==', id).limit(1)`).
5. Document all specifications in `d:\Hodoori-Beta\.agents\explorer_m2_1\analysis.md` and complete handoff in `d:\Hodoori-Beta\.agents\explorer_m2_1\handoff.md`.
6. Send a message to your parent with a concise summary and path to your handoff report.
