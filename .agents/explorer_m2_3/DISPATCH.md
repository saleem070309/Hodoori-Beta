## 2026-08-29T17:53:08Z

<USER_REQUEST>
You are an Explorer agent (Role: Notifications & Realtime Listener Specifier).
Your working directory is: d:\Hodoori-Beta\.agents\explorer_m2_3
Original user request path: d:\Hodoori-Beta\.agents\ORIGINAL_REQUEST.md
Scope document: d:\Hodoori-Beta\PROJECT.md
Survey analysis: d:\Hodoori-Beta\.agents\explorer_survey_3\analysis.md
Core DB implementation: d:\Hodoori-Beta\scripts\core-db.js

Mission for Milestone 2 (M2):
Develop the complete technical specification for optimizing `scripts/utils-notifications.js` and notification handling across portals:
1. Scoped Realtime Listener (`scripts/utils-notifications.js:184-217`):
   - Add strict multi-tenant scoping `where('schoolId', '==', schoolId)` to `onSnapshot` query.
   - Retain and return the `unsubscribe` function to allow proper cleanup on portal unload or tenant switch.
2. In-Place State Updates & Cascading Query Elimination:
   - When a new notification snapshot arrives, update local notification state in-place and invalidate local `v2_notifications` cache in `core-db.js` instead of triggering a 3-4 query cascade in `portal-student.html:278`.
3. Document all specifications in `d:\Hodoori-Beta\.agents\explorer_m2_3\analysis.md` and complete handoff in `d:\Hodoori-Beta\.agents\explorer_m2_3\handoff.md`.
4. Send a message to your parent with a concise summary and path to your handoff report.
</USER_REQUEST>
