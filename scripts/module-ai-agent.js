/**
 * AI Agent - النسخة المطورة
 * الإصلاحات: إضافة appendChild المفقود، محلل JSON قوي، streaming، أوامر جديدة
 */

const Agent = {
    // ════════════════ CONFIGURATION ════════════════
    provider: 'auto', // 'openrouter', 'inworld', 'deepinfra', or 'auto' (selects automatically based on active key)
    defaultModel: 'qwen/qwen3.7-plus', // Default model to use (e.g. sakana/fugu-ultra)

    // API Keys - can be set directly here or fall back to Gemini/localStorage settings
    apiKeys: {
        openrouter: '', // If empty, will fallback to Gemini.getOpenRouterKey()
        inworld: '',    // If empty, will fallback to Gemini.getInworldKey()
        deepinfra: ''   // Put your DeepInfra API key here (e.g., 'your_key')
    },

    getEffectiveProvider() {
        if (this.provider !== 'auto') {
            return this.provider;
        }
        const openrouterKey = this.apiKeys.openrouter || (typeof Gemini !== 'undefined' ? Gemini.getOpenRouterKey() : '');
        const deepinfraKey = this.apiKeys.deepinfra || localStorage.getItem('deepinfra_api_key') || '';
        const inworldKey = this.apiKeys.inworld || (typeof Gemini !== 'undefined' ? Gemini.getInworldKey() : '');

        if (openrouterKey) return 'openrouter';
        if (deepinfraKey) return 'deepinfra';
        if (inworldKey) return 'inworld';
        return 'openrouter'; // Fallback
    },
    // ══════════════════════════════════════════════

    chatHistory: [],
    isOpen: false,
    isStreaming: false,
    currentMatchedStudent: null,

    scrollToBottom(force = false) {
        const messages = document.getElementById('agent-messages');
        if (!messages) return;
        if (force) {
            messages.scrollTop = messages.scrollHeight;
            this.userHasScrolledUp = false;
        } else {
            if (this.userHasScrolledUp) return;
            const isAtBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 120;
            if (isAtBottom) {
                messages.scrollTop = messages.scrollHeight;
            }
        }
    },

    async init() {
        if (typeof GmailManager !== 'undefined') {
            await GmailManager.init();
        }
        this.userHasScrolledUp = false;
        this.lastScrollTop = 0;
        this.renderToggle();
        this.chatHistory = [{ role: 'system', content: await this.getSystemContext() }];
    },

    // ═══ القالب المدمج للتعليمات (Fallback عند فشل fetch) ═══
    _getBuiltinInstructionTemplate() {
        return `أنت وكيل إداري متكامل لنظام حضور وغياب المدارس "حضوري".
المستخدم الحالي: {{USER_NAME}} (ID: {{USER_ID}})
تاريخ اليوم: {{TODAY_HUMAN}} ({{TODAY_STR}})

═══ إحصائيات النظام الحالية ═══
إجمالي الطلاب المسجلين: {{TOTAL_STUDENTS}} طالب
حضور اليوم ({{TODAY_STR}}): {{PRESENT_TODAY}} | غياب اليوم: {{ABSENT_TODAY}}
إجمالي التقارير المسجلة في التاريخ: {{TOTAL_RECORDS}} تقرير
{{LAST_REPORT_SUMMARY}}

═══ السجلات والتقارير الأخيرة (IDs للتعامل معها) ═══
{{RECENT_REPORTS}}

═══ ملخص حالة الطلاب ═══
• طلاب يتطلبون متابعة (حضور < 75%): {{LOW_ATTENDANCE_COUNT}}
• طلاب متميزون (حضور 100%): {{PERFECT_ATTENDANCE_COUNT}}

═══ الفصول الدراسية (IDs للاستخدام) ═══
{{CLASSES_LIST}}

═══ المعلمون والموظفون (IDs للاستخدام) ═══
{{TEACHERS_LIST}}

═══ الاستعلام عن تفاصيل الطلاب والبيانات ═══
لتوفير استهلاك التوكنز، لا يتم تحميل قائمة الطلاب التفصيلية ولا سجلات الحضور التفصيلية في السياق تلقائياً.
إذا طلب المستخدم تفاصيل عن طالب معين (مثال: "عطني معلومات أحمد" أو "تواصل مع ولي أمر سالم" أو "ما هي نسبة حضور محمد") أو تفاصيل معلم أو سجلات حضور، يجب عليك أولاً إجراء استعلام للبحث في قاعدة البيانات باستخدام الأمر التالي:
|||COMMAND|||{"type":"database_action","action":"select","table":"students","query":"اسم الطالب أو جزء منه"}
أو للبحث عن معلم:
|||COMMAND|||{"type":"database_action","action":"select","table":"teachers","query":"اسم المعلم"}
أو للبحث عن سجل حضور:
|||COMMAND|||{"type":"database_action","action":"select","table":"records","query":"التاريخ مثل 2024-04-22 أو معرف الفصل"}

بمجرد إرسال هذا الأمر، سيقوم النظام بالبحث تلقائياً وإعادة تزويدك بالنتائج المفصلة في رسالة مخفية لتتمكن من صياغة الرد النهائي للمستخدم.

═══ قدراتك (أنواع الأوامر) ═══

1) database_action — عمليات قاعدة البيانات
الجداول المدعومة: students, teachers, classes, records
للإضافة: insert، للتعديل: update، للحذف: delete
للطلاب استخدم academicId كمعرف. للمعلمين والفصول والتقارير استخدم id من القوائم.
**قاعدة:** schoolId يُضاف تلقائياً — لا ترسله.

أمثلة:
|||COMMAND|||{"type":"database_action","action":"insert","table":"students","data":{"name":"اسم جديد","academicId":"123","classId":"c1","phone":"079xxx"}}
|||COMMAND|||{"type":"database_action","action":"insert","table":"teachers","data":{"name":"معلم","ministryId":"333","role":"teacher","password":"123"}}
|||COMMAND|||{"type":"database_action","action":"insert","table":"classes","data":{"name":"الصف","section":"أ"}}
|||COMMAND|||{"type":"database_action","action":"insert","table":"records","data":{"date":"2024-04-22","classId":"c1","teacherId":"{{USER_ID}}","details":[{"studentId":"2024001","status":"present"},{"studentId":"2024042","status":"absent"}]}}
|||COMMAND|||{"type":"database_action","action":"update","table":"students","id":"2024001","data":{"name":"اسم معدل"}}
|||COMMAND|||{"type":"database_action","action":"delete","table":"students","ids":["ID1","ID2"]}
|||COMMAND|||{"type":"database_action","action":"delete","table":"records","id":"REPORT_ID"}

2) export_excel — تصدير إكسل
|||COMMAND|||{"type":"export_excel","data":[{"الاسم":"أحمد","الحالة":"غائب"}],"fileName":"تقرير.xlsx"}

3) export_word — تصدير وورد
|||COMMAND|||{"type":"export_word","content":{"title":"عنوان","sections":[{"heading":"مقدمة","text":"نص"}]},"fileName":"تقرير.docx"}

4) chart — رسم بياني (bar, line, pie, doughnut)
|||COMMAND|||{"type":"chart","chartType":"bar","labels":["أ","ب"],"values":[80,90],"title":"نسبة الحضور"}

5) send_email — إرسال إيميل (Gmail API)
|||COMMAND|||{"type":"send_email","to":"email@example.com","subject":"موضوع","message":"النص"}

6) send_notification — إشعار دفع للهاتف
|||COMMAND|||{"type":"send_notification","title":"عنوان","body":"نص التنبيه","url":"/dashboard-teacher.html"}

7) full_system_export — تصدير شامل (3 ورقات: طلاب + معلمون + سجلات حضور)
|||COMMAND|||{"type":"full_system_export"}

8) stats — إحصائيات سريعة
|||COMMAND|||{"type":"stats","data":{"title":"إحصائيات","items":[{"label":"الطلاب","value":"150"}]}}

9) identify_student — التعرف على الوجه واستخراج البصمة الرقمية من الصورة المرفوعة
|||COMMAND|||{"type":"identify_student"}

10) web_search — البحث في الويب (مدمج تلقائياً عبر OpenRouter)
عندما يسألك المستخدم عن معلومات عامة، حية، أو تاريخية خارج قاعدة البيانات المحلية، سيقوم خادم OpenRouter تلقائياً بتشغيل أداة البحث وإرجاع النتائج لك لتصيغ ردك النهائي بها.

═══ قواعد صارمة ═══
1. |||COMMAND||| في سطر مستقل في نهاية ردك — بدون json أو \`\`\`.
2. JSON صحيح ومغلق الأقواس.
3. استخدم المعرفات الصحيحة من القوائم أعلاه فقط.
4. أمر واحد فقط لكل رد.
5. لا توجد خاصية "حظر" للمعلمين في هذا النظام.
6. لا يمكن تسجيل حضور لنفس الفصل في نفس اليوم مرتين.

═══ قواعد سلوكية ═══
1. لديك صلاحيات كاملة — نفذ فوراً دون تردد.
2. لا تقترح خطوات يدوية — نفذ المهمة مباشرة.
3. أبلغ بالنتيجة بوضوح (تم/فشل).
4. قبل الحذف الجماعي، اطلب التأكيد واذكر العدد.
5. تصرف باستباقية: حلل البيانات وقدم توصيات.`;
    },

    async getSystemContext() {
        try {
            const [students, classes, records, teachers, fetchedTemplate] = await Promise.all([
                DB.getStudents(), DB.getClasses(), DB.getRecords(), DB.getTeachers(),
                fetch('agent-instructions.md?v=' + Date.now()).then(r => {
                    if (!r.ok) throw new Error('File not found');
                    return r.text();
                }).catch((err) => {
                    console.warn('Fallback to builtin instruction template:', err);
                    return null; // سيُستخدم القالب المدمج
                })
            ]);

            // استخدام القالب المحمّل أو القالب المدمج كـ Fallback
            const instructionTemplate = fetchedTemplate || this._getBuiltinInstructionTemplate();

            const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
            const currentUserId = currentUser ? currentUser.id : '1';

            // إحصائيات مسبقة للسياق - مع مراعاة المنطقة الزمنية المحلية
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

            // حساب نسب الحضور لكل طالب عبر جميع التقارير
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
            const lastReport = records.length > 0 ? records.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))[0] : null;
            let lastReportSummary = "لا يوجد تقارير مسجلة بعد.";
            if (lastReport) {
                const lrPresent = lastReport.details?.filter(d => d.status === 'present').length || 0;
                const lrAbsent = lastReport.details?.filter(d => d.status === 'absent').length || 0;
                const classObj = classes.find(c => c.id === lastReport.classId);
                lastReportSummary = `آخر تقرير بتاريخ ${lastReport.date} لفصل ${classObj ? classObj.name : 'غير معروف'}. الحضور: ${lrPresent}، الغياب: ${lrAbsent}.`;
            }

            // آخر 10 تقارير للسياق
            const recentReports = records
                .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
                .slice(0, 10)
                .map(r => {
                    const cls = classes.find(c => c.id === r.classId);
                    return `• تقرير ID: ${r.id} | التاريخ: ${r.date} | الفصل: ${cls ? cls.name : r.classId} | الطلاب: ${r.details?.length || 0}`;
                }).join('\n');

            // تجهيز القوائم مع إرفاق الملاحظات إن وجدت
            const studentsList = ""; // تم إفراغها بالكامل لتوفير التوكنز والاعتماد على الاستعلام الديناميكي
            const classesList = classes.map(c => `• ${c.name || 'غير محدد'} (${c.section || '-'}) | ID: ${c.id}`).join('\n');
            const teachersList = teachers.map(t => `• ${t.name || 'بدون اسم'} (${t.role || 'موظف'}) | ID: ${t.id}`).join('\n');

            // تعويض المتغيرات في القالب
            let finalPrompt = instructionTemplate
                .replace(/{{USER_NAME}}/g, currentUser ? currentUser.name : 'مدير النظام')
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

            // Add Skill-based context
            const settings = (await DB.getSettings()) || {};
            const customization = settings.customization || {};

            if (customization['skill-reports']) {
                finalPrompt += `\n\n### مهارة تحليل التقارير الذكي (مفعلة):
- أنت الآن تمتلك قدرة تحليلية متقدمة لبيانات الحضور.
- ابحث عن الأنماط: هل هناك أيام معينة يزداد فيها الغياب؟ هل هناك فصول تعاني من تدني الحضور بشكل متكرر؟
- قدم توصيات إدارية (مثلاً: "نلاحظ زيادة غياب طلاب الصف العاشر يوم الخميس، نقترح التواصل مع أولياء أمورهم").
- عند السؤال عن الإحصائيات، لا تكتفِ بالأرقام، بل قدم تحليلاً لما تعنيه هذه الأرقام للمدرسة.`;
            }

            if (customization['conn-gmail']) {
                finalPrompt += `\n\n### الربط مع Gmail (مفعل):
- يمكنك الآن إرسال تقارير عبر البريد الإلكتروني باستخدام أمر send_email.
- اقترح على المستخدم إرسال ملخصات الحضور لمدير المدرسة عبر البريد عند انتهاء التحليل.`;
            }

            // Add Gmail API connection state and guidance to AI system prompt
            const isGmailConnected = (typeof GmailManager !== 'undefined' && GmailManager.isConnected());
            finalPrompt += `\n\n### حالة اتصال بريد Gmail الشخصي للمستخدم:
- حالة الربط الحالية: [${isGmailConnected ? 'متصل ومربوط بنجاح' : 'غير متصل وغير مربوط'}].
- توجيهات هامة: ${isGmailConnected ? 'يمكنك الآن إرسال رسائل البريد الإلكتروني مباشرة وحرية باستخدام الأمر send_email.' : 'إذا طلب منك المستخدم إرسال إيميل أو تقرير بالبريد الإلكتروني، فيجب عليك إخباره بوضوح ولطف شديد بأنه لم يقم بربط إيميله الشخصي بعد، وتوجيهه خطوة بخطوة بالخطوات التالية تماماً: "لم تقم بربط بريدك الإلكتروني بعد. يرجى الضغط على زر التخصيص الموجود أعلى الشاشة، ثم اختيار قسم التطبيقات (التطبيقات)، والضغط على كرت Gmail، ثم الضغط على زر (ربط الحساب) وعمل تسجيل دخول بالبريد الذي تريده لتفعيل الإرسال الآمن والمجاني."'}`;

            if (this.currentUploadedFile && this.currentFingerprint) {
                if (this.currentMatchedStudent) {
                    finalPrompt += `\n\n### نتيجة مطابقة البصمة الرقمية للوجه (Face Matching Match):
- تم مطابقة الوجه في الصورة المرفوعة مع الطالب التالي المسجل في قاعدة البيانات:
  * الاسم: ${this.currentMatchedStudent.name}
  * معرف الطالب (ID): ${this.currentMatchedStudent.id}
  * الرقم الأكاديمي (academicId): ${this.currentMatchedStudent.academicId}
  * معرف الصف (classId): ${this.currentMatchedStudent.classId}
  * مسافة التطابق (Confidence Distance): ${this.currentMatchedStudent.distance.toFixed(4)} (كلما كانت أقل من 0.6 كلما كان التطابق دقيقاً)
- توجيه: أخبر المستخدم بوضوح أنك تعرفت على الطالب "${this.currentMatchedStudent.name}" في الصورة المرفوعة بناءً على البصمة الرقمية للوجه المكتشفة ومقارنتها بقاعدة البيانات.
`;
                } else {
                    finalPrompt += `\n\n### تم كشف صورة مرفوعة تحتوي على بصمة رقمية (وجه) للمستخدم الحالي:
- البصمة الرقمية الحالية المستخرجة من الصورة "${this.currentUploadedFile.name}" هي: "${JSON.stringify(this.currentFingerprint)}"
- حقل "descriptors" للطالب في قاعدة البيانات يجب أن يتم تحديثه/إضافته كـ JSON stringified array يحتوي على البصمة الرقمية، أي: "descriptors": ${JSON.stringify([this.currentFingerprint])}
- إذا طلب المستخدم تعديل/ربط الصورة بطالب موجود (مثلاً: "Saleem Al-Zoubi" أو أي طالب تحدده بالاسم أو الـ ID)، فاستخدم الأمر database_action مع action: "update" لتحديث حقل "descriptors" لهذا الطالب، مثلاً:
  |||COMMAND|||{"type":"database_action","action":"update","table":"students","id":"STUDENT_ID","data":{"descriptors": ${JSON.stringify([this.currentFingerprint])}}}
- إذا طلب المستخدم إضافة طالب جديد (مثلاً: أضف طالب جديد اسمه فلان الفلان وهذه صورته)، فاستخدم الأمر database_action مع action: "insert" لتخزين الطالب الجديد مع وضع البصمة الرقمية في حقل "descriptors" كـ JSON stringified array، مثلاً:
  |||COMMAND|||{"type":"database_action","action":"insert","table":"students","data":{"name":"اسم الطالب الجديد","academicId":"Academic_ID_OR_Generate_Unique_Number","classId":"Class_ID","descriptors": ${JSON.stringify([this.currentFingerprint])}}}
- وبمجرد أن تنفذ الأمر بنجاح، أخبر المستخدم بوضوح أنه تم تحويل الصورة لبصمة رقمية وحفظها بنجاح للطالب.
`;
                }
            }

            return finalPrompt;
        } catch (e) {
            console.error('Context error:', e);
            return 'أنت مساعد ذكي لنظام الحضور والغياب. حدث خطأ أثناء جلب البيانات أو التعليمات.';
        }
    },

    toggleChat() {
        this.isOpen = !this.isOpen;
        const container = document.getElementById('agent-container');
        if (this.isOpen) {
            container.classList.remove('hidden');
            setTimeout(() => container.classList.add('active'), 10);
            document.getElementById('agent-input')?.focus();
        } else {
            container.classList.remove('active');
            setTimeout(() => container.classList.add('hidden'), 400);
        }
    },

    renderToggle() {
        const isEmbedded = !!document.getElementById('tab-ai');

        if (!isEmbedded) {
            // FAB Button
            const fab = document.createElement('div');
            fab.id = 'agent-fab';
            fab.className = 'liquid-glass liquid-glass-interactive fixed bottom-6 left-6 w-14 h-14 rounded-2xl z-[100] flex items-center justify-center transition-all';
            fab.innerHTML = `<span class="material-symbols-outlined text-primary text-3xl" style="font-variation-settings: 'FILL' 1;">smart_toy</span>`;
            fab.onclick = () => this.toggleChat();
            document.body.appendChild(fab);

            // Chat Container
            const container = document.createElement('div');
            container.id = 'agent-container';
            container.className = 'hidden fixed bottom-24 left-4 right-4 h-[75vh] z-[100] bg-white/95 dark:bg-white/10 rounded-[2.5rem] border border-black/10 dark:border-white/20 flex flex-col shadow-2xl transition-all duration-400 opacity-0 translate-y-4';
            container.innerHTML = `
                <div class="px-5 py-4 flex justify-between items-center border-b border-black/10 dark:border-white/10 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings:'FILL' 1">auto_awesome</span>
                        </div>
                        <div>
                            <h3 class="font-bold text-neutral-800 dark:text-white text-sm leading-tight">AutoPilot</h3>
                            <div id="agent-status" class="text-xs text-neutral-500 dark:text-white/40">جاهز للمساعدة</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="agent-clear-btn" title="مسح المحادثة" class="w-8 h-8 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-neutral-500 dark:text-white/40 hover:text-neutral-800 dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 transition-all">
                            <span class="material-symbols-outlined text-sm">delete_sweep</span>
                        </button>
                        <button onclick="Agent.toggleChat()" class="text-neutral-500 dark:text-white/40 hover:text-neutral-800 dark:hover:text-white transition-colors flex items-center justify-center">
                            <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
                        </button>
                    </div>
                </div>

                <div id="agent-messages" class="flex-1 overflow-y-auto p-4 space-y-4 liquid-glass-scrollbar hide-scrollbar">
                    <div class="flex flex-col items-start animate-fade-in mx-1">
                        <span class="text-[9px] font-black text-primary mb-1 px-1 uppercase tracking-tight">AutoPilot</span>
                        <div class="bg-white border border-gray-100 text-gray-800 p-4 rounded-2xl rounded-tr-sm text-xs leading-relaxed max-w-[92%] relative">
                            أهلاً! أنا AutoPilot، مساعدك الذكي المتخصص في بيانات الحضور والغياب 📊<br><br>
                            يمكنني مساعدتك في:
                            <ul class="mt-1 space-y-0.5 text-gray-600">
                                <li>• تحليل نسب الحضور والغياب</li>
                                <li>• إنشاء تقارير إكسل وورد</li>
                                <li>• رسوم بيانية ولوحات إحصائية</li>
                                <li>• تتبع الطلاب الأكثر غياباً</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div id="agent-suggestions" class="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0 hide-scrollbar">
                    <button class="suggestion-btn shrink-0 text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-600 dark:text-white/60 px-3 py-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white transition-all whitespace-nowrap">
                        طلاب بغياب كثير
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-600 dark:text-white/60 px-3 py-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white transition-all whitespace-nowrap">
                        تقرير إكسل شامل
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-600 dark:text-white/60 px-3 py-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white transition-all whitespace-nowrap">
                        إحصائيات اليوم
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-600 dark:text-white/60 px-3 py-1.5 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 hover:text-neutral-800 dark:hover:text-white transition-all whitespace-nowrap">
                        رسم بياني للحضور
                    </button>
                </div>

                <div class="p-3 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/20 shrink-0 rounded-b-[2.5rem]">
                    <div class="relative flex items-center gap-2">
                        <textarea id="agent-input" placeholder="اكتب سؤالك هنا..." 
                            class="flex-1 bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:border-primary/50 text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/20 resize-none overflow-y-auto max-h-32 hide-scrollbar"
                            rows="1"></textarea>
                        <button id="agent-send-btn" onclick="Agent.sendMessage()" class="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center active:scale-90 transition-transform shrink-0">
                            <span class="material-symbols-outlined text-sm">send</span>
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(container);
        }

        this._injectStyles();
        this._setupListeners();
    },

    _setupListeners() {
        const input = document.getElementById('agent-input');
        const suggestions = document.getElementById('agent-suggestions');

        if (input) {
            input.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 128) + 'px';

                if (suggestions) {
                    if (this.value.trim().length > 0) {
                        suggestions.style.display = 'none';
                    } else {
                        suggestions.style.display = 'flex';
                    }
                }
            });

            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!this.isStreaming) this.sendMessage();
                }
            });
        }

        document.getElementById('agent-clear-btn')?.addEventListener('click', () => this.clearChat());

        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (input) {
                    input.value = btn.textContent.trim();
                    input.style.height = 'auto';
                    this.sendMessage();
                }
            });
        });

        const messages = document.getElementById('agent-messages');
        if (messages) {
            this.lastScrollTop = messages.scrollTop;
            messages.addEventListener('scroll', () => {
                if (this.isStreaming) {
                    if (messages.scrollTop < this.lastScrollTop - 4) {
                        this.userHasScrolledUp = true;
                    }
                    const isNearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 30;
                    if (isNearBottom) {
                        this.userHasScrolledUp = false;
                    }
                }
                this.lastScrollTop = messages.scrollTop;
            });
        }
    },

    clearChat() {
        const messages = document.getElementById('agent-messages');
        messages.innerHTML = `
            <div class="flex flex-col items-start animate-fade-in mx-1">
                <span class="text-[9px] font-black text-neutral-500 dark:text-white/40 mb-1 px-1 uppercase tracking-tight">AutoPilot</span>
                <div class="bg-primary/10 border border-primary/20 p-3.5 rounded-2xl rounded-tr-sm text-xs leading-relaxed max-w-[92%] text-neutral-800 dark:text-white/90">
                    تم مسح المحادثة. كيف يمكنني مساعدتك؟
                </div>
            </div>`;
        this.chatHistory = [];

        const suggestions = document.getElementById('agent-suggestions');
        if (suggestions) suggestions.style.display = 'flex';

        const input = document.getElementById('agent-input');
        if (input) {
            input.value = '';
            if (typeof window.handleInputTyping === 'function') {
                window.handleInputTyping(input);
            } else {
                input.style.height = 'auto';
            }
        }

        this.getSystemContext().then(ctx => {
            this.chatHistory = [{ role: 'system', content: ctx }];
        });
    },

    setStatus(text, active = false) {
        const status = document.getElementById('agent-status');
        if (status) {
            status.textContent = text;
            status.className = active ? 'text-xs text-primary animate-pulse' : 'text-xs text-neutral-500 dark:text-white/40';
        }
    },

    async sendMessage() {
        if (this.isStreaming) return;
        const input = document.getElementById('agent-input');
        const text = input ? input.value.trim() : '';
        if (!text && !this.currentUploadedFile) return;

        // Force stop and turn off speech recognition upon sending
        if (typeof window.stopSpeechRecognition === 'function') {
            window.stopSpeechRecognition();
        }

        if (input) {
            input.value = '';
            if (typeof window.handleInputTyping === 'function') {
                window.handleInputTyping(input);
            } else {
                input.style.height = 'auto';
            }
        }
        this.addMessage(text, 'user');

        // Hide suggestions after first message
        const suggestionsEl = document.getElementById('agent-suggestions');
        if (suggestionsEl) suggestionsEl.style.display = 'none';

        // Loading indicator
        const loadingDiv = this.addLoadingIndicator();
        this.isStreaming = true;
        this.setStatus('يفكر...', true);
        const sendBtn = document.getElementById('agent-send-btn');
        if (sendBtn) sendBtn.disabled = true;

        let liveContext = '';
        const attempts = [];
        try {
            // Refresh context with latest data
            liveContext = await this.getSystemContext();
            if (this.chatHistory.length > 0 && this.chatHistory[0].role === 'system') {
                this.chatHistory[0].content = liveContext;
            } else {
                this.chatHistory.unshift({ role: 'system', content: liveContext });
            }

            // Capture uploaded file reference before clearing preview UI
            const uploadedFile = this.currentUploadedFile;
            this.clearFilePreviewUI();

            // --- المحاولة الأولى (الوكيل الخفي) ---
            console.log('[AutoPilot] Launching hidden agent (Attempt 1)...');
            const msgEl = this.addMessage('', 'ai');
            let finalUserContent = text;
            if (uploadedFile && uploadedFile.dataUrl && uploadedFile.type.startsWith('image/')) {
                finalUserContent = [
                    {
                        type: 'text',
                        text: text || 'حلل هذه الصورة'
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: uploadedFile.dataUrl
                        }
                    }
                ];
            }
            const hiddenResponse = await this._streamHiddenAgent(msgEl, liveContext, finalUserContent, this.chatHistory, null, false, loadingDiv);

            const DELIMITER = '|||COMMAND|||';
            const hasCommand = hiddenResponse.includes(DELIMITER);

            if (!hasCommand) {
                // محادثة طبيعية عادية، لا داعي للتحقق أو الفشل
                this.chatHistory.push({ role: 'user', content: finalUserContent });
                this.chatHistory.push({ role: 'assistant', content: hiddenResponse });
                return;
            }

            // تحليل واستخراج الأوامر
            const parts = hiddenResponse.split(DELIMITER);
            const mainText = parts[0].trim();
            const cmdStr = parts[1]?.trim();

            let parsedCmd = null;
            try {
                const cleanedJson = this._sanitizeJSON(cmdStr);
                parsedCmd = JSON.parse(cleanedJson);
            } catch (jsonErr) {
                console.warn('[AutoPilot] Failed to parse JSON command:', jsonErr);
                const fallbackJson = this._extractJSONFallback(cmdStr);
                if (fallbackJson) {
                    try { parsedCmd = JSON.parse(fallbackJson); } catch (e) { }
                }
            }

            if (!parsedCmd) {
                const parseErrText = 'فشل فك تشفير الأمر البرمجي JSON في المحاولة الأولى';
                attempts.push({
                    title: 'المحاولة الأولى: فك تشفير الأمر البرمجي JSON',
                    success: false,
                    error: parseErrText,
                    action: `رد الوكيل: ${cmdStr || 'فارغ'}`
                });
                throw new Error(parseErrText);
            }

            // تحديث حالة التفكير لتوضيح الأداة المستدعاة
            const thinkingDropdown = msgEl.querySelector('.agent-thinking-dropdown');
            if (thinkingDropdown) {
                if (thinkingDropdown.dataset.thinkingInterval) {
                    clearInterval(parseInt(thinkingDropdown.dataset.thinkingInterval));
                }
                const label = thinkingDropdown.querySelector('.thinking-label');
                const spinner = thinkingDropdown.querySelector('span.material-symbols-outlined');
                if (label) {
                    if (parsedCmd.type === 'database_action') {
                        label.textContent = parsedCmd.action === 'select' ? 'جاري البحث في قاعدة البيانات...' : 'جاري تحديث قاعدة البيانات...';
                    } else if (parsedCmd.type === 'identify_student') {
                        label.textContent = 'جاري مطابقة بصمة الوجه...';
                    } else if (parsedCmd.type === 'send_email') {
                        label.textContent = 'جاري إرسال البريد الإلكتروني...';
                    } else if (parsedCmd.type === 'send_notification') {
                        label.textContent = 'جاري إرسال الإشعار...';
                    } else if (parsedCmd.type === 'export_excel' || parsedCmd.type === 'export_word') {
                        label.textContent = 'جاري تصدير التقرير...';
                    } else {
                        label.textContent = 'جاري تشغيل الأداة المطلوبة...';
                    }
                }
                if (spinner) {
                    spinner.textContent = 'sync';
                    spinner.style.animation = 'spin 1.2s linear infinite';
                }
            }

            // تنفيذ مع التحقق
            console.log('[AutoPilot] Executing and verifying command:', parsedCmd);
            const result = await this._executeCommandWithVerification(parsedCmd);

            if (thinkingDropdown) {
                const label = thinkingDropdown.querySelector('.thinking-label');
                const spinner = thinkingDropdown.querySelector('span.material-symbols-outlined');
                if (label) {
                    label.textContent = result.success ? 'تم التفكير وتلبية طلبك بنجاح' : 'فشل الإجراء المتخذ';
                }
                if (spinner) {
                    spinner.className = 'material-symbols-outlined text-[14px] ' + (result.success ? 'text-green-500' : 'text-red-500');
                    spinner.style.animation = 'none';
                    spinner.textContent = result.success ? 'check_circle' : 'error';
                }
            }

            if (result.success) {
                this.chatHistory.push({ role: 'user', content: finalUserContent });
                this.chatHistory.push({ role: 'assistant', content: hiddenResponse });

                if (parsedCmd.type === 'identify_student') {
                    const idRes = this.lastIdentifyResult || { success: false, error: 'لم يتم تشغيل الأداة بنجاح' };
                    let resultsText = '';
                    if (!idRes.success) {
                        resultsText = `[نتيجة أداة التعرف على الوجه]: فشل التعرف. الخطأ: ${idRes.error}`;
                    } else if (!idRes.faceDetected) {
                        resultsText = `[نتيجة أداة التعرف على الوجه]: لم يتم اكتشاف أي وجه في الصورة المرفوعة.`;
                    } else {
                        resultsText = `[نتيجة أداة التعرف على الوجه]: تم اكتشاف وجه واستخراج البصمة بنجاح.\n` +
                            `- البصمة الرقمية للوجه (descriptor): "${JSON.stringify(idRes.fingerprint)}"\n` +
                            (idRes.match
                                ? `- تم مطابقة الوجه مع الطالب التالي في قاعدة البيانات:\n` +
                                `  * الاسم: ${idRes.match.name}\n` +
                                `  * معرف الطالب (ID): ${idRes.match.id}\n` +
                                `  * الرقم الأكاديمي (academicId): ${idRes.match.academicId}\n` +
                                `  * معرف الصف (classId): ${idRes.match.classId}\n` +
                                `  * مسافة التطابق (Confidence Distance): ${idRes.match.distance.toFixed(4)}\n`
                                : `- لم يتم مطابقة الوجه مع أي طالب مسجل حالياً في قاعدة البيانات.\n` +
                                `- حقل "descriptors" للطالب في قاعدة البيانات يجب أن يتم تحديثه/إضافته كـ JSON stringified array يحتوي على البصمة الرقمية، أي: "descriptors": ${JSON.stringify([idRes.fingerprint])}\n`);
                    }

                    this.chatHistory.push({ role: 'user', content: resultsText });

                    this.setStatus('جاري صياغة الرد النهائي...', true);
                    const finalMsgEl = this.addMessage('', 'ai');

                    await this._streamHiddenAgent(
                        finalMsgEl,
                        liveContext,
                        "الرجاء صياغة الرد النهائي للمستخدم بناءً على نتائج أداة التعرف على الوجه السابقة المعروضة أمامك، وتزويد التفاصيل المطلوبة.",
                        this.chatHistory
                    );
                    return;
                }

                if (parsedCmd.type === 'database_action' && parsedCmd.action === 'select') {
                    const resultsData = this.lastQueryResult?.data || [];
                    const resultsText = `[نتائج الاستعلام التلقائي من قاعدة البيانات للجدول ${parsedCmd.table} بـ "${parsedCmd.query || parsedCmd.id}"]: \n` +
                        (resultsData.length > 0
                            ? JSON.stringify(resultsData)
                            : "لا توجد نتائج تطابق هذا الاستعلام في قاعدة البيانات.");

                    this.chatHistory.push({ role: 'user', content: resultsText });

                    this.setStatus('جاري صياغة الرد النهائي...', true);
                    const finalMsgEl = this.addMessage('', 'ai');

                    await this._streamHiddenAgent(
                        finalMsgEl,
                        liveContext,
                        "الرجاء صياغة الرد النهائي للمستخدم بناءً على نتائج الاستعلام السابقة المعروضة أمامك، وتزويد كافة التفاصيل المطلوبة.",
                        this.chatHistory
                    );
                    return;
                }

                const successText = `✓ تم تنفيذ العملية بنجاح تام وتم التحقق من استقرار قاعدة البيانات!`;
                this.addMessagePlain(successText);
                return;
            }

            attempts.push({
                title: 'المحاولة الأولى: تنفيذ وقبول التعديل بقاعدة البيانات',
                success: false,
                error: result.executionError || (result.verification ? result.verification.reason : 'فشل التحقق من قاعدة البيانات بعد الاستدعاء الأول'),
                action: `الأمر الموجه: ${JSON.stringify(parsedCmd)}`
            });

            // --- المحاولة الثانية (التصحيح الذاتي بنموذج أقوى وذاكرة نظيفة كلياً) ---
            console.warn('[AutoPilot] First attempt failed. Triggering Self-Correction with premium model...');

            const correctionNotice = this.addMessage('⚠️ جاري تصحيح وتعديل المعالجة ذاتياً لاستقرار قاعدة البيانات...', 'ai');
            const correctionLoading = this.addLoadingIndicator();

            // تجهيز سياق التصحيح الذاتي المخفي
            const correctionPrompt = `
لقد طلب المستخدم القيام بالعملية التالية: "${text}"
ولكن المحاولة السابقة فشلت.
الأمر البرمجي الذي تم تجسيده: ${JSON.stringify(parsedCmd)}
الأخطاء الملتقطة في الكونسول: ${JSON.stringify(result.capturedErrors)}
حالة تحقق قاعدة البيانات: ${result.verification ? result.verification.reason : 'غير معروف'}
 
المطلوب منك:
1. تحليل سبب الفشل بدقة بالغة.
2. تفادي الخطأ السابق بالكامل وصياغة أمر قاعدة البيانات الصحيح والبديل فوراً.
3. التزم بإخراج الأمر البرمجي بصيغة |||COMMAND||| يليه مباشرة كود JSON صالح تماماً وخالٍ من الهلوسة البرمجية. لا تشرح خطواتك البرمجية، اكتب الكود فوراً ليتم تنفيذه برمجياً.
`;

            try {
                const fallbackMsgEl = this.addMessage('', 'ai');
                const fallbackResponse = await this._streamHiddenAgent(fallbackMsgEl,
                    liveContext,
                    correctionPrompt,
                    [], // ذاكرة نظيفة تماماً لتفادي الهلوسة البرمجية
                    this.defaultModel,
                    true, // تفعيل ذاكرة نظيفة
                    correctionLoading
                );

                correctionNotice.remove();


                const fallbackParts = fallbackResponse.split(DELIMITER);
                const fallbackMainText = fallbackParts[0].trim();
                const fallbackCmdStr = fallbackParts[1]?.trim();

                let parsedFallbackCmd = null;
                try {
                    const cleanedFallbackJson = this._sanitizeJSON(fallbackCmdStr);
                    parsedFallbackCmd = JSON.parse(cleanedFallbackJson);
                } catch (jsonErr) {
                    const fallbackJson = this._extractJSONFallback(fallbackCmdStr);
                    if (fallbackJson) {
                        try { parsedFallbackCmd = JSON.parse(fallbackJson); } catch (e) { }
                    }
                }

                if (!parsedFallbackCmd) {
                    const parseErrText = 'فشل فك تشفير أمر التصحيح البرمجي JSON في المحاولة الثانية';
                    attempts.push({
                        title: 'التشخيص والتصحيح الذاتي: فك تشفير JSON البديل',
                        success: false,
                        error: parseErrText,
                        action: `رد التصحيح الذاتي: ${fallbackCmdStr || 'فارغ'}`
                    });
                    throw new Error(parseErrText);
                }

                // تحديث حالة التفكير لتوضيح الأداة المستدعاة للمحاولة الثانية
                const fallbackThinkingDropdown = fallbackMsgEl.querySelector('.agent-thinking-dropdown');
                if (fallbackThinkingDropdown) {
                    if (fallbackThinkingDropdown.dataset.thinkingInterval) {
                        clearInterval(parseInt(fallbackThinkingDropdown.dataset.thinkingInterval));
                    }
                    const label = fallbackThinkingDropdown.querySelector('.thinking-label');
                    const spinner = fallbackThinkingDropdown.querySelector('span.material-symbols-outlined');
                    if (label) {
                        if (parsedFallbackCmd.type === 'database_action') {
                            label.textContent = parsedFallbackCmd.action === 'select' ? 'جاري البحث في قاعدة البيانات...' : 'جاري تحديث قاعدة البيانات...';
                        } else if (parsedFallbackCmd.type === 'identify_student') {
                            label.textContent = 'جاري مطابقة بصمة الوجه...';
                        } else if (parsedFallbackCmd.type === 'send_email') {
                            label.textContent = 'جاري إرسال البريد الإلكتروني...';
                        } else if (parsedFallbackCmd.type === 'send_notification') {
                            label.textContent = 'جاري إرسال الإشعار...';
                        } else if (parsedFallbackCmd.type === 'export_excel' || parsedFallbackCmd.type === 'export_word') {
                            label.textContent = 'جاري تصدير التقرير...';
                        } else {
                            label.textContent = 'جاري تشغيل الأداة المطلوبة...';
                        }
                    }
                    if (spinner) {
                        spinner.textContent = 'sync';
                        spinner.style.animation = 'spin 1.2s linear infinite';
                    }
                }

                // تنفيذ مع التحقق من جديد
                console.log('[AutoPilot] Executing and verifying fallback command:', parsedFallbackCmd);
                const fallbackResult = await this._executeCommandWithVerification(parsedFallbackCmd);

                if (fallbackThinkingDropdown) {
                    const label = fallbackThinkingDropdown.querySelector('.thinking-label');
                    const spinner = fallbackThinkingDropdown.querySelector('span.material-symbols-outlined');
                    if (label) {
                        label.textContent = fallbackResult.success ? 'تم تصحيح المشكلة وتلبية طلبك بنجاح' : 'فشل تصحيح المشكلة';
                    }
                    if (spinner) {
                        spinner.className = 'material-symbols-outlined text-[14px] ' + (fallbackResult.success ? 'text-green-500' : 'text-red-500');
                        spinner.style.animation = 'none';
                        spinner.textContent = fallbackResult.success ? 'check_circle' : 'error';
                    }
                }

                if (fallbackResult.success) {
                    this.chatHistory.push({ role: 'user', content: finalUserContent });
                    this.chatHistory.push({ role: 'assistant', content: fallbackResponse });

                    if (parsedFallbackCmd.type === 'identify_student') {
                        const idRes = this.lastIdentifyResult || { success: false, error: 'لم يتم تشغيل الأداة بنجاح' };
                        let resultsText = '';
                        if (!idRes.success) {
                            resultsText = `[نتيجة أداة التعرف على الوجه]: فشل التعرف. الخطأ: ${idRes.error}`;
                        } else if (!idRes.faceDetected) {
                            resultsText = `[نتيجة أداة التعرف على الوجه]: لم يتم اكتشاف أي وجه في الصورة المرفوعة.`;
                        } else {
                            resultsText = `[نتيجة أداة التعرف على الوجه]: تم اكتشاف وجه واستخراج البصمة بنجاح.\n` +
                                `- البصمة الرقمية للوجه (descriptor): "${JSON.stringify(idRes.fingerprint)}"\n` +
                                (idRes.match
                                    ? `- تم مطابقة الوجه مع الطالب التالي في قاعدة البيانات:\n` +
                                    `  * الاسم: ${idRes.match.name}\n` +
                                    `  * معرف الطالب (ID): ${idRes.match.id}\n` +
                                    `  * الرقم الأكاديمي (academicId): ${idRes.match.academicId}\n` +
                                    `  * معرف الصف (classId): ${idRes.match.classId}\n` +
                                    `  * مسافة التطابق (Confidence Distance): ${idRes.match.distance.toFixed(4)}\n`
                                    : `- لم يتم مطابقة الوجه مع أي طالب مسجل حالياً في قاعدة البيانات.\n` +
                                    `- حقل "descriptors" للطالب في قاعدة البيانات يجب أن يتم تحديثه/إضافته كـ JSON stringified array يحتوي على البصمة الرقمية، أي: "descriptors": ${JSON.stringify([idRes.fingerprint])}\n`);
                        }

                        this.chatHistory.push({ role: 'user', content: resultsText });

                        this.setStatus('جاري صياغة الرد النهائي...', true);
                        const finalMsgEl = this.addMessage('', 'ai');

                        await this._streamHiddenAgent(
                            finalMsgEl,
                            liveContext,
                            "الرجاء صياغة الرد النهائي للمستخدم بناءً على نتائج أداة التعرف على الوجه السابقة المعروضة أمامك، وتزويد التفاصيل المطلوبة.",
                            this.chatHistory
                        );

                        attempts.push({
                            title: 'التشخيص والتصحيح الذاتي (المحاولة الثانية)',
                            success: true,
                            action: `تم التعرف على الوجه بنجاح: ${JSON.stringify(parsedFallbackCmd)}`
                        });
                        this._renderDiagnosticsCard(document.getElementById('agent-messages'), { attempts });
                        return;
                    }

                    if (parsedFallbackCmd.type === 'database_action' && parsedFallbackCmd.action === 'select') {
                        const resultsData = this.lastQueryResult?.data || [];
                        const resultsText = `[نتائج الاستعلام التلقائي من قاعدة البيانات للجدول ${parsedFallbackCmd.table} بـ "${parsedFallbackCmd.query || parsedFallbackCmd.id}"]: \n` +
                            (resultsData.length > 0
                                ? JSON.stringify(resultsData)
                                : "لا توجد نتائج تطابق هذا الاستعلام في قاعدة البيانات.");

                        this.chatHistory.push({ role: 'user', content: resultsText });

                        this.setStatus('جاري صياغة الرد النهائي...', true);
                        const finalMsgEl = this.addMessage('', 'ai');

                        await this._streamHiddenAgent(
                            finalMsgEl,
                            liveContext,
                            "الرجاء صياغة الرد النهائي للمستخدم بناءً على نتائج الاستعلام السابقة المعروضة أمامك، وتزويد كافة التفاصيل المطلوبة.",
                            this.chatHistory
                        );

                        attempts.push({
                            title: 'التشخيص والتصحيح الذاتي (المحاولة الثانية)',
                            success: true,
                            action: `تم الاستعلام من قاعدة البيانات بنجاح: ${JSON.stringify(parsedFallbackCmd)}`
                        });
                        this._renderDiagnosticsCard(document.getElementById('agent-messages'), { attempts });
                        return;
                    }

                    const successText = `🎉 تم تصحيح المشكلة بنجاح تام وإتمام العملية!`;
                    this.addMessagePlain(successText);

                    attempts.push({
                        title: 'التشخيص والتصحيح الذاتي (المحاولة الثانية)',
                        success: true,
                        action: `تم تعديل وتثبيت قاعدة البيانات بنجاح: ${JSON.stringify(parsedFallbackCmd)}`
                    });

                    this._renderDiagnosticsCard(document.getElementById('agent-messages'), { attempts });
                    return;
                }

                attempts.push({
                    title: 'التشخيص والتصحيح الذاتي (المحاولة الثانية)',
                    success: false,
                    error: fallbackResult.executionError || (fallbackResult.verification ? fallbackResult.verification.reason : 'فشل التحقق بعد التصحيح الذاتي'),
                    action: `فشل استقرار قاعدة البيانات: ${JSON.stringify(parsedFallbackCmd)}`
                });

                // إذا فشل التصحيح أيضاً
                throw new Error(`فشل التصحيح الذاتي أيضاً. الخطأ: ${fallbackResult.executionError || (fallbackResult.verification ? fallbackResult.verification.reason : 'غير معروف')}`);

            } catch (fallbackErr) {
                if (typeof correctionNotice !== 'undefined' && correctionNotice.parentNode) correctionNotice.remove();
                if (typeof correctionLoading !== 'undefined' && correctionLoading.parentNode) correctionLoading.remove();
                throw fallbackErr;
            }

        } catch (e) {
            // --- الفشل التام والتسجيل الصامت في قوقل شيت ---
            console.error('[AutoPilot] Ultimate failure in agentic flow:', e);

            // إزالة الرسائل التمهيدية المتبقية إن وجدت
            if (typeof loadingDiv !== 'undefined' && loadingDiv.parentNode) loadingDiv.remove();

            this.addMessage(`❌ أعتذر منك بشدة، واجهت المهمة خطأ مستعصياً بعد عدة محاولات ولم تكتمل العملية بنجاح. تم تدوين تقرير التشخيص للإدارة فوراً لتصحيح المشكلة.`, 'ai');

            if (attempts.length === 0) {
                attempts.push({
                    title: 'فشل العملية العام',
                    success: false,
                    error: e.message
                });
            }
            this._renderDiagnosticsCard(document.getElementById('agent-messages'), { attempts });

            // تجميع معلومات التشخيص بالكامل بشكل صامت
            const diagnosticData = {
                userPrompt: text,
                chatHistory: this.chatHistory,
                error: e.message,
                timestamp: new Date().toISOString(),
                provider: this.getEffectiveProvider(),
                uploadedFile: this.lastUploadedFile || null,
                systemContext: liveContext
            };

            // تشغيل الإرسال الصامت
            this._silentLogToGoogleSheets(diagnosticData);
        } finally {
            this.isStreaming = false;
            this.setStatus('جاهز للمساعدة', false);
            const sendBtn = document.getElementById('agent-send-btn');
            if (sendBtn) sendBtn.disabled = false;
        }
    },

    addMessage(text, role) {
        const messages = document.getElementById('agent-messages');
        const isUser = role === 'user';
        const div = document.createElement('div');
        div.className = `flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-4 mx-2 animate-fade-in`;

        const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
        const labelText = isUser ? (currentUser ? currentUser.name : 'مدير النظام') : 'AutoPilot';

        // Strip commands from display text
        const displayText = text.split('|||COMMAND|||')[0].trim();

        let formattedContent;
        if (!isUser && typeof marked !== 'undefined') {
            // Configure marked for safe rendering
            marked.setOptions({
                breaks: true,      // newlines become <br>
                gfm: true,         // GitHub Flavored Markdown (tables, strikethrough, etc.)
                pedantic: false,
                sanitize: false
            });
            formattedContent = marked.parse(displayText || '&nbsp;');
        } else {
            // User messages: plain text only
            formattedContent = displayText
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>') || '&nbsp;';
        }

        const bubbleClass = isUser
            ? 'agent-msg-user'
            : 'agent-msg-ai agent-markdown';

        let fileContentHtml = '';
        if (isUser && Agent.currentUploadedFile) {
            if (Agent.currentUploadedFile.dataUrl) {
                fileContentHtml = `<div class="agent-msg-file-attachment mt-2">
                    <img src="${Agent.currentUploadedFile.dataUrl}" class="max-w-[200px] max-h-[150px] rounded-xl object-cover border border-white/20 shadow-sm" />
                    <div class="text-[9px] text-gray-400 mt-1 truncate" style="max-width: 200px;">${Agent.currentUploadedFile.name}</div>
                </div>`;
            } else {
                fileContentHtml = `<div class="agent-msg-file-attachment mt-2 flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 max-w-[200px]">
                    <span class="material-symbols-outlined text-sm text-gray-400">description</span>
                    <span class="text-[9px] text-gray-400 truncate">${Agent.currentUploadedFile.name}</span>
                </div>`;
            }
        }

        div.innerHTML = `
            <span class="text-[9px] font-black ${isUser ? 'text-gray-400' : 'text-primary'} mb-1 px-1 uppercase tracking-tight">${labelText}</span>
            <div class="${bubbleClass} p-3.5 rounded-2xl ${isUser ? 'rounded-tl-sm' : 'rounded-tr-sm'} text-xs font-bold leading-relaxed max-w-[92%] relative">
                ${formattedContent}
                ${fileContentHtml}
            </div>`;

        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    },

    addMessagePlain(text) {
        const messages = document.getElementById('agent-messages');
        const div = document.createElement('div');
        div.className = `flex flex-col items-start mb-4 mx-2 animate-fade-in`;

        // Strip commands from display text
        const displayText = text.split('|||COMMAND|||')[0].trim();

        let formattedContent;
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                pedantic: false,
                sanitize: false
            });
            formattedContent = marked.parse(displayText || '&nbsp;');
        } else {
            formattedContent = displayText
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>') || '&nbsp;';
        }

        div.innerHTML = `
            <div class="agent-msg-ai agent-markdown p-3.5 rounded-2xl rounded-tr-sm text-xs font-bold leading-relaxed max-w-[92%] relative">
                ${formattedContent}
            </div>`;

        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    },

    addLoadingIndicator() {
        const messages = document.getElementById('agent-messages');
        const div = document.createElement('div');
        div.className = 'autopilot-loading-row animate-fade-in mx-2 flex items-center gap-3 py-1.5 px-0.5 max-w-[280px]';
        div.style.alignSelf = 'flex-start';
        div.style.marginBottom = '12px';

        div.innerHTML = `
            <div class="flex items-center gap-1 shrink-0" style="direction: ltr;">
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 0.1s; display: inline-block;"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 0.2s; display: inline-block;"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style="animation-delay: 0.3s; display: inline-block;"></span>
            </div>
            <div class="loading-text text-xs text-neutral-600 dark:text-white/70 font-semibold">جاري تحضير الرد...</div>
        `;

        const textEl = div.querySelector('.loading-text');
        const phrases = [
            "جاري تحضير الرد...",
            "نجمع لك أفضل البيانات...",
            "يكتب الآن...",
            "يرجى الانتظار ثوانٍ معدودة...",
            "نصوغ لك إجابة دقيقة...",
            "نستخرج السجلات المطلوبة..."
        ];
        let phraseIdx = 0;
        const intervalId = setInterval(() => {
            if (div.parentNode) {
                phraseIdx = (phraseIdx + 1) % phrases.length;
                textEl.textContent = phrases[phraseIdx];
            } else {
                clearInterval(intervalId);
            }
        }, 2500);

        div.dataset.intervalId = intervalId;

        const originalRemove = div.remove;
        div.remove = function () {
            if (this.dataset.intervalId) {
                clearInterval(parseInt(this.dataset.intervalId));
            }
            originalRemove.call(this);
        };

        messages.appendChild(div);
        this.scrollToBottom(true);
        return div;
    },

    // ═══════════════════════════════════════════════════
    // محلل الأوامر - الإصلاح الرئيسي + منطق قوي
    // ═══════════════════════════════════════════════════
    async handleAIResponse(rawText) {
        const DELIMITER = '|||COMMAND|||';
        const parts = rawText.split(DELIMITER);

        // النص قبل أي أمر
        const mainText = parts[0].trim();
        if (mainText) this.addMessage(mainText, 'ai');

        // معالجة كل أمر بالتتابع
        for (let i = 1; i < parts.length; i++) {
            const cmdStr = parts[i].trim();
            if (!cmdStr) continue;

            try {
                // محاولة تحليل JSON مع تنظيف مسبق
                const cleanedCmd = this._sanitizeJSON(cmdStr);
                const cmd = JSON.parse(cleanedCmd);
                await this.executeCommand(cmd); // انتظار انتهاء العملية الحالية
            } catch (e) {
                console.error('Command parse error:', e, '\nRaw:', cmdStr);
                // محاولة استخراج JSON بديل
                const fallback = this._extractJSONFallback(cmdStr);
                if (fallback) {
                    try {
                        await this.executeCommand(JSON.parse(fallback));
                    } catch (e2) {
                        this._showCommandError(cmdStr);
                    }
                } else {
                    this._showCommandError(cmdStr);
                }
            }
        }
    },

    _sanitizeJSON(str) {
        // أخذ أول { حتى آخر } متوازن
        const start = str.indexOf('{');
        if (start === -1) throw new Error('No JSON found');

        let depth = 0, end = -1;
        for (let i = start; i < str.length; i++) {
            if (str[i] === '{') depth++;
            else if (str[i] === '}') {
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }
        if (end === -1) throw new Error('Unbalanced JSON');
        return str.slice(start, end + 1);
    },

    _extractJSONFallback(str) {
        // fallback: ابحث عن أي بنية JSON صالحة
        const match = str.match(/\{[\s\S]*\}/);
        return match ? match[0] : null;
    },

    _showCommandError(cmdStr) {
        const messages = document.getElementById('agent-messages');
        const div = document.createElement('div');
        div.className = 'flex gap-2 mb-3 animate-fade-in';
        div.innerHTML = `
            <div class="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl rounded-tr-none text-xs text-red-300 max-w-[88%]">
                ⚠️ لم يتم تحليل الأمر بنجاح. <button onclick="navigator.clipboard.writeText(${JSON.stringify(cmdStr)})" class="underline opacity-60">نسخ الكود الخام</button>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    },

    // ═══════════════════════════════════════════════════
    // تنفيذ الأوامر - الإصلاح الرئيسي: messages.appendChild مضاف!
    // ═══════════════════════════════════════════════════
    async executeCommand(cmd) {
        const messages = document.getElementById('agent-messages');

        if (cmd.type === 'export_excel') {
            this._renderFileCard(messages, {
                icon: 'table_view',
                iconColor: 'text-green-400',
                bgColor: 'bg-green-500/10',
                borderColor: 'border-green-500/20',
                badge: 'Excel',
                badgeColor: 'bg-green-500/20 text-green-300',
                fileName: cmd.fileName || 'تصدير.xlsx',
                onClick: () => FileUtils.exportToExcel(cmd.data, cmd.fileName, cmd.sheetName)
            });

        } else if (cmd.type === 'export_word') {
            const wordContent = cmd.content || cmd.data || { title: 'تقرير مساعد الذكاء الاصطناعي', sections: [{ heading: 'محتوى التقرير', text: 'لا يوجد محتوى محدد' }] };
            this._renderFileCard(messages, {
                icon: 'description',
                iconColor: 'text-blue-400',
                bgColor: 'bg-blue-500/10',
                borderColor: 'border-blue-500/20',
                badge: 'Word',
                badgeColor: 'bg-blue-500/20 text-blue-300',
                fileName: cmd.fileName || 'تقرير.docx',
                onClick: () => FileUtils.exportToWord(wordContent, cmd.fileName)
            });

        } else if (cmd.type === 'database_action') {
            await this._handleDatabaseAction(messages, cmd);

        } else if (cmd.type === 'chart') {
            this._renderChart(messages, cmd);

        } else if (cmd.type === 'send_email') {
            await this._handleSendEmail(messages, cmd);

        } else if (cmd.type === 'stats') {
            this._renderStatsCards(messages, cmd);
        } else if (cmd.type === 'send_notification') {
            await this._handleSendNotification(messages, cmd);
        } else if (cmd.type === 'full_system_export') {
            await this._handleFullSystemExport(messages, cmd);
        } else if (cmd.type === 'identify_student') {
            await this._handleIdentifyStudent(messages, cmd);
        } else {
            console.warn('Unknown command type:', cmd.type);
        }
    },

    async _handleIdentifyStudent(messages, cmd) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="bg-gray-800 text-white p-3 rounded-2xl text-[10px] font-bold flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm text-primary">face</span>
                    <span>جاري تشغيل أداة التعرف على الوجه...</span>
                </div>
                <div id="face-status-${Date.now()}" class="text-primary">جاري المعالجة...</div>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        const status = div.querySelector('div:last-child');

        try {
            if (!this.lastUploadedImageForTools) {
                throw new Error("لم يتم العثور على أي صورة مرفوعة حالياً للتعرف عليها.");
            }

            status.textContent = 'تحميل الصورة...';
            const img = new Image();
            img.src = this.lastUploadedImageForTools;

            const descriptor = await new Promise((resolve, reject) => {
                img.onload = async () => {
                    try {
                        const desc = await FaceDetection.getDescriptorFromImage(img);
                        resolve(desc);
                    } catch (err) {
                        reject(err);
                    }
                };
                img.onerror = () => reject(new Error("فشل تحميل الصورة المرفوعة لمعالجتها."));
            });

            if (!descriptor) {
                status.textContent = 'لم يتم كشف وجه ✗';
                status.className = 'text-red-400';
                this.lastIdentifyResult = { success: true, faceDetected: false };
                return;
            }

            status.textContent = 'مطابقة البصمة...';
            const matchResult = await this.searchStudentByFingerprint(descriptor);

            this.lastIdentifyResult = {
                success: true,
                faceDetected: true,
                fingerprint: descriptor,
                match: (matchResult && matchResult.success && matchResult.match) ? matchResult.match : null
            };

            if (this.lastIdentifyResult.match) {
                status.textContent = `تم التعرف: ${this.lastIdentifyResult.match.name} ✓`;
                status.className = 'text-green-400';
            } else {
                status.textContent = 'بصمة صالحة (غير مسجل) ✓';
                status.className = 'text-green-400';
            }
        } catch (e) {
            status.textContent = 'فشل ✗';
            status.className = 'text-red-400';
            console.error('Face Identification Error:', e);
            this.lastIdentifyResult = { success: false, error: e.message };
            this.addMessage(`❌ فشل التعرف على الوجه: ${e.message}`, 'ai');
        }
    },

    async _handleFullSystemExport(messages, cmd) {
        this._renderFileCard(messages, {
            icon: 'analytics',
            iconColor: 'text-purple-400',
            bgColor: 'bg-purple-500/10',
            borderColor: 'border-purple-500/20',
            badge: 'النظام بالكامل',
            badgeColor: 'bg-purple-500/20 text-purple-300',
            fileName: `تقرير_شامل_${new Date().toLocaleDateString('ar-EG')}.xlsx`,
            onClick: async () => {
                const [students, classes, teachers, records] = await Promise.all([
                    DB.getStudents(), DB.getClasses(), DB.getTeachers(), DB.getRecords()
                ]);

                // Prepare specialized sheets
                const studentsData = students.map(s => {
                    const cls = classes.find(c => c.id === s.classId);
                    return {
                        'الرقم الأكاديمي': s.academicId,
                        'اسم الطالب': s.name,
                        'الفصل': cls ? cls.name : 'غير محدد',
                        'رقم ولي الأمر': s.phone,
                        'تاريخ الإضافة': s.timestamp ? new Date(s.timestamp).toLocaleDateString('ar-EG') : '-'
                    };
                });

                const teachersData = teachers.map(t => ({
                    'الاسم': t.name,
                    'رقم الوزارة': t.ministryId,
                    'الدور': t.role === 'admin' ? 'مدير' : 'معلم',
                    'الحالة': 'نشط'
                }));

                const attendanceData = [];
                records.forEach(r => {
                    const cls = classes.find(c => c.id === r.classId);
                    const teacher = teachers.find(t => t.id === r.teacherId);
                    r.details?.forEach(d => {
                        const student = students.find(s => s.id === d.studentId);
                        attendanceData.push({
                            'التاريخ': r.date,
                            'الفصل': cls ? cls.name : '-',
                            'المعلم': teacher ? teacher.name : '-',
                            'اسم الطالب': student ? student.name : 'مجهول',
                            'الحالة': d.status === 'present' ? 'حاضر' : 'غائب'
                        });
                    });
                });

                // Generate multi-sheet workbook
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentsData), "الطلاب");
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teachersData), "المعلمون");
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendanceData), "سجل الحضور");

                XLSX.writeFile(wb, `تقرير_النظام_الشامل_${Date.now()}.xlsx`);
            }
        });
    },


    async _handleSendEmail(messages, cmd) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="bg-blue-600 text-white p-3 rounded-2xl text-[10px] font-bold flex items-center justify-between">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="material-symbols-outlined text-sm">mail</span>
                    <span class="truncate">إرسال إلى: ${cmd.to}</span>
                </div>
                <div id="email-status-${Date.now()}" class="text-blue-200 shrink-0 mr-2">جاري...</div>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        const status = div.querySelector('div:last-child');

        try {
            await this.sendEmail(cmd.to, cmd.subject, cmd.message);
            status.textContent = 'تم الإرسال بنجاح ✓';
            status.className = 'text-green-300';

        } catch (e) {
            status.textContent = 'فشل الإرسال ✗';
            status.className = 'text-red-300';
            console.error('Email Error:', e);
            this.addMessage(`❌ فشل إرسال الإيميل: ${e.message || 'حدث خطأ غير معروف'}`, 'ai');
        }
    },

    async sendEmail(to, subject, message) {
        // Enforce direct Gmail API integration
        if (typeof GmailManager !== 'undefined' && GmailManager.isConnected()) {
            console.log('[Agent] Sending via Gmail API...');
            return await GmailManager.sendEmail(to, subject, message);
        }
        throw new Error('يرجى ربط حساب Gmail الخاص بك أولاً من قسم التطبيقات في المساعد الذكي لتتمكن من إرسال الإيميلات.');
    },

    async _handleSendNotification(messages, cmd) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="bg-primary/10 text-primary p-3 rounded-2xl text-[10px] font-bold flex items-center justify-between border border-primary/20">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="material-symbols-outlined text-sm">notifications_active</span>
                    <span class="truncate">إرسال إشعار: ${cmd.title}</span>
                </div>
                <div id="notif-status-${Date.now()}" class="shrink-0 mr-2">جاري...</div>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        const status = div.querySelector('div:last-child');

        try {
            if (typeof NotificationManager !== 'undefined') {
                await NotificationManager.sendLocalNotification(cmd.title, cmd.body, cmd.url || '/');
                status.textContent = 'تم الإرسال ✓';
                status.className = 'text-green-600';
            } else {
                throw new Error('NotificationManager is not loaded');
            }
        } catch (e) {
            status.textContent = 'فشل ✗';
            status.className = 'text-red-600';
            console.error('Notification Error:', e);
            this.addMessage(`❌ فشل إرسال الإشعار: ${e.message}`, 'ai');
        }
    },

    async _handleDatabaseAction(messages, cmd) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-neutral-800 dark:text-white p-3.5 rounded-2xl text-xs font-bold flex flex-col gap-2 shadow-sm">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm text-primary">database</span>
                        <span>تنفيذ عملية: ${cmd.action === 'select' ? 'بحث' : cmd.action} على ${cmd.table}</span>
                    </div>
                    <div id="db-status-${Date.now()}" class="text-primary font-bold">جاري...</div>
                </div>
            </div>`;
        messages.appendChild(div);
        this.scrollToBottom(true);

        const status = div.querySelector('div.text-primary');

        // التحقق من المعرفات الوهمية (Placeholders)
        const placeholderIds = ['ID_HERE', 'STUDENT_ID', 'TEACHER_ID', 'CLASS_ID', 'ID_CLASS', 'NEW_ID'];
        if (cmd.id && placeholderIds.includes(cmd.id)) {
            status.textContent = 'خطأ: معرف غير صالح';
            status.className = 'text-red-400 font-bold';
            this.addMessage(`⚠️ تنبيه: حاول الوكيل استخدام معرف غير حقيقي (${cmd.id}). يرجى تزويده بالمعرف الصحيح من القوائم.`, 'ai');
            return;
        }

        // توحيد ومعالجة البصمات الرقمية (descriptors) لتفادي خطأ المصفوفات المتداخلة في Firebase
        if (cmd.table === 'students') {
            const normalizeStudentData = (data) => {
                if (data) {
                    if (data.descriptors && Array.isArray(data.descriptors)) {
                        data.descriptors = JSON.stringify(data.descriptors);
                    }
                    if (data.descriptor && Array.isArray(data.descriptor)) {
                        data.descriptor = JSON.stringify(data.descriptor);
                    }
                }
            };
            if (cmd.data) {
                if (Array.isArray(cmd.data)) {
                    cmd.data.forEach(normalizeStudentData);
                } else {
                    normalizeStudentData(cmd.data);
                }
            }
        }

        try {
            let result;

            if (cmd.action === 'select') {
                status.textContent = 'جاري الاستعلام...';
                function normalizeArabic(str) {
                    if (!str) return '';
                    return str
                        .replace(/[أإآا]/g, 'a')
                        .replace(/ة/g, 'h')
                        .replace(/ى/g, 'y')
                        .replace(/[\u064B-\u0652]/g, '')
                        .replace(/[أإآا]/g, 'ا')
                        .replace(/ة/g, 'ه')
                        .replace(/ى/g, 'ي')
                        .toLowerCase()
                        .trim();
                }
                const query = (cmd.query || cmd.id || '').toLowerCase().trim();
                const normQuery = normalizeArabic(query);
                let results = [];

                if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    results = list.filter(s => {
                        const nameMatch = s.name && normalizeArabic(s.name).includes(normQuery);
                        const idMatch = s.academicId && s.academicId.toLowerCase() === query;
                        const classIdMatch = s.classId && s.classId.toLowerCase() === query;
                        return nameMatch || idMatch || classIdMatch;
                    });
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    results = list.filter(t => {
                        const nameMatch = t.name && normalizeArabic(t.name).includes(normQuery);
                        const idMatch = t.ministryId && t.ministryId.toLowerCase() === query;
                        return nameMatch || idMatch;
                    });
                } else if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    results = list.filter(c => {
                        const nameMatch = c.name && normalizeArabic(c.name).includes(normQuery);
                        const idMatch = c.id && c.id.toLowerCase() === query;
                        return nameMatch || idMatch;
                    });
                } else if (cmd.table === 'records') {
                    const list = await DB.getRecords();
                    results = list.filter(r =>
                        (r.date && r.date.toLowerCase() === query) ||
                        (r.classId && r.classId.toLowerCase() === query)
                    );
                }

                Agent.lastQueryResult = {
                    success: true,
                    query: cmd.query || cmd.id,
                    table: cmd.table,
                    data: results
                };

                status.textContent = `تم العثور على ${results.length} نتائج ✓`;
                status.className = 'text-green-400 font-bold';

                if (results.length > 0) {
                    const resDiv = document.createElement('div');
                    resDiv.className = 'mt-2 p-2.5 bg-black/30 rounded-xl text-[10.5px] text-white/90 max-h-48 overflow-y-auto space-y-1.5 hide-scrollbar';
                    resDiv.style.border = '1px solid rgba(255,255,255,0.05)';
                    resDiv.style.direction = 'rtl';
                    resDiv.innerHTML = results.map((item, idx) => {
                        if (cmd.table === 'students') {
                            return `<div class="flex justify-between border-b border-white/5 pb-1 gap-4">
                                <span class="truncate font-semibold">${idx + 1}. ${item.name}</span>
                                <span class="shrink-0 text-white/60">الأكاديمي: ${item.academicId || '-'}</span>
                            </div>`;
                        } else if (cmd.table === 'teachers') {
                            return `<div class="flex justify-between border-b border-white/5 pb-1 gap-4">
                                <span class="truncate font-semibold">${idx + 1}. ${item.name}</span>
                                <span class="shrink-0 text-white/60">الوزارة: ${item.ministryId || '-'}</span>
                            </div>`;
                        } else if (cmd.table === 'classes') {
                            return `<div class="flex justify-between border-b border-white/5 pb-1 gap-4">
                                <span class="truncate font-semibold">${idx + 1}. ${item.name}</span>
                                <span class="shrink-0 text-white/60">الشعبة: ${item.section || 'عام'}</span>
                            </div>`;
                        } else if (cmd.table === 'records') {
                            const present = item.details?.filter(d => d.status === 'present').length || 0;
                            const absent = item.details?.filter(d => d.status === 'absent').length || 0;
                            return `<div class="flex justify-between border-b border-white/5 pb-1 gap-4">
                                <span class="font-semibold">${idx + 1}. التاريخ: ${item.date}</span>
                                <span class="shrink-0 text-white/60">حضور: ${present} | غياب: ${absent}</span>
                            </div>`;
                        }
                        return `<div class="border-b border-white/5 pb-1 text-[9px] truncate">${idx + 1}. ${JSON.stringify(item)}</div>`;
                    }).join('');
                    div.firstElementChild.appendChild(resDiv);
                    this.scrollToBottom(true);
                }
            } else if (cmd.action === 'insert') {
                const dataItems = Array.isArray(cmd.data) ? cmd.data : [cmd.data];
                status.textContent = `جاري إضافة ${dataItems.length} عنصر...`;

                for (const item of dataItems) {
                    await DB.insert(cmd.table, item);
                }
                status.textContent = 'تمت الإضافة بنجاح ✓';
                status.className = 'text-green-400 font-bold';
            } else {
                // الحذف والتعديل يتطلب معرفات
                const ids = cmd.ids || [cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId];
                const validIds = ids.filter(id => id && !placeholderIds.includes(id));

                if (validIds.length === 0) {
                    throw new Error('لم يتم تزويد أي معرفات (IDs) صالحة للعملية. يرجى تزويد حقل "id"');
                }

                status.textContent = `جاري تنفيذ ${validIds.length} عملية...`;
                for (const finalId of validIds) {
                    if (cmd.action === 'update') {
                        await DB.update(cmd.table, finalId, cmd.data);
                    } else if (cmd.action === 'delete') {
                        await DB.delete(cmd.table, finalId);
                    }
                }
                status.textContent = 'تم التنفيذ بنجاح ✓';
                status.className = 'text-green-400 font-bold';
            }



            if (cmd.table === 'students' && (cmd.action === 'insert' || cmd.action === 'update')) {
                Agent.currentUploadedFile = null;
                Agent.currentFingerprint = null;
            }

            if (typeof window.renderAll === 'function') {
                const activeTab = localStorage.getItem('admin_active_tab') || 'ai';
                await window.renderAll();
                if (typeof window.switchTab === 'function') {
                    window.switchTab(activeTab);
                }
            }
        } catch (e) {
            status.textContent = 'فشل ✗';
            status.className = 'text-red-400';
            console.error('DB Action error:', e);
            this.addMessage(`❌ خطأ: ${e.message}.`, 'ai');
        }
    },

    _renderFileCard(messages, opts) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3';
        div.innerHTML = `
            <div class="bg-white border border-black/5 p-4 rounded-3xl mx-2 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-gray-50 border border-black/5 flex items-center justify-center shrink-0">
                        <span class="material-symbols-outlined ${opts.iconColor.replace('text-green-400', 'text-green-600').replace('text-blue-400', 'text-blue-600')} text-xl" style="font-variation-settings:'FILL' 1">${opts.icon}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2 mb-0.5">
                            <span class="text-[9px] font-black px-1.5 py-0.5 rounded-md ${opts.badgeColor.replace('text-green-300', 'text-green-700').replace('text-blue-300', 'text-blue-700')}">${opts.badge}</span>
                            <span class="text-[10px] text-gray-400 font-bold">جاهز للتنزيل</span>
                        </div>
                        <div class="text-[11px] font-black text-gray-800">${opts.fileName}</div>
                    </div>
                </div>
                <button id="dl-btn-${Date.now()}" class="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center active:scale-95 transition-all hover:opacity-80 shrink-0">
                    <span class="material-symbols-outlined text-sm">download</span>
                </button>
            </div>`;

        // ✅ الإصلاح الرئيسي: إضافة العنصر للـ DOM
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;

        // ربط الحدث بعد الإضافة للـ DOM
        const btn = div.querySelector('button');
        btn.addEventListener('click', async () => {
            btn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span>`;
            btn.disabled = true;
            try {
                await opts.onClick();
                btn.innerHTML = `<span class="material-symbols-outlined text-sm">check</span>`;
                btn.className = btn.className.replace('bg-primary', 'bg-green-500');
            } catch (e) {
                btn.innerHTML = `<span class="material-symbols-outlined text-sm">error</span>`;
                btn.className = btn.className.replace('bg-primary', 'bg-red-500');
                console.error('Export error:', e);
            }
        });
    },

    _renderChart(messages, cmd) {
        const id = `chart-${Date.now()}`;
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="liquid-glass-modal border border-white/10 p-4 rounded-3xl">
                <div class="text-xs font-bold text-gray-800 mb-3">${cmd.title || 'رسم بياني'}</div>
                <canvas id="${id}" height="180"></canvas>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;

        // رسم Chart.js إن كان متاحاً
        if (typeof Chart !== 'undefined') {
            const canvas = document.getElementById(id);

            // تعيين الألوان الافتراضية للخطوط لتكون داكنة
            Chart.defaults.color = 'rgba(0,0,0,0.7)';
            Chart.defaults.font.family = 'Tajawal, sans-serif';

            const colors = cmd.labels.map((_, i) =>
                `hsl(${(i * 47 + 200) % 360}, 70%, 55%)`
            );
            new Chart(canvas, {
                type: cmd.chartType || 'bar',
                data: {
                    labels: cmd.labels,
                    datasets: [{
                        label: cmd.title || 'القيمة',
                        data: cmd.values,
                        backgroundColor: colors,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: cmd.chartType === 'pie' || cmd.chartType === 'doughnut',
                            labels: { color: 'rgba(0,0,0,0.7)', font: { size: 10, weight: 'bold' } }
                        }
                    },
                    scales: (cmd.chartType === 'pie' || cmd.chartType === 'doughnut') ? {} : {
                        x: { ticks: { color: 'rgba(0,0,0,0.6)', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
                        y: { ticks: { color: 'rgba(0,0,0,0.6)', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } }
                    }
                }
            });
        } else {
            // fallback: عرض أشرطة CSS بسيطة
            const canvas = document.getElementById(id);
            const max = Math.max(...cmd.values);
            canvas.outerHTML = `<div class="space-y-2">
                ${cmd.labels.map((l, i) => `
                    <div class="flex items-center gap-2 text-xs">
                        <span class="text-gray-600 w-16 text-left truncate">${l}</span>
                        <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                            <div class="h-full bg-primary/70 rounded-full flex items-center px-2 text-[10px] text-white font-bold" style="width:${Math.round((cmd.values[i] / max) * 100)}%">
                                ${cmd.values[i]}
                            </div>
                        </div>
                    </div>`).join('')}
            </div>`;
        }
    },

    _renderStatsCards(messages, cmd) {
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';
        div.innerHTML = `
            <div class="grid grid-cols-2 gap-2">
                ${cmd.items.map(item => `
                    <div class="bg-white border border-black/5 p-3 rounded-2xl">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings:'FILL' 1">${(item.icon || 'analytics').replace(/-/g, '_')}</span>
                            <span class="text-[9px] text-gray-400 font-black uppercase tracking-wider">${item.label}</span>
                        </div>
                        <div class="text-lg font-black text-gray-800">${item.value}</div>
                        ${item.sub ? `<div class="text-[10px] text-gray-400 font-bold mt-0.5">${item.sub}</div>` : ''}
                    </div>`).join('')}
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    },

    async getModelPricing(modelName) {
        try {
            const cached = localStorage.getItem('openrouter_models_pricing');
            if (cached) {
                const data = JSON.parse(cached);
                const found = data.find(m => m.id === modelName);
                if (found) return found.pricing;
            }
            const res = await fetch("https://openrouter.ai/api/v1/models");
            if (res.ok) {
                const json = await res.json();
                if (json && json.data) {
                    localStorage.setItem('openrouter_models_pricing', JSON.stringify(json.data));
                    const found = json.data.find(m => m.id === modelName);
                    if (found) return found.pricing;
                }
            }
        } catch (e) {
            console.warn("Failed to fetch model pricing:", e);
        }
        if (modelName === this.defaultModel) {
            return { prompt: "0.000002", completion: "0.000002" };
        }
        return { prompt: "0", completion: "0" };
    },

    async _callHiddenAgent(systemContext, userMessage, chatHistory = [], modelOverride = null, useFreshMemory = false, onChunk = null) {
        const currentProvider = this.getEffectiveProvider();
        const modelName = modelOverride || this.defaultModel;
        const providers = {
            inworld: {
                url: "https://api.inworld.ai/v1/chat/completions",
                key: this.apiKeys.inworld || (typeof Gemini !== 'undefined' ? Gemini.getInworldKey() : ''),
                headers: {},
                body: { model: modelName }
            },
            openrouter: {
                url: "https://openrouter.ai/api/v1/chat/completions",
                key: this.apiKeys.openrouter || (typeof Gemini !== 'undefined' ? Gemini.getOpenRouterKey() : ''),
                headers: {
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "Attendance AI Agent"
                },
                body: {
                    model: modelName
                }
            },
            deepinfra: {
                url: "https://api.deepinfra.com/v1/openai/chat/completions",
                key: this.apiKeys.deepinfra || localStorage.getItem('deepinfra_api_key') || '',
                headers: {},
                body: {
                    model: modelName
                }
            }
        };

        const config = providers[currentProvider];

        let messages = [];
        if (useFreshMemory) {
            messages = [
                { role: 'system', content: systemContext },
                { role: 'user', content: userMessage }
            ];
        } else {
            messages = [
                { role: 'system', content: systemContext },
                ...chatHistory.filter(h => h.role !== 'system'),
                { role: 'user', content: userMessage }
            ];
        }

        const requestBody = {
            messages: messages,
            temperature: 0.1,
            max_tokens: 4096,
            ...config.body
        };

        if (currentProvider === 'openrouter') {
            requestBody.tools = [
                { type: 'openrouter:web_search' }
            ];
        }

        if (onChunk) {
            requestBody.stream = true;
            if (currentProvider === 'openrouter') {
                requestBody.stream_options = { include_usage: true };
            }
        }

        const response = await fetch(config.url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.key}`,
                "Content-Type": "application/json",
                ...config.headers
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        if (onChunk) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = '';
            let fullText = '';
            let fullReasoningText = '';
            let usageData = null;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        const cleaned = line.trim();
                        if (!cleaned) continue;
                        if (cleaned.startsWith('data: ')) {
                            const dataStr = cleaned.slice(6);
                            if (dataStr === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(dataStr);
                                const delta = parsed.choices?.[0]?.delta;
                                if (delta) {
                                    const content = delta.content || '';
                                    const reasoning = delta.reasoning_content || delta.reasoning || '';

                                    if (content) fullText += content;
                                    if (reasoning) fullReasoningText += reasoning;

                                    onChunk({
                                        content: content,
                                        reasoning_content: reasoning,
                                        fullContent: fullText,
                                        fullReasoning: fullReasoningText,
                                        usage: parsed.usage || null
                                    });
                                }
                                if (parsed.usage) {
                                    usageData = parsed.usage;
                                    onChunk({
                                        content: '',
                                        reasoning_content: '',
                                        fullContent: fullText,
                                        fullReasoning: fullReasoningText,
                                        usage: parsed.usage
                                    });
                                }
                            } catch (e) {
                                // Ignore partial line errors
                            }
                        }
                    }
                }
            } catch (streamErr) {
                console.error("Error reading stream:", streamErr);
            }

            return fullText;
        } else {
            const data = await response.json();
            const resultText = data.choices?.[0]?.message?.content;
            if (!resultText) throw new Error('لم يأتِ رد من النموذج');
            return resultText;
        }
    },

    async _streamHiddenAgent(msgEl, systemContext, userMessage, chatHistory = [], modelOverride = null, useFreshMemory = false, loadingDiv = null) {
        const bodyEl = msgEl.querySelector('.agent-msg-ai-body') || msgEl.querySelector('.agent-msg-ai') || msgEl;

        let thinkingDropdown = null;
        let thinkingContent = null;
        let contentContainer = null;
        let isThinkingComplete = false;
        let hasScrolledForThisResponse = false;
        const modelName = modelOverride || this.defaultModel;

        const responseText = await this._callHiddenAgent(
            systemContext,
            userMessage,
            chatHistory,
            modelName,
            useFreshMemory,
            async (chunk) => {
                if (loadingDiv) {
                    loadingDiv.remove();
                    loadingDiv = null;
                }
                
                if (!hasScrolledForThisResponse) {
                    hasScrolledForThisResponse = true;
                    this.scrollToBottom(true);
                }
                if (chunk.reasoning_content) {
                    if (!thinkingDropdown) {
                        thinkingDropdown = document.createElement('details');
                        thinkingDropdown.className = 'agent-thinking-dropdown mb-2.5 opacity-90';
                        thinkingDropdown.open = false;

                        const summary = document.createElement('summary');
                        summary.className = 'text-xs text-neutral-500 dark:text-white/50 cursor-pointer select-none py-1 flex items-center gap-1.5 font-bold hover:text-neutral-700 dark:hover:text-white/70';
                        summary.innerHTML = `
                            <span class="material-symbols-outlined text-[14px] animate-spin text-amber-500" style="font-size:14px; animation: spin 1s linear infinite;">progress_activity</span>
                            <span class="thinking-label">جاري التفكير...</span>
                        `;
                        thinkingDropdown.appendChild(summary);

                        thinkingContent = document.createElement('div');
                        thinkingContent.className = 'agent-thinking-content text-[11px] text-gray-600 dark:text-gray-300 pl-3 border-l border-orange-500/30 mt-2 leading-relaxed whitespace-pre-wrap';
                        thinkingContent.style.fontFamily = "'Tajawal', sans-serif";
                        thinkingDropdown.appendChild(thinkingContent);

                        bodyEl.insertBefore(thinkingDropdown, bodyEl.firstChild);

                        // Cycle thinking phrases
                        const thinkingPhrases = ["جاري التفكير...", "تحليل الاستفسار...", "ما زلت أفكر...", "تحضير الإجابة..."];
                        let phraseIdx = 0;
                        thinkingDropdown.dataset.thinkingInterval = setInterval(() => {
                            const label = thinkingDropdown.querySelector('.thinking-label');
                            if (label && !isThinkingComplete) {
                                phraseIdx = (phraseIdx + 1) % thinkingPhrases.length;
                                label.textContent = thinkingPhrases[phraseIdx];
                            }
                        }, 2500);
                    }
                    thinkingContent.textContent = chunk.fullReasoning;
                }

                if (chunk.content) {
                    if (thinkingDropdown && !isThinkingComplete) {
                        isThinkingComplete = true;
                        if (thinkingDropdown.dataset.thinkingInterval) {
                            clearInterval(parseInt(thinkingDropdown.dataset.thinkingInterval));
                        }
                        const spinner = thinkingDropdown.querySelector('span.material-symbols-outlined');
                        if (spinner) {
                            spinner.className = 'material-symbols-outlined text-[14px] text-green-500';
                            spinner.style.animation = 'none';
                            spinner.textContent = 'check_circle';
                        }
                        const label = thinkingDropdown.querySelector('.thinking-label');
                        if (label) {
                            label.textContent = 'تم التفكير';
                        }
                        thinkingDropdown.open = false;
                    }

                    if (!contentContainer) {
                        contentContainer = document.createElement('div');
                        contentContainer.className = 'agent-actual-content';
                        bodyEl.appendChild(contentContainer);
                    }

                    const displaySoFar = chunk.fullContent.split('|||COMMAND|||')[0].trim();
                    if (typeof marked !== 'undefined') {
                        contentContainer.innerHTML = marked.parse(displaySoFar || '&nbsp;');
                    } else {
                        contentContainer.innerHTML = displaySoFar.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') || '&nbsp;';
                    }
                }

                if (chunk.usage) {
                    const settings = await DB.getSettings();
                    if (settings?.customization?.['dev-mode']) {
                        const usage = chunk.usage;
                        const pricing = await this.getModelPricing(modelName);
                        const promptCost = (usage.prompt_tokens || 0) * parseFloat(pricing.prompt || 0);
                        const completionCost = (usage.completion_tokens || 0) * parseFloat(pricing.completion || 0);
                        const totalCost = promptCost + completionCost;

                        const oldBadge = bodyEl.querySelector('.agent-msg-usage-badge');
                        if (oldBadge) oldBadge.remove();

                        const usageBadge = document.createElement('div');
                        usageBadge.className = 'agent-msg-usage-badge mt-2.5 pt-2.5 border-t border-black/10 dark:border-white/10 text-[10px] text-gray-600 dark:text-gray-400 flex items-center justify-between font-mono select-none w-full';
                        usageBadge.innerHTML = `
                            <span>المدخلات: ${usage.prompt_tokens} (${(promptCost * 1000).toFixed(4)}¢) | المخرجات: ${usage.completion_tokens} (${(completionCost * 1000).toFixed(4)}¢)</span>
                            <span class="bg-primary/20 text-primary px-1.5 py-0.5 rounded-md font-bold shrink-0">التكلفة الفعلية: $${totalCost.toFixed(6)}</span>
                        `;
                        bodyEl.appendChild(usageBadge);
                    }
                }
            }
        );

        if (thinkingDropdown && !isThinkingComplete) {
            isThinkingComplete = true;
            if (thinkingDropdown.dataset.thinkingInterval) {
                clearInterval(parseInt(thinkingDropdown.dataset.thinkingInterval));
            }
            const spinner = thinkingDropdown.querySelector('span.material-symbols-outlined');
            if (spinner) {
                spinner.className = 'material-symbols-outlined text-[14px] text-green-500';
                spinner.style.animation = 'none';
                spinner.textContent = 'check_circle';
            }
            const label = thinkingDropdown.querySelector('.thinking-label');
            if (label) label.textContent = 'تم التفكير';
            thinkingDropdown.open = false;
        }

        return responseText;
    },

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
                        const exists = list.some(c => c.name === name && (!item.section || c.section === item.section));
                        if (!exists) return { success: false, reason: `الصف "${name}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    for (const item of dataItems) {
                        const name = item.name;
                        const exists = list.some(s => s.name === name);
                        if (!exists) return { success: false, reason: `الطالب "${name}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    for (const item of dataItems) {
                        const name = item.name;
                        const exists = list.some(t => t.name === name);
                        if (!exists) return { success: false, reason: `المعلم "${name}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                }
            } else if (cmd.action === 'update') {
                const id = cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId;
                if (!id) return { success: false, reason: 'لم يتم توفير معرف للتعديل' };

                if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    const item = list.find(c => c.id === id);
                    if (!item) return { success: false, reason: `الفصل ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in cmd.data) {
                        if (item[key] !== cmd.data[key]) return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                    }
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    const item = list.find(s => s.id === id);
                    if (!item) return { success: false, reason: `الطالب ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in cmd.data) {
                        if (item[key] !== cmd.data[key]) return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                    }
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    const item = list.find(t => t.id === id);
                    if (!item) return { success: false, reason: `المعلم ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in cmd.data) {
                        if (item[key] !== cmd.data[key]) return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                    }
                }
            } else if (cmd.action === 'delete') {
                const ids = cmd.ids || [cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId];
                const validIds = ids.filter(id => id && !placeholderIds.includes(id));
                if (validIds.length === 0) return { success: false, reason: 'لم يتم توفير معرفات صالحة للحذف' };

                if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    const remains = list.some(c => validIds.includes(c.id));
                    if (remains) return { success: false, reason: 'الفصل المحذوف لا يزال موجوداً في قاعدة البيانات' };
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    const remains = list.some(s => validIds.includes(s.id));
                    if (remains) return { success: false, reason: 'الطالب المحذوف لا يزال موجوداً في قاعدة البيانات' };
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    const remains = list.some(t => validIds.includes(t.id));
                    if (remains) return { success: false, reason: 'المعلم المحذوف لا يزال موجوداً في قاعدة البيانات' };
                }
            }
            return { success: true };
        } catch (e) {
            return { success: false, reason: `خطأ أثناء التحقق من قاعدة البيانات: ${e.message}` };
        }
    },

    async _executeCommandWithVerification(cmd) {
        const capturedErrors = [];
        const originalConsoleError = console.error;

        console.error = function (...args) {
            capturedErrors.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' '));
            originalConsoleError.apply(console, args);
        };

        let executionError = null;
        try {
            await this.executeCommand(cmd);
        } catch (e) {
            executionError = e.message;
            capturedErrors.push(`Exception: ${e.message}`);
        } finally {
            console.error = originalConsoleError;
        }

        // انتظر قليلاً ليستقر Firestore
        await new Promise(resolve => setTimeout(resolve, 1000));

        const verification = await this._verifyDatabaseState(cmd);

        return {
            success: !executionError && verification.success && capturedErrors.length === 0,
            executionError,
            capturedErrors,
            verification
        };
    },

    async _silentLogToGoogleSheets(errorDetails) {
        const webhookUrl = localStorage.getItem('google_sheets_webhook_url') || '';

        // التسجيل الاحتياطي الصامت في Firestore (حتى لا تضيع الأخطاء إذا لم يكن Webhook مهيئاً)
        try {
            await DB.insert('v2_agentic_logs', {
                timestamp: new Date().toISOString(),
                user: typeof Auth !== 'undefined' ? Auth.getCurrentUser() : { name: 'Unknown' },
                ...errorDetails
            });
            console.log('[AutoPilot] Diagnostic log fallback saved to Firestore successfully.');
        } catch (dbErr) {
            console.error('[AutoPilot] Firestore log fallback failed:', dbErr);
        }

        if (!webhookUrl) {
            console.warn('[AutoPilot] Google Sheets Webhook URL is not configured. Configured fallback saved to DB.');
            return;
        }

        try {
            console.log('[AutoPilot] Sending diagnostic logs silently to Google Sheets...');
            await fetch(webhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    timestamp: new Date().toISOString(),
                    user: typeof Auth !== 'undefined' ? Auth.getCurrentUser() : { name: 'Unknown' },
                    ...errorDetails
                })
            });
        } catch (e) {
            console.error('[AutoPilot] Failed to log to Google Sheets silently:', e);
        }
    },

    clearFilePreviewUI() {
        this.currentUploadedFile = null;
        this.currentFingerprint = null;
        this.currentMatchedStudent = null;
        const previewContainer = document.getElementById('agent-file-preview-container');
        if (previewContainer) {
            previewContainer.classList.add('hidden');
        }
        const fileInput = document.getElementById('agent-file-input');
        if (fileInput) {
            fileInput.value = '';
        }
        const thumbnail = document.getElementById('agent-file-preview-thumbnail');
        if (thumbnail) {
            thumbnail.src = '';
            thumbnail.classList.add('hidden');
        }
        const previewIcon = document.getElementById('agent-file-preview-icon');
        if (previewIcon) {
            previewIcon.classList.remove('hidden');
        }
    },

    clearFileAttachment(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        this.clearFilePreviewUI();
    },

    handleFileUpload(input) {
        const file = input.files[0];
        if (!file) return;

        // Save metadata for diagnostic logging
        Agent.lastUploadedFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            timestamp: new Date().toISOString()
        };

        // Show preview container
        const previewContainer = document.getElementById('agent-file-preview-container');
        const thumbnail = document.getElementById('agent-file-preview-thumbnail');
        const previewIcon = document.getElementById('agent-file-preview-icon');
        const nameEl = document.getElementById('agent-file-preview-name');
        const statusEl = document.getElementById('agent-file-preview-status');

        if (previewContainer) {
            previewContainer.classList.remove('hidden');
        }
        if (nameEl) {
            nameEl.textContent = file.name;
        }
        if (statusEl) {
            statusEl.textContent = 'جاري المعالجة...';
            statusEl.style.color = '';
        }

        Agent.setStatus('جاري معالجة الملف...', true);

        if (file.type && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;

                // Show thumbnail
                if (thumbnail) {
                    thumbnail.src = dataUrl;
                    thumbnail.classList.remove('hidden');
                }
                if (previewIcon) {
                    previewIcon.classList.add('hidden');
                }

                // Save it to Agent.currentUploadedFile and lastUploadedImageForTools
                Agent.currentUploadedFile = {
                    name: file.name,
                    type: file.type,
                    dataUrl: dataUrl
                };
                Agent.lastUploadedImageForTools = dataUrl;
                Agent.currentFingerprint = null;
                Agent.currentMatchedStudent = null;

                if (statusEl) {
                    statusEl.textContent = 'تم تحميل الصورة بنجاح ✓';
                    statusEl.style.color = '#4caf50';
                }
                Agent.setStatus('جاهز للمساعدة', false);
            };
            reader.readAsDataURL(file);
        } else {
            if (thumbnail) {
                thumbnail.classList.add('hidden');
            }
            if (previewIcon) {
                previewIcon.classList.remove('hidden');
            }
            Agent.currentUploadedFile = {
                name: file.name,
                type: file.type
            };
            Agent.currentFingerprint = null;
            Agent.currentMatchedStudent = null;

            if (statusEl) {
                statusEl.textContent = 'ملف جاهز';
                statusEl.style.color = '#4caf50';
            }
            Agent.setStatus('جاهز للمساعدة', false);
        }
    },

    async searchStudentByFingerprint(descriptor) {
        if (!descriptor || !Array.isArray(descriptor)) {
            return { success: false, error: 'البصمة الرقمية غير صالحة' };
        }

        try {
            const students = await DB.getStudents();
            let bestMatch = null;
            let minDistance = Infinity;
            const threshold = 0.6; // standard distance threshold

            for (const s of students) {
                let descriptors = [];
                if (s.descriptors) {
                    try {
                        descriptors = typeof s.descriptors === 'string' ? JSON.parse(s.descriptors) : s.descriptors;
                    } catch (e) { }
                } else if (s.descriptor) {
                    try {
                        const single = typeof s.descriptor === 'string' ? JSON.parse(s.descriptor) : s.descriptor;
                        if (single) descriptors = [single];
                    } catch (e) { }
                }

                if (!Array.isArray(descriptors)) continue;

                for (const desc of descriptors) {
                    if (!desc || desc.length !== descriptor.length) continue;
                    let sum = 0;
                    for (let i = 0; i < descriptor.length; i++) {
                        const diff = descriptor[i] - desc[i];
                        sum += diff * diff;
                    }
                    const distance = Math.sqrt(sum);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestMatch = s;
                    }
                }
            }

            if (minDistance < threshold && bestMatch) {
                return {
                    success: true,
                    match: {
                        id: bestMatch.id,
                        name: bestMatch.name,
                        academicId: bestMatch.academicId,
                        classId: bestMatch.classId,
                        distance: minDistance
                    }
                };
            }
            return { success: true, match: null, reason: 'لم يتم العثور على طالب مطابق لهذه البصمة في قاعدة البيانات.' };
        } catch (e) {
            console.error('Error searching fingerprint:', e);
            return { success: false, error: e.message };
        }
    },

    _renderDiagnosticsCard(messages, data) {
        const id = `diag-${Date.now()}`;
        const div = document.createElement('div');
        div.className = 'animate-fade-in mb-3 mx-2';

        let stepsHtml = '';
        if (data.attempts && data.attempts.length > 0) {
            stepsHtml = data.attempts.map((attempt, index) => {
                const isSuccess = attempt.success;
                const statusIcon = isSuccess ? 'check_circle' : 'cancel';
                const statusColor = isSuccess ? 'text-green-500' : 'text-red-500';

                return `
                    <div class="relative pl-6 pb-4 border-l border-dashed ${index === data.attempts.length - 1 ? 'border-transparent' : 'border-black/10 dark:border-white/10'} last:pb-0">
                        <div class="absolute -left-[8px] top-0.5 w-4 h-4 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center border border-black/10 dark:border-white/5">
                            <span class="material-symbols-outlined text-[12px] ${statusColor}">${statusIcon}</span>
                        </div>
                        <div class="text-[11px] font-black text-neutral-800 dark:text-white/90 leading-tight">${attempt.title}</div>
                        ${attempt.error ? `<div class="text-[10px] text-red-300/80 font-mono mt-1 p-2 bg-red-950/20 border border-red-950/40 rounded-xl overflow-x-auto select-text">${attempt.error}</div>` : ''}
                        ${attempt.action ? `<div class="text-[10px] text-gray-400 font-bold mt-1 leading-normal break-all">${attempt.action}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        div.innerHTML = `
            <div class="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-3xl overflow-hidden shadow-lg">
                <div class="p-3.5 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-all select-none" onclick="document.getElementById('${id}').classList.toggle('hidden')">
                    <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-sm text-amber-500" style="font-variation-settings:'FILL' 1">construction</span>
                        <span class="text-[11px] font-black text-amber-500">مخطط سير عملية التشخيص والصيانة الذاتية</span>
                    </div>
                    <span class="material-symbols-outlined text-neutral-500 dark:text-white/40 text-xs">expand_more</span>
                </div>
                <div id="${id}" class="hidden p-4 border-t border-black/10 dark:border-white/10 bg-black/5 dark:bg-black/10">
                    <div class="space-y-4 relative pr-2">
                        ${stepsHtml}
                    </div>
                </div>
            </div>
        `;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    },

    _injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #agent-container.active { opacity: 1; transform: translateY(0); }
            @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
            @keyframes spin { to { transform: rotate(360deg); } }
            .animate-spin { animation: spin 1s linear infinite; }
            .hide-scrollbar::-webkit-scrollbar { display: none; }
            .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            
            /* إصلاح الأيقونات لمنع تداخل الخطوط والاتجاهات */
            .material-symbols-outlined {
                font-family: 'Material Symbols Outlined' !important;
                font-weight: normal;
                font-style: normal;
                font-size: 24px;
                line-height: 1;
                letter-spacing: normal;
                text-transform: none;
                display: inline-block;
                white-space: nowrap;
                word-wrap: normal;
                direction: ltr !important;
                -webkit-font-feature-settings: 'liga';
                -webkit-font-smoothing: antialiased;
            }
        `;
        document.head.appendChild(style);
    }
};