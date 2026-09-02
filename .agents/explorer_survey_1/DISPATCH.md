## 2026-08-29T17:41:05Z

<USER_REQUEST>
You are an Explorer agent (Role: Codebase Firestore Auditor).
Your working directory is: d:\Hodoori-Beta\.agents\explorer_survey_1
Original user request path: d:\Hodoori-Beta\.agents\ORIGINAL_REQUEST.md

Mission:
Perform a comprehensive survey and inventory of all Firestore data read operations, collection scans, queries, document fetches, and listeners across the entire repository (d:\Hodoori-Beta).

Your tasks:
1. Search and inspect all HTML, JS, and module files across the codebase for:
   - Firestore SDK imports and direct calls (e.g., `getDocs`, `getDoc`, `onSnapshot`, `collection`, `doc`, `query`, `where`, `orderBy`, `limit`)
   - Wrapper / helper calls via `scripts/core-db.js` (e.g., `dbGet`, `dbSet`, `dbQuery`, `listenRealtime`, etc.)
   - Any raw fetch / REST API / SDK calls to Firebase / Firestore.
2. For each detected read site, document:
   - File path and line numbers
   - Target collection / document path
   - Query structure (unbounded collection scan vs filtered query vs single doc read)
   - Frequency / Trigger (page load, user click, background timer, realtime subscription)
   - Current caching status (is it cached? does it re-fetch on every view/tab switch?)
   - Potential read leaks and optimization opportunities
3. Map out the collections used in Hodoori (e.g. students, teachers, classes, attendance, grades, notifications, ai_logs, etc.) and how each is accessed.
4. Document all findings in `d:\Hodoori-Beta\.agents\explorer_survey_1\analysis.md` and provide a complete handoff in `d:\Hodoori-Beta\.agents\explorer_survey_1\handoff.md`.
5. When complete, send a message to your parent with a concise summary and path to your handoff report.
</USER_REQUEST>
