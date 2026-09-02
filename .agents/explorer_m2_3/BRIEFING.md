# BRIEFING — 2026-08-29T20:54:55+03:00

## Mission
Develop the complete technical specification for optimizing `scripts/utils-notifications.js` and notification handling across portals for Milestone 2 (M2): strict multi-tenant scoping (`schoolId`), listener lifecycle (`unsubscribe` retention/cleanup), in-place state updates, and elimination of cascading queries.

## 🔒 My Identity
- Archetype: explorer
- Roles: Notifications & Realtime Listener Specifier
- Working directory: d:\Hodoori-Beta\.agents\explorer_m2_3
- Original parent: 34d7340d-2c81-43b1-a6db-ce6eae45f8c1
- Milestone: M2

## 🔒 Key Constraints
- Read-only investigation — do NOT implement changes in source code.
- Write analysis, specifications, and handoff reports within `d:\Hodoori-Beta\.agents\explorer_m2_3`.
- Strict multi-tenant scoping (`schoolId`) must be addressed.
- Listener lifecycle and cleanup (`unsubscribe`) must be addressed.
- Elimination of query cascades on snapshot and integration with `core-db.js` cache invalidation.

## Current Parent
- Conversation ID: 34d7340d-2c81-43b1-a6db-ce6eae45f8c1
- Updated: 2026-08-29T20:54:55+03:00

## Investigation State
- **Explored paths**:
  - `scripts/utils-notifications.js` (lines 1-223)
  - `scripts/core-db.js` (lines 1-1553, L1 caching, TTL, `getNotifications`, `invalidateCache`)
  - `portal-student.html` (lines 250-541, `checkNotifications`, event handlers)
  - `portal-parent.html` (lines 250-341, `checkNotifications`, `subscribeToAllChildren`)
  - `dashboard-admin.html`, `dashboard-teacher.html`, `scripts/module-ai-agent.js`
- **Key findings**:
  1. `subscribeToNotifications` lacked `where('schoolId', '==', schoolId)` causing cross-tenant event leaks across schools.
  2. `onSnapshot` unsubscribe closure was discarded inside an unreturned Promise chain.
  3. `portal-student.html:278` handled `new_notification_received` by calling `checkNotifications()`, triggering 3-4 un-cached Firestore queries per open client on every single notification creation.
  4. Formulated complete drop-in replacement for `scripts/utils-notifications.js`, `portal-student.html`, and `portal-parent.html` achieving 0 cloud reads on snapshot events, multi-child support, and full lifecycle cleanup.
- **Unexplored areas**: None within the Notifications & Realtime Listener scope.

## Key Decisions Made
- Scoped query with `where('schoolId', '==', schoolId)` when `schoolId` is not `'ministry'` or `'global'`.
- Implemented `NotificationManager._unsubscribe` and `NotificationManager.unsubscribe()`.
- Bound auto-cleanup to `beforeunload` and `pagehide`.
- Designed in-place array mutation (`window.studentNotifications`, `window.parentNotifications`) and direct UI re-render on snapshot event, cutting Firestore queries on push to 0.
- Integrated local cache eviction via `DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, { broadcast: false })`.

## Artifact Index
- `d:\Hodoori-Beta\.agents\explorer_m2_3\analysis.md` — Complete technical specification and replacement code.
- `d:\Hodoori-Beta\.agents\explorer_m2_3\handoff.md` — 5-component handoff report.
- `d:\Hodoori-Beta\.agents\explorer_m2_3\progress.md` — Progress tracker.
- `d:\Hodoori-Beta\.agents\explorer_m2_3\DISPATCH.md` — Dispatch message log.
