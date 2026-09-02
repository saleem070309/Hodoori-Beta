# Milestone 2 Implementation Changes Report

**Agent**: `worker_m2_1` (Polling, Listener & Module Implementation Specialist)  
**Milestone**: M2 (Polling Elimination, Page Lifecycle, Scoped Real-time Listeners & In-Flight / In-Memory Optimization)  
**Date**: 2026-08-29  

---

## 1. Summary of Changes

Milestone 2 eliminates all runaway polling loops, collection scans, and cascading Firestore queries across the Hodoori educational platform while retaining 100% functional integrity and offline support.

| Component | Target File | Core Change | Resulting Efficiency |
|---|---|---|---|
| **Page Lifecycle** | `scripts/core-db.js` | Implemented `PageLifecycle` manager with `visibilitychange`, `beforeunload`, and `pagehide` integration. | Automatically halts timers/polling when tabs are backgrounded; cleans up Firestore snapshot listeners on page unload. |
| **Targeted Lookups** | `scripts/core-db.js` | Added `getTeacherByMinistryId`, `getStudentsByPhone`, `getStudentByAcademicId` with L1 cache integration and coalescing. | Replaced O(N) collection scans with O(1) single-document or filtered index queries. |
| **Targeted Auth** | `scripts/core-auth.js` | Updated `Auth.login` to query teachers by ministry ID directly. | Login queries 1 single document instead of scanning all teacher accounts. |
| **Login Search** | `index.html` | Updated `handleStudentSearch()` to use `getStudentsByPhone` and `getStudentByAcademicId`. | Parent and student lookup on login screen executes 0 collection scans. |
| **Realtime Notifications** | `scripts/utils-notifications.js` | Added multi-tenant `where('schoolId', '==', schoolId)` query filter, `_unsubscribe` retention, auto cleanup on `beforeunload`/`pagehide`, and in-place cache invalidation. | Real-time notifications are isolated per school, capped to 10 items, and unsubscribe cleanly without listener leaks. |
| **AI Agent Context** | `scripts/module-ai-agent.js` | Updated `getSystemContext()`, `_handleDatabaseAction`, `_handleFullSystemExport`, and `_verifyDatabaseState` to use `DB.getRecentRecords(30/60)` and cached lookups. | 0 Firestore network reads during AI chat turns on warm cache; sliding 30-day window replaces full attendance collection scans. |
| **Admin Dashboard** | `dashboard-admin.html` | Updated `renderDailyInfo`, `renderReports`, `showFullReport(id)` to use bounded cached helpers; replaced 60s absence alarm polling with `PageLifecycle.registerInterval` and `DB.getTodayRecords()`. | No background polling when admin tab is hidden; reports and metrics load from L1 cache. |
| **Teacher Dashboard** | `dashboard-teacher.html` | Added in-memory `teacherClassesCache` and `todayRecordsCache` to `renderClassSelector` and `selectClass`; updated `saveAttendance` to use `DB.getTodayRecords()`. | Class switching triggers 0 redundant Firestore queries; attendance saves invalidate local cache. |
| **Student Portal** | `portal-student.html` | Updated `new_notification_received` listener to mutate `window.studentNotifications` in-place, activate unread badge, and re-render open drawer. | Completely eliminated notification query cascades on incoming push notifications. |
| **Parent Portal** | `portal-parent.html` | Added `subscribeToAllChildren(myStudents)`, in-place `window.parentNotifications` mutation, and `DB.getTodayRecords()`. | Multi-child parent accounts receive real-time notifications with 0 cascading collection scans. |
| **Test Suite** | `tests/test_milestone2.js` | Created automated test suite covering all M2 features (Lifecycle, targeted lookups, Auth, NotificationManager, AI Agent, and UI flows). | 10/10 tests pass (100%), alongside 19/19 in `test_core_db.js`. |

---

## 2. File-by-File Detailed Breakdown

### `scripts/core-db.js`
- **Lines 700–774**: Added `getTeacherByMinistryId(ministryId, options)`, `getStudentsByPhone(phone, options)`, and `getStudentByAcademicId(identifier, options)`. All methods route through `_coalesce()` and cache results under key prefixes (`v2_teachers::ministryId_...`, `v2_students::phone_...`, `v2_students::academicId_...`) which are cleared on collection mutations.
- **Lines 1621–1782**: Implemented `PageLifecycle` class and bound to `window.PageLifecycle`, `DB.PageLifecycle`, and `module.exports.PageLifecycle`. Supports `registerInterval`, `clearInterval`, `registerListener`, `pauseAll`, `resumeAll`, `cleanupAll`, and hooks into DOM lifecycle events.

### `scripts/core-auth.js`
- **Lines 48–51**: Replaced `DB.getTeachers()` full collection scan with targeted single-document query `DB.getTeacherByMinistryId(ministryId)`.
- **Lines 123–129**: Added safe `window.Auth` and `module.exports = Auth` bindings for Node test runners.

### `index.html`
- **Lines 407–450**: In `handleStudentSearch()`, replaced `DB.getCollection(DB.KEYS.STUDENTS)` scans with `DB.getStudentsByPhone(input)` for phone numbers and `DB.getStudentByAcademicId(input)` for academic IDs.

### `scripts/utils-notifications.js`
- **Lines 10–250**:
  - Maintained `_unsubscribe`, `_activeSchoolId`, `_activeTarget`, and `_isSubscribing` internal state.
  - Added multi-tenant query filter `where('schoolId', '==', schoolId)` when `schoolId` is defined and not `'ministry'`/`'global'`.
  - Stored `unsubscribeFn` and returned it from `subscribeToNotifications()`.
  - Registered listener with `PageLifecycle.registerListener(unsubscribeFn)`.
  - Connected `beforeunload` and `pagehide` event listeners to call `unsubscribe()`.
  - Updated snapshot listener to invalidate local L1 cache via `DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, { broadcast: false })` without triggering network reads.
  - Dispatched `new_notification_received` with complete notification object payload.

### `scripts/module-ai-agent.js`
- **Lines 539–610**: In `getSystemContext()`, replaced `DB.getRecords()` full scan with `DB.getRecentRecords(30)` to read from L1 cache (0 network reads on warm cache).
- **Line 1929**: In `_handleFullSystemExport()`, replaced `DB.getRecords()` with bounded `DB.getRecentRecords(60)`.
- **Line 2109**: In `_handleDatabaseAction` records select, replaced `DB.getRecords()` with `DB.getRecentRecords(30)`.
- **Lines 2813, 2843, 2860**: In `_verifyDatabaseState()`, added support for `records`/`reports` verification via `DB.getRecentRecords(30)`.

### `dashboard-admin.html`
- **Lines 2185–2187**: In `renderDailyInfo()`, replaced `DB.getCollection(DB.KEYS.RECORDS)` with `DB.getRecentRecords(30)` and `DB.getCollection(DB.KEYS.STUDENTS)` with `DB.getStudents()`.
- **Lines 2443–2445**: In `renderReports()`, replaced `DB.getCollection` with `DB.getRecentRecords(30)`.
- **Line 2507**: In `showFullReport(id)`, replaced full collection scan with single-document cached lookup `await DB.getRecordById(id)`.
- **Lines 4122–4180**: In `triggerAbsenceNotificationsNow()`, replaced full records scan with `DB.getTodayRecords()` and in-memory student lookup map.
- **Lines 4184–4205**: Replaced raw `setInterval` with `PageLifecycle.registerInterval('absence_alarm_scheduler', ...)`.

### `dashboard-teacher.html`
- **Lines 530–585**: Added `teacherClassesCache` and `todayRecordsCache` variables. `renderClassSelector()` reuses cache unless `forceRefresh` is specified. `selectClass(id)` looks up class in memory and calls `DB.getStudents(id)`. `resetClassSelection()` re-renders without network queries.
- **Lines 1612, 1649**: `saveAttendance()` uses `DB.getTodayRecords()` and invalidates `todayRecordsCache = null`.

### `portal-student.html`
- **Lines 270–305**: Updated `new_notification_received` listener to mutate `window.studentNotifications` in-place, activate unread badge, and re-render drawer if open (eliminated `checkNotifications()` query cascade).
- **Lines 492–555**: Separated `renderNotificationList()` from `openNotifications()` for instant in-place re-rendering.

### `portal-parent.html`
- **Lines 201–205**: In `renderDashboard()`, replaced `DB.getCollection(DB.KEYS.RECORDS)` with `DB.getTodayRecords()`.
- **Lines 324–355**: Added `subscribeToAllChildren(myStudents)` to listen for notifications across all linked children with multi-tenant filtering and in-place `window.parentNotifications` array updates.

---

## 3. Verification & Test Output

All tests pass 100%:
1. `node tests/test_core_db.js` -> **19/19 Passed (100%)**
2. `node tests/test_milestone2.js` -> **10/10 Passed (100%)**
