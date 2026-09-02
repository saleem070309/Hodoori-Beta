# Comprehensive Audit Report: Background Timers, Intervals, Polling Loops, Listeners & Lifecycle (Requirement R3)

**Author:** Explorer Agent (Polling and Interval Auditor)  
**Date:** 2026-08-29  
**Scope:** `dashboard-admin.html`, `dashboard-teacher.html`, `dashboard-ministry.html`, `agent.html`, `portal-student.html`, `portal-parent.html`, `index.html`, `scripts/module-ai-agent.js`, `scripts/utils-notifications.js`, `scripts/core-db.js`, `scripts/module-face-api.js`, `scripts/utils-thinking-orbs.js`, `scripts/module-telemetry.js`  
**Milestone:** Milestone 1 — Discovery & Codebase Audit (Requirement R3)

---

## 1. Executive Summary

Requirement R3 mandates auditing, profiling, and eliminating all un-cached background polling loops, redundant realtime listeners, un-bounded Firestore scans, and memory/timer lifecycle leaks across the Hodoori educational platform.

During this investigation, **5 critical cloud read leaks and lifecycle vulnerabilities** were identified:
1. **Un-cached 60-Second Background Scheduler (`dashboard-admin.html:4181`)**: Recurring 1-minute `setInterval` executing direct Firestore cloud reads (`DB.getSettings()`) 24/7 without visibility throttling. When triggered, it executes an unbounded historical scan of the entire `v2_records` collection plus per-class student queries in a loop.
2. **AI Agent Context Cloud Query Storm (`scripts/module-ai-agent.js:539`)**: `getSystemContext()` fetches all students, classes, records, teachers, and settings from Firestore on every initialization, chat reset, user message send, and tool execution.
3. **Un-scoped Real-Time Snapshot Listener & Cascade Query Leak (`scripts/utils-notifications.js:189`, `portal-student.html:278`)**: `onSnapshot` lacks a `schoolId` multi-tenant filter, leaks cross-tenant events, discards its unsubscribe callback, and triggers a cascade of 3–4 new un-cached Firestore queries on every notification event.
4. **Initial Load / Tab Redundancy (`dashboard-admin.html:2161`, `dashboard-teacher.html:531,571`)**: Parallel render routines fire 15–20 simultaneous full collection queries on page load and class navigation without in-memory caching or in-flight promise deduplication.
5. **Absence of Page Visibility & Lifecycle Cleanup**: Zero `visibilitychange` or `pagehide`/`beforeunload` lifecycle managers exist. Background timers continue executing in hidden tabs, and `ThinkingOrbs` runs an un-cancelled `requestAnimationFrame` loop.

---

## 2. Complete Inventory of Timers, Loops, Listeners & Lifecycle

### 2.1. `setInterval` Inventory

| File | Line | Interval / Frequency | Code Snippet | Purpose | Cloud Read Impact & Assessment |
|---|---|---|---|---|---|
| `dashboard-admin.html` | 4181 | `60,000 ms` (1 min) | `setInterval(async () => { const settings = (await DB.getSettings()) \|\| {}; ... }, 60000)` | Absence Alarm Background Scheduler | **CRITICAL LEAK**: Executes recurring cloud read `doc(SETTINGS).get()` every 60s. Scans entire `RECORDS` collection and queries `STUDENTS` per class when alarm time matches. |
| `dashboard-admin.html` | 3566 | `2,500 ms` | `setInterval(() => { ... textEl.textContent = phrases[phraseIdx]; }, 2500)` | Cycling loading phrases in AI chat bubble | **SAFE (UI ONLY)**: Self-clears when DOM element is removed or parent node is detached. No cloud reads. |
| `dashboard-teacher.html` | 767 | `100 ms` | `setInterval(() => { const qrVideo = document.querySelector('#qr-reader video'); ... }, 100)` | Video ready-state detector for QR scanner | **SAFE (DOM ONLY)**: Clears once `qrVideo.readyState >= 2` with safety timeout (`setTimeout(() => clearInterval(checkVideo), 5000)`). No cloud reads. |

---

### 2.2. Realtime Listeners (`onSnapshot`) & Subscription Management

| File | Line | Query Structure | Subscription Handler / Cleanup | Multi-Tenant Safety | Cloud Read Impact & Assessment |
|---|---|---|---|---|---|
| `scripts/utils-notifications.js` | 189 | `DB.dbInstance.collection('v2_notifications').orderBy('timestamp', 'desc').limit(5).onSnapshot(...)` | **UNSUBSCRIBE DISCARDED**: Unsubscribe function is returned inside `.then()` but not assigned to any variable. Cannot be unsubscribed. | **INSECURE (NO SCHOOL FILTER)**: Lacks `schoolId` filter. Receives events from all schools in the database. | **HIGH LEAK**: Kept open permanently in background tabs. On event, `portal-student.html` executes 3–4 new Firestore cloud queries via `checkNotifications()`. |

---

### 2.3. Polling Routines & Data Synchronization Loops

| File | Routine / Function | Trigger Mechanism | Firestore Queries Executed | Cloud Read Impact |
|---|---|---|---|---|
| `dashboard-admin.html:4181` | `triggerAbsenceNotificationsNow(isAuto=true)` | 1-minute background interval | 1. `DB.getCollection(DB.KEYS.RECORDS)` (Scans ALL historical records)<br>2. `DB.getStudents(r.classId)` in loop per today's record<br>3. `DB.addNotification(...)` per absentee | **MASSIVE**: If 10 classes are monitored, scans entire records collection and executes 10 student queries every time alarm triggers. |
| `scripts/module-ai-agent.js:539` | `getSystemContext()` | 1. `Agent.init()`<br>2. `Agent.clearChat()`<br>3. `Agent.sendMessage()` (Every user prompt)<br>4. Tool execution (lines 1013, 1245) | 1. `DB.getStudents()`<br>2. `DB.getClasses()`<br>3. `DB.getRecords()`<br>4. `DB.getTeachers()`<br>5. `DB.getSettings()` | **MASSIVE**: A 10-message conversation with the AI triggers 50+ full collection cloud scans. |
| `portal-student.html:448` | `checkNotifications()` | 1. Page load<br>2. `new_notification_received` event from `onSnapshot` | 1. `q.where('targetType', '==', 'all').get()`<br>2. `q.where('targetType', '==', 'class').where('targetId', '==', classId).get()`<br>3. `q.where('targetType', '==', 'student').where('targetId', '==', studentId).get()` | **HIGH**: 3 separate cloud reads executed per notification check; triggered repeatedly on real-time events. |
| `portal-parent.html:262` | `checkNotifications()` | Page load (loops over linked children) | 4 Firestore queries per linked child (`all`, `class`, `student`, `parent`) | **HIGH**: For a parent with 3 children, executes 12 separate Firestore cloud queries on page load. |

---

### 2.4. `requestAnimationFrame` Loops & Graphic Engines

| File | Line | Loop / Function | Cancellation / Cleanup | Assessment |
|---|---|---|---|---|
| `scripts/utils-thinking-orbs.js` | 261 | `renderLoop(time)` | `requestAnimationFrame(renderLoop)` is called unconditionally; never cancelled even if `activeOrbs.size === 0`. | **RESOURCE LEAK**: Keeps GPU/CPU active indefinitely after first orb mounts. No Firestore reads. |
| `scripts/utils-morphicons.js` | 1984 | `loop(ts)` | Has `removeTicker()` and `cancelAnimationFrame(rafId)` when `tickers.size === 0`. | **OPTIMIZED**: Properly cancels RAF when inactive. |
| `scripts/module-face-api.js` | 202 | `predictLoop()` | Stopped when `this.isActive = false` or `stop()` is called. | **CONTROLLED**: Uses `isActive` flag and throttled `setTimeout` for low-end hardware. |
| `dashboard-teacher.html` | 1064 | `startDetectionLoop()` | Iterates on `isAiAnalysisActive` and `AdaptiveQuality.interval`. | **CONTROLLED**: Stops processing when camera modal is closed. |

---

### 2.5. Tab / View Switching & Navigation Audit

| Dashboard File | Handler | Navigation Behavior | Current Cloud Query Impact |
|---|---|---|---|
| `dashboard-admin.html` | `window.switchTab(tabId, idx)` (Line 2068) | Toggles panel classes (`.tab-panel.active`). Tab switching itself is purely visual/CSS. | **OPTIMAL DURING SESSION**: Tab switching does not re-query DB. **BUT** page load runs `window.renderAll()` which executes 6 render functions concurrently, querying all collections 4–5 times in parallel. |
| `dashboard-teacher.html` | `selectClass(id)` (Line 571) & `resetClassSelection()` (Line 581) | Switching between class view and attendance view. | **UN-CACHED**: Every class tap calls `DB.getClasses()` + `DB.getStudents(id)`. Every "Back" tap calls `DB.getClasses()` + `DB.getRecords(today)`. |
| `dashboard-ministry.html` | `switchTab(tabId)` (Line 844) | Toggles sidebar/tab panels. When switching to `logs`, calls `loadAndRenderLogs()`. | **ACCEPTABLE**: Toggles visual tabs; only queries logs on specific tab selection. |
| `index.html` | `switchTab(type)` (Line 330) | Toggles UI between Teacher login and Student/Parent login forms. | **OPTIMAL**: Pure UI animation, zero queries. |

---

### 2.6. Lifecycle & Visibility Management Audit

| Area | Current Implementation Status | Vulnerability / Impact |
|---|---|---|
| `document.addEventListener('visibilitychange')` | **0 occurrences across entire project** | When browser tab is placed in background or minimized, intervals (absence alarm), listeners, and streams continue consuming CPU and cloud reads. |
| `window.addEventListener('beforeunload')` or `pagehide` | **0 occurrences for resource cleanup** | Unsubscribe callbacks for Firestore listeners and active timers are not disposed when navigating away. |
| Memory leaks in long-running tabs | Background schedulers and un-cleared RAF loops stay in memory. | CPU/memory degradation over extended multi-hour school shifts. |

---

## 3. Root Causes & Detailed Impact Analysis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FIRESTORE READ MULTIPLICATION MAP                     │
└─────────────────────────────────────────────────────────────────────────────┘

1. Absence Background Interval (dashboard-admin.html:4181)
   └── Every 60s: DB.getSettings() ─────────────► 1 Cloud Read / min (480 reads/shift)
       └── When Triggered (08:00):
           ├── DB.getCollection(RECORDS) ──────► Full historical scan (N reads)
           └── DB.getStudents(classId) ────────► 1 query per class (M reads)

2. AI Agent Chatting (module-ai-agent.js:539)
   └── Per User Message: getSystemContext() ────► DB.getStudents()   (1 scan)
                                                 DB.getClasses()    (1 scan)
                                                 DB.getRecords()    (1 scan)
                                                 DB.getTeachers()   (1 scan)
                                                 DB.getSettings()   (1 read)
                                                 Total = 5 Cloud Scans / prompt

3. Real-Time Notification Cascade (utils-notifications.js + portal-student.html)
   └── onSnapshot (No schoolId filter) ─────────► Receives cross-tenant doc event
       └── Emits 'new_notification_received'
           └── checkNotifications() ────────────► 3–4 un-cached Firestore queries

4. Initial Load Storm (dashboard-admin.html:2161)
   └── window.renderAll()
       ├── renderDailyInfo() ──────────────────► 4 Cloud Scans
       ├── renderReports() ────────────────────► 4 Cloud Scans
       ├── renderTeachers() ───────────────────► 3 Cloud Scans
       ├── renderClasses() ────────────────────► 2 Cloud Scans
       ├── renderNotifications() ──────────────► 3 Cloud Scans
       └── renderSchedule() ───────────────────► 3 Cloud Scans
           Total on Page Open = 19 Parallel Cloud Scans (Zero Deduplication)
```

---

## 4. Optimization & Architecture Plan for Requirement R3

### 4.1. Local Cache Integration for Background Schedulers
1. **Eliminate Firestore Network Reads in Periodic Schedulers**:
   - The 60-second scheduler in `dashboard-admin.html` must call `DB.getSettings()` which, under Requirement R2, resolves directly from the local in-memory / IndexedDB cache with an active TTL.
   - 0 Firestore cloud reads during the recurring 60s tick.
2. **Date-Bounded & Cached Absence Alarm Trigger**:
   - In `triggerAbsenceNotificationsNow()`:
     - Replace `DB.getCollection(DB.KEYS.RECORDS)` with `DB.getRecords(todayStr)` (date-bounded query, or retrieved directly from cached daily records).
     - Replace repeated `DB.getStudents(classId)` calls with cached student lists.

---

### 4.2. Universal Page Visibility & Lifecycle Manager (`PageLifecycleManager`)
Create a lightweight, unified visibility and lifecycle manager to pause/resume background timers and unsubscribe listeners:

```javascript
const PageLifecycle = {
    _intervals: new Map(),
    _listeners: new Set(),
    isPageVisible: !document.hidden,

    init() {
        document.addEventListener('visibilitychange', () => {
            this.isPageVisible = !document.hidden;
            if (document.hidden) {
                console.log('[Lifecycle] Page hidden: pausing non-essential timers');
                this.pauseAll();
            } else {
                console.log('[Lifecycle] Page visible: resuming timers & reconciling delta');
                this.resumeAll();
            }
        });

        window.addEventListener('beforeunload', () => {
            this.cleanupAll();
        });
    },

    registerInterval(id, callback, ms, runOnResume = false) {
        const item = { callback, ms, runOnResume, timerId: null };
        this._intervals.set(id, item);
        if (this.isPageVisible) {
            item.timerId = setInterval(callback, ms);
        }
    },

    pauseAll() {
        this._intervals.forEach(item => {
            if (item.timerId) {
                clearInterval(item.timerId);
                item.timerId = null;
            }
        });
    },

    resumeAll() {
        this._intervals.forEach(item => {
            if (!item.timerId) {
                if (item.runOnResume) item.callback();
                item.timerId = setInterval(item.callback, item.ms);
            }
        });
    },

    cleanupAll() {
        this.pauseAll();
        this._intervals.clear();
        this._listeners.forEach(unsub => {
            try { if (typeof unsub === 'function') unsub(); } catch (_) {}
        });
        this._listeners.clear();
    }
};
```

---

### 4.3. Scoped, Multi-Tenant Bounded Realtime Listeners
Refactor `NotificationManager.subscribeToNotifications` in `scripts/utils-notifications.js`:
1. **School-Id Scoping**:
   ```javascript
   const schoolId = DB.getCurrentUserSchoolId();
   let query = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);
   if (schoolId && schoolId !== 'ministry') {
       query = query.where('schoolId', '==', schoolId);
   }
   query = query.orderBy('timestamp', 'desc').limit(5);
   ```
2. **Retain and Manage Unsubscribe Callback**:
   ```javascript
   if (this._unsubscribe) {
       this._unsubscribe();
       this._unsubscribe = null;
   }
   this._unsubscribe = query.onSnapshot(...);
   PageLifecycle.registerListener(this._unsubscribe);
   ```
3. **Eliminate Cascading Re-Queries**:
   - Instead of calling `checkNotifications()` and re-fetching 3–4 queries on every snapshot, inject the new document directly into the cached notification list in memory and dispatch the UI update event.

---

### 4.4. AI Agent Context Cache Optimization (`scripts/module-ai-agent.js`)
1. **Cache-First System Context**:
   - `getSystemContext()` must consume the in-memory cached datasets produced by `core-db.js` (R2).
   - In-memory computation of attendance rates and summaries avoids issuing any Firestore queries when prompting the AI.
2. **Delta Invalidation on Command Execution**:
   - When the AI executes a command (`database_action`), invalidate only the affected collection key in the local cache, keeping subsequent context builds instant and 0-read.

---

### 4.5. Teacher Dashboard Class Switching Optimization
1. In `dashboard-teacher.html`:
   - Store loaded classes and today's records in local component state (`cachedClasses`, `cachedTodayRecords`).
   - `selectClass(id)` retrieves class metadata from `cachedClasses` without calling `DB.getClasses()`.
   - `resetClassSelection()` re-renders using existing state without re-querying cloud Firestore.

---

### 4.6. ThinkingOrbs RAF Lifecycle Fix
In `scripts/utils-thinking-orbs.js`:
- In `renderLoop()`, if `activeOrbs.size === 0`, cancel and nullify `animFrameId` to stop the GPU/CPU loop completely until a new orb mounts.

---

## 5. Verification & Acceptance Criteria Matrix for R3

| Requirement / Test Case | Target State | Verification Method |
|---|---|---|
| Background Absence Scheduler | 0 Firestore reads during regular 60s ticks | Inspect Network / Firestore emulator logs during 5 minutes of idle admin dashboard. |
| Page Visibility Backgrounding | Background timers paused when tab hidden; no network requests sent | Switch tab in browser, verify zero intervals fire via console / network tab. |
| Realtime Notification Scoping | Only receives notifications for user's `schoolId` | Trigger notification in School A; verify School B listener receives 0 snapshots. |
| Notification Listener Cleanup | `onSnapshot` unsubscribed on page navigation / logout | Verify `NotificationManager._unsubscribe()` invoked on logout and `beforeunload`. |
| AI Agent Chat Context | 0 Firestore reads on sending user messages | Send 5 consecutive messages in `agent.html` / Admin AI tab; verify 0 network get calls to Firestore. |
| Class Switching (Teacher) | 0 Firestore reads when navigating between classes | Switch between Class A and Class B in `dashboard-teacher.html`; verify data served from local cache. |
| ThinkingOrbs RAF Loop | RAF loop terminates when all orbs are unmounted | Mount and unmount AI thinking pill; verify `requestAnimationFrame` stops. |
