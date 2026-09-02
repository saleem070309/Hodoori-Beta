# Milestone 2 (M2) Adversarial Challenge & Stress Test Report

**Challenger**: `challenger_m2_1` (Role: Polling & Visibility Stress Challenger)  
**Target Milestone**: M2 (Polling Elimination, Page Lifecycle, Targeted Lookups & Dashboard Optimization)  
**Execution Script**: `d:\Hodoori-Beta\.agents\challenger_m2_1\stress_m2.js`  
**Verdict**: **APPROVE**  

---

## 1. Challenge Summary

**Overall risk assessment**: **LOW** (Empirically verified across 13/13 adversarial stress scenarios with 100% pass rate).

The M2 implementation changes submitted by `worker_m2_1` were subjected to intensive adversarial load testing, including 100 rapid visibility toggle cycles, repeated background scheduler executions under warm/cold caches, 200 rapid classroom switches, and 100-request concurrent auth bursts.

---

## 2. Adversarial Challenges & Empirical Stress Results

### [Low Risk] Challenge 1: Timer Execution & Leaks Under 100 Rapid Tab Visibility Toggles
- **Assumption challenged**: `PageLifecycle` might leak active `setInterval` handles or fire timer callbacks during rapid visibility toggles (hidden <-> visible), causing phantom background execution or timer drift.
- **Attack scenario**: 5 concurrent interval timers (5ms, 10ms, 15ms, 20ms, 30ms) subjected to 100 alternating visibility state transitions (`document.hidden = true` -> `pauseAll()`, `document.hidden = false` -> `resumeAll()`) with sub-millisecond switching.
- **Blast radius**: If timers fired while hidden, background tabs would consume battery/network and violate the zero-background-polling contract.
- **Empirical result**: 
  - Executions while `document.hidden === true`: **0** (Invariant preserved).
  - Post-resume active executions: **Confirmed normal resumption without timer accumulation or orphan timers**.
  - Duplicate timer overwrite stress (50 rapid overwrites of the same ID): **0 stale callbacks fired; exactly 1 active timer retained**.
  - Result: **PASS**

### [Low Risk] Challenge 2: Background Cloud Read Leaks in Absence Alarm Scheduler
- **Assumption challenged**: The 60-second absence alarm scheduler in `dashboard-admin.html` might cause continuous Firestore `.get()` reads on every tick even when settings and records are unchanged.
- **Attack scenario**: 50 consecutive virtual scheduler ticks executed with pre-warmed L1 cache. Time matching evaluated against scheduled hour, days array, and `lastAlarmSentDate`.
- **Blast radius**: Excessive Firestore billable read operations from long-open admin dashboard tabs.
- **Empirical result**:
  - Cold read count: **1** (primes settings cache).
  - Warm read count across 50 ticks: **0 Firestore queries** (100% L1 cache hits).
  - Date-lock protection: Alarm triggered on schedule, created exactly 1 batch of parent notifications, updated `lastAlarmSentDate`, and strictly bypassed duplicate sends on all subsequent 20 ticks.
  - Corrupted/empty settings: Evaluated against `null`, `{}`, missing customization, and empty class lists without throwing exceptions.
  - Result: **PASS**

### [Low Risk] Challenge 3: In-Memory Teacher Class Selector State Inconsistency & Query Cascade
- **Assumption challenged**: Rapid classroom switching in `dashboard-teacher.html` could bypass in-memory caches, flood Firestore with `getClasses()` / `getStudents()` queries, or leave stale locked badges after attendance submission.
- **Attack scenario**: 200 rapid alternating class selection and reset operations across 20 distinct classes, followed by an attendance save and cache invalidation cycle.
- **Blast radius**: High read volume and sluggish UI during high-frequency classroom switching; desynchronized attendance status badges.
- **Empirical result**:
  - 200 rapid switches generated **0 Firestore queries** (100% served from `teacherClassesCache` and L1 student cache).
  - Saving attendance properly invalidated `todayRecordsCache = null`, triggered exactly 1 query to refresh `getTodayRecords()`, locked the class card (`isSent = true`), and re-cached state.
  - 50 concurrent selection promises in flight resolved in parallel with 0 race conditions or state corruption.
  - Result: **PASS**

### [Low Risk] Challenge 4: Target Login Request Coalescing Under High-Concurrency Bursts
- **Assumption challenged**: Simultaneous login attempts from users or rapid UI clicks could bypass L1 caching and cause redundant database lookups or fallback to unindexed scans.
- **Attack scenario**: 
  - 100 concurrent `Auth.login('998877', 'pass')` calls fired simultaneously.
  - 50 distinct teacher login calls fired in parallel.
  - Edge cases: Ministry super-account (`MOE2025`), blocked accounts, non-existent ministry IDs, and whitespace-padded phone/academic IDs.
- **Blast radius**: Server query spike during morning rush hour login periods.
- **Empirical result**:
  - 100 concurrent logins for the same teacher coalesced into **EXACTLY 1 targeted Firestore query** (`.where('ministryId', '==', '998877').limit(1)`).
  - 50 distinct logins executed **50 single-doc targeted queries** (0 full table scans).
  - Ministry super-account required **0 Firestore queries**.
  - Blocked accounts correctly blocked with informative status message.
  - Whitespace-padded lookups trimmed and matched accurately.
  - Result: **PASS**

---

## 3. Stress Test Results Matrix

| # | Section | Stress Test Scenario | Expected Behavior | Actual Behavior | Result |
|---|---|---|---|---|---|
| 1 | `PageLifecycle` | 100 Rapid Visibility Toggles (5 concurrent timers) | 0 executions while hidden; clean resume | 0 hidden executions; clean resume | **PASS** (1498ms) |
| 2 | `PageLifecycle` | Interval registered while hidden | Remains paused until page becomes visible | Paused immediately; executed on resume | **PASS** (79ms) |
| 3 | `PageLifecycle` | Overwriting same interval ID 50 times | Exactly 1 active timer; 0 stale callbacks | 0 stale callbacks; 1 active timer | **PASS** (55ms) |
| 4 | `PageLifecycle` | 100 listener registrations & bulk `cleanupAll` | All 100 unsubscribers called once; set cleared | 100 unsubs called; 0 listeners remaining | **PASS** (1ms) |
| 5 | `AbsenceAlarm` | 50 repeated scheduler ticks on warm cache | 0 Firestore reads across 50 ticks | 0 Firestore reads | **PASS** (2ms) |
| 6 | `AbsenceAlarm` | Alarm schedule match & date-lock | 1 notification write; 0 duplicate sends | Exactly 1 write; locked against repeat | **PASS** (2ms) |
| 7 | `AbsenceAlarm` | Corrupted / empty settings resilience | No exceptions thrown | Handled gracefully | **PASS** (0ms) |
| 8 | `TeacherClassSelector` | 200 rapid class switches across 20 classes | 0 Firestore queries | 0 Firestore queries | **PASS** (5ms) |
| 9 | `TeacherClassSelector` | Attendance save cache invalidation lifecycle | Invalidates `todayRecordsCache`, locks card | Successfully locks card and re-caches | **PASS** (1ms) |
| 10 | `TeacherClassSelector` | 50 concurrent class selection burst | All 50 resolve cleanly without state race | 50/50 resolved cleanly | **PASS** (2ms) |
| 11 | `TargetedAuth` | 100 concurrent logins (same ministry ID) | Coalesces to 1 targeted Firestore query | Exactly 1 query dispatched | **PASS** (1ms) |
| 12 | `TargetedAuth` | 50 distinct teacher concurrent logins | 50 targeted single-doc queries (0 scans) | 50 single-doc queries (0 scans) | **PASS** (1ms) |
| 13 | `TargetedAuth` | Edge cases (Ministry root, blocked, trims) | 0 queries for root, blocked rejected, trims work | Invariants verified | **PASS** (0ms) |

---

## 4. Unchallenged Areas

- **Native Mobile OS Deep Sleep / Webview Suspension**: While standard `visibilitychange`, `pagehide`, and `beforeunload` events were thoroughly simulated, hardware-level OS process suspension (iOS WKWebView freezing) relies on browser engine compliance with standard W3C Page Visibility APIs.
