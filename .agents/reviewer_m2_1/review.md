# Milestone 2 (M2) Quality & Adversarial Review Report

**Reviewer**: Senior Frontend & Polling Reviewer & Critic  
**Working Directory**: `d:\Hodoori-Beta\.agents\reviewer_m2_1`  
**Target Milestone**: M2 — Polling Elimination, Page Lifecycle, Scoped Real-time Listeners & In-Memory Optimization  
**Date**: 2026-08-29  

---

## 1. Review Summary

**Verdict**: **APPROVE**  
**Overall Risk Assessment**: **LOW**

The implementation of Milestone 2 meets all architectural, performance, and integrity requirements outlined in `PROJECT.md` and the user specification:
1. **Background Polling & Timer Management**: All unmanaged timers have been converted to `PageLifecycle.registerInterval`, pausing on background tabs (`document.hidden === true`) and restoring upon visibility.
2. **0 Cloud Reads on Unchanged Polling**: The 60s absence alarm scheduler in `dashboard-admin.html` operates against cached settings (`DB.getSettings()`) and bounded single-day records (`DB.getTodayRecords()`) with in-memory student mapping.
3. **Single-Document Targeted Queries**: Full collection scans during authentication and student search (`DB.getTeachers()`, `DB.getCollection('students')`) have been replaced with targeted single-document queries (`DB.getTeacherByMinistryId`, `DB.getStudentsByPhone`, `DB.getStudentByAcademicId`) with L1 caching and coalescing.
4. **Tenant-Scoped Real-time Listeners**: Real-time snapshot listeners in `scripts/utils-notifications.js` are strictly filtered by `schoolId`, capped at 10 items, retain unsubscribe closures, and clean up automatically on page lifecycle events.
5. **Elimination of Cascading Queries**: Portal notifications mutate local arrays (`studentNotifications`, `parentNotifications`) in-place, eliminating secondary Firestore queries on incoming push notifications.
6. **Integrity & Test Verification**: Automated test suites (`test_core_db.js` and `test_milestone2.js`) run cleanly and independently verify real functional logic (100% pass rate).

---

## 2. Integrity & Adversarial Assessment

| Integrity Check Dimension | Status | Evidence / Verification |
|---|---|---|
| **Hardcoded Test Assertions** | **CLEAN** | Mock Firestore in tests simulates query execution, filtering, limit, sorting, snapshot streams, and in-flight deduplication. No hardcoded results in source files. |
| **Dummy / Facade Code** | **CLEAN** | `PageLifecycle`, `NotificationManager`, `Auth.login`, and `DB.getTeacherByMinistryId` execute genuine state management, query building, and cache invalidation. |
| **Task Bypassing / Shortcuts** | **CLEAN** | All UI flows (`dashboard-admin.html`, `dashboard-teacher.html`, `portal-student.html`, `portal-parent.html`, `index.html`) were inspected directly and properly integrate the optimized APIs. |
| **Self-Certifying Verification** | **CLEAN** | Tests were independently executed via Node.js CLI with 0 failed assertions. |

---

## 3. Verified Claims & Test Matrix

| Component / Claim | Verification Method | Result | Notes |
|---|---|---|---|
| **PageLifecycle Interval Pausing** | `test_milestone2.js:318` + Code Inspection | **PASS** | Timer IDs are nulled on `document.hidden = true` and restored on resume; zero callbacks execute while hidden. |
| **PageLifecycle Listener Teardown** | `test_milestone2.js:363` + Code Inspection | **PASS** | `cleanupAll()` fires all registered unsubscribe closures on `beforeunload` and `pagehide`. |
| **Targeted Teacher Login Query** | `test_milestone2.js:385`, `428` + Code Inspection | **PASS** | Executes `where('ministryId', '==', ...).limit(1)`; second call hits L1 cache with 0 network queries; parallel calls coalesce into 1 query. |
| **Targeted Parent/Student Lookups** | `test_milestone2.js:462` + Code Inspection | **PASS** | `getStudentsByPhone` and `getStudentByAcademicId` query filtered indices and cache results in memory. |
| **Multi-Tenant Notification Scoping** | `test_milestone2.js:500` + Code Inspection | **PASS** | Query enforces `where('schoolId', '==', schoolId).orderBy('timestamp', 'desc').limit(10)` and retains unsubscribe handle. |
| **In-Place UI Updates on Notification** | `portal-student.html:280`, `portal-parent.html:352` | **PASS** | Incoming notifications mutate `window.studentNotifications` in-place, trigger UI badges, and avoid secondary Firestore reads. |
| **AI Agent Prompt Context Caching** | `test_milestone2.js:555` | **PASS** | 4 consecutive AI prompt context builds execute with 0 network reads on warm L1 cache. |
| **Teacher Dashboard In-Memory Caching** | `dashboard-teacher.html:530-585` | **PASS** | Class switching reuses `teacherClassesCache` and `todayRecordsCache`, clearing cache only upon attendance submission. |
| **Admin Absence Alarm Bounded Query** | `dashboard-admin.html:4122-4228` | **PASS** | Uses `DB.getTodayRecords()` and in-memory student lookup map. Registered with `PageLifecycle`. |

---

## 4. Adversarial Stress-Testing & Attack Scenarios

### Challenge 1: Rapid Background / Foreground Tab Toggling
- **Scenario**: User rapidly switches browser tabs or minimizes window multiple times in rapid succession.
- **Analysis**: In `scripts/core-db.js:1638`, `visibilitychange` evaluates `wasHidden = !this.isPageVisible`. If `document.hidden === true`, `pauseAll()` clears interval timer IDs. If visible, `resumeAll()` resets `desc.lastRun = now` and calculates whether the interval duration has elapsed.
- **Outcome**: No duplicate interval timers or leaked handles are created.

### Challenge 2: Multi-Tab Admin Alarm Race Conditions
- **Scenario**: Administrator opens multiple dashboard tabs at 07:59 AM before the scheduled 08:00 AM alarm.
- **Analysis**: When 08:00 AM hits, the first tab to trigger sets `settings.lastAlarmSentDate = todayStr` and writes to `DB.saveSettings(settings)`. `saveSettings` broadcasts cache invalidation over `BroadcastChannel` to peer tabs. Peer tabs update their cached settings, seeing `settings.lastAlarmSentDate === todayStr` and skipping duplicate alarms.
- **Outcome**: Robust deduplication across browser tabs.

### Challenge 3: Rapid Subscriptions in NotificationManager
- **Scenario**: Component re-mounts or invokes `subscribeToNotifications` multiple times quickly.
- **Analysis**: `subscribeToNotifications` explicitly calls `this.unsubscribe()` at entry, tearing down existing snapshot listeners before attaching a new one.
- **Outcome**: Listener leaks prevented.

---

## 5. Non-Blocking Recommendations (Future Optimization)

1. **Firestore Composite Index Notice**: In production Firebase Firestore, executing `where('schoolId', '==', schoolId).orderBy('timestamp', 'desc')` requires a composite index on `(schoolId ASC, timestamp DESC)`. If not already configured in Firebase Console, a direct link will appear in the developer console on first run.
2. **Storage of Local Notification Counts**: In `portal-parent.html:324`, `parent_notif_count` is stored globally in `localStorage`. If multiple parents share a single browser profile, isolating by phone number key (`parent_notif_count_${phone}`) is recommended in future polish iterations.

---

## 6. Verdict

**FINAL VERDICT**: **APPROVE**  
Milestone 2 is verified complete, robust, performant, and fully compliant with project standards.
