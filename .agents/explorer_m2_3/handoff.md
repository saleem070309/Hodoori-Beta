# Handoff Report: Notifications & Realtime Listener Optimization (Milestone 2)

**Author:** Explorer Agent (Role: Notifications & Realtime Listener Specifier)  
**Date:** 2026-08-29  
**Working Directory:** `d:\Hodoori-Beta\.agents\explorer_m2_3`  
**Parent Agent:** `34d7340d-2c81-43b1-a6db-ce6eae45f8c1`  
**Specification Document:** `d:\Hodoori-Beta\.agents\explorer_m2_3\analysis.md`

---

## 1. Observation

1. **Un-scoped Real-Time Snapshot Listener in `scripts/utils-notifications.js:184-217`**:
   Direct inspection of `scripts/utils-notifications.js` reveals:
   ```javascript
   184:         DB.init().then(() => {
   185:             console.log('Subscribing to real-time notifications for target:', target);
   186:             const notificationsRef = DB.dbInstance.collection(DB.KEYS.NOTIFICATIONS);
   187:             
   188:             // Listen for changes (limit to 5 most recent to save resources)
   189:             return notificationsRef.orderBy('timestamp', 'desc').limit(5).onSnapshot(snapshot => {
   ```
   - The query on line 189 contains no `.where('schoolId', '==', schoolId)` constraint.
   - The `onSnapshot` return value is returned inside `.then()`, but `subscribeToNotifications` returns nothing synchronously or asynchronously to the caller, and no instance property (such as `_unsubscribe`) exists to store it.
   - `NotificationManager` has no `unsubscribe()` method.

2. **Cascading Query Storm in `portal-student.html:278, 448-468`**:
   Direct inspection of `portal-student.html` reveals:
   ```javascript
   278:                     window.addEventListener('new_notification_received', () => {
   279:                         checkNotifications();
   280:                     });
   ```
   When `checkNotifications()` executes:
   ```javascript
   448:         async function checkNotifications() {
   449:             if (!window.currentStudent) return;
   450:             try {
   451:                 const target = {
   452:                     id: window.currentStudent.academicId,
   453:                     classId: window.currentStudent.classId
   454:                 };
   455:                 const notifications = await DB.getNotifications(target);
   ```
   In `scripts/core-db.js:908-925`, `DB.getNotifications(target)` executes 3 separate Firestore queries (`where('targetType', '==', 'all')`, `where('targetType', '==', 'class')`, `where('targetType', '==', 'student')`). Every single real-time snapshot event received by open student tabs fires 3 new cloud queries per client.

3. **Parent Portal Unimplemented Listener in `portal-parent.html:330-334`**:
   ```javascript
   330:         function subscribeToAllChildren() {
   331:             if (typeof NotificationManager === 'undefined') return;
   332:             // This would require real-time listener support in NotificationManager
   333:             // For now we poll on render.
   334:         }
   ```
   `portal-parent.html` polls sequentially per child on render, lacking multi-target real-time stream support.

4. **In-Flight Coalescing & L1 Caching in `scripts/core-db.js:889-935`**:
   `DB.getNotifications` is protected by L1 caching with a 2-minute TTL (`TTL.NOTIFICATIONS = 2 * 60 * 1000`) and request coalescing, but write operations and snapshot arrivals require explicit cache eviction (`DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id)`).

---

## 2. Logic Chain

1. **Multi-Tenant Isolation (Premise 1)**: Because Firestore collections in multi-tenant environments are shared unless scoped by query predicates, querying `v2_notifications` without `where('schoolId', '==', schoolId)` (Observation 1) causes cross-tenant notification leaks across schools. Adding `.where('schoolId', '==', schoolId)` when `schoolId !== 'ministry'` strictly isolates real-time event delivery.
2. **Resource & Lifecycle Leakage (Premise 2)**: Discarding the unsubscribe closure (Observation 1) means active snapshot listeners remain permanently open when users switch tabs, log out, or navigate pages. Storing the unsubscribe handle in `NotificationManager._unsubscribe` and exposing `NotificationManager.unsubscribe()` with `beforeunload`/`pagehide` listeners guarantees complete resource cleanup.
3. **Query Cascade Elimination (Premise 3)**: The payload received inside `snapshot.docChanges()` already contains the complete notification document `{ id: change.doc.id, ...change.doc.data() }`. Invoking `checkNotifications()` (Observation 2) is redundant and triggers 3–4 Firestore network reads per connected client. Mutating `window.studentNotifications` in-place, updating the badge in the DOM, and re-rendering the open drawer reduces Firestore queries upon notification arrival from **3–4 to 0**.
4. **Cache Invalidation Integration (Premise 4)**: Calling `DB.invalidateCache(DB.KEYS.NOTIFICATIONS, notif.id, { broadcast: false })` when a snapshot change arrives ensures that any in-memory L1 cache entries in `core-db.js` are invalidated locally so future manual fetches reflect the latest state without stale data.

---

## 3. Caveats

- **Ministry Multi-School Access**: Ministry accounts (`schoolId === 'ministry'`) monitor cross-school activity and intentionally bypass the `schoolId` query constraint.
- **Service Worker Push Notifications**: Full background push notifications when the browser window is completely closed depend on Web Push / Service Worker registrations. `NotificationManager` implements Window Notifications with Service Worker fallback for active sessions.
- **No Source Code Direct Writes**: In accordance with the Explorer role constraints, no source files were directly modified. All drop-in replacement code and diff specifications are provided in `analysis.md`.

---

## 4. Conclusion

The technical specifications for `scripts/utils-notifications.js`, `portal-student.html`, and `portal-parent.html` are complete, robust, and directly implementable by the Milestone 2 Worker:
1. `scripts/utils-notifications.js` is fully refactored with `where('schoolId', '==', schoolId)`, `this._unsubscribe` retention, `NotificationManager.unsubscribe()`, multi-child target matching (`_isTargetMatch`), and automatic cleanup on `beforeunload`.
2. `portal-student.html` replaces the query cascade with in-place array updates (`window.studentNotifications`), instant badge activation, and decoupled UI rendering (`renderNotificationList()`), achieving **0 cloud reads on push**.
3. `portal-parent.html` receives multi-child real-time listener integration (`subscribeToAllChildren`) with in-place updates.
4. L1 cache invalidation in `core-db.js` is integrated on snapshot events.

---

## 5. Verification Method

To independently verify the implementation:
1. **Multi-Tenant Isolation**:
   - Initialize `NotificationManager.subscribeToNotifications({ schoolId: 's1', id: '2024001' })`.
   - Add a notification in Firestore with `schoolId: 's2'`.
   - Verify that the School 1 client receives 0 snapshot change events.
2. **Query Cascade Elimination**:
   - Open `portal-student.html` and monitor network / Firestore queries.
   - Insert a notification for that student in Firestore.
   - Verify that the notification badge appears and local toast displays, while **0 new `get()` queries** are executed against `v2_notifications`.
3. **Lifecycle & Unsubscribe**:
   - Call `const unsub = await NotificationManager.subscribeToNotifications(...)`.
   - Assert `typeof unsub === 'function'`.
   - Call `NotificationManager.unsubscribe()`.
   - Assert `NotificationManager._unsubscribe === null`.
4. **Code Inspection**:
   - Inspect `scripts/utils-notifications.js` to ensure lines 184–218 are replaced with the specification in `d:\Hodoori-Beta\.agents\explorer_m2_3\analysis.md`.
