# Milestone 2 (M2) Review & Adversarial Challenge Report

**Reviewer Agent**: `reviewer_m2_2` (AI Agent & Notification Architecture Reviewer / Adversarial Critic)  
**Parent Conversation ID**: `34d7340d-2c81-43b1-a6db-ce6eae45f8c1`  
**Date**: 2026-08-29  
**Target Milestone**: M2 (Polling Elimination, Page Lifecycle, Scoped Real-time Listeners & In-Flight / In-Memory Optimization)  

---

## 1. Review Summary

**Verdict**: **`APPROVE`**

The implementation of Milestone 2 across `scripts/module-ai-agent.js`, `scripts/utils-notifications.js`, `scripts/core-db.js`, `scripts/core-auth.js`, `portal-student.html`, `portal-parent.html`, `dashboard-admin.html`, `dashboard-teacher.html`, and `index.html` adheres to all architectural requirements and quality standards:
1. **AI Agent Context Caching**: `getSystemContext()` concurrently reads from `DB.getStudents()`, `DB.getClasses()`, `DB.getRecentRecords(30)`, `DB.getTeachers()`, and `DB.getSettings()`. All 5 calls route through `core-db.js` L1 caching, resulting in **0 cloud reads** during chat turns on warm cache.
2. **Multi-Tenant Realtime Notifications**: `NotificationManager.subscribeToNotifications` rigorously enforces `where('schoolId', '==', schoolId)` scoping, caps query results to 10 entries with descending timestamp ordering, holds `_unsubscribe`, and integrates with `PageLifecycle` and `beforeunload`/`pagehide` for leak-free unsubscription.
3. **In-Place Mutation & Query Storm Elimination**: `portal-student.html` and `portal-parent.html` mutate local in-memory notification arrays directly upon receiving push events, update UI badges, and re-render without triggering Firestore collection re-queries.
4. **Integrity & Authenticity**: No hardcoded test results, facade mocks, or shortcuts exist in implementation files. Real data flows, real TTL caching, and real filtering semantics are verified.

---

## 2. Findings

### [Good Practice] Bounded Sliding Window for AI Context & Exports
- **Location**: `scripts/module-ai-agent.js:545`, `1929`, `2109`
- **Details**: Replaced unbounded historical attendance queries (`DB.getRecords()`) with sliding 30-day/60-day windows (`DB.getRecentRecords(30/60)`). This prevents Firestore billing blowups and avoids LLM prompt token exhaustion as school attendance data scales over multi-year terms.

### [Good Practice] Defensive Resource Lifecycle Management
- **Location**: `scripts/core-db.js:1621-1766`, `scripts/utils-notifications.js:27-28`
- **Details**: `PageLifecycle` hooks into `visibilitychange` to freeze intervals when tabs are hidden, reducing background client CPU and network polling to zero. Listeners registered with `registerListener` are cleaned up deterministically during navigation.

### [Minor Finding / Non-Blocking Note] Firestore Multi-Tenant Composite Index
- **Location**: `scripts/utils-notifications.js:249-254`
- **Details**: The compound query `collection('v2_notifications').where('schoolId', '==', schoolId).orderBy('timestamp', 'desc').limit(10)` requires a composite index `(schoolId ASC, timestamp DESC)` in Firestore cloud production. In standard Firestore behavior, un-indexed composite queries trigger an exception with an auto-generated index creation URL in console.
- **Suggestion**: Ensure production Firebase deployment includes `firestore.indexes.json` with this definition during release staging.

---

## 3. Verified Claims

| Claim | Verification Method | Result |
|---|---|---|
| `getSystemContext()` reads 5 DB collections via L1 cache (0 cloud reads during chat turns) | Inspected `scripts/module-ai-agent.js:542-638`; ran `node tests/test_milestone2.js` Section 4 (4 consecutive chat context builds executed with 0 Firestore network queries) | **PASS** |
| `subscribeToNotifications` scopes with `where('schoolId', '==', schoolId)` | Inspected `scripts/utils-notifications.js:248-251`; verified query recording in `test_milestone2.js` Section 3 | **PASS** |
| `subscribeToNotifications` manages `_unsubscribe` and cleans up on unload | Inspected `scripts/utils-notifications.js:27-28, 319-354`; verified unsubscription test in `test_milestone2.js` | **PASS** |
| Push handling in `portal-student.html` and `portal-parent.html` mutates in-place | Inspected `portal-student.html:280-302` and `portal-parent.html:352-370`; confirmed absence of `checkNotifications()` inside event handlers | **PASS** |
| Targeted login query in `core-auth.js` | Inspected `scripts/core-auth.js:49`; verified single doc query with limit(1) in `test_milestone2.js` Section 2 | **PASS** |
| Absence alarm scheduler runs on `PageLifecycle` | Inspected `dashboard-admin.html:4206-4228`; verified interval pause/resume and in-memory student mapping | **PASS** |
| Automated test suite 100% pass | Executed `node tests/test_core_db.js` (19/19) and `node tests/test_milestone2.js` (10/10) | **PASS** (29/29 total) |

---

## 4. Adversarial Stress-Testing & Attack Surface Analysis

### Challenge 1: Memory Bloat / Stale Cache in Single-Page Navigation
- **Stress-Test Scenario**: Rapid class switching on `dashboard-teacher.html` or rapid AI chat queries.
- **Outcome**: `teacherClassesCache` and `todayRecordsCache` are invalidated automatically on `saveAttendance()`. AI Agent context calls `DB.getRecentRecords(30)` which is bound to `KEYS.RECORDS` L1 TTL cache (10 minutes) and invalidated upon write.
- **Result**: **PASS (Robust)**

### Challenge 2: Cross-Tenant Data Leakage in Realtime Notifications
- **Stress-Test Scenario**: Tenant A receives broadcast notifications from Tenant B.
- **Outcome**: `subscribeToNotifications` binds `where('schoolId', '==', schoolId)` at the query level, preventing Firestore from delivering other schools' events over WebSocket. Client-side `_isTargetMatch` further validates `targetId`, `classId`, and `studentIds`.
- **Result**: **PASS (Robust)**

### Challenge 3: Empty Database / Malformed Records Edge Cases
- **Stress-Test Scenario**: Running `getSystemContext()` and `_isTargetMatch` with empty tables, null fields, or invalid target descriptors.
- **Outcome**: Handled gracefully with fallback values (`lastReportSummary = "لا يوجد تقارير مسجلة بعد."`, `studentsList = ""`). No unhandled promise rejections or null pointer exceptions.
- **Result**: **PASS (Robust)**

---

## 5. Integrity Audit

- **Hardcoded test answers**: None found. Mocks in `tests/test_milestone2.js` simulate full Firestore query semantics (filtering, limits, sorting, snapshot streams) with query count tracking.
- **Facade implementations**: None found. All methods in `scripts/core-db.js`, `scripts/module-ai-agent.js`, and `scripts/utils-notifications.js` contain complete business logic and caching rules.
- **Bypassed work**: None. All requirements in Milestone 2 are fully realized.

---

## 6. Verdict

**`APPROVE`** — All Milestone 2 requirements have been verified, independently tested, and validated against performance, architectural, and adversarial criteria.
