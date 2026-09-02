# Comprehensive Codebase Firestore Read & Query Inventory
**Repository**: `d:\Hodoori-Beta`  
**Auditor**: Explorer Survey 1 (`teamwork_preview_explorer` / Codebase Firestore Auditor)  
**Date**: 2026-08-29  

---

## 1. Executive Summary

This audit represents an exhaustive survey of all Firestore data read operations, collection scans, document fetches, query structures, real-time listeners, and background polling intervals across the entire **Hodoori (حضوري)** platform codebase.

### Key Risk Findings
1. **Unbounded Collection Scans**:
   - `v2_records` (attendance records): Queried repeatedly across `dashboard-admin.html`, `dashboard-ministry.html`, `portal-student.html`, `portal-parent.html`, and `module-ai-agent.js` without date or range filters (`getCollection(DB.KEYS.RECORDS)` or unbounded `getRecords()`). In production, this downloads all historical records across months/years on every render or AI chat turn.
   - `v2_students`, `v2_teachers`, `v2_classes`: Scanned in full on initial load, logins, modal opens, and AI prompts.
2. **Redundant & Multi-fetch Duplication in Single Workflows**:
   - On `dashboard-admin.html` page load (`renderAll()`), `v2_classes` is queried **5 times**, `v2_teachers` **4 times**, `v2_records` **2 times**, and `v2_students` **2 times** in parallel promises without shared memory or caching.
   - On `portal-parent.html` load, `DB.getStudents()` is called **twice** in sequential functions (`loadLinkedChildren` and `checkNotifications`).
   - In `core-auth.js` (`Auth.login`), `DB.getTeachers()` executes an unfiltered scan of every teacher in Firestore across all schools because session context is not yet loaded.
   - In `index.html` (Student/Parent logins), `DB.getStudents()` scans the entire global students collection without `schoolId` or query filters.
3. **Un-cached Background Polling**:
   - `dashboard-admin.html` (lines 4181–4201): Runs an unfiltered `setInterval` every 60,000 ms (1 minute) executing `await DB.getSettings()` against Firestore continuously.
4. **Listener Leaks & Cascades**:
   - `scripts/utils-notifications.js` (line 189): Sets an `onSnapshot` listener on `v2_notifications` without `schoolId` filter (receives global notifications) and without returning an unsubscribe cleanup handle. When a snapshot arrives, `portal-student.html` executes 3 new Firestore queries to refresh notifications.
5. **AI Agent Cloud Consumption Multiplier**:
   - `scripts/module-ai-agent.js`: Every single message sent by a user triggers `getSystemContext()`, which executes 5 Firestore reads (`DB.getStudents()`, `DB.getClasses()`, `DB.getRecords()`, `DB.getTeachers()`, `DB.getSettings()`). In addition, executing any database tool command triggers `_verifyDatabaseState()` which re-scans the target collection from Firestore.

---

## 2. Collections Registry & Access Matrix

| Collection Key (`DB.KEYS`) | Firestore Collection Name | Purpose | Primary Read Sites | Query Types Observed |
|---|---|---|---|---|
| `STUDENTS` | `v2_students` | Student profiles & face biometric embeddings (`descriptors`) | `core-db.js`, `core-auth.js`, `index.html`, `dashboard-admin.html`, `dashboard-ministry.html`, `dashboard-teacher.html`, `portal-student.html`, `portal-parent.html`, `module-ai-agent.js` | Unbounded scans, `where('schoolId')`, `where('classId')`, `where('academicId')` |
| `TEACHERS` | `v2_teachers` | Staff & administrator accounts, credentials, roles | `core-db.js`, `core-auth.js`, `dashboard-admin.html`, `dashboard-ministry.html`, `dashboard-teacher.html`, `module-ai-agent.js` | Unbounded scans, `where('ministryId')`, `where('schoolId')` |
| `CLASSES` | `v2_classes` | School classrooms and sections | `core-db.js`, `dashboard-admin.html`, `dashboard-ministry.html`, `dashboard-teacher.html`, `portal-student.html`, `portal-parent.html`, `module-ai-agent.js` | Unbounded scans, `where('schoolId')` |
| `RECORDS` / `REPORTS` | `v2_records` | Attendance logs, period details, photo proofs | `core-db.js`, `dashboard-admin.html`, `dashboard-ministry.html`, `dashboard-teacher.html`, `portal-student.html`, `portal-parent.html`, `module-ai-agent.js` | Unbounded scans, `where('date')`, `where('classId')`, `where('schoolId')` |
| `NOTIFICATIONS` | `v2_notifications` | Broadcast and targeted notifications (parent/student/class/all) | `core-db.js`, `dashboard-admin.html`, `portal-student.html`, `portal-parent.html`, `utils-notifications.js` | `where('schoolId')`, multi-query target splits (`q1..q4`), Realtime `onSnapshot` with `orderBy` + `limit(5)` |
| `SETTINGS` | `v2_settings` | School-level customization toggles, alarm rules, timetable configurations | `core-db.js`, `dashboard-admin.html`, `dashboard-teacher.html`, `module-ai-agent.js` | Single document get (`doc(schoolId)` / `doc('global')`), Polling loop (60s) |
| `SCHOOLS` | `v2_schools` | Ministry registered schools & principals | `core-db.js`, `dashboard-admin.html`, `dashboard-teacher.html`, `dashboard-ministry.html`, `module-ai-agent.js` | Unbounded scans, `doc(id)` single reads |
| `SCHEDULE` | `v2_schedule` | Weekly period timetables per class and teacher | `core-db.js`, `dashboard-admin.html` | Unbounded scan via `where('schoolId')` |
| `HOLIDAYS` | `v2_holidays` | Official calendar holidays | `core-db.js`, `portal-student.html` | Unbounded scan via `where('schoolId')` |
| `SYSTEM_LOGS` | `v2_system_logs` | Telemetry client error logs | `module-telemetry.js` | `orderBy('timestamp').limit(100)`, `limit(150)` for batch wipe |
| `AGENTIC_LOGS` | `v2_agentic_logs` | AI Agent diagnostic logs fallback | `module-ai-agent.js` | Write-only (`insert`) |

---

## 3. Comprehensive File-by-File Inventory of Read Operations

### 3.1 `scripts/core-db.js` (Core DB Layer)

| Line | Function / Method | Firestore Query / Call | Nature of Read | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **73–75** | `init()` | `this.dbInstance.collection('v2_teachers').where('ministryId', '==', '000').get()` | Filtered query (seed check) | Once per page session initialization | **None** | Cloud read on every page load to check seed state. Should be cached in localStorage or bypassed if already seeded. |
| **124–134** | `getCollection(collectionName, filterBySchool)` | `this.dbInstance.collection(name).where('schoolId', '==', schoolId).get()` | Collection-wide scan | Called by `getTeachers`, `getClasses`, `getSchedule`, `getRecords`, etc. | **None** | Fetches every doc in collection on every call. Needs memory TTL cache + localStorage persistence. |
| **137–151** | `getStudents(classId)` | `this.dbInstance.collection('v2_students').where('schoolId', '==', schoolId)[.where('classId', '==', classId)].get()` | Full student list or class list | Called on page loads, modals, AI prompts | **None** | Frequent duplicate fetches. Should be served from cached student store. |
| **161–174** | `getRecords(date, classId)` | `this.dbInstance.collection('v2_records').where('schoolId', '==', schoolId)[.where('date', '==', date)][.where('classId', '==', classId)].get()` | Filtered or unbounded query | Dashboard initialization, teacher submission, reports | **None** | When called with no date (`getRecords()`), downloads entire history. Needs date bounds and local index. |
| **179–185** | `saveAttendance(...)` | `this.dbInstance.collection('v2_records').where('date', '==', date).where('classId', '==', classId).where('schoolId', '==', schoolId).get()` | Pre-write existence check query | Triggered on every attendance submission | **None** | Extra read before set. Can use deterministic document ID (`${schoolId}_${classId}_${date}_p${period}`) to eliminate read. |
| **381–400** | `deleteStudent(id)` | 1. `doc(id).get()`<br>2. Fallback: `where('academicId', '==', id).get()`<br>3. Fallback: `getStudents()` (full scan) | 1-3 cloud reads | On student deletion | **None** | Fallbacks trigger full scans. Cache lookup would prevent cloud reads. |
| **406–425** | `updateTeacher(id, data)` | 1. `doc(id).get()`<br>2. Fallback: `where('ministryId', '==', id).get()`<br>3. Fallback: `getTeachers()` (full scan) | 1-3 cloud reads | On teacher update | **None** | Multi-step fallback read chain. |
| **429–448** | `deleteTeacher(id)` | 1. `doc(id).get()`<br>2. Fallback: `where('ministryId', '==', id).get()`<br>3. Fallback: `getTeachers()` (full scan) | 1-3 cloud reads | On teacher deletion | **None** | Multi-step fallback read chain. |
| **458–479** | `updateStudent(id, data)` | 1. `doc(id).get()`<br>2. Fallback: `where('academicId', '==', id).get()`<br>3. Fallback: `getStudents()` (full scan) | 1-3 cloud reads | On student update | **None** | Multi-step fallback read chain. |
| **483–525** | `getNotifications(target)` | If target: executes up to 4 queries (`targetType==all`, `targetType==class`, `targetType==student`, `targetType==parent`). Else: `get()` full collection | 1 to 4 cloud queries | Page loads in student/parent/admin dashboards | **None** | Up to 4 queries per child for parents on load. High read volume. |
| **543–550** | `isHoliday(dateString)` | `getCollection(this.KEYS.HOLIDAYS)` | Unbounded collection scan | Calendar rendering | **None** | Re-downloads all holidays every time checked. |
| **605–611** | `getSettings()` | `this.dbInstance.collection('v2_settings').doc(docId).get()` | Single doc read | Page loads, polling timers, AI prompts | **None** | Critical polling hot spot. |
| **617–621** | `getSchool(id)` | `this.dbInstance.collection('v2_schools').doc(id).get()` | Single doc read | Dashboard header loads | **None** | School metadata rarely changes; should be permanently cached in session. |
| **640–642** | `getSchedule()` | `getCollection(this.KEYS.SCHEDULE)` | Full collection scan | Schedule tab render | **None** | Full scan on every schedule view. |

---

### 3.2 `scripts/core-auth.js` (Authentication Layer)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **48** | `Auth.login(ministryId, password)` | `await DB.getTeachers()` | Unfiltered full scan of all teachers across all schools | User login button click | **None** | Reads every teacher document in Firestore because `schoolId` is not known prior to login. Should use targeted query `.where('ministryId', '==', ministryId).limit(1)`. |

---

### 3.3 `scripts/utils-notifications.js` (Push & Alerts Engine)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **189** | `subscribeToNotifications(target)` | `DB.dbInstance.collection('v2_notifications').orderBy('timestamp', 'desc').limit(5).onSnapshot(...)` | Realtime listener | Initiated in `portal-student.html` | Realtime stream | 1. Not scoped by `schoolId` (cross-tenant leak risk).<br>2. Does not return or retain unsubscribe handle.<br>3. Fires UI event that triggers 3 additional REST/SDK reads. |

---

### 3.4 `scripts/module-telemetry.js` (Telemetry & Error Tracker)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **391–395** | `getLogs()` | `DB.dbInstance.collection('v2_system_logs').orderBy('timestamp', 'desc').limit(100).get()` | Bounded query (100 docs) | Telemetry modal open / dev tools | LocalStorage merge | Well-bounded with `limit(100)`. |
| **486** | `clearAllLogs()` | `DB.dbInstance.collection('v2_system_logs').limit(150).get()` | Bounded query (150 docs) | Admin clear telemetry button | **None** | Bounded; necessary for batch deletion. |

---

### 3.5 `index.html` (Landing & Multi-role Login Portal)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **409** | `handleStudentSearch()` (Parent Login) | `await DB.getStudents()` | Unbounded scan of entire `v2_students` collection | Parent clicks login with phone number | **None** | Fetches all students across the entire database to do `filter(s => s.phone === input)`. Must use `.where('phone', '==', input)` query or indexed lookup. |
| **446** | `handleStudentSearch()` (Student Login) | `await DB.getStudents()` | Unbounded scan of entire `v2_students` collection | Student clicks login with national/academic ID | **None** | Fetches all students across entire database to do `find(s => s.academicId === input)`. Must use `.where('academicId', '==', input).limit(1)`. |

---

### 3.6 `portal-student.html` (Student Portal)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **233–238** | `init()` | `Promise.all([ DB.getCollection(DB.KEYS.STUDENTS), DB.getClasses(), DB.getCollection(DB.KEYS.RECORDS), DB.getCollection(DB.KEYS.HOLIDAYS) ])` | 4 concurrent full collection scans | Page load / refresh | In-memory `cachedData` object for calendar render | 1. `getCollection(STUDENTS)` downloads all students to find 1 student.<br>2. `getCollection(RECORDS)` downloads all school records across all dates.<br>Should be scoped to target student ID and date-bounded records. |
| **455** | `checkNotifications()` | `await DB.getNotifications(target)` | Up to 3 Firestore queries | Page load + triggered on realtime event | **None** | Re-queries cloud on every received notification. |

---

### 3.7 `portal-parent.html` (Parent Portal)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **201–205** | `loadLinkedChildren()` | `Promise.all([ DB.getStudents(), DB.getClasses(), DB.getCollection(DB.KEYS.RECORDS) ])` | 3 full collection scans | Page load | **None** | Downloads all students, classes, and complete historical records to check today's status. |
| **267–273** | `checkNotifications()` | 1. `await DB.getStudents()` (2nd full scan!)<br>2. Loop per child: `DB.getNotifications(...)` | 1 scan + (4 queries * N children) | Called immediately inside `loadLinkedChildren` | **None** | Duplicate scan of `getStudents()` within 5ms of previous scan. Multiple child notification queries. |

---

### 3.8 `dashboard-teacher.html` (Teacher Attendance Dashboard)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **476** | `init()` | `await DB.getSettings()` | Single doc read | Dashboard page load | **None** | Loads teacher feature toggles. |
| **485** | `init()` | `await DB.getSchool(user.schoolId)` | Single doc read | Dashboard page load | **None** | Loads school name. |
| **533** | `renderClassSelector()` | `await DB.getClasses()` | Full collection scan | Dashboard page load / Reset selection | **None** | Re-fetched every time user returns to class selector. |
| **537** | `renderClassSelector()` | `await DB.getRecords(today)` | Query `where('date', '==', today)` | Dashboard page load / Reset selection | **None** | Re-fetched on return to class selector. |
| **572–574** | `selectClass(id)` | 1. `await DB.getClasses()`<br>2. `await DB.getStudents(id)` | 1 full scan + 1 filtered scan | Teacher clicks on a class card | **None** | Re-downloads all classes even though they were just rendered in `renderClassSelector`. |
| **1605** | `submitAttendance()` | `await DB.getRecords(date)` | Query `where('date', '==', date)` | Teacher clicks submit attendance | **None** | Re-checks existing records before save. |

---

### 3.9 `dashboard-ministry.html` (Ministry Level Super-Dashboard)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **605–610** | `refreshData()` | `Promise.all([ DB.getSchools(), DB.getTeachers(), DB.getStudents(), DB.getCollection(DB.KEYS.RECORDS) ])` | 4 country-wide collection scans | Page load and manual refresh | **None** | Scans all schools, all teachers, all students, and all records across the platform. Extremely heavy cloud read operation. |
| **1034** | `savePrincipalModal()` | `await DB.getTeachers()` | Full scan of teachers | Principal update modal save | **None** | Scans all teachers to update roles. |

---

### 3.10 `dashboard-admin.html` (School Admin Dashboard)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **2183–2188** | `renderDailyInfo()` | `Promise.all([ DB.getClasses(), DB.getCollection(DB.KEYS.RECORDS), DB.getCollection(DB.KEYS.STUDENTS), DB.getTeachers() ])` | 4 full collection scans | Page load / `renderAll()` | **None** | Unbounded `v2_records` scan downloading all historical school records. |
| **2425** | `populateFilters()` | `Promise.all([ DB.getClasses(), DB.getTeachers() ])` | 2 full collection scans | Page load / `renderAll()` | **None** | Concurrent duplicate read of classes & teachers. |
| **2443** | `renderReports()` | `Promise.all([ DB.getTeachers(), DB.getClasses(), DB.getCollection(DB.KEYS.RECORDS) ])` | 3 full collection scans | Page load / Filter change | **None** | Concurrent duplicate read of teachers, classes, and all records. |
| **2506** | `showFullReport(id)` | `await DB.getCollection(DB.KEYS.RECORDS)` | Full collection scan | Admin clicks "Details" on report | **None** | Scans all records just to `find(r => r.id === id)` instead of doc read or cached record. |
| **2529–2530** | `renderReportDetailModal()` | `Promise.all([ DB.getTeachers(), DB.getClasses() ])` | 2 full collection scans | Admin opens report detail modal | **None** | Re-downloads teachers and classes to populate names. |
| **2608** | `renderTeachers()` | `await DB.getTeachers()` | Full collection scan | Page load / `renderAll()` | **None** | Concurrent duplicate scan during page load. |
| **2669** | `renderClasses()` | `await DB.getClasses()` | Full collection scan | Page load / `renderAll()` / view change | **None** | Concurrent duplicate scan during page load. |
| **2733** | `renderStudentsView()` | `await DB.getStudents(classInfo.id)` | Filtered query `where('classId', '==', id)` | Admin drills into section | **None** | Fetches students for section. |
| **2797** | `renderNotifications()` | `await DB.getNotifications('all_admin')` | Full collection scan | Page load / `renderAll()` | **None** | Scans all notifications. |
| **2896** | `showEditTeacherModal(id)` | `await DB.getTeachers()` | Full collection scan | Admin clicks on teacher row | **None** | Scans all teachers to find 1 teacher by ID. |
| **2950** | `showEditClassModal(id)` | `await DB.getClasses()` | Full collection scan | Admin clicks edit class | **None** | Scans all classes to find 1 class by ID. |
| **2972** | `showEditStudentModal(id)` | `await DB.getCollection(DB.KEYS.STUDENTS)` | Full collection scan | Admin clicks edit student | **None** | Scans all students to find 1 student by ID. |
| **3042** | `showAddNotificationModal()` | `await DB.getClasses()` | Full collection scan | Admin clicks "New Notification" | **None** | Scans all classes for dropdown. |
| **3050** | `showEditNotificationModal(id)` | `await DB.getNotifications('all_admin')` | Full collection scan | Admin clicks edit notification | **None** | Scans all notifications. |
| **3063** | `showEditNotificationModal(id)` | `await DB.getClasses()` | Full collection scan | Inside edit notification modal | **None** | Scans all classes for dropdown. |
| **3119** | `handleAddTeacher()` | `await DB.getTeachers()` | Full collection scan | Form submit (edit validation) | **None** | Scans all teachers. |
| **3159** | `handleAddClass()` | `await DB.getClasses()` | Full collection scan | Form submit (duplicate check) | **None** | Scans all classes for uniqueness check. |
| **3236** | `handleAddStudent()` | `await DB.getCollection(DB.KEYS.STUDENTS)` | Full collection scan | Form submit (append descriptors) | **None** | Scans all students to find existing descriptors. |
| **3287** | `deleteClass(id)` | `await DB.getStudents(id)` | Query `where('classId', '==', id)` | Admin deletes a class | **None** | Queries students to delete them in cascade. |
| **3701** | `init()` | `await DB.getSchool(user.schoolId)` | Single doc read | Admin dashboard init | **None** | Reads school doc. |
| **3802, 3807, 3817, 3898** | Settings & Customization | `await DB.getSettings()` | Single doc read | Toggle clicks, modal open | **None** | Repeatedly reads settings doc on UI interaction. |
| **4035** | `showAbsenceAlarmModal()` | `await DB.getSettings()` | Single doc read | Alarm settings modal open | **None** | Reads settings. |
| **4052, 4091** | `renderAlarmClasses()` | `await DB.getClasses()` | Full collection scan | Alarm modal open / toggle all | **None** | Scans all classes. |
| **4110, 4120** | Alarm Settings & Manual Trigger | `await DB.getSettings()` | Single doc read | Save / trigger button | **None** | Reads settings. |
| **4135** | `triggerAbsenceNotificationsNow()` | `await DB.getCollection(DB.KEYS.RECORDS)` | Full collection scan | Alarm trigger execution | **None** | Scans entire history of records to find today's records. |
| **4143** | `triggerAbsenceNotificationsNow()` | `await DB.getStudents(r.classId)` | Query `where('classId', '==', id)` | Per-class with absent students | **None** | Queries students for absent names. |
| **4181–4201** | Background Polling Interval | `setInterval(async () => { await DB.getSettings(); }, 60000)` | **Recurring single doc read every 60s** | **Continuous background interval** | **None** | **CRITICAL POLLING LEAK**: Fires 60 cloud reads/hour per open browser tab indefinitely. |
| **4231–4235** | `renderSchedule()` | `Promise.all([ DB.getSchedule(), DB.getTeachers(), DB.getClasses() ])` | 3 full collection scans | Schedule tab open / `renderAll()` | **None** | Concurrent scan during `renderAll()`. |
| **4295** | `populateScheduleSelects()` | `Promise.all([ DB.getTeachers(), DB.getClasses() ])` | 2 full collection scans | Add/Edit schedule modal open | **None** | Scans teachers and classes. |
| **4393** | `importStudentsFromExcel()` | `await DB.getClasses()` | Full collection scan | Excel import file upload | **None** | Scans classes to build mapping. |

---

### 3.11 `scripts/module-ai-agent.js` (AI Smart Assistant Engine)

| Line | Function | Call | Nature | Frequency & Trigger | Caching Status | Risk & Optimization |
|---|---|---|---|---|---|---|
| **50, 76, 131** | Gmail Session Management | `await DB.getSettings()` | Single doc read | Gmail token connect / restore / logout | **None** | Reads settings doc. |
| **366, 376, 386** | `_resolveTargetIds(table, query)` | `DB.getStudents()`, `DB.getTeachers()`, `DB.getClasses()` | Full collection scan per table | AI resolving user query entity target | **None** | Scans entire table to match Arabic names or IDs. |
| **403, 413, 419** | `getEffectiveModel()` | `DB.getTeachers()`, `DB.getSchools()`, `DB.getSchool(schoolId)` | Up to 2 scans + 1 doc read | AI module init | **None** | Resolves model per school. |
| **541–543** | `getSystemContext()` | `Promise.all([ DB.getStudents(), DB.getClasses(), DB.getRecords(), DB.getTeachers() ])` | **4 full collection scans concurrently** | **Every user prompt sent to AI Assistant** | **None** | **CRITICAL READ MULTIPLIER**: Every chat message downloads the entire school database (all students, classes, teachers, historical records) to build system context. |
| **634** | `getSystemContext()` | `await DB.getSettings()` | Single doc read | Every user prompt | **None** | Reads settings on every message. |
| **1895** | Face Identification Tool | `await DB.getStudents()` | Full collection scan | User uploads photo for AI identification | **None** | Scans all students to extract descriptors. |
| **1924–1926** | `_handleFullSystemExport()` | `Promise.all([ DB.getStudents(), DB.getClasses(), DB.getTeachers(), DB.getRecords() ])` | 4 full collection scans | User asks AI to export full Excel report | **None** | Full export dump. |
| **2034–2109** | `_handleDatabaseAction()` (`select`) | Table dependent: calls `getStudents()`, `getClasses()`, `getTeachers()`, `getRecords()` | 1 to 4 full collection scans | User asks AI to search or show data | **None** | Scans entire collection for in-memory filtering. |
| **2788–2855** | `_verifyDatabaseState(cmd)` | Calls `getClasses()`, `getStudents()`, or `getTeachers()` based on table | Full collection scan | **After EVERY database mutation (insert/update/delete)** | **None** | Auto-verification check downloads entire collection from Firestore after write. |
| **3048** | `searchStudentByFingerprint()` | `await DB.getStudents()` | Full collection scan | Biometric search query | **None** | Scans all students. |

---

## 4. Synthesis of Query Patterns & Leak Profiles

### Summary of Major Architectural Read Bottlenecks

```
+--------------------------------------------------------------------------------------------------+
|                                    FIRESTORE READ HOTSPOTS                                       |
+--------------------------------------------------------------------------------------------------+
| 1. Unbounded Records Fetches  : 10+ locations call getCollection('v2_records') without date limit  |
| 2. Redundant renderAll() Calls: 15 full collection reads dispatched concurrently on single load   |
| 3. Polling setInterval        : 60-second recurring DB.getSettings() cloud reads per tab           |
| 4. AI Message Multiplier      : 5 cloud queries on EVERY user chat turn in module-ai-agent.js     |
| 5. Login Unbounded Scans      : Auth.login & index.html download all teachers/students globally    |
| 6. Realtime Listener Cascades : Unscoped onSnapshot triggering re-query loops                      |
+--------------------------------------------------------------------------------------------------+
```

---

## 5. Architectural Recommendations for Next Implementation Milestones

1. **Smart In-Memory & Multi-tab Cache Layer (`scripts/core-db.js`)**:
   - Wrap all collection readers (`getStudents`, `getTeachers`, `getClasses`, `getSchedule`, `getSettings`, `getSchools`) in an in-memory cache with configurable TTL (e.g. 5 minutes).
   - Provide `localStorage` snapshot persistence across tabs with BroadcastChannel invalidation on writes.
   - On write mutations (`addStudent`, `updateTeacher`, `deleteClass`, etc.), immediately invalidate or mutate local cache without requiring re-reads from Firestore.

2. **Date-Bounded & Delta-Sync Attendance Queries**:
   - Prohibit unbounded `getCollection(DB.KEYS.RECORDS)`.
   - Default all attendance queries to date bounds (e.g., `date == today` or `date >= startOfMonth`).
   - Cache historical records by date key; only fetch missing dates.

3. **Background Interval Decoupling**:
   - Eliminate recurring cloud reads in `setInterval` (lines 4181–4201). The background absence scheduler should inspect memory/local cache and only touch Firestore if an action is actively due.

4. **Targeted Authentication Lookups**:
   - Refactor `Auth.login` and `index.html` search to use exact Firestore field queries (`where('ministryId', '==', id).limit(1)`, `where('academicId', '==', id).limit(1)`, `where('phone', '==', phone).limit(1)`).

5. **Scoped Realtime Listeners**:
   - Update `NotificationManager.subscribeToNotifications` to include `where('schoolId', '==', currentSchoolId)`, return the unsubscribe function, and store it to detach on unmount.
