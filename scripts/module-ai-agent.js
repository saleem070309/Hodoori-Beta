/**
 * AI Agent - النسخة المطورة
 * الإصلاحات: إضافة appendChild المفقود، محلل JSON قوي، streaming، أوامر جديدة
 */

const Agent = {
    provider: 'inworld', // <--- غير القيمة هنا لـ 'openrouter' أو 'inworld' للتبديل بينهما
    chatHistory: [],
    isOpen: false,
    isStreaming: false,

    async init() {
        if (typeof GmailManager !== 'undefined') {
            await GmailManager.init();
        }
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

═══ قائمة الطلاب التفصيلية ═══
{{STUDENTS_LIST}}

═══ الفصول الدراسية ═══
{{CLASSES_LIST}}

═══ المعلمون والموظفون ═══
{{TEACHERS_LIST}}

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
            const studentsList = studentStats.map(s => `• ${s.name || 'مسمى مفقود'} | ID (الرقم الأكاديمي): ${s.academicId || 'بدون رقم'} | هاتف ولي الأمر: ${s.phone || 'غير مسجل'} | الفصل: ${s.classId || 'غير محدد'} | النسبة: ${s.attendanceRate}%${s.notes ? ` | ملاحظات: ${s.notes}` : ''}`).join('\n');
            const classesList = classes.map(c => `• ${c.name || 'مسمى غير محدد'} (${c.section || '-'}) | ID: ${c.id}${c.notes ? ` | ملاحظات: ${c.notes}` : ''}`).join('\n');
            const teachersList = teachers.map(t => `• ${t.name || 'بدون اسم'} (${t.role || 'موظف'}) | ID: ${t.id}${t.notes ? ` | ملاحظات: ${t.notes}` : ''}`).join('\n');

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
            container.className = 'hidden fixed bottom-24 left-4 right-4 h-[75vh] z-[100] bg-white/10 rounded-[2.5rem] border border-white/20 flex flex-col transition-all duration-400 opacity-0 translate-y-4';
            container.innerHTML = `
                <div class="px-5 py-4 flex justify-between items-center border-b border-white/10 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span class="material-symbols-outlined text-primary text-sm" style="font-variation-settings:'FILL' 1">auto_awesome</span>
                        </div>
                        <div>
                            <h3 class="font-bold text-white text-sm leading-tight">AutoPilot</h3>
                            <div id="agent-status" class="text-xs text-white/40">جاهز للمساعدة</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="agent-clear-btn" title="مسح المحادثة" class="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all">
                            <span class="material-symbols-outlined text-sm">delete_sweep</span>
                        </button>
                        <button onclick="Agent.toggleChat()" class="text-white/40 hover:text-white transition-colors flex items-center justify-center">
                            <img src="assets/icons/close.svg" alt="إغلاق" style="width: 14px; height: 14px; object-fit: contain; filter: brightness(0) invert(1);" />
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
                    <button class="suggestion-btn shrink-0 text-xs bg-white/5 border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
                        طلاب بغياب كثير
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-white/5 border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
                        تقرير إكسل شامل
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-white/5 border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
                        إحصائيات اليوم
                    </button>
                    <button class="suggestion-btn shrink-0 text-xs bg-white/5 border border-white/10 text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10 hover:text-white transition-all whitespace-nowrap">
                        رسم بياني للحضور
                    </button>
                </div>

                <div class="p-3 border-t border-white/10 bg-black/20 shrink-0 rounded-b-[2.5rem]">
                    <div class="relative flex items-center gap-2">
                        <textarea id="agent-input" placeholder="اكتب سؤالك هنا..." 
                            class="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-xs focus:outline-none focus:border-primary/50 text-white placeholder:text-white/20 resize-none overflow-y-auto max-h-32 hide-scrollbar"
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
    },

    clearChat() {
        const messages = document.getElementById('agent-messages');
        messages.innerHTML = `
            <div class="flex flex-col items-start animate-fade-in mx-1">
                <span class="text-[9px] font-black text-white/40 mb-1 px-1 uppercase tracking-tight">AutoPilot</span>
                <div class="bg-primary/10 border border-primary/20 p-3.5 rounded-2xl rounded-tr-sm text-xs leading-relaxed max-w-[92%] text-white/90">
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
            status.className = active ? 'text-xs text-primary animate-pulse' : 'text-xs text-white/40';
        }
    },

    async sendMessage() {
        if (this.isStreaming) return;
        const input = document.getElementById('agent-input');
        const text = input.value.trim();
        if (!text) return;

        // Force stop and turn off speech recognition upon sending
        if (typeof window.stopSpeechRecognition === 'function') {
            window.stopSpeechRecognition();
        }

        input.value = '';
        if (typeof window.handleInputTyping === 'function') {
            window.handleInputTyping(input);
        } else {
            input.style.height = 'auto';
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
        try {
            // Refresh context with latest data
            liveContext = await this.getSystemContext();
            if (this.chatHistory.length > 0 && this.chatHistory[0].role === 'system') {
                this.chatHistory[0].content = liveContext;
            } else {
                this.chatHistory.unshift({ role: 'system', content: liveContext });
            }

            // --- المحاولة الأولى (الوكيل الخفي) ---
            console.log('[AutoPilot] Launching hidden agent (Attempt 1)...');
            const hiddenResponse = await this._callHiddenAgent(liveContext, text, this.chatHistory);
            
            // إزالة مؤشر التحميل لعدم تكرار الواجهة
            loadingDiv.remove();

            const DELIMITER = '|||COMMAND|||';
            const hasCommand = hiddenResponse.includes(DELIMITER);

            if (!hasCommand) {
                // محادثة طبيعية عادية، لا داعي للتحقق أو الفشل
                this.chatHistory.push({ role: 'user', content: text });
                this.chatHistory.push({ role: 'assistant', content: hiddenResponse });
                this.addMessage(hiddenResponse, 'ai');
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
                    try { parsedCmd = JSON.parse(fallbackJson); } catch (e) {}
                }
            }

            if (!parsedCmd) {
                throw new Error('فشل فك تشفير الأمر البرمجي JSON في المحاولة الأولى');
            }

            // إظهار النص التمهيدي للتأكيد فوراً (مع دائرة الأفاتار)
            if (mainText) {
                this.addMessage(mainText, 'ai');
            }

            // تنفيذ مع التحقق
            console.log('[AutoPilot] Executing and verifying command:', parsedCmd);
            const result = await this._executeCommandWithVerification(parsedCmd);

            if (result.success) {
                // نجحت العملية تماماً!
                this.chatHistory.push({ role: 'user', content: text });
                this.chatHistory.push({ role: 'assistant', content: hiddenResponse });
                
                const successText = `✓ تم تنفيذ العملية بنجاح تام وتم التحقق من استقرار قاعدة البيانات!`;
                this.addMessagePlain(successText);
                return;
            }

            // --- المحاولة الثانية (التصحيح الذاتي بنموذج أقوى وذاكرة نظيفة كلياً) ---
            console.warn('[AutoPilot] First attempt failed. Triggering Self-Correction with premium model...');
            
            const correctionNotice = this.addMessage('⚠️ تم اكتشاف عدم استقرار أو خطأ في المحاولة الأولى. جاري تفعيل نموذج التصحيح الذاتي الأقوى (Gemini Pro) بذاكرة نظيفة كلياً لتجاوز الهلوسة وإتمام المهمة...', 'ai');
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
                const fallbackResponse = await this._callHiddenAgent(
                    liveContext, 
                    correctionPrompt, 
                    [], // ذاكرة نظيفة تماماً لتفادي الهلوسة البرمجية
                    'xiaomi/mimo-v2.5-pro',
                    true // تفعيل ذاكرة نظيفة
                );

                correctionNotice.remove();
                correctionLoading.remove();

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
                        try { parsedFallbackCmd = JSON.parse(fallbackJson); } catch (e) {}
                    }
                }

                if (!parsedFallbackCmd) {
                    throw new Error('فشل فك تشفير أمر التصحيح البرمجي JSON في المحاولة الثانية');
                }

                // تنفيذ مع التحقق من جديد
                console.log('[AutoPilot] Executing and verifying fallback command:', parsedFallbackCmd);
                const fallbackResult = await this._executeCommandWithVerification(parsedFallbackCmd);

                if (fallbackResult.success) {
                    // نجح التصحيح التلقائي!
                    this.chatHistory.push({ role: 'user', content: text });
                    this.chatHistory.push({ role: 'assistant', content: fallbackResponse });
                    
                    if (fallbackMainText) {
                        this.addMessagePlain(fallbackMainText);
                    }
                    const successText = `🎉 تم تصحيح المشكلة بنجاح تام وإتمام العملية بواسطة نموذج التصحيح الذاتي الأقوى!`;
                    this.addMessagePlain(successText);
                    return;
                }

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

            // تجميع معلومات التشخيص بالكامل بشكل صامت
            const diagnosticData = {
                userPrompt: text,
                chatHistory: this.chatHistory,
                error: e.message,
                timestamp: new Date().toISOString(),
                provider: this.provider,
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

        div.innerHTML = `
            <span class="text-[9px] font-black ${isUser ? 'text-gray-400' : 'text-primary'} mb-1 px-1 uppercase tracking-tight">${labelText}</span>
            <div class="${bubbleClass} p-3.5 rounded-2xl ${isUser ? 'rounded-tl-sm' : 'rounded-tr-sm'} text-xs font-bold leading-relaxed max-w-[92%] relative">
                ${formattedContent}
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
        div.className = 'flex gap-2';
        div.innerHTML = `
            <div class="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tr-none animate-fade-in flex items-center justify-center">
                <svg class="pencil-loader" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <clipPath id="pencil-eraser">
                            <rect rx="5" ry="5" width="30" height="30"></rect>
                        </clipPath>
                    </defs>
                    <circle class="pencil__stroke" r="70" fill="none" stroke="transparent" stroke-width="2" stroke-dasharray="439.82 439.82" stroke-dashoffset="439.82" stroke-linecap="round" transform="rotate(-113,100,100)" />
                    <image href="assets/AI-logo.png" x="60" y="60" width="80" height="80" class="pencil__logo" />
                    <g class="pencil__rotate" transform="translate(100,100)">
                        <g fill="none">
                            <circle class="pencil__body1" r="64" stroke="hsl(33,90%,50%)" stroke-width="30" stroke-dasharray="402.12 402.12" stroke-dashoffset="402" transform="rotate(-90)" />
                            <circle class="pencil__body2" r="74" stroke="hsl(33,90%,60%)" stroke-width="10" stroke-dasharray="464.96 464.96" stroke-dashoffset="465" transform="rotate(-90)" />
                            <circle class="pencil__body3" r="54" stroke="hsl(33,90%,40%)" stroke-width="10" stroke-dasharray="339.29 339.29" stroke-dashoffset="339" transform="rotate(-90)" />
                        </g>
                        <g class="pencil__eraser" transform="rotate(-90) translate(49,0)">
                            <g class="pencil__eraser-skew">
                                <rect fill="hsl(343,90%,70%)" rx="5" ry="5" width="30" height="30" />
                                <rect fill="hsl(343,90%,60%)" width="5" height="30" clip-path="url(#pencil-eraser)" />
                                <rect fill="hsl(223,10%,90%)" width="30" height="20" />
                                <rect fill="hsl(223,10%,70%)" width="15" height="20" />
                                <rect fill="hsl(223,10%,80%)" width="5" height="20" />
                                <rect fill="hsla(223,10%,10%,0.2)" y="6" width="30" height="2" />
                                <rect fill="hsla(223,10%,10%,0.2)" y="13" width="30" height="2" />
                            </g>
                        </g>
                        <g class="pencil__point" transform="rotate(-90) translate(49,-30)">
                            <polygon fill="hsl(33,90%,70%)" points="15 0,30 30,0 30" />
                            <polygon fill="hsl(33,90%,50%)" points="15 0,6 30,0 30" />
                            <polygon fill="hsl(223,10%,10%)" points="15 0,20 10,10 10" />
                        </g>
                    </g>
                </svg>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
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
        } else {
            console.warn('Unknown command type:', cmd.type);
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
            <div class="bg-gray-800 text-white p-3 rounded-2xl text-[10px] font-bold flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-sm text-primary">database</span>
                    <span>تنفيذ عملية: ${cmd.action} على ${cmd.table}</span>
                </div>
                <div id="db-status-${Date.now()}" class="text-primary">جاري...</div>
            </div>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;

        const status = div.querySelector('div:last-child');

        // التحقق من المعرفات الوهمية (Placeholders)
        const placeholderIds = ['ID_HERE', 'STUDENT_ID', 'TEACHER_ID', 'CLASS_ID', 'ID_CLASS', 'NEW_ID'];
        if (cmd.id && placeholderIds.includes(cmd.id)) {
            status.textContent = 'خطأ: معرف غير صالح';
            status.className = 'text-red-400';
            this.addMessage(`⚠️ تنبيه: حاول الوكيل استخدام معرف غير حقيقي (${cmd.id}). يرجى تزويده بالمعرف الصحيح من القوائم.`, 'ai');
            return;
        }

        try {
            let result;

            if (cmd.action === 'insert') {
                const dataItems = Array.isArray(cmd.data) ? cmd.data : [cmd.data];
                status.textContent = `جاري إضافة ${dataItems.length} عنصر...`;

                for (const item of dataItems) {
                    await DB.insert(cmd.table, item);
                }
                status.textContent = 'تمت الإضافة بنجاح ✓';
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
                status.textContent = 'تم تنفيذ المجموعة بنجاح ✓';
            }

            status.className = 'text-green-400';



            if (cmd.table === 'students' && (cmd.action === 'insert' || cmd.action === 'update')) {
                Agent.currentUploadedFile = null;
                Agent.currentFingerprint = null;
            }

            if (typeof window.renderAll === 'function') {
                await window.renderAll();
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

    async _callHiddenAgent(systemContext, userMessage, chatHistory = [], modelOverride = null, useFreshMemory = false) {
        const currentProvider = this.provider;
        const providers = {
            inworld: {
                url: "https://api.inworld.ai/v1/chat/completions",
                key: Gemini.getInworldKey(),
                headers: {},
                body: { model: modelOverride || "xiaomi/mimo-v2.5-pro" }
            },
            openrouter: {
                url: "https://openrouter.ai/api/v1/chat/completions",
                key: Gemini.getOpenRouterKey(),
                headers: {
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "Attendance AI Agent"
                },
                body: {
                    model: modelOverride || "xiaomi/mimo-v2.5-pro"
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

        const response = await fetch(config.url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.key}`,
                "Content-Type": "application/json",
                ...config.headers
            },
            body: JSON.stringify({
                messages: messages,
                temperature: 0.1,
                max_tokens: 4096,
                ...config.body
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        const resultText = data.choices?.[0]?.message?.content;
        if (!resultText) throw new Error('لم يأتِ رد من النموذج');
        return resultText;
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
        
        console.error = function(...args) {
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

    handleFileUpload(input) {
        const file = input.files[0];
        if (!file) return;

        // تسجيل الملف المرفوع في الجلسة الصامتة لمراقبة الأخطاء
        Agent.lastUploadedFile = {
            name: file.name,
            size: file.size,
            type: file.type,
            timestamp: new Date().toISOString()
        };

        Agent.addMessage(`تم رفع ملف: ${file.name}`, 'user');
        Agent.setStatus('جاري معالجة الملف...', true);

        if (file.type && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;
                
                // Save it to Agent.currentUploadedFile
                Agent.currentUploadedFile = {
                    name: file.name,
                    type: file.type,
                    dataUrl: dataUrl
                };

                // Compute the digital fingerprint
                try {
                    const img = new Image();
                    img.src = dataUrl;
                    img.onload = async () => {
                        const descriptor = await FaceDetection.getDescriptorFromImage(img);
                        if (descriptor) {
                            Agent.currentFingerprint = descriptor;
                            console.log("Hodoori Agent: Extracted digital fingerprint successfully:", descriptor);
                            Agent.addMessagePlain(`✓ تم استخراج البصمة الرقمية من الصورة بنجاح وتجهيزها للاستخدام! يمكنك الآن أن تطلب مني ربطها بطالب أو إضافة طالب جديد بها.`);
                        } else {
                            Agent.currentFingerprint = null;
                            Agent.addMessagePlain(`⚠️ لم أتمكن من العثور على وجه واضح في الصورة المرفوعة لاستخراج البصمة الرقمية. يرجى التأكد من أن الصورة تحتوي على وجه واضح ومضاء بشكل جيد.`);
                        }
                        Agent.setStatus('جاهز للمساعدة', false);
                    };
                } catch (err) {
                    console.error("Error extracting descriptor from uploaded file:", err);
                    Agent.currentFingerprint = null;
                    Agent.addMessagePlain(`❌ فشل معالجة الصورة المرفوعة لاستخراج البصمة الرقمية: ${err.message}`);
                    Agent.setStatus('جاهز للمساعدة', false);
                }
            };
            reader.readAsDataURL(file);
        } else {
            Agent.currentUploadedFile = {
                name: file.name,
                type: file.type
            };
            Agent.currentFingerprint = null;
            // Placeholder for real processing
            setTimeout(() => {
                Agent.addMessage(`لقد استلمت الملف **${file.name}**. كيف تود أن أساعدك به؟ (مثلاً: استيراد البيانات، تحليل الأسماء، إلخ)`, 'ai');
                Agent.setStatus('جاهز للمساعدة', false);
            }, 1500);
        }

        input.value = ''; // Reset input
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