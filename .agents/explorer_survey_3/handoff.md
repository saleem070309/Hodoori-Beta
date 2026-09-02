# Handoff Report — Requirement R3 (Polling, Intervals, Realtime Listeners & Lifecycle Audit)

**Agent:** Explorer Agent (Polling and Interval Auditor)  
**Date:** 2026-08-29  
**Working Directory:** `d:\Hodoori-Beta\.agents\explorer_survey_3`  
**Parent Conversation ID:** `34d7340d-2c81-43b1-a6db-ce6eae45f8c1`  
**Status:** Complete (Hard Handoff)

---

## 1. Observation

Direct code observations across the repository:

1. **`dashboard-admin.html:4181-4201`**:
   ```javascript
   // Background Scheduler (Checks every minute)
   setInterval(async () => {
       const settings = (await DB.getSettings()) || {};
       if (!settings.customization?.['plugin-absence']) return;
       ...
       if (currentTime === scheduledTime &&
           scheduledDays.includes(currentDay) &&
           settings.lastAlarmSentDate !== todayStr) {
           triggerAbsenceNotificationsNow(true);
       }
   }, 60000);
   ```
   Directly issues `DB.getSettings()` -> `doc(SETTINGS, docId).get()` to Firestore cloud every 60 seconds without checking page visibility or cache freshness.
   When triggered, `triggerAbsenceNotificationsNow(true)` (lines 4135, 4143) executes `await DB.getCollection(DB.KEYS.RECORDS)` (unbounded scan across entire historical collection) and `await DB.getStudents(r.classId)` in a loop per class.

2. **`scripts/module-ai-agent.js:539-544, 634`**:
   ```javascript
   async getSystemContext(activeFile = null, activeFingerprint = null, activeMatchedStudent = null) {
       try {
           const [students, classes, records, teachers] = await Promise.all([
               DB.getStudents(), DB.getClasses(), DB.getRecords(), DB.getTeachers()
           ]);
           ...
           const settings = (await DB.getSettings()) || {};
   ```
   Invoked at lines 447 (`init()`), 766 (`clearChat()`), 831 (`sendMessage()`), 1013 (command execution), and 1245 (batch execution). Each execution fires 5 distinct full collection Firestore reads.

3. **`scripts/utils-notifications.js:184-217`**:
   ```javascript
   DB.init().then(() => {
       const notificationsRef = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);
       return notificationsRef.orderBy('timestamp', 'desc').limit(5).onSnapshot(snapshot => {
           ...
       });
   });
   ```
   The listener query has no `where('schoolId', '==', currentUserSchoolId)` filter. The unsubscribe function returned by `onSnapshot` is returned inside the `.then()` promise and never retained or managed. When a snapshot change occurs, it fires `new_notification_received` which triggers `checkNotifications()` in `portal-student.html:278`, executing 3–4 new un-cached Firestore queries (`getNotifications()`).

4. **`dashboard-admin.html:2160-2173`**:
   ```javascript
   window.renderAll = async function () {
       syncDirectoryToggles();
       renderDailyInfo();
       await Promise.all([
           populateFilters(),
           renderReports(),
           renderTeachers(),
           renderClasses(),
           renderNotifications(),
           renderSchedule()
       ]);
   };
   ```
   Executes 6 render routines simultaneously, each calling `DB.getClasses()`, `DB.getStudents()`, `DB.getCollection(RECORDS)`, `DB.getTeachers()`, generating 15–20 un-cached parallel collection queries.

5. **`scripts/utils-thinking-orbs.js:261-263`**:
   ```javascript
   function renderLoop(time) {
       animFrameId = requestAnimationFrame(renderLoop);
       ...
   }
   ```
   Once mounted, `renderLoop` re-schedules `requestAnimationFrame` indefinitely and does not cancel `animFrameId` when `activeOrbs.size === 0`.

6. **Global Search for `visibilitychange` & `beforeunload`**:
   - `grep_search` for `visibilitychange` yielded **0 results**.
   - `grep_search` for `beforeunload` / `pagehide` yielded **0 results for resource cleanup**.

---

## 2. Logic Chain

1. **Step 1 (Observation 1)**: `dashboard-admin.html` runs `setInterval(async () => { await DB.getSettings() }, 60000)`. Because `core-db.js:609` executes `this.dbInstance.collection(SETTINGS).doc(docId).get()`, every minute generates a Firestore billable document read. In an 8-hour workday, an open admin tab generates 480 cloud reads purely for an idle check.
2. **Step 2 (Observation 2)**: Every user prompt sent to the AI agent invokes `getSystemContext()`, which executes `Promise.all([DB.getStudents(), DB.getClasses(), DB.getRecords(), DB.getTeachers()])` and `DB.getSettings()`. Because these methods in `core-db.js` issue raw Firestore queries, sending 10 prompts consumes at least 50 cloud collection queries.
3. **Step 3 (Observation 3)**: `subscribeToNotifications` lacks `schoolId` filter. A notification created in School A causes `onSnapshot` to trigger across all connected client tabs in School B, School C, etc. Furthermore, `portal-student.html` handles the snapshot event by invoking `checkNotifications()`, which queries Firestore 3–4 times (`targetType == all`, `targetType == class`, `targetType == student`), creating an exponential cascade of cloud reads.
4. **Step 4 (Observation 4 & 6)**: The lack of in-memory caching and visibility lifecycle handlers causes all render functions (`renderDailyInfo`, `renderReports`, `renderTeachers`, etc.) to flood Firestore with redundant duplicate requests on page startup and class switching, while continuing to run in backgrounded tabs.
5. **Conclusion Inference**: Introducing a local cache layer (R2) alone is not enough; Requirement R3 must decouple recurring timers, listeners, and AI context builders from direct Firestore calls, bind them to the local cache, scope listeners by `schoolId`, and implement visibility/unload lifecycle management.

---

## 3. Caveats

- **External Libraries**: `marked.min.js`, `xlsx.full.min.js`, and `face-api.min.js` were verified and do not contain hidden cloud telemetry or Firestore queries.
- **Offline / Localhost Mode**: When running offline or without network access, un-cached queries currently throw errors or stall on unhandled promises. The optimization plan will guarantee clean offline fallback.
- **No Implementation in Survey**: In accordance with the Explorer role constraints, zero project source code was modified; all designs and proposals are ready for implementer execution.

---

## 4. Conclusion

The codebase currently leaks Firestore reads through 3 primary background vectors:
1. Recurring 60-second polling for absence alarms.
2. AI Agent context reconstruction on every user prompt and tool invocation.
3. Un-scoped multi-tenant realtime listeners with cascading query side-effects.

To achieve complete optimization under Requirement R3:
- **Local Cache Binding**: Divert background schedulers and `getSystemContext()` to read directly from local memory/IndexedDB (R2) with 0 network reads.
- **Page Visibility & Lifecycle Handler (`PageLifecycleManager`)**: Pause intervals when `document.hidden === true`; resume when visible; clean up on `beforeunload`.
- **Scoped & Bounded Realtime Listeners**: Add `where('schoolId', '==', currentUserSchoolId)` to `onSnapshot`, retain the `unsubscribe` reference, and update local state in-place on snapshot events instead of re-querying Firestore.
- **Class Switching Cache**: Cache class rosters in component state to eliminate re-queries on tab/class selection in `dashboard-teacher.html`.

---

## 5. Verification Method

To independently verify these findings:
1. **Inspect Code Locations**:
   - `dashboard-admin.html`: View lines 4181–4201 (Interval) and 4135–4158 (Absence trigger scan).
   - `scripts/module-ai-agent.js`: View lines 539–544 (Context queries).
   - `scripts/utils-notifications.js`: View lines 184–217 (`onSnapshot` & missing `schoolId`).
   - `scripts/utils-thinking-orbs.js`: View lines 258–263 (Un-cancelled RAF loop).
2. **Runtime Verification**:
   - Open `dashboard-admin.html` with browser DevTools Network / Console active. Observe `get()` calls every 60 seconds.
   - Open `agent.html`, send a message to the AI agent, and observe 5 Firestore network requests dispatched per prompt.
   - Open `portal-student.html`, create a notification in Firestore console, and observe `checkNotifications()` firing 3 subsequent Firestore queries.
