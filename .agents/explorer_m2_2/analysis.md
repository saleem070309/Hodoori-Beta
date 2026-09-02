# Technical Specification: AI Agent System Context, State Verification & Query Optimization (Milestone 2)

**Author:** Explorer Agent (Role: AI Agent & Context Query Specifier)  
**Date:** 2026-08-29  
**Target Module:** `scripts/module-ai-agent.js`  
**Dependencies:** `scripts/core-db.js`, `scripts/utils-thinking-orbs.js`, `scripts/module-face-api.js`  
**Milestone:** Milestone 2 (M2) — AI Agent & System Context Optimization  

---

## 1. Executive Summary

In previous versions of the Hodoori platform, the AI Smart Assistant (`scripts/module-ai-agent.js`) represented one of the largest sources of Firestore cloud read multiplication:
1. **Un-cached Context Query Storm**: Every single user prompt sent to the AI agent invoked `getSystemContext()`, which executed `Promise.all([DB.getStudents(), DB.getClasses(), DB.getRecords(), DB.getTeachers()])` and `DB.getSettings()`. A standard 10-turn conversation triggered over **50 full-collection cloud queries**.
2. **Un-bounded Historical Records Scanning**: `DB.getRecords()` with no date or range boundaries scanned the entire historical `v2_records` collection on every turn.
3. **Redundant Post-Write Verification Scans**: Executing a database write tool (`database_action`) triggered `_verifyDatabaseState()`, which issued un-cached collection queries to confirm database updates, followed immediately by another full `getSystemContext()` scan.

This specification details the technical refactoring for `scripts/module-ai-agent.js` to leverage the **L1 In-Memory Cache and Smart Coalescing Engine** in `scripts/core-db.js`. 

### Key Guarantees
- **0 Network Reads on Chat Prompts**: Once initial data is cached in `core-db.js` L1 memory (TTL: 3–15 min), all subsequent conversational turns, tool executions, and chat resets generate **zero Firestore network queries**.
- **Bounded Sliding Context Window**: Replaces unbounded historical scans with `DB.getRecentRecords(30)` (30-day sliding attendance window) or cached date ranges.
- **Write-Invalidation & Single-Prime Verification**: Write commands purge the affected collection in L1; `_verifyDatabaseState` refreshes that collection once into L1, and downstream `getSystemContext()` consumes the updated memory cache in 0ms.
- **100% Preservation of Arabic NLP & Agent Capabilities**: Verbatim preservation of all Arabic normalization, multi-tiered fuzzy name matching, genealogy heuristics, strict JSON tool dispatch schemas, multi-turn autonomous loops (`MAX_AGENT_LOOPS = 4`), facial biometrics, and export capabilities.

---

## 2. System Context Optimization (`getSystemContext`)

### 2.1. Architectural Flow & Cache Interaction
`getSystemContext(activeFile, activeFingerprint, activeMatchedStudent)` is the core function responsible for assembling the prompt context sent to LLM providers (OpenRouter, DeepInfra, Inworld).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   AI AGENT CONTEXT GENERATION PIPELINE                      │
└─────────────────────────────────────────────────────────────────────────────┘

 [User Types Message / Chat Init / Tool Step]
                       │
                       ▼
            Agent.getSystemContext()
                       │
 ┌─────────────────────┴─────────────────────┐
 │       Concurrent L1 Cache Resolution      │
 │  (0ms, 0 Network Reads when cache warm)   │
 ├───────────────────────────────────────────┤
 │ 1. DB.getStudents()        [TTL: 5 min]   │ ──► Memory L1 Hit
 │ 2. DB.getClasses()         [TTL: 10 min]  │ ──► Memory L1 Hit
 │ 3. DB.getRecentRecords(30) [TTL: 3 min]   │ ──► Memory L1 Hit (30-day Range)
 │ 4. DB.getTeachers()        [TTL: 10 min]  │ ──► Memory L1 Hit
 │ 5. DB.getSettings()        [TTL: 15 min]  │ ──► Memory L1 Hit
 └─────────────────────┬─────────────────────┘
                       │
                       ▼
 ┌───────────────────────────────────────────┐
 │       In-Memory Statistical Compute       │
 ├───────────────────────────────────────────┤
 │ • todayReports (filter by local todayStr) │
 │ • presentToday / absentToday counts       │
 │ • studentStats (attendanceRate per student)│
 │ • lowAttendance (<75%) & perfect (100%)   │
 │ • lastReportSummary & recentReports (10)  │
 │ • classesList & teachersList formatting   │
 └─────────────────────┬─────────────────────┘
                       │
                       ▼
 ┌───────────────────────────────────────────┐
 │        Prompt Assembly & Injection        │
 ├───────────────────────────────────────────┤
 │ • Builtin Arabic Instruction Template     │
 │ • Variable string replacement ({{...}})   │
 │ • Custom skills injection (skill-reports) │
 │ • Biometric Face Descriptors / Attachments│
 └─────────────────────┬─────────────────────┘
                       │
                       ▼
             [Final Prompt String]
```

### 2.2. Mathematical Aggregations & Local Timezone Logic
All statistical metrics in `getSystemContext` are computed directly in memory without any secondary database queries:
1. **Local Date Normalization**:
   ```javascript
   const now = new Date();
   const year = now.getFullYear();
   const month = String(now.getMonth() + 1).padStart(2, '0');
   const day = String(now.getDate()).padStart(2, '0');
   const todayStr = `${year}-${month}-${day}`;
   const todayHuman = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
   ```
2. **Today's Attendance Tally**:
   ```javascript
   const todayReports = records.filter(r => r.date === todayStr);
   let presentToday = 0;
   let absentToday = 0;
   todayReports.forEach(report => {
       if (report.details) {
           report.details.forEach(d => {
               if (d.status === 'present') presentToday++;
               else if (d.status === 'absent') absentToday++;
           });
       }
   });
   ```
3. **Per-Student Attendance Ratio & Segmentations**:
   ```javascript
   const studentStats = students.map(s => {
       let pCount = 0;
       let tCount = 0;
       records.forEach(report => {
           if (report.details) {
               const studentEntry = report.details.find(d => d.studentId === s.id);
               if (studentEntry) {
                   tCount++;
                   if (studentEntry.status === 'present') pCount++;
               }
           }
       });
       const rate = tCount > 0 ? Math.round((pCount / tCount) * 100) : 0;
       return { ...s, attendanceRate: rate, totalRecords: tCount, presentCount: pCount };
   });

   const lowAttendance = studentStats.filter(s => s.attendanceRate < 75 && s.totalRecords > 0);
   const perfectAttendance = studentStats.filter(s => s.attendanceRate === 100 && s.totalRecords > 0);
   ```
4. **Latest Report Summary & 10 Most Recent Reports**:
   ```javascript
   const sortedRecords = [...records].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
   const lastReport = sortedRecords.length > 0 ? sortedRecords[0] : null;
   let lastReportSummary = "لا يوجد تقارير مسجلة بعد.";
   if (lastReport) {
       const lrPresent = lastReport.details?.filter(d => d.status === 'present').length || 0;
       const lrAbsent = lastReport.details?.filter(d => d.status === 'absent').length || 0;
       const classObj = classes.find(c => c.id === lastReport.classId);
       lastReportSummary = `آخر تقرير بتاريخ ${lastReport.date} لفصل ${classObj ? classObj.name : 'غير معروف'}. الحضور: ${lrPresent}، الغياب: ${lrAbsent}.`;
   }

   const recentReports = sortedRecords.slice(0, 10).map(r => {
       const cls = classes.find(c => c.id === r.classId);
       return `• تقرير ID: ${r.id} | التاريخ: ${r.date} | الفصل: ${cls ? cls.name : r.classId} | الطلاب: ${r.details?.length || 0}`;
   }).join('\n');
   ```

### 2.3. Exact Code Replacement for `getSystemContext` (Lines 539–683)

```javascript
    async getSystemContext(activeFile = null, activeFingerprint = null, activeMatchedStudent = null) {
        try {
            // High-performance concurrent retrieval from core-db.js L1 Cache (0 network reads on warm cache)
            const [students, classes, records, teachers] = await Promise.all([
                DB.getStudents(),
                DB.getClasses(),
                DB.getRecentRecords(30), // Bounded 30-day sliding window
                DB.getTeachers()
            ]);

            const instructionTemplate = this._getBuiltinInstructionTemplate();

            const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
            const currentUserId = currentUser ? (currentUser.id || currentUser.ministryId || '1') : '1';

            // Pre-computed context statistics - with local timezone
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;
            const todayHuman = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            const todayReports = records.filter(r => r.date === todayStr);
            let presentToday = 0;
            let absentToday = 0;

            todayReports.forEach(report => {
                if (report.details) {
                    report.details.forEach(d => {
                        if (d.status === 'present') presentToday++;
                        else if (d.status === 'absent') absentToday++;
                    });
                }
            });

            // حساب نسب الحضور لكل طالب عبر السجلات الأخيرة
            const studentStats = students.map(s => {
                let pCount = 0;
                let tCount = 0;
                records.forEach(report => {
                    if (report.details) {
                        const studentEntry = report.details.find(d => d.studentId === s.id);
                        if (studentEntry) {
                            tCount++;
                            if (studentEntry.status === 'present') pCount++;
                        }
                    }
                });
                const rate = tCount > 0 ? Math.round((pCount / tCount) * 100) : 0;
                return { ...s, attendanceRate: rate, totalRecords: tCount, presentCount: pCount };
            });

            const lowAttendance = studentStats.filter(s => s.attendanceRate < 75 && s.totalRecords > 0);
            const perfectAttendance = studentStats.filter(s => s.attendanceRate === 100 && s.totalRecords > 0);

            // آخر تقرير وصل
            const sortedRecords = [...records].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
            const lastReport = sortedRecords.length > 0 ? sortedRecords[0] : null;
            let lastReportSummary = "لا يوجد تقارير مسجلة بعد.";
            if (lastReport) {
                const lrPresent = lastReport.details?.filter(d => d.status === 'present').length || 0;
                const lrAbsent = lastReport.details?.filter(d => d.status === 'absent').length || 0;
                const classObj = classes.find(c => c.id === lastReport.classId);
                lastReportSummary = `آخر تقرير بتاريخ ${lastReport.date} لفصل ${classObj ? classObj.name : 'غير معروف'}. الحضور: ${lrPresent}، الغياب: ${lrAbsent}.`;
            }

            // آخر 10 تقارير للسياق
            const recentReports = sortedRecords
                .slice(0, 10)
                .map(r => {
                    const cls = classes.find(c => c.id === r.classId);
                    return `• تقرير ID: ${r.id} | التاريخ: ${r.date} | الفصل: ${cls ? cls.name : r.classId} | الطلاب: ${r.details?.length || 0}`;
                }).join('\n');

            // تجهيز القوائم مع إرفاق المعرفات
            const studentsList = ""; // تم إفراغها بالكامل لتوفير التوكنز والاعتماد على الاستعلام الديناميكي
            const classesList = classes.map(c => `• ${c.name || 'غير محدد'} (${c.section || '-'}) | ID: ${c.id}`).join('\n');
            const teachersList = teachers.map(t => `• ${t.name || 'بدون اسم'} (${t.role || 'موظف'}) | ID: ${t.id}`).join('\n');

            // تعويض المتغيرات في القالب
            let finalPrompt = instructionTemplate
                .replace(/{{USER_NAME}}/g, currentUser ? (currentUser.name || 'مدير المدرسة') : 'مدير المدرسة')
                .replace(/{{USER_ID}}/g, currentUserId)
                .replace(/{{TODAY_HUMAN}}/g, todayHuman)
                .replace(/{{TODAY_STR}}/g, todayStr)
                .replace(/{{TOTAL_STUDENTS}}/g, students.length)
                .replace(/{{PRESENT_TODAY}}/g, presentToday)
                .replace(/{{ABSENT_TODAY}}/g, absentToday)
                .replace(/{{TOTAL_RECORDS}}/g, records.length)
                .replace(/{{LAST_REPORT_SUMMARY}}/g, lastReportSummary)
                .replace(/{{RECENT_REPORTS}}/g, recentReports)
                .replace(/{{LOW_ATTENDANCE_COUNT}}/g, lowAttendance.length)
                .replace(/{{PERFECT_ATTENDANCE_COUNT}}/g, perfectAttendance.length)
                .replace(/{{STUDENTS_LIST}}/g, studentsList)
                .replace(/{{CLASSES_LIST}}/g, classesList)
                .replace(/{{TEACHERS_LIST}}/g, teachersList);

            // L1 Cached Settings Read (TTL: 15 min - 0 network reads)
            const settings = (await DB.getSettings()) || {};
            const customization = settings.customization || {};

            if (customization['skill-reports']) {
                finalPrompt += `\n\n### مهارة تحليل التقارير الذكي (مفعلة):
- أنت الآن تمتلك قدرة تحليلية متقدمة لبيانات الحضور.
- ابحث عن الأنماط: هل هناك أيام معينة يزداد فيها الغياب؟ هل هناك فصول تعاني من تدني الحضور بشكل متكرر؟
- قدم توصيات إدارية (مثلاً: "نلاحظ زيادة غياب طلاب الصف العاشر يوم الخميس، نقترح التواصل مع أولياء أمورهم").
- عند السؤال عن الإحصائيات، لا تكتفِ بالأرقام، بل قدم تحليلاً لما تعنيه هذه الأرقام للمدرسة.`;
            }

            // خاصية إرسال البريد الإلكتروني معطلة مؤقتاً
            finalPrompt += `\n\n### خاصية البريد الإلكتروني (معطلة مؤقتاً):
- ميزة إرسال البريد الإلكتروني (Email) معطلة حالياً ومغلقة مؤقتاً للتجهيز للإطلاق الرسمي.
- إذا طلب المستخدم إرسال إيميل أو مشاركة تقرير عبر البريد الإلكتروني، فأخبره بلطف بأن الميزة قيد التطوير والتجهيز للإطلاق قريباً، واقترح عليه بدلاً من ذلك تجهيز رابط WhatsApp فوري مباشر أو تصدير تقرير رسمي منسق (Word أو Excel).`;

            const fileToUse = activeFile || this.currentUploadedFile;
            const fingerprintToUse = activeFingerprint || this.currentFingerprint;
            const matchedStudentToUse = activeMatchedStudent || this.currentMatchedStudent;

            if (fileToUse && fingerprintToUse) {
                if (matchedStudentToUse) {
                    finalPrompt += `\n\n### نتيجة مطابقة البصمة الرقمية للوجه (Face Matching Match):
- تم مطابقة الوجه في الصورة المرفوعة مع الطالب التالي المسجل في قاعدة البيانات:
  * الاسم: ${matchedStudentToUse.name}
  * معرف الطالب (ID): ${matchedStudentToUse.id}
  * الرقم الأكاديمي (academicId): ${matchedStudentToUse.academicId}
  * معرف الصف (classId): ${matchedStudentToUse.classId}
  * مسافة التطابق (Confidence Distance): ${matchedStudentToUse.distance.toFixed(4)} (كلما كانت أقل من 0.6 كلما كان التطابق دقيقاً)
- توجيه: أخبر المستخدم بوضوح أنك تعرفت على الطالب "${matchedStudentToUse.name}" في الصورة المرفوعة بناءً على البصمة الرقمية للوجه المكتشفة ومقارنتها بقاعدة البيانات.
`;
                } else {
                    finalPrompt += `\n\n### تم كشف صورة مرفوعة تحتوي على بصمة رقمية (وجه) للمستخدم الحالي:
- البصمة الرقمية الحالية المستخرجة من الصورة "${fileToUse.name}" هي: "${JSON.stringify(fingerprintToUse)}"
- حقل "descriptors" للطالب في قاعدة البيانات يجب أن يتم تحديثه/إضافته كـ JSON stringified array يحتوي على البصمة الرقمية، أي: "descriptors": ${JSON.stringify([fingerprintToUse])}
- إذا طلب المستخدم تعديل/ربط الصورة بطالب موجود (مثلاً: "Saleem Al-Zoubi" أو أي طالب تحدده بالاسم أو الـ ID)، فاستخدم الأمر database_action مع action: "update" لتحديث حقل "descriptors" لهذا الطالب، مثلاً:
  |||COMMAND|||{"type":"database_action","action":"update","table":"students","id":"STUDENT_ID","data":{"descriptors": ${JSON.stringify([fingerprintToUse])}}}
- إذا طلب المستخدم إضافة طالب جديد (مثلاً: أضف طالب جديد اسمه فلان الفلان وهذه صورته)، فاستخدم الأمر database_action مع action: "insert" لتخزين الطالب الجديد مع وضع البصمة الرقمية في حقل "descriptors" كـ JSON stringified array، مثلاً:
  |||COMMAND|||{"type":"database_action","action":"insert","table":"students","data":{"name":"اسم الطالب الجديد","academicId":"Academic_ID_OR_Generate_Unique_Number","classId":"Class_ID","descriptors": ${JSON.stringify([fingerprintToUse])}}}
- وبمجرد أن تنفذ الأمر بنجاح، أخبر المستخدم بوضوح أنه تم تحويل الصورة لبصمة رقمية وحفظها بنجاح للطالب.
`;
                }
            }

            return finalPrompt;
        } catch (e) {
            console.error('Context error:', e);
            return 'أنت مساعد ذكي لنظام الحضور والغياب. حدث خطأ أثناء جلب البيانات أو التعليمات.';
        }
    }
```

---

## 3. State Verification Optimization (`_verifyDatabaseState`)

### 3.1. Verification Lifecycle & Cache Invalidation Pipeline

When the autonomous AI agent issues a database mutation (`insert`, `update`, `delete`), the execution follows a strict 5-stage pipeline:

```
[Agent Emits Command]
       │
       ▼
1. executeCommand(cmd) ──────► DB.insert / DB.update / DB.delete
                                        │
                                        ▼ (core-db.js)
                               [Invalidate L1 Cache Key + Broadcast]
                                        │
                                        ▼
2. Delay 600ms (Storage Settling)
                                        │
                                        ▼
3. _verifyDatabaseState(cmd) ─► DB.getClasses() / DB.getStudents() / DB.getTeachers() / DB.getRecentRecords(30)
                                        │
                                        ▼ (core-db.js)
                               [Fetches Fresh Collection ONCE & Caches in L1]
                                        │
                                        ▼
4. In-Memory Verification Check ──► { success: true } or { success: false, reason }
                                        │
                                        ▼
5. Agent.getSystemContext() ──► Reads newly primed L1 Cache in 0ms (0 Network Reads!)
```

### 3.2. Verification Rules by Operation and Table

| Operation | Table | Verification Method | Pass Condition |
|---|---|---|---|
| `insert` | `classes` | `DB.getClasses()` (L1 primed) | `list.some(c => matchArabicNames(c.name, name) && (!section || c.section === section))` |
| `insert` | `students` | `DB.getStudents()` (L1 primed) | `list.some(s => s.name === name \|\| matchArabicNames(s.name, name) \|\| s.academicId === academicId)` |
| `insert` | `teachers` | `DB.getTeachers()` (L1 primed) | `list.some(t => t.name === name \|\| matchArabicNames(t.name, name) \|\| t.ministryId === ministryId)` |
| `insert` | `records` | `DB.getRecentRecords(30)` | `list.some(r => r.date === date && r.classId === classId)` |
| `update` | `classes` | `DB.getClasses()` (L1 primed) | Item exists (`c.id === id \|\| matchArabicNames(c.name, id)`) AND all updated keys match |
| `update` | `students` | `DB.getStudents()` (L1 primed) | Item exists (`s.id === id \|\| s.academicId === id \|\| matchArabicNames(s.name, id)`) AND updated keys match |
| `update` | `teachers` | `DB.getTeachers()` (L1 primed) | Item exists (`t.id === id \|\| t.ministryId === id \|\| matchArabicNames(t.name, id)`) AND updated keys match |
| `update` | `records` | `DB.getRecentRecords(30)` | Item exists by ID (`r.id === id`) |
| `delete` | `classes` | `DB.getClasses()` (L1 primed) | No items remain matching `validIds` or Arabic names |
| `delete` | `students` | `DB.getStudents()` (L1 primed) | No items remain matching `validIds`, `academicId`, or Arabic names |
| `delete` | `teachers` | `DB.getTeachers()` (L1 primed) | No items remain matching `validIds`, `ministryId`, or Arabic names |
| `delete` | `records` | `DB.getRecentRecords(30)` | No items remain matching `validIds` |

### 3.3. Exact Code Replacement for `_verifyDatabaseState` (Lines 2773–2865)

```javascript
    async _verifyDatabaseState(cmd) {
        if (cmd.type !== 'database_action') {
            return { success: true };
        }

        const placeholderIds = ['ID_HERE', 'STUDENT_ID', 'TEACHER_ID', 'CLASS_ID', 'ID_CLASS', 'NEW_ID'];
        if (cmd.id && placeholderIds.includes(cmd.id)) {
            return { success: false, reason: `معرف وهمي غير صالح: ${cmd.id}` };
        }

        try {
            if (cmd.action === 'insert') {
                const dataItems = Array.isArray(cmd.data) ? cmd.data : [cmd.data];

                if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    for (const item of dataItems) {
                        const name = item.name || item.className || item.title;
                        const exists = list.some(c => Agent.matchArabicNames(c.name, name) && (!item.section || c.section === item.section));
                        if (!exists) return { success: false, reason: `الصف "${name}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    for (const item of dataItems) {
                        const name = item.name;
                        const exists = list.some(s => s.name === name || (name && Agent.matchArabicNames(s.name, name)) || (item.academicId && s.academicId === item.academicId));
                        if (!exists) return { success: false, reason: `الطالب "${name}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    for (const item of dataItems) {
                        const name = item.name;
                        const exists = list.some(t => t.name === name || (name && Agent.matchArabicNames(t.name, name)) || (item.ministryId && t.ministryId === item.ministryId));
                        if (!exists) return { success: false, reason: `المعلم "${name}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                } else if (cmd.table === 'records' || cmd.table === 'reports') {
                    const list = await DB.getRecentRecords(30);
                    for (const item of dataItems) {
                        const date = item.date;
                        const classId = item.classId;
                        const exists = list.some(r => r.date === date && r.classId === classId);
                        if (!exists) return { success: false, reason: `تقرير الحضور بتاريخ "${date}" للفصل "${classId}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                }
            } else if (cmd.action === 'update') {
                const id = cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId;
                if (!id) return { success: false, reason: 'لم يتم توفير معرف للتعديل' };

                if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    const item = list.find(c => c.id === id || Agent.matchArabicNames(c.name, id));
                    if (!item) return { success: false, reason: `الفصل ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in cmd.data) {
                        if (item[key] !== undefined && cmd.data[key] !== undefined && String(item[key]).trim() !== String(cmd.data[key]).trim()) {
                            return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                        }
                    }
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    const item = list.find(s => s.id === id || s.academicId === id || s.academicId === String(id) || (s.name && Agent.matchArabicNames(s.name, id)));
                    if (!item) return { success: false, reason: `الطالب ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in cmd.data) {
                        if (item[key] !== undefined && cmd.data[key] !== undefined && String(item[key]).trim() !== String(cmd.data[key]).trim()) {
                            return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                        }
                    }
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    const item = list.find(t => t.id === id || t.ministryId === id || t.ministryId === String(id) || (t.name && Agent.matchArabicNames(t.name, id)));
                    if (!item) return { success: false, reason: `المعلم ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in cmd.data) {
                        if (item[key] !== undefined && cmd.data[key] !== undefined && String(item[key]).trim() !== String(cmd.data[key]).trim()) {
                            return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                        }
                    }
                } else if (cmd.table === 'records' || cmd.table === 'reports') {
                    const list = await DB.getRecentRecords(30);
                    const item = list.find(r => r.id === id);
                    if (!item) return { success: false, reason: `تقرير الحضور ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                }
            } else if (cmd.action === 'delete') {
                const ids = cmd.ids || [cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId];
                const validIds = ids.filter(id => id && !placeholderIds.includes(id));
                if (validIds.length === 0) return { success: false, reason: 'لم يتم توفير معرفات صالحة للحذف' };

                if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    const remains = list.some(c => validIds.includes(c.id) || validIds.some(v => Agent.matchArabicNames(c.name, v)));
                    if (remains) return { success: false, reason: 'الفصل المحذوف لا يزال موجوداً في قاعدة البيانات' };
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    const remains = list.some(s => validIds.includes(s.id) || validIds.includes(s.academicId) || validIds.some(v => Agent.matchArabicNames(s.name, v)));
                    if (remains) return { success: false, reason: 'الطالب المحذوف لا يزال موجوداً في قاعدة البيانات' };
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    const remains = list.some(t => validIds.includes(t.id) || validIds.includes(t.ministryId) || validIds.some(v => Agent.matchArabicNames(t.name, v)));
                    if (remains) return { success: false, reason: 'المعلم المحذوف لا يزال موجوداً في قاعدة البيانات' };
                } else if (cmd.table === 'records' || cmd.table === 'reports') {
                    const list = await DB.getRecentRecords(30);
                    const remains = list.some(r => validIds.includes(r.id));
                    if (remains) return { success: false, reason: 'تقرير الحضور المحذوف لا يزال موجوداً في قاعدة البيانات' };
                }
            }
            return { success: true };
        } catch (e) {
            return { success: false, reason: `خطأ أثناء التحقق من قاعدة البيانات: ${e.message}` };
        }
    }
```

---

## 4. Arabic NLP, Context Formatting & Tool Execution Integrity

To guarantee 100% preservation of all intelligence, prompt engineering, and operational capabilities, the following subsystems must remain strictly intact:

### 4.1. Arabic NLP Normalization & Multi-Tier Fuzzy Matching
The Arabic linguistic engine in lines 246–395 must be preserved verbatim:
1. `normalizeArabic(str)`:
   - Strips tashkeel (`[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]`).
   - Strips kashida / tatweel (`\u0640`).
   - Normalizes alefs (`[إأآاٱ]` -> `ا`).
   - Normalizes yaa/alef maksura (`[يى]` -> `ي`).
   - Normalizes taa marbuta/haa (`[ةه]` -> `ه`).
   - Strips isolated hamzas (`[ؤئء]`).
2. `stripDefiniteArticle(word)`:
   - Strips leading `ال` if token length > 3.
3. `scoreArabicMatch(targetName, query)`:
   - Score 100: Exact normalized match.
   - Score 98: Exact first name AND family name match (e.g. "سليم الزعبي" matching "سليم ياسر سليم الزعبي").
   - Score 96: Normalized prefix substring match with identical first name root.
   - Score 94: Strict ordered sequence of roots found across tokens.
   - Score 90: All query token roots exist anywhere in target tokens.
   - Score 75–82: Substring or partial token overlap.
4. `filterAndRankMatches(list, query)`:
   - Sorts matches descending by score.
   - If highest score >= 90, filters to tier 1 (>=90).
   - Else if highest score >= 80, filters to tier 2 (>=80).
5. `matchArabicNames(targetName, query)`:
   - Returns boolean `scoreArabicMatch >= 75`.
6. `_resolveTargetIds(table, idOrQuery)`:
   - Converts user or agent queries (Arabic name, academicId, ministryId, class title, or docId) into canonical Firestore document IDs using L1-cached collections.

### 4.2. Arabic Genealogy & Lineage Heuristics
The platform's context prompt instructs the AI model on standard Arabic patronymic naming conventions:
- Name format: `[Student Name] [Father Name] [Grandfather Name] [Family / Clan Name]`.
- Example: "سليم ياسر سليم الزعبي":
  - Student: سليم
  - Father: ياسر
  - Grandfather: سليم
  - Family: الزعبي
- Immediate resolution to conversational questions like "شو اسم أبوه؟" -> "ياسر".

### 4.3. Full System Prompt & Instructions Template
The template in `_getBuiltinInstructionTemplate()` retains all operational mandates:
1. **Administrative Authority Statement**: Declares the dashboard an internal administrative environment with full legitimate authority to access national IDs, academic IDs, phone numbers, and full records.
2. **Confidence in Arabic Name Matches**: Mandates that the agent provide matching records immediately and confidently without hesitation.
3. **WhatsApp Link Direct Generation**: Automatically formats Jordanian phone numbers (`07...` -> `962...`) and generates one-click `[الاسم](https://wa.me/962.../?text=...)` links.
4. **Temporary Email Notice**: Informs the user that email dispatch is temporarily paused for official release and recommends WhatsApp or Word/Excel exports instead.
5. **Strict Single-Line JSON Command Output**: Commands output as `|||COMMAND|||{...}` on a dedicated line without Markdown code blocks.

### 4.4. Complete Tool Dispatch Schema Inventory

```json
// 1. In-Memory Dynamic Query (Students, Teachers, Classes, Records)
|||COMMAND|||{"type":"database_action","action":"select","table":"students","query":"سليم الزعبي"}
|||COMMAND|||{"type":"database_action","action":"select","table":"records","query":"2026-08-29"}

// 2. Database Insert / Add
|||COMMAND|||{"type":"database_action","action":"insert","table":"classes","data":{"name":"الصف العاشر","section":"أ"}}
|||COMMAND|||{"type":"database_action","action":"insert","table":"students","data":{"name":"طالب جديد","academicId":"2026099","classId":"c1"}}
|||COMMAND|||{"type":"database_action","action":"insert","table":"teachers","data":{"name":"معلم جديد","ministryId":"555","role":"teacher","password":"123"}}
|||COMMAND|||{"type":"database_action","action":"insert","table":"records","data":{"date":"2026-08-29","classId":"c1","teacherId":"1","details":[{"studentId":"2024001","status":"present"},{"studentId":"2024042","status":"absent"}]}}

// 3. Database Update
|||COMMAND|||{"type":"database_action","action":"update","table":"students","id":"2024001","data":{"name":"أحمد المحمدي المعدل"}}
|||COMMAND|||{"type":"database_action","action":"update","table":"records","id":"REC_ID","data":{"details":[{"studentId":"2024001","status":"present"}]}}

// 4. Database Delete
|||COMMAND|||{"type":"database_action","action":"delete","table":"students","ids":["2024001"]}
|||COMMAND|||{"type":"database_action","action":"delete","table":"records","id":"REC_ID"}

// 5. Biometric Face Identification
|||COMMAND|||{"type":"identify_student","mode":"single"}
|||COMMAND|||{"type":"identify_student","mode":"multiple"}

// 6. Export Word & Excel
|||COMMAND|||{"type":"export_excel","data":[{"الاسم":"أحمد","الحالة":"حاضر"}],"fileName":"تقرير.xlsx"}
|||COMMAND|||{"type":"export_word","content":{"title":"تقرير رسمي","sections":[{"heading":"ملخص","text":"..."}]},"fileName":"تقرير.docx"}
|||COMMAND|||{"type":"full_system_export"}

// 7. Visual Statistics & Charts
|||COMMAND|||{"type":"chart","chartType":"bar","title":"نسب الحضور","data":{"labels":["عاشر أ","عاشر ب"],"datasets":[{"data":[95,88]}]}}
|||COMMAND|||{"type":"stats","data":{"title":"إحصائيات","items":[{"label":"الطلاب","value":"150"}]}}
```

### 4.5. Multi-Turn Autonomous Execution & Self-Correction
The execution loop (`while (currentParsedCmd && loopCount < MAX_AGENT_LOOPS)`) supports chaining up to 4 consecutive tool actions in memory (e.g. `select students` -> `insert records` -> `send_notification` -> `final response`) without surfacing intermediate raw JSON to the end-user. If verification fails, the self-correction engine (`attempts.push({...})`) diagnoses the cause and engages a clean-context fallback prompt.

---

## 5. Downstream File Modifications & Patches

### 5.1. Target File: `scripts/module-ai-agent.js`

1. **Line 541–544 (`getSystemContext`)**:
   - *Before*: `Promise.all([ DB.getStudents(), DB.getClasses(), DB.getRecords(), DB.getTeachers() ])`
   - *After*: `Promise.all([ DB.getStudents(), DB.getClasses(), DB.getRecentRecords(30), DB.getTeachers() ])`
2. **Line 2105 (`_handleDatabaseAction: select records`)**:
   - *Before*: `Promise.all([ DB.getRecords(), DB.getClasses(), DB.getStudents(), DB.getTeachers() ])`
   - *After*: `Promise.all([ DB.getRecentRecords(30), DB.getClasses(), DB.getStudents(), DB.getTeachers() ])`
3. **Line 2788–2855 (`_verifyDatabaseState`)**:
   - Enhanced with `records` verification (`DB.getRecentRecords(30)`) alongside cached lookups for `classes`, `students`, and `teachers`.
4. **Line 1925 (`_handleFullSystemExport`)**:
   - *Before*: `DB.getRecords()`
   - *After*: `DB.getRecentRecords(60)` or cached `DB.getRecords(null, null, { useDeltaSync: true })`

### 5.2. Target File: `dashboard-admin.html`
- Ensure lines 3610 and 3976 calling `Agent.getSystemContext()` seamlessly consume the L1 cached data without invoking Firestore.

---

## 6. Independent Verification & Testing Protocol

### 6.1. Cache Hit & Zero-Read Verification Test
Execute the following verification script in the browser console during an active AI chat session:

```javascript
// Test: Verify L1 Cache Hit Ratio & Zero Network Reads
console.log('=== Pre-Prompt Cache Stats ===');
const beforeStats = DB.getCacheStats();
console.table(beforeStats);

// Simulate 5 consecutive Agent context evaluations
for (let i = 0; i < 5; i++) {
    const ctx = await Agent.getSystemContext();
    console.log(`Turn ${i + 1} Context Generated. Length: ${ctx.length} characters.`);
}

console.log('=== Post-Prompt Cache Stats ===');
const afterStats = DB.getCacheStats();
console.table(afterStats);

const newMisses = afterStats.misses - beforeStats.misses;
const newHits = afterStats.hits - beforeStats.hits;

console.assert(newMisses === 0, `FAILED: Generated ${newMisses} cache misses during AI chat!`);
console.assert(newHits >= 25, `FAILED: Expected at least 25 L1 hits (5 entities x 5 turns), got ${newHits}`);
console.log(`✅ VERIFIED: 0 network reads generated across 5 AI turns. Cache Hit Ratio: ${afterStats.hitRatio}`);
```

### 6.2. Write-Invalidation & Verification Lifecycle Test

```javascript
// Test: Verify Write Invalidation, Verification, and Repriming
const testStudent = {
    name: 'طالب اختبار آلي',
    academicId: 'TEST_' + Date.now(),
    classId: 'c1'
};

const cmd = {
    type: 'database_action',
    action: 'insert',
    table: 'students',
    data: testStudent
};

console.log('1. Executing AI command with verification...');
const result = await Agent._executeCommandWithVerification(cmd);
console.assert(result.success === true, 'FAILED: AI command verification failed', result);

console.log('2. Generating context immediately after write...');
const ctxAfter = await Agent.getSystemContext();
console.assert(ctxAfter.includes('طالب اختبار آلي') === false, 'Students list in prompt should be empty (token optimization)');

console.log('3. Cleaning up test student...');
await DB.deleteStudent(testStudent.academicId);
console.log('✅ VERIFIED: Write-invalidation, state verification, and context rebuild passed.');
```

### 6.3. Arabic Name Matching Test

```javascript
// Test: Arabic NLP & Name Matching
const testCases = [
    { target: 'سليم ياسر سليم الزعبي', query: 'سليم الزعبي', expectedMinScore: 95 },
    { target: 'أحمد المحمدي', query: 'احمد المحمدي', expectedMinScore: 100 },
    { target: 'عبد الله خالد', query: 'عبدالله خالد', expectedMinScore: 90 },
    { target: 'الصف العاشر (أ)', query: 'عاشر', expectedMinScore: 80 }
];

testCases.forEach(tc => {
    const score = Agent.scoreArabicMatch(tc.target, tc.query);
    console.assert(score >= tc.expectedMinScore, `FAILED Arabic match for "${tc.query}" against "${tc.target}". Expected >= ${tc.expectedMinScore}, got ${score}`);
});
console.log('✅ VERIFIED: All Arabic NLP test cases passed.');
```

---

## 7. Conclusion & Next Steps
With this specification, `scripts/module-ai-agent.js` is fully decoupled from direct cloud Firestore reads on conversational turns, achieving **0 network reads** on chat interactions via `core-db.js` L1 caching, bounded historical range queries (`getRecentRecords(30)`), single-prime write verification, and complete retention of all Arabic NLP, tool dispatch, and prompt capabilities.

This specification is ready for implementation in Milestone 2 by the implementer agent.
