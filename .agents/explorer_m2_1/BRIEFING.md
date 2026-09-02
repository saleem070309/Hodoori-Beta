# BRIEFING — 2026-08-29T17:55:20Z

## Mission
Develop complete technical specification for optimizing background intervals, rendering routines, lifecycle management, and login queries across dashboard and portal pages for Milestone 2 (M2).

## 🔒 My Identity
- Archetype: Explorer
- Roles: Dashboard Polling & Lifecycle Specifier, Read-only investigation and technical specifier
- Working directory: d:\Hodoori-Beta\.agents\explorer_m2_1
- Original parent: 34d7340d-2c81-43b1-a6db-ce6eae45f8c1
- Milestone: Milestone 2 (M2)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source files.
- Produce technical specifications, diffs/replacement snippets, and handoff report.
- Adhere strictly to project conventions in PROJECT.md and core-db.js.

## Current Parent
- Conversation ID: 34d7340d-2c81-43b1-a6db-ce6eae45f8c1
- Updated: 2026-08-29T17:55:20Z

## Investigation State
- **Explored paths**:
  - `dashboard-admin.html` (lines 2050-2820, 3700-3740, 4120-4215, 4450-4510)
  - `dashboard-teacher.html` (lines 470-600, 767, 1600-1625)
  - `portal-student.html` (lines 220-320, 440-475)
  - `portal-parent.html` (lines 190-280)
  - `scripts/core-auth.js` (lines 1-122)
  - `scripts/utils-notifications.js` (lines 1-223)
  - `scripts/module-ai-agent.js` (lines 525-580)
  - `index.html` (lines 300-450)
  - `scripts/core-db.js` (lines 1-900)
  - `tests/test_core_db.js` (verified 19/19 tests passing)
- **Key findings**:
  1. Absence alarm interval at `dashboard-admin.html:4181` is unthrottled and triggers full historical scans via `DB.getCollection(DB.KEYS.RECORDS)` with $O(N)$ student queries.
  2. `window.renderAll()` fires 6 parallel rendering routines with direct collection scans.
  3. Zero page visibility and lifecycle handlers exist across the entire frontend.
  4. `Auth.login` and `handleStudentSearch` on `index.html` perform full collection scans across teachers and students without targeted equality/limit queries.
  5. `NotificationManager.subscribeToNotifications` lacks tenant scoping and loses its unsubscribe callback.
- **Unexplored areas**: None. All target files and tasks have been completely analyzed and specified.

## Key Decisions Made
- Designed universal `PageLifecycleManager` with visibility change detection, interval pausing/resumption, and unload listener cleanup.
- Specified targeted helper queries in `core-db.js` (`DB.getTeacherByMinistryId`, `DB.getStudentByAcademicId`, `DB.getStudentsByPhone`).
- Specified date-bounded attendance reads (`DB.getTodayRecords`, `DB.getRecentRecords(30)`) and in-memory student mapping for absence notifications.

## Artifact Index
- `d:\Hodoori-Beta\.agents\explorer_m2_1\analysis.md` — Complete Technical Specification
- `d:\Hodoori-Beta\.agents\explorer_m2_1\handoff.md` — 5-component Handoff Report
- `d:\Hodoori-Beta\.agents\explorer_m2_1\progress.md` — Liveness progress heartbeat
