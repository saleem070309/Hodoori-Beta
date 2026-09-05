/**
 * @fileoverview AI Agent Core Engine & Intelligence Modules
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 * 
 * يحتوي هذا الملف على:
 * 1. عقل الوكيل ومزودات الذكاء الاصطناعي (OpenRouter, DeepInfra, Inworld)
 * 2. التوجيهات والتعليمات الكاملة (System Prompt & Rules)
 * 3. مدير وأداة ربط البريد الإلكتروني (GmailManager API)
 * 4. محرك تنفيذ الأوامر، المخططات البيانية، وتصدير الملفات
 */

// ════════════════ GMAIL MANAGER (مدمج داخلياً) ════════════════
if (typeof GmailManager === 'undefined') {
    window.GmailManager = {
        CLIENT_ID: '338402675234-krfr3itjfr2f4q96sofa19mbb5s3ii6b.apps.googleusercontent.com',
        SCOPES: 'https://www.googleapis.com/auth/gmail.send',
        tokenClient: null,
        accessToken: null,

        getStorageKey(suffix) {
            const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
            const prefix = user ? `user_${user.id || user.ministryId}` : 'global';
            return `gmail_${prefix}_${suffix}`;
        },

        async init() {
            if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
                // Google Identity Services will initialize on demand when needed
                return;
            }

            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.CLIENT_ID,
                scope: this.SCOPES,
                callback: async (response) => {
                    if (response.error !== undefined) {
                        throw (response);
                    }
                    this.accessToken = response.access_token;
                    
                    const expiryTime = Date.now() + (response.expires_in * 1000);
                    localStorage.setItem(this.getStorageKey('access_token'), this.accessToken);
                    localStorage.setItem(this.getStorageKey('token_expiry'), expiryTime);
                    
                    try {
                        if (typeof DB !== 'undefined') {
                            const settings = await DB.getSettings();
                            settings.gmail_session = {
                                access_token: this.accessToken,
                                token_expiry: expiryTime,
                                saved_at: Date.now()
                            };
                            await DB.saveSettings(settings);
                            console.log('Gmail session saved to Firebase');
                        }
                    } catch (dbErr) {
                        console.error('Failed to save Gmail session to Firebase:', dbErr);
                    }

                    if (typeof UI !== 'undefined') {
                        UI.toast('تم ربط حساب Gmail بنجاح ✨', 'success');
                        window.dispatchEvent(new CustomEvent('gmail_connected'));
                    }
                },
            });

            let savedToken = localStorage.getItem(this.getStorageKey('access_token'));
            let expiry = localStorage.getItem(this.getStorageKey('token_expiry'));
            
            if (!savedToken || !expiry || Date.now() >= parseInt(expiry)) {
                try {
                    if (typeof DB !== 'undefined') {
                        const settings = await DB.getSettings();
                        if (settings.gmail_session && settings.gmail_session.access_token) {
                            const dbExpiry = settings.gmail_session.token_expiry;
                            if (dbExpiry && Date.now() < parseInt(dbExpiry)) {
                                savedToken = settings.gmail_session.access_token;
                                expiry = dbExpiry;
                                localStorage.setItem(this.getStorageKey('access_token'), savedToken);
                                localStorage.setItem(this.getStorageKey('token_expiry'), expiry);
                            }
                        }
                    }
                } catch (dbErr) {
                    console.error('Failed to restore Gmail session from Firebase:', dbErr);
                }
            }

            if (savedToken && expiry && Date.now() < parseInt(expiry)) {
                this.accessToken = savedToken;
            } else {
                this.accessToken = null;
                localStorage.removeItem(this.getStorageKey('access_token'));
                localStorage.removeItem(this.getStorageKey('token_expiry'));
            }
        },

        isConnected() {
            const savedToken = localStorage.getItem(this.getStorageKey('access_token'));
            const expiry = localStorage.getItem(this.getStorageKey('token_expiry'));
            
            if (!savedToken || !expiry || Date.now() >= parseInt(expiry)) {
                this.accessToken = null;
                return false;
            }
            
            if (savedToken !== this.accessToken) {
                this.accessToken = savedToken;
            }
            return !!this.accessToken;
        },

        login() {
            if (!this.tokenClient) {
                this.init().then(() => this.tokenClient?.requestAccessToken({ prompt: 'consent' }));
            } else {
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            }
        },

        async logout() {
            this.accessToken = null;
            localStorage.removeItem(this.getStorageKey('access_token'));
            localStorage.removeItem(this.getStorageKey('token_expiry'));
            
            try {
                if (typeof DB !== 'undefined') {
                    const settings = await DB.getSettings();
                    delete settings.gmail_session;
                    await DB.saveSettings(settings);
                }
            } catch (dbErr) {
                console.error('Failed to delete Gmail session from Firebase:', dbErr);
            }

            if (typeof UI !== 'undefined') UI.toast('تم فصل حساب Gmail', 'info');
        },

        async sendEmail(to, subject, message) {
            if (!this.isConnected()) {
                this.login();
                throw new Error('يرجى تسجيل الدخول وربط الحساب أولاً');
            }

            const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
            const emailContent = [
                `To: ${to}`,
                `Subject: ${utf8Subject}`,
                'Content-Type: text/html; charset=utf-8',
                'MIME-Version: 1.0',
                '',
                message
            ].join('\n');

            const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    raw: base64EncodedEmail
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 401) {
                    this.logout();
                    throw new Error('انتهت صلاحية الجلسة، يرجى إعادة الربط');
                }
                throw new Error(errorData.error?.message || 'فشل إرسال الإيميل');
            }

            return await response.json();
        }
    };
}

const Agent = {
    // ════════════════ CONFIGURATION ════════════════
    provider: 'auto', // 'openrouter', 'inworld', 'deepinfra', or 'auto' (selects automatically based on active key)
    defaultModel: 'nvidia/nemotron-3.5-lightning:free', // Default model to use

    // API Keys - can be set directly here or fall back to Gemini/localStorage settings
    apiKeys: {
        openrouter: '', // Set your key or configure via localStorage.setItem('openrouter_api_key', '...')
        inworld: '',    // If empty, will fallback to Gemini.getInworldKey()
        deepinfra: ''   // Put your DeepInfra API key here (e.g., 'your_key')
    },

    getApiKey(provider) {
        const p = (provider || '').toLowerCase();
        const keysObj = (this && this.apiKeys) || (typeof Agent !== 'undefined' && Agent.apiKeys) || {};
        if (p === 'openrouter') {
            return (
                keysObj.openrouter ||
                (typeof Gemini !== 'undefined' && typeof Gemini.getOpenRouterKey === 'function' ? Gemini.getOpenRouterKey() : '') ||
                (typeof window !== 'undefined' && window.__ENV__ && (window.__ENV__.OPENROUTER_API_KEY || window.__ENV__.openrouter_api_key || window.__ENV__.OPENROUTER_KEY)) ||
                (typeof localStorage !== 'undefined' ? (localStorage.getItem('openrouter_api_key') || localStorage.getItem('OPENROUTER_API_KEY')) : '') ||
                ''
            );
        }
        if (p === 'deepinfra') {
            return (
                keysObj.deepinfra ||
                (typeof Gemini !== 'undefined' && typeof Gemini.getDeepInfraKey === 'function' ? Gemini.getDeepInfraKey() : '') ||
                (typeof window !== 'undefined' && window.__ENV__ && (window.__ENV__.DEEPINFRA_API_KEY || window.__ENV__.deepinfra_api_key)) ||
                (typeof localStorage !== 'undefined' ? (localStorage.getItem('deepinfra_api_key') || localStorage.getItem('DEEPINFRA_API_KEY')) : '') ||
                ''
            );
        }
        if (p === 'inworld') {
            return (
                keysObj.inworld ||
                (typeof Gemini !== 'undefined' && typeof Gemini.getInworldKey === 'function' ? Gemini.getInworldKey() : '') ||
                (typeof window !== 'undefined' && window.__ENV__ && (window.__ENV__.INWORLD_API_KEY || window.__ENV__.inworld_api_key)) ||
                (typeof localStorage !== 'undefined' ? (localStorage.getItem('inworld_api_key') || localStorage.getItem('INWORLD_API_KEY')) : '') ||
                ''
            );
        }
        return '';
    },

    getEffectiveProvider() {
        if (this && this.provider && this.provider !== 'auto') {
            return this.provider;
        }
        const openrouterKey = this.getApiKey('openrouter');
        const deepinfraKey = this.getApiKey('deepinfra');
        const inworldKey = this.getApiKey('inworld');

        if (openrouterKey) return 'openrouter';
        if (deepinfraKey) return 'deepinfra';
        if (inworldKey) return 'inworld';
        return 'openrouter'; // Fallback
    },

    isVisionModel(modelName) {
        return true;
    },
    // ══════════════════════════════════════════════

    chatHistory: [],
    isOpen: false,
    isStreaming: false,
    currentMatchedStudent: null,
    requireConfirmation: true,

    isConfirmationRequired() {
        if (typeof this.requireConfirmation !== 'undefined') {
            return !!this.requireConfirmation;
        }
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('agent_require_confirmation');
            if (saved === 'false') return false;
        }
        return true;
    },

    isMutativeDbAction(cmd) {
        return !!(cmd && cmd.type === 'database_action' && ['insert', 'update', 'delete'].includes(cmd.action));
    },

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

    normalizeArabic(str) {
        if (!str) return '';
        return String(str)
            .replace(/[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')
            .replace(/\u0640/g, '')
            .replace(/[إأآاٱ]/g, 'ا')
            .replace(/[يى]/g, 'ي')
            .replace(/[ةه]/g, 'ه')
            .replace(/[ؤئء]/g, '')
            .toLowerCase()
            .trim();
    },

    stripDefiniteArticle(word) {
        if (!word) return '';
        if (word.startsWith('ال') && word.length > 3) {
            return word.slice(2);
        }
        return word;
    },

    scoreArabicMatch(targetName, query) {
        if (!targetName || !query) return 0;
        const targetNorm = this.normalizeArabic(targetName);
        const queryNorm = this.normalizeArabic(query);

        if (targetNorm === queryNorm) return 100;

        const queryTokens = queryNorm.split(/\s+/).filter(Boolean);
        const targetTokens = targetNorm.split(/\s+/).filter(Boolean);

        if (queryTokens.length === 0 || targetTokens.length === 0) return 0;

        const firstQ = this.stripDefiniteArticle(queryTokens[0]);
        const firstT = this.stripDefiniteArticle(targetTokens[0]);
        const lastQ = this.stripDefiniteArticle(queryTokens[queryTokens.length - 1]);
        const lastT = this.stripDefiniteArticle(targetTokens[targetTokens.length - 1]);

        const isFirstMatch = (firstQ === firstT);
        const isLastMatch = (lastQ === lastT);

        // First Name & Last Name exact match (e.g. "سليم ... الزعبي" for query "سليم الزعبي")
        if (queryTokens.length >= 2 && isFirstMatch && isLastMatch) {
            return 98;
        }

        if (targetNorm.includes(queryNorm)) {
            if (isFirstMatch) return 96;
            return 80;
        }

        let targetIdx = 0;
        let strictOrderedMatches = 0;

        for (const qTok of queryTokens) {
            const qRoot = this.stripDefiniteArticle(qTok);
            let found = false;
            while (targetIdx < targetTokens.length) {
                const tTok = targetTokens[targetIdx];
                const tRoot = this.stripDefiniteArticle(tTok);
                targetIdx++;

                if (tTok === qTok || tRoot === qRoot) {
                    found = true;
                    strictOrderedMatches++;
                    break;
                }
            }
            if (!found) break;
        }

        if (strictOrderedMatches === queryTokens.length) {
            if (isFirstMatch) return 94;
            return 82;
        }

        const allStrictFound = queryTokens.every(qTok => {
            const qRoot = this.stripDefiniteArticle(qTok);
            return targetTokens.some(tTok => {
                const tRoot = this.stripDefiniteArticle(tTok);
                return tTok === qTok || tRoot === qRoot;
            });
        });

        if (allStrictFound) {
            if (isFirstMatch) return 90;
            return 75;
        }

        return 0;
    },

    filterAndRankMatches(list, query) {
        if (!query || !list || list.length === 0) return [];
        const scored = list.map(item => ({
            item,
            score: this.scoreArabicMatch(item.name, query)
        })).filter(x => x.score > 0);

        scored.sort((a, b) => b.score - a.score);

        const topScore = scored.length > 0 ? scored[0].score : 0;
        if (topScore >= 90) {
            return scored.filter(x => x.score >= 90).map(x => x.item);
        }
        if (topScore >= 80) {
            return scored.filter(x => x.score >= 80).map(x => x.item);
        }
        return scored.map(x => x.item);
    },

    matchArabicNames(targetName, query) {
        return this.scoreArabicMatch(targetName, query) >= 75;
    },

    async _resolveTargetIds(table, idOrQuery) {
        if (!idOrQuery) return [];
        const queryStr = String(idOrQuery).trim();

        if (table === 'students') {
            const list = await DB.getStudents();
            const byDocId = list.find(s => s.id === queryStr);
            if (byDocId) return [byDocId.id];

            const byAcademicId = list.find(s => s.academicId && s.academicId.toLowerCase() === queryStr.toLowerCase());
            if (byAcademicId) return [byAcademicId.id];

            const ranked = this.filterAndRankMatches(list, queryStr);
            if (ranked.length > 0) return ranked.map(s => s.id);
        } else if (table === 'teachers') {
            const list = await DB.getTeachers();
            const byDocId = list.find(t => t.id === queryStr);
            if (byDocId) return [byDocId.id];

            const byMinistryId = list.find(t => t.ministryId && t.ministryId.toLowerCase() === queryStr.toLowerCase());
            if (byMinistryId) return [byMinistryId.id];

            const ranked = this.filterAndRankMatches(list, queryStr);
            if (ranked.length > 0) return ranked.map(t => t.id);
        } else if (table === 'classes') {
            const list = await DB.getClasses();
            const byDocId = list.find(c => c.id === queryStr);
            if (byDocId) return [byDocId.id];

            const ranked = this.filterAndRankMatches(list, queryStr);
            if (ranked.length > 0) return ranked.map(c => c.id);
        }

        return [queryStr];
    },

    async getEffectiveModel() {
        if (typeof Auth !== 'undefined' && typeof DB !== 'undefined') {
            const user = Auth.getCurrentUser();
            let schoolId = user ? user.schoolId : null;
            if (!schoolId && user) {
                try {
                    const freshUser = (await DB.getTeachers()).find(t => t.id === user.id || t.ministryId === user.ministryId);
                    if (freshUser && freshUser.schoolId) {
                        schoolId = freshUser.schoolId;
                        user.schoolId = schoolId;
                        localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify(user));
                    }
                } catch (e) {}
            }
            if (!schoolId) {
                try {
                    const schools = await DB.getSchools();
                    if (schools.length > 0) schoolId = schools[0].id;
                } catch (e) {}
            }
            if (schoolId) {
                try {
                    const school = await DB.getSchool(schoolId);
                    if (school && school.aiModel) {
                        this.defaultModel = school.aiModel;
                        return school.aiModel;
                    }
                } catch (e) {
                    console.warn('[Agent] Could not fetch school AI model:', e);
                }
            }
        }
        return this.defaultModel || 'nvidia/nemotron-3.5-lightning:free';
    },

    async init() {
        if (typeof GmailManager !== 'undefined') {
            await GmailManager.init();
        }
        try {
            const schoolModel = await this.getEffectiveModel();
            if (schoolModel) {
                this.defaultModel = schoolModel;
            }
        } catch (e) { }

        this.userHasScrolledUp = false;
        this.lastScrollTop = 0;
        this._injectStyles();
        this._setupListeners();
        this.chatHistory = [{ role: 'system', content: await this.getSystemContext() }];
    },

    isFaceAnalysisEnabledSync() {
        if (typeof localStorage !== 'undefined') {
            const localPref = localStorage.getItem('hodoori_agent_face_analysis_enabled');
            if (localPref === 'false') return false;
        }
        if (typeof this._cachedFaceAnalysisEnabled === 'boolean') {
            return this._cachedFaceAnalysisEnabled;
        }
        return true;
    },

    async isFaceAnalysisEnabled() {
        try {
            if (typeof localStorage !== 'undefined') {
                const localPref = localStorage.getItem('hodoori_agent_face_analysis_enabled');
                if (localPref === 'false') {
                    this._cachedFaceAnalysisEnabled = false;
                    return false;
                }
            }

            if (typeof DB !== 'undefined') {
                try {
                    const settings = await DB.getSettings();
                    if (settings && settings.enableAgentFaceAnalysis === false) {
                        this._cachedFaceAnalysisEnabled = false;
                        return false;
                    }
                } catch (_) {}

                if (typeof Auth !== 'undefined') {
                    const user = Auth.getCurrentUser();
                    let schoolId = user ? user.schoolId : null;
                    if (schoolId && schoolId !== 'ministry') {
                        try {
                            const school = await DB.getSchool(schoolId);
                            if (school && school.agentFaceAnalysis === false) {
                                this._cachedFaceAnalysisEnabled = false;
                                return false;
                            }
                        } catch (_) {}
                    }
                }
            }
            this._cachedFaceAnalysisEnabled = true;
            return true;
        } catch (e) {
            console.warn('[Agent] Error checking face analysis status:', e);
            return true;
        }
    },

    // ═══ القالب المدمج للتعليمات والعقل التوجيهي الشامل ═══
    _getBuiltinInstructionTemplate(faceAnalysisEnabled = true) {
        if (typeof AgentInstructions !== 'undefined' && typeof AgentInstructions.getTemplate === 'function') {
            return AgentInstructions.getTemplate({ faceAnalysisEnabled });
        }
        if (typeof window !== 'undefined' && window.AgentPromptTemplate) {
            if (!faceAnalysisEnabled && typeof AgentInstructions !== 'undefined' && typeof AgentInstructions.getTemplateWithoutFace === 'function') {
                return AgentInstructions.getTemplateWithoutFace();
            }
            return window.AgentPromptTemplate;
        }
        if (typeof require !== 'undefined') {
            try {
                const instructions = require('./module-ai-prompt.js');
                return typeof instructions.getTemplate === 'function' ? instructions.getTemplate({ faceAnalysisEnabled }) : (instructions.template || '');
            } catch (_) {}
        }
        return '';
    },

    async getSystemContext(activeFile = null, activeFingerprint = null, activeMatchedStudent = null) {
        try {
            // High-performance concurrent retrieval from core-db.js L1 Cache (0 network reads on warm cache)
            const [students, classes, records, teachers, isFaceEnabled] = await Promise.all([
                DB.getStudents(),
                DB.getClasses(),
                DB.getRecentRecords(30), // Bounded 30-day sliding window
                DB.getTeachers(),
                this.isFaceAnalysisEnabled()
            ]);

            const instructionTemplate = this._getBuiltinInstructionTemplate(isFaceEnabled);

            const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
            const currentUserId = currentUser ? (currentUser.id || currentUser.ministryId || '1') : '1';

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

            // تجهيز القوائم مع إرفاق الملاحظات إن وجدت
            const studentsList = ""; // تم إفراغها بالكامل لتوفير التوكنز والاعتماد على الاستعلام الديناميكي
            const classesList = classes.map(c => `• ${c.name || 'غير محدد'} (${c.section || '-'}) | ID: ${c.id}`).join('\n');
            const teachersList = teachers.map(t => `• ${t.name || 'بدون اسم'} (${t.role || 'موظف'}) | ID: ${t.id}`).join('\n');

            // تعويض المتغيرات في القالب
            let finalPrompt = instructionTemplate
                .replace(/{{USER_NAME}}/g, currentUser ? currentUser.name : 'مدير المدرسة')
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

            // خاصية إرسال البريد الإلكتروني معطلة مؤقتاً
            finalPrompt += `\n\n### خاصية البريد الإلكتروني (معطلة مؤقتاً):
- ميزة إرسال البريد الإلكتروني (Email) معطلة حالياً ومغلقة مؤقتاً للتجهيز للإطلاق الرسمي.
- إذا طلب المستخدم إرسال إيميل أو مشاركة تقرير عبر البريد الإلكتروني، فأخبره بلطف بأن الميزة قيد التطوير والتجهيز للإطلاق قريباً، واقترح عليه بدلاً من ذلك تجهيز رابط WhatsApp فوري مباشر أو تصدير تقرير رسمي منسق (Word أو Excel).`;

            const fileToUse = activeFile || this.currentUploadedFile;
            const fingerprintToUse = activeFingerprint || this.currentFingerprint;
            const matchedStudentToUse = activeMatchedStudent || this.currentMatchedStudent;

            if (isFaceEnabled && fileToUse && fingerprintToUse) {
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
    },

    /**
     * Lightweight delta context for intermediate multi-step loops.
     * Eliminates 30-day stats re-computations and leverages warm L1 cache.
     */
    async getDeltaContext() {
        try {
            const [students, classes, teachers] = await Promise.all([
                DB.getStudents(),
                DB.getClasses(),
                DB.getTeachers()
            ]);
            const currentUser = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
            const currentUserId = currentUser ? (currentUser.id || currentUser.ministryId || '1') : '1';
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            return `[سياق النظام المحدث (Delta Context)]:
- المستخدم الحالي: ${currentUser ? currentUser.name : 'مدير المدرسة'} (المعرف: ${currentUserId})
- التاريخ: ${todayStr}
- إحصائيات الكيانات المحدثة: إجمالي الطلاب (${students.length})، إجمالي الفصول (${classes.length})، إجمالي المعلمين (${teachers.length}).
- قائمة الفصول المسجلة: ${classes.map(c => `${c.name || c.id} (ID: ${c.id})`).join('، ') || 'لا يوجد'}
- وضع التشغيل: التنفيذ المتسلسل للوكيل المستقل (Autonomous Multi-Step Execution Loop).`;
        } catch (e) {
            console.warn('[Agent] Error generating delta context:', e);
            return `[سياق النظام المحدث]: وضع التنفيذ المتسلسل للوكيل المستقل.`;
        }
    },

    /**
     * Sanitizes data entities for inclusion in system context or tool summaries.
     * Removes large binary embeddings, face descriptors, and base64 images.
     */
    _sanitizeEntityForPrompt(entity) {
        if (!entity || typeof entity !== 'object') return entity;
        if (Array.isArray(entity)) {
            return entity.slice(0, 30).map(item => this._sanitizeEntityForPrompt(item));
        }
        const clean = {};
        for (const key of Object.keys(entity)) {
            // Exclude heavy fields: descriptors, face embeddings, base64 images, raw buffers
            if (['descriptors', 'descriptor', 'avatar', 'image', 'dataUrl', 'rawImage', 'fingerprint', 'embedding', 'faceDescriptors'].includes(key)) {
                continue;
            }
            if (typeof entity[key] === 'string' && entity[key].startsWith('data:image/')) {
                continue;
            }
            clean[key] = entity[key];
        }
        return clean;
    },

    /**
     * Replaces heavy base64 dataUrl payloads with lean text placeholders in chat history.
     */
    _sanitizeHistoryContent(content) {
        if (!content) return content;
        if (typeof content === 'string') {
            if (content.includes('data:image/')) {
                return content.replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g, '[صورة مرفقة: مستند معالَج]');
            }
            return content;
        }
        if (Array.isArray(content)) {
            const textPart = content.find(p => p && p.type === 'text');
            const textStr = textPart ? (textPart.text || '').trim() : '';
            return textStr ? `${textStr}\n[صورة مرفقة: مستند معالَج]` : '[صورة مرفقة: مستند معالَج]';
        }
        if (typeof content === 'object') {
            if (content.image_url || content.dataUrl) {
                return '[صورة مرفقة: مستند معالَج]';
            }
        }
        return content;
    },

    /**
     * Strips base64 image data from all existing turns in this.chatHistory.
     */
    _stripBase64FromHistory() {
        if (!Array.isArray(this.chatHistory)) return;
        for (let i = 0; i < this.chatHistory.length; i++) {
            const msg = this.chatHistory[i];
            if (msg && msg.content) {
                msg.content = this._sanitizeHistoryContent(msg.content);
            }
        }
    },

    /**
     * Deep equality helper for robust verification of objects and arrays.
     */
    _deepEqual(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return a == b;
        if (typeof a !== typeof b) {
            if ((typeof a === 'number' || typeof a === 'string') && (typeof b === 'number' || typeof b === 'string')) {
                return String(a).trim() === String(b).trim();
            }
            return false;
        }
        if (typeof a === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;
            if (Array.isArray(a)) {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (!this._deepEqual(a[i], b[i])) return false;
                }
                return true;
            }
            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            for (const k of keysA) {
                if (!this._deepEqual(a[k], b[k])) return false;
            }
            return true;
        }
        return String(a).trim() === String(b).trim();
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
            <div class="flex flex-col items-start animate-fade-in mx-1 my-2">
                <div class="agent-msg-ai agent-markdown text-sm leading-relaxed text-neutral-800 dark:text-white/90">
                    تم مسح المحادثة. كيف يمكنني مساعدتك؟
                </div>
            </div>`;
        this.chatHistory = [];
        const pageRoot = document.getElementById('agent-page-root') || document.querySelector('.agent-page-container');
        if (pageRoot) pageRoot.classList.remove('has-messages');

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

    async sendMessage(customText = '') {
        if (this.isStreaming) return;
        const input = document.getElementById('agent-input');
        const text = (typeof customText === 'string' && customText.trim()) ? customText.trim() : (input ? input.value.trim() : '');
        const uploadedFile = this.currentUploadedFile;
        const currentFingerprint = this.currentFingerprint;
        const currentMatchedStudent = this.currentMatchedStudent;

        if (!text && !uploadedFile) return;

        // Force stop and turn off speech recognition upon sending
        if (typeof window.stopSpeechRecognition === 'function') {
            window.stopSpeechRecognition();
        }

        // Set streaming state immediately to lock the unified button into 'stop' state
        this.isStreaming = true;
        this.setStatus('يفكر...', true);

        if (typeof window.setCapsuleActionState === 'function') {
            window.setCapsuleActionState('stop');
        }

        if (input) {
            input.value = '';
            if (typeof window.handleInputTyping === 'function') {
                window.handleInputTyping(input);
            } else {
                input.style.height = 'auto';
            }
        }

        // Add user message to UI (renders file attachment thumbnail inside message bubble)
        this.addMessage(text, 'user');

        // IMMEDIATELY clear the file preview container above the input bar upon sending
        this.clearFilePreviewUI();

        // Hide suggestions after first message
        const suggestionsEl = document.getElementById('agent-suggestions');
        if (suggestionsEl) suggestionsEl.style.display = 'none';

        // Loading indicator
        const loadingDiv = this.addLoadingIndicator(text);

        const sendBtn = document.getElementById('agent-send-btn');
        if (sendBtn) sendBtn.disabled = true;

        let liveContext = '';
        const attempts = [];
        try {
            // Refresh context with latest data including captured file metadata
            liveContext = await this.getSystemContext(uploadedFile, currentFingerprint, currentMatchedStudent);
            if (this.chatHistory.length > 0 && this.chatHistory[0].role === 'system') {
                this.chatHistory[0].content = liveContext;
            } else {
                this.chatHistory.unshift({ role: 'system', content: liveContext });
            }

            // --- المحاولة الأولى (الوكيل الخفي والتخطيط البرمجي) ---
            console.log('[AutoPilot] Launching hidden agent (Attempt 1)...');
            const msgEl = this.addMessage('', 'ai');
            msgEl.style.display = 'none';

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

            // استدعاء الوكيل الخفي بدون بث أحرف وسيطة إلى الشاشة
            const hiddenResponse = await this._callHiddenAgent(
                liveContext,
                finalUserContent,
                this.chatHistory,
                null,
                false,
                null
            );

            const CMD_REGEX = /\|{1,3}COMMAND\|{1,3}|COMMAND\|{1,3}|\|{1,3}COMMAND/i;
            const hasCommand = CMD_REGEX.test(hiddenResponse);

            if (!hasCommand) {
                // محادثة طبيعية مباشرة: اعرض الرد النظيف فوراً
                if (loadingDiv && typeof ThinkingOrbs !== 'undefined') {
                    ThinkingOrbs.completeBadge(loadingDiv);
                }
                const bodyEl = msgEl.querySelector('.agent-msg-ai-body') || msgEl.querySelector('.agent-msg-ai') || msgEl;
                bodyEl.innerHTML = '';
                const contentContainer = document.createElement('div');
                contentContainer.className = 'agent-actual-content';
                const cleanDisplay = hiddenResponse
                    .replace(/<think>[\s\S]*?<\/think>/gi, '')
                    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                    .trim();

                if (typeof marked !== 'undefined') {
                    contentContainer.innerHTML = marked.parse(cleanDisplay || '&nbsp;');
                } else {
                    contentContainer.innerHTML = cleanDisplay.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') || '&nbsp;';
                }
                bodyEl.appendChild(contentContainer);
                msgEl.style.display = '';

                this._appendMsgActions(bodyEl);

                this.chatHistory.push({ role: 'user', content: this._sanitizeHistoryContent(finalUserContent) });
                this._stripBase64FromHistory();
                this.chatHistory.push({ role: 'assistant', content: hiddenResponse });
                return;
            }

            // تحليل واستخراج الأوامر
            const parts = hiddenResponse.split(CMD_REGEX);
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

            // ─── محرك التنفيذ المتسلسل للوكيل الذكي (Autonomous Execution Loop) ───
            let currentParsedCmd = parsedCmd;
            let loopCount = 0;
            const MAX_AGENT_LOOPS = 4;
            let lastExecutionResult = null;
            const executedActionTables = [];
            let lastCreatedClassName = null;
            let lastCreatedClassId = null;

            this.chatHistory.push({ role: 'user', content: finalUserContent });

            while (currentParsedCmd && loopCount < MAX_AGENT_LOOPS) {
                loopCount++;
                console.log(`[AutoPilot] Step ${loopCount}: Executing command silently:`, currentParsedCmd);

                // فحص ما إذا كان الأمر تعديلياً ويحتاج موافقة واستئذان المستخدم أولاً
                if (this.isMutativeDbAction(currentParsedCmd) && !currentParsedCmd._confirmed && this.isConfirmationRequired()) {
                    console.log('[AutoPilot] Mutative DB action requires user approval. Rendering RecommendationCard...');
                    if (loadingDiv && typeof ThinkingOrbs !== 'undefined') {
                        ThinkingOrbs.completeBadge(loadingDiv);
                    }
                    this.isStreaming = false;
                    this.setStatus('بانتظار موافقتك...', false);
                    if (typeof window.setCapsuleActionState === 'function') {
                        window.setCapsuleActionState('idle');
                    }
                    const sendBtn = document.getElementById('agent-send-btn');
                    if (sendBtn) sendBtn.disabled = false;

                    const bodyEl = msgEl.querySelector('.agent-msg-ai-body') || msgEl.querySelector('.agent-msg-ai') || msgEl;
                    bodyEl.innerHTML = '';
                    const contentContainer = document.createElement('div');
                    contentContainer.className = 'agent-actual-content';

                    const currentStepText = loopCount === 1 ? mainText : (typeof nextHiddenResponse !== 'undefined' && nextHiddenResponse ? nextHiddenResponse.split(CMD_REGEX)[0].trim() : '');
                    const cleanDisplay = (currentStepText || '')
                        .replace(/<think>[\s\S]*?<\/think>/gi, '')
                        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                        .trim();

                    if (cleanDisplay) {
                        if (typeof marked !== 'undefined') {
                            contentContainer.innerHTML = marked.parse(cleanDisplay);
                        } else {
                            contentContainer.innerHTML = cleanDisplay.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                        }
                        bodyEl.appendChild(contentContainer);
                    }

                    // عرض بطاقة الاستئذان والموافقة
                    this._renderRecommendationCard(bodyEl, currentParsedCmd);
                    msgEl.style.display = '';
                    this._appendMsgActions(bodyEl);

                    this.chatHistory.push({ role: 'assistant', content: cleanDisplay ? cleanDisplay : 'طلب إذن لاعتماد العملية في قاعدة البيانات.' });
                    this.scrollToBottom(true);
                    return;
                }

                // تحديث حالة كبسولة التفكير بشكل ديناميكي أثناء العمل
                if (loadingDiv && typeof ThinkingOrbs !== 'undefined') {
                    if (currentParsedCmd.action === 'select') {
                        ThinkingOrbs.updateBadge(loadingDiv, 'searching', 'Searching....');
                    } else if (currentParsedCmd.type === 'identify_student') {
                        ThinkingOrbs.updateBadge(loadingDiv, 'shaping', 'Scanning....');
                    } else {
                        ThinkingOrbs.updateBadge(loadingDiv, 'working', 'Working....');
                    }
                }

                lastExecutionResult = await this._executeCommandWithVerification(currentParsedCmd);

                if (!lastExecutionResult.success) {
                    attempts.push({
                        title: `المحاولة ${loopCount}: تنفيذ الأمر البرمجي`,
                        success: false,
                        error: lastExecutionResult.executionError || (lastExecutionResult.verification ? lastExecutionResult.verification.reason : 'فشل التحقق من قاعدة البيانات'),
                        action: `الأمر: ${JSON.stringify(currentParsedCmd)}`
                    });
                    break; // الانتقال للتصحيح الذاتي في حال فشل التنفيذ
                }

                if (currentParsedCmd.action === 'insert') {
                    executedActionTables.push(currentParsedCmd.table);
                    if (currentParsedCmd.table === 'classes') {
                        lastCreatedClassName = currentParsedCmd.data?.name || currentParsedCmd.data?.className || 'الجديد';
                        lastCreatedClassId = currentParsedCmd.data?.id || 'c1';
                    }
                }

                // تجهيز ملخص نتيجة الأداة بدقة واكتمال مع ترشيد التوكنز
                let toolResultSummary = '';
                if (currentParsedCmd.type === 'database_action') {
                    if (currentParsedCmd.action === 'select') {
                        const resultsData = this.lastQueryResult?.data || [];
                        const sanitizedResults = this._sanitizeEntityForPrompt(resultsData);
                        toolResultSummary = `[نتائج الاستعلام التلقائي من قاعدة البيانات للجدول ${currentParsedCmd.table} بـ "${currentParsedCmd.query || currentParsedCmd.id}"]: \n` +
                            (resultsData.length > 0
                                ? JSON.stringify(sanitizedResults)
                                : "لا توجد نتائج تطابق هذا الاستعلام في قاعدة البيانات.");
                    } else if (currentParsedCmd.action === 'insert') {
                        const sanitizedData = this._sanitizeEntityForPrompt(currentParsedCmd.data);
                        const count = Array.isArray(currentParsedCmd.data) ? currentParsedCmd.data.length : 1;
                        toolResultSummary = `[نتيجة العملية البرمجية]: تم إضافة وحفظ (${count}) عنصر بنجاح في جدول ${currentParsedCmd.table}. البيانات المضافة: ${JSON.stringify(sanitizedData)}. تم تحديث قاعدة البيانات فوراً.`;
                    } else if (currentParsedCmd.action === 'update') {
                        const sanitizedData = this._sanitizeEntityForPrompt(currentParsedCmd.data);
                        toolResultSummary = `[نتيجة العملية البرمجية]: تم تحديث بيانات العنصر ذي المعرف (${currentParsedCmd.id || currentParsedCmd.academicId}) في جدول ${currentParsedCmd.table} بنجاح. البيانات المعدلة: ${JSON.stringify(sanitizedData)}. تم تحديث قاعدة البيانات فوراً.`;
                    } else if (currentParsedCmd.action === 'delete') {
                        toolResultSummary = `[نتيجة العملية البرمجية]: تم حذف العنصر من جدول ${currentParsedCmd.table} بنجاح. تم تحديث قاعدة البيانات فوراً.`;
                    }
                } else if (currentParsedCmd.type === 'identify_student') {
                    if (!this.isFaceAnalysisEnabledSync()) {
                        toolResultSummary = `[نتيجة تنفيذ الأداة]: هذا الأمر غير معرّف أو غير مدعوم في النظام.`;
                    } else {
                        const idRes = this.lastIdentifyResult || { success: false, error: 'لم يتم تشغيل الأداة بنجاح' };
                        if (!idRes.success) {
                            toolResultSummary = `[نتيجة أداة التعرف على الوجه]: فشل التعرف. الخطأ: ${idRes.error}`;
                        } else if (!idRes.faceDetected) {
                            toolResultSummary = `[نتيجة أداة التعرف على الوجه]: لم يتم اكتشاف أي وجه في الصورة المرفوعة.`;
                        } else {
                            const matchedList = idRes.matchedStudents || (idRes.match ? [idRes.match] : []);
                            if (matchedList.length > 0) {
                                const names = matchedList.map(s => `${s.name} (الرقم: ${s.academicId || s.id}, الصف: ${s.classId || '-'})`).join('، ');
                                toolResultSummary = `[نتيجة أداة التعرف على الوجه بالمحرك المطور (${idRes.modeUsed === 'multiple' ? 'وضع عدة طلاب/صف كامل' : 'وضع طالب واحد'})]:\n` +
                                    `- إجمالي الوجوه المكتشفة في الصورة: ${idRes.totalFaces || matchedList.length}\n` +
                                    `- الطلاب الذين تم التعرف عليهم ومطابقتهم (${matchedList.length}): ${names}\n` +
                                    (idRes.unmatchedCount > 0 ? `- وجوه أخرى غير مسجلة في النظام: ${idRes.unmatchedCount}\n` : '');
                            } else {
                                toolResultSummary = `[نتيجة أداة التعرف على الوجه]: تم اكتشاف (${idRes.totalFaces || 1}) وجه في الصورة، ولكن لم يتم مطابقة أي منها مع الطلاب المسجلين حالياً في قاعدة البيانات.`;
                            }
                        }
                    }
                } else if (currentParsedCmd.type === 'send_email') {
                    toolResultSummary = `[نتيجة إرسال الإيميل]: تم إرسال البريد الإلكتروني بنجاح إلى (${currentParsedCmd.to}) بالموضوع (${currentParsedCmd.subject}).`;
                } else if (currentParsedCmd.type === 'send_notification') {
                    toolResultSummary = `[نتيجة إرسال الإشعار]: تم إرسال الإشعار بنجاح بعنوان (${currentParsedCmd.title}).`;
                } else if (currentParsedCmd.type === 'export_excel' || currentParsedCmd.type === 'export_word' || currentParsedCmd.type === 'full_system_export') {
                    toolResultSummary = `[نتيجة تصدير التقرير]: تم تجهيز ملف التقرير وتنزيله بنجاح باسم (${currentParsedCmd.fileName || 'تقرير'}).`;
                } else if (currentParsedCmd.type === 'chart') {
                    toolResultSummary = `[نتيجة الرسم البياني]: تم إنشاء وعرض المخطط البياني بنجاح.`;
                } else {
                    toolResultSummary = `[نتيجة تنفيذ الأداة]: تم تنفيذ الأمر بنجاح.`;
                }

                // حفظ الأداة ونتيجتها في الذاكرة دون نصوص تمهيدية وسيطة
                this.chatHistory.push({ role: 'assistant', content: `|||COMMAND|||${JSON.stringify(currentParsedCmd)}` });
                this.chatHistory.push({ role: 'user', content: toolResultSummary });

                // استخدام سياق دلتا خفيف للأدوار الوسيطة لتفادي إعادة حساب إحصائيات 30 يوماً
                const updatedContext = await this.getDeltaContext();

                const hasRosterImage = uploadedFile && uploadedFile.type && uploadedFile.type.startsWith('image/');
                const hasCreatedClass = executedActionTables.includes('classes');
                const hasInsertedStudents = executedActionTables.includes('students');

                let rosterInstruction = '';
                if (hasRosterImage && hasCreatedClass && !hasInsertedStudents) {
                    rosterInstruction = `\n\n⚠️ [تنبيه نظام حاسم - إلزام برمجي فوري]:
لقد تم بنجاح إنشاء الصف ("${lastCreatedClassName || 'الجديد'}")، ولكنك **لم تقم بعد بإصدار أمر إدخال الطلاب المذكورين في الكشف المرفوع بالصورة**!
- تذكر: ذكر أسماء الطلاب في ردك النصي لا يحفظهم في قاعدة البيانات أبداً، ويُعتبر ادعاءً باطلاً وكاذباً.
- يجب عليك **حصراً في هذه الخطوة** قراءة الصورة وإصدار أمر الإدخال الجماعي لجميع طلاب الكشف المرفق دفعة واحدة:
|||COMMAND|||{"type":"database_action","action":"insert","table":"students","data":[{"name":"اسم الطالب الأول","academicId":"الرقم الوطني","classId":"${lastCreatedClassId || 'CLASS_ID'}"},{"name":"اسم الطالب الثاني","academicId":"الرقم الوطني","classId":"${lastCreatedClassId || 'CLASS_ID'}"},...]}
- **يُمنع منعاً باتاً** كتابة رد ختامي قبل إصدار هذا الأمر وتنفيذه وتأكيده في قاعدة البيانات!`;
                }

                // التوجيه للخطوة التالية في الذاكرة المخفية
                const nextStepPrompt = `أنت في وضع التنفيذ المتسلسل للعمليات المركبة (Autonomous Multi-Step Execution).
طلب المستخدم الأصلي: "${text}"
نتائج العملية البرمجية السابقة:
${toolResultSummary}${rosterInstruction}

المطلوب منك (تنفيذ تسلسلي دقيق وإتمام تلقائي شامل):
1. راجع طلب المستخدم والصورة المرفقة. إذا كانت هناك أي خطوة لم تُنفذ بعد (مثل إدخال الطلاب بعد إنشاء الصف)، أصدر أمر |||COMMAND||| فوراً في نهاية ردك دون أي نصوص تمهيدية.
2. إذا تم تنفيذ واكتمال كافة أجزاء وطلبات المستخدم بالكامل وبنجاح (تم إنشاء الصف وتم إدخال جميع طلاب الكشف بأوامر برمجية حقيقية)، اكتب رداً نهائياً شاملاً وموحداً يؤكد للمستخدم بوضوح واحترافية باللغة العربية إنجاز كافة العمليات بنجاح، دون كتابة أي أوامر.`;

                const nextHiddenResponse = await this._callHiddenAgent(
                    updatedContext,
                    nextStepPrompt,
                    this.chatHistory,
                    null,
                    false,
                    null
                );

                if (CMD_REGEX.test(nextHiddenResponse)) {
                    // هناك خطوة أو أمر تنفيذي إضافي
                    const parts = nextHiddenResponse.split(CMD_REGEX);
                    const nextCmdStr = parts[1]?.trim();
                    try {
                        currentParsedCmd = JSON.parse(this._sanitizeJSON(nextCmdStr) || this._extractJSONFallback(nextCmdStr));
                    } catch (e) {
                        currentParsedCmd = null;
                    }
                } else {
                    // اعتراض أي إدعاء زائف بالحفظ قبل إصدار الأمر الفعلي
                    if (hasRosterImage && hasCreatedClass && !executedActionTables.includes('students') && (nextHiddenResponse.includes('طلاب') || nextHiddenResponse.includes('طالب') || nextHiddenResponse.includes('students') || nextHiddenResponse.includes('استخراج'))) {
                        console.warn('[AutoPilot] Intercepted premature response without student insert command. Enforcing command...');
                        const forcePrompt = `⚠️ خطأ حاسم: لقد كتبت رداً تذكر فيه إضافة الطلاب، لكنك لم ترسل أمر |||COMMAND||| الفعلي لحفظهم في جدول students! لم يدخل أي طالب قاعدة البيانات حتى الآن.\nأصدر الآن فوراً أمر إدخال الطلاب الجماعي بالمصفوفة data: [...] ولا تكتب أي نصوص تمهيدية:\n|||COMMAND|||{"type":"database_action","action":"insert","table":"students","data":[{"name":"اسم الطالب","academicId":"الرقم الوطني","classId":"${lastCreatedClassId || 'CLASS_ID'}"},...]}`;
                        const retryResponse = await this._callHiddenAgent(
                            updatedContext,
                            forcePrompt,
                            this.chatHistory,
                            null,
                            false,
                            null
                        );
                        if (CMD_REGEX.test(retryResponse)) {
                            const parts = retryResponse.split(CMD_REGEX);
                            const retryCmdStr = parts[1]?.trim();
                            try {
                                currentParsedCmd = JSON.parse(this._sanitizeJSON(retryCmdStr) || this._extractJSONFallback(retryCmdStr));
                                continue;
                            } catch (e) {
                                currentParsedCmd = null;
                            }
                        }
                    }

                    // تم الوصول للإجابة النهائية الخالية من الأوامر -> اعرضها للمستخدم فوراً وبشكل نظيف
                    if (loadingDiv && typeof ThinkingOrbs !== 'undefined') {
                        ThinkingOrbs.completeBadge(loadingDiv);
                    }
                    const bodyEl = msgEl.querySelector('.agent-msg-ai-body') || msgEl.querySelector('.agent-msg-ai') || msgEl;
                    bodyEl.innerHTML = '';
                    const contentContainer = document.createElement('div');
                    contentContainer.className = 'agent-actual-content';
                    const cleanDisplay = nextHiddenResponse
                        .replace(/<think>[\s\S]*?<\/think>/gi, '')
                        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                        .split(CMD_REGEX)[0]
                        .trim();

                    if (typeof marked !== 'undefined') {
                        contentContainer.innerHTML = marked.parse(cleanDisplay || '&nbsp;');
                    } else {
                        contentContainer.innerHTML = cleanDisplay.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') || '&nbsp;';
                    }
                    bodyEl.appendChild(contentContainer);
                    msgEl.style.display = '';

                    this._appendMsgActions(bodyEl);

                    this.chatHistory.push({ role: 'assistant', content: cleanDisplay });
                    this.scrollToBottom(true);
                    return;
                }
            }

            // إذا اكتملت كافة خطوات الحلقة بنجاح
            if (lastExecutionResult && lastExecutionResult.success) {
                if (loadingDiv && typeof ThinkingOrbs !== 'undefined') {
                    ThinkingOrbs.completeBadge(loadingDiv);
                }
                this.setStatus('جاري صياغة الرد النهائي...', true);
                const updatedContext = await this.getDeltaContext();
                const finalPrompt = `لقد تم تنفيذ جميع خطوات طلب المستخدم "${text}" بنجاح وتأكيدها في قاعدة البيانات.\nقدم الآن رداً ختامياً واحداً، شاملاً، ومؤكداً واحترافياً باللغة العربية يلخص كل ما تم إنجازه بدقة. لا تكتب أي أوامر.`;
                const finalResponse = await this._callHiddenAgent(
                    updatedContext,
                    finalPrompt,
                    this.chatHistory,
                    null,
                    false,
                    null
                );

                const cleanDisplay = finalResponse
                    .replace(/<think>[\s\S]*?<\/think>/gi, '')
                    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                    .split(CMD_REGEX)[0]
                    .trim();

                const bodyEl = msgEl.querySelector('.agent-msg-ai-body') || msgEl.querySelector('.agent-msg-ai') || msgEl;
                bodyEl.innerHTML = '';
                const contentContainer = document.createElement('div');
                contentContainer.className = 'agent-actual-content';

                if (typeof marked !== 'undefined') {
                    contentContainer.innerHTML = marked.parse(cleanDisplay || '&nbsp;');
                } else {
                    contentContainer.innerHTML = cleanDisplay.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') || '&nbsp;';
                }
                bodyEl.appendChild(contentContainer);
                msgEl.style.display = '';

                this._appendMsgActions(bodyEl);

                this.chatHistory.push({ role: 'assistant', content: cleanDisplay });
                this.scrollToBottom(true);
                return;
            }

            attempts.push({
                title: 'المحاولة الأولى: تنفيذ وقبول التعديل بقاعدة البيانات',
                success: false,
                error: lastExecutionResult?.executionError || (lastExecutionResult?.verification ? lastExecutionResult.verification.reason : 'فشل التحقق من قاعدة البيانات بعد الاستدعاء الأول'),
                action: `الأمر الموجه: ${JSON.stringify(parsedCmd)}`
            });

            // --- المحاولة الثانية (التصحيح الذاتي بنموذج أقوى وذاكرة نظيفة كلياً) ---
            console.warn('[AutoPilot] First attempt failed. Triggering Self-Correction...');
            if (loadingDiv && typeof ThinkingOrbs !== 'undefined') {
                ThinkingOrbs.updateBadge(loadingDiv, 'working', 'Correcting....');
            }

            // تجهيز سياق التصحيح الذاتي المخفي
            const correctionPrompt = `
لقد طلب المستخدم القيام بالعملية التالية: "${text}"
ولكن المحاولة السابقة فشلت.
الأمر البرمجي الذي تم تجسيده: ${JSON.stringify(parsedCmd)}
حالة تحقق قاعدة البيانات: ${lastExecutionResult?.verification ? lastExecutionResult.verification.reason : (lastExecutionResult?.executionError || 'غير معروف')}
 
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
                    this.defaultModel,
                    true
                );

                const fallbackParts = fallbackResponse.split(CMD_REGEX);
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

                // تنفيذ مع التحقق من جديد
                console.log('[AutoPilot] Executing and verifying fallback command:', parsedFallbackCmd);
                const fallbackResult = await this._executeCommandWithVerification(parsedFallbackCmd);

                if (fallbackResult.success) {
                    if (loadingDiv && typeof ThinkingOrbs !== 'undefined') {
                        ThinkingOrbs.completeBadge(loadingDiv);
                    }
                    this.chatHistory.push({ role: 'user', content: this._sanitizeHistoryContent(finalUserContent) });
                    this._stripBase64FromHistory();
                    this.chatHistory.push({ role: 'assistant', content: fallbackResponse });

                    let fallbackSummary = '';
                    if (parsedFallbackCmd.type === 'identify_student') {
                        if (!this.isFaceAnalysisEnabledSync()) {
                            fallbackSummary = `[نتيجة تنفيذ الأداة]: هذا الأمر غير معرّف أو غير مدعوم في النظام.`;
                        } else {
                            const idRes = this.lastIdentifyResult || { success: false, error: 'لم يتم تشغيل الأداة بنجاح' };
                            if (!idRes.success) {
                                fallbackSummary = `[نتيجة أداة التعرف على الوجه]: فشل التعرف. الخطأ: ${idRes.error}`;
                            } else if (!idRes.faceDetected) {
                                fallbackSummary = `[نتيجة أداة التعرف على الوجه]: لم يتم اكتشاف أي وجه في الصورة المرفوعة.`;
                            } else {
                                const matchedList = idRes.matchedStudents || (idRes.match ? [idRes.match] : []);
                                if (matchedList.length > 0) {
                                    const names = matchedList.map(s => `${s.name} (الرقم: ${s.academicId || s.id}, الصف: ${s.classId || '-'})`).join('، ');
                                    fallbackSummary = `[نتيجة أداة التعرف على الوجه]: تم التعرف على: ${names}`;
                                } else {
                                    fallbackSummary = `[نتيجة أداة التعرف على الوجه]: لم يتم مطابقة أي وجوه مع المسجلين.`;
                                }
                            }
                        }
                    } else if (parsedFallbackCmd.type === 'database_action' && parsedFallbackCmd.action === 'select') {
                        const resultsData = this.lastQueryResult?.data || [];
                        const sanitizedResults = this._sanitizeEntityForPrompt(resultsData);
                        fallbackSummary = `[نتائج الاستعلام]: ` + (resultsData.length > 0 ? JSON.stringify(sanitizedResults) : "لا توجد نتائج.");
                    } else {
                        const sanitizedData = this._sanitizeEntityForPrompt(parsedFallbackCmd.data);
                        fallbackSummary = `تم تنفيذ العملية وتصحيحها بنجاح في قاعدة البيانات للأمر: ${JSON.stringify({ ...parsedFallbackCmd, data: sanitizedData })}.`;
                    }

                    this.chatHistory.push({ role: 'user', content: fallbackSummary });

                    this.setStatus('جاري صياغة الرد النهائي...', true);
                    const updatedContext = await this.getDeltaContext();

                    const finalFallbackResponse = await this._callHiddenAgent(
                        updatedContext,
                        `تم تنفيذ وتصحيح طلب المستخدم "${text}" بنجاح في قاعدة البيانات.\nقدم الآن رداً ختامياً واحداً، شاملاً، ومؤكداً واحترافياً باللغة العربية يؤكد اكتمال العملية بنجاح. لا تكتب أي أوامر.`,
                        this.chatHistory,
                        null,
                        false,
                        null
                    );

                    const cleanDisplay = finalFallbackResponse
                        .replace(/<think>[\s\S]*?<\/think>/gi, '')
                        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                        .split(CMD_REGEX)[0]
                        .trim();

                    const bodyEl = msgEl.querySelector('.agent-msg-ai-body') || msgEl.querySelector('.agent-msg-ai') || msgEl;
                    bodyEl.innerHTML = '';
                    const contentContainer = document.createElement('div');
                    contentContainer.className = 'agent-actual-content';

                    if (typeof marked !== 'undefined') {
                        contentContainer.innerHTML = marked.parse(cleanDisplay || '&nbsp;');
                    } else {
                        contentContainer.innerHTML = cleanDisplay.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') || '&nbsp;';
                    }
                    bodyEl.appendChild(contentContainer);
                    msgEl.style.display = '';

                    this._appendMsgActions(bodyEl);

                    this.chatHistory.push({ role: 'assistant', content: cleanDisplay });
                    this.scrollToBottom(true);
                    return;
                }

                attempts.push({
                    title: 'التشخيص والتصحيح الذاتي (المحاولة الثانية)',
                    success: false,
                    error: fallbackResult.executionError || (fallbackResult.verification ? fallbackResult.verification.reason : 'فشل التحقق بعد التصحيح الذاتي'),
                    action: `فشل استقرار قاعدة البيانات: ${JSON.stringify(parsedFallbackCmd)}`
                });

                throw new Error(`فشل التصحيح الذاتي أيضاً. الخطأ: ${fallbackResult.executionError || (fallbackResult.verification ? fallbackResult.verification.reason : 'غير معروف')}`);
            } catch (fallbackErr) {
                throw fallbackErr;
            }

        } catch (e) {
            // معالجة إيقاف الرد يدوياً من قبل المستخدم بنظافة واكتمال
            if (e.message === 'USER_ABORTED' || e.name === 'UserAbortError' || this.isUserAborted) {
                this.isUserAborted = false;
                console.log('[AutoPilot] Generation stopped cleanly by user.');

                if (typeof loadingDiv !== 'undefined' && loadingDiv && loadingDiv.parentNode) {
                    if (typeof ThinkingOrbs !== 'undefined') {
                        ThinkingOrbs.completeBadge(loadingDiv);
                    } else {
                        loadingDiv.remove();
                    }
                }

                // عرض الجملة البسيطة المحددة فقط: "أنت أوقفت هذا الرد"
                const lastAiMsg = document.querySelector('.agent-msg-ai:last-of-type') || document.querySelector('.agent-msg-ai-row:last-of-type');
                const bodyEl = lastAiMsg ? (lastAiMsg.querySelector('.agent-msg-ai-body') || lastAiMsg.querySelector('.agent-msg-ai') || lastAiMsg) : null;
                const existingContent = bodyEl ? (bodyEl.querySelector('.agent-actual-content')?.textContent?.trim() || '') : '';

                if (!existingContent || (lastAiMsg && lastAiMsg.style.display === 'none')) {
                    if (lastAiMsg && lastAiMsg.style.display === 'none') {
                        lastAiMsg.remove();
                    }
                    this.addMessage('أنت أوقفت هذا الرد', 'ai');
                } else {
                    const notice = document.createElement('div');
                    notice.className = 'text-xs text-neutral-400 dark:text-neutral-500 mt-2 font-medium italic';
                    notice.textContent = '⏹️ أنت أوقفت هذا الرد';
                    bodyEl.appendChild(notice);
                    lastAiMsg.style.display = '';
                    this._appendMsgActions(bodyEl);
                }
                return;
            }

            // --- الفشل التام والتسجيل الصامت في قوقل شيت ورصد الوزارة ---
            console.error('[AutoPilot] Ultimate failure in agentic flow:', e);

            // توثيق فوري للخطأ في منظومة الرصد الفني الموحدة لصفحة الوزارة
            if (typeof Telemetry !== 'undefined' && typeof Telemetry.logError === 'function') {
                try {
                    Telemetry.logError('AI_AGENT', e.message || 'خطأ مستعصٍ أثناء استجابة المساعد الذكي', e, {
                        userPrompt: text,
                        provider: this.getEffectiveProvider(),
                        attemptsCount: attempts.length,
                        source: 'Agent.sendMessage'
                    });
                } catch (_) {}
            }

            // إزالة الرسائل التمهيدية المتبقية إن وجدت
            if (typeof loadingDiv !== 'undefined' && loadingDiv && loadingDiv.parentNode) {
                if (typeof ThinkingOrbs !== 'undefined') ThinkingOrbs.completeBadge(loadingDiv);
                else loadingDiv.remove();
            }

            const friendlyErr = (e.message && (e.message.includes('مهلة') || e.message.includes('timeout') || e.name === 'AbortError'))
                ? e.message
                : `أعتذر منك بشدة، واجهت المهمة خطأ مستعصياً بعد عدة محاولات ولم تكتمل العملية بنجاح. تم تدوين تقرير التشخيص للإدارة فوراً لتصحيح المشكلة.`;
            this.addMessage(`❌ ${friendlyErr}`, 'ai');

            if (attempts.length === 0) {
                attempts.push({
                    title: 'فشل العملية العام',
                    success: false,
                    error: e.message
                });
            }

            // تجميع معلومات التشخيص بالكامل بشكل صامت
            const diagnosticData = {
                userPrompt: text,
                chatHistory: this.chatHistory,
                error: e.message,
                timestamp: new Date().toISOString(),
                provider: this.getEffectiveProvider(),
                uploadedFile: Agent.lastUploadedFile || this.lastUploadedFile || null,
                systemContext: liveContext
            };

            // تشغيل الإرسال الصامت
            this._silentLogToGoogleSheets(diagnosticData);
        } finally {
            this._stripBase64FromHistory();
            this.isStreaming = false;
            this.activeAbortController = null;
            this.setStatus('جاهز للمساعدة', false);
            const sendBtn = document.getElementById('agent-send-btn');
            if (sendBtn) sendBtn.disabled = false;

            if (typeof window.syncCapsuleActionState === 'function') {
                window.syncCapsuleActionState();
            }
            const input = document.getElementById('agent-input');
            if (typeof window.handleInputTyping === 'function' && input) {
                window.handleInputTyping(input);
            }
        }
    },

    addMessage(text, role) {
        const messages = document.getElementById('agent-messages');
        const pageRoot = document.getElementById('agent-page-root') || document.querySelector('.agent-page-container');
        if (pageRoot) pageRoot.classList.add('has-messages');
        const isUser = role === 'user';
        const div = document.createElement('div');
        div.className = isUser 
            ? 'agent-msg-user-row animate-fade-in' 
            : 'agent-msg-ai-row animate-fade-in';

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
            // User messages: plain text only with clean <br>
            formattedContent = displayText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>') || '&nbsp;';
        }

        let fileContentHtml = '';
        if (isUser && Agent.currentUploadedFile) {
            const fileIcon = typeof Morphicons !== 'undefined' ? Morphicons.svg('FileText', 18, 'text-gray-400') : '<span class="material-symbols-outlined text-sm text-gray-400">description</span>';
            if (Agent.currentUploadedFile.dataUrl) {
                fileContentHtml = `<div class="agent-msg-file-attachment mt-2"><img src="${Agent.currentUploadedFile.dataUrl}" class="max-w-[200px] max-h-[150px] rounded-xl object-cover border border-white/20 shadow-sm" /><div class="text-[9px] text-gray-400 mt-1 truncate" style="max-width: 200px;">${Agent.currentUploadedFile.name}</div></div>`;
            } else {
                fileContentHtml = `<div class="agent-msg-file-attachment mt-2 flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/10 dark:border-white/10 max-w-[200px]">${fileIcon}<span class="text-[9px] text-gray-400 truncate">${Agent.currentUploadedFile.name}</span></div>`;
            }
        }

        const mEdit = typeof Morphicons !== 'undefined' ? Morphicons.svg('Pencil', 13) : '<span class="material-symbols-outlined text-[13px]">edit</span>';
        const mUserCopy = typeof Morphicons !== 'undefined' ? Morphicons.svg('Copy', 13) : '<span class="material-symbols-outlined text-[13px]">content_copy</span>';

        if (isUser) {
            div.innerHTML = `<div class="agent-user-msg-container group"><div class="agent-msg-user relative">${formattedContent}${fileContentHtml}</div><div class="agent-user-actions"><button class="agent-action-btn" onclick="Agent.editPrompt(this)" title="تعديل الرسالة">${mEdit}</button><button class="agent-action-btn" onclick="Agent.copyUserPrompt(this)" title="نسخ الرسالة">${mUserCopy}</button></div></div>`;
        } else {
            const hasContent = displayText.length > 0;
            div.innerHTML = `
                <div class="agent-msg-ai agent-markdown w-full text-[15px] leading-relaxed relative">
                    <div class="agent-actual-content">${formattedContent}</div>
                </div>`;
            if (hasContent) {
                const bodyEl = div.querySelector('.agent-msg-ai');
                this._appendMsgActions(bodyEl);
            }
        }

        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    },

    addMessagePlain(text) {
        const messages = document.getElementById('agent-messages');
        const div = document.createElement('div');
        div.className = 'w-full mb-6 mx-0 animate-fade-in flex flex-col items-start';

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
            <div class="agent-msg-ai agent-markdown w-full text-[15px] leading-relaxed relative">
                <div class="agent-actual-content">${formattedContent}</div>
            </div>`;

        const bodyEl = div.querySelector('.agent-msg-ai');
        this._appendMsgActions(bodyEl);

        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
        return div;
    },

    // ─── AI & User Message Action Handlers ───
    _copyToClipboard(text) {
        if (!text) return Promise.reject(new Error('No text to copy'));

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text).catch(() => {
                return this._fallbackCopyText(text);
            });
        }
        return this._fallbackCopyText(text);
    },

    _fallbackCopyText(text) {
        return new Promise((resolve, reject) => {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.top = '0';
                textarea.style.left = '0';
                textarea.style.width = '2em';
                textarea.style.height = '2em';
                textarea.style.padding = '0';
                textarea.style.border = 'none';
                textarea.style.outline = 'none';
                textarea.style.boxShadow = 'none';
                textarea.style.background = 'transparent';
                textarea.style.opacity = '0';
                textarea.setAttribute('readonly', '');
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                textarea.setSelectionRange(0, text.length);
                const successful = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (successful) {
                    resolve();
                } else {
                    reject(new Error('execCommand copy failed'));
                }
            } catch (err) {
                reject(err);
            }
        });
    },

    copyMessage(btn) {
        const msgContainer = btn.closest('.agent-msg-ai-row') || btn.closest('.agent-msg-ai') || btn.closest('.w-full') || btn.parentElement?.parentElement;
        const contentEl = msgContainer?.querySelector('.agent-actual-content') || msgContainer?.querySelector('.agent-markdown') || msgContainer;
        if (!contentEl) return;

        // Clone and extract only text excluding action toolbar and usage badges
        const clone = contentEl.cloneNode(true);
        const actions = clone.querySelector('.agent-msg-actions');
        if (actions) actions.remove();
        const usage = clone.querySelector('.agent-msg-usage-badge');
        if (usage) usage.remove();

        const textToCopy = (clone.innerText || clone.textContent || '').trim();
        if (!textToCopy) return;

        this._copyToClipboard(textToCopy).then(() => {
            const svg = btn.querySelector('svg');
            const icon = btn.querySelector('.material-symbols-outlined');
            if (typeof Morphicons !== 'undefined' && svg) {
                Morphicons.morph(svg, 'Check');
                svg.classList.add('text-green-500');
                setTimeout(() => {
                    Morphicons.morph(svg, 'Copy');
                    svg.classList.remove('text-green-500');
                }, 2000);
            } else if (icon) {
                const prevIcon = icon.textContent;
                icon.textContent = 'check';
                icon.classList.add('text-green-500');
                setTimeout(() => {
                    icon.textContent = prevIcon;
                    icon.classList.remove('text-green-500');
                }, 2000);
            }
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('تم نسخ الإجابة بنجاح', 'success');
            }
        }).catch(err => {
            console.error('[AutoPilot] Copy failed:', err);
        });
    },

    regenerateLastResponse(btn) {
        if (this.isStreaming) return;

        // 1. Find the preceding user bubble before this AI response in the DOM
        let promptText = '';
        const aiRow = btn ? (btn.closest('.agent-msg-ai-row') || btn.closest('.agent-msg-ai') || btn.closest('.mb-6')) : null;
        if (aiRow) {
            let prev = aiRow.previousElementSibling;
            while (prev) {
                const userBubble = prev.querySelector('.agent-msg-user');
                if (userBubble) {
                    promptText = userBubble.innerText.trim();
                    break;
                }
                prev = prev.previousElementSibling;
            }
        }

        // 2. If not found in previous sibling, find latest user prompt in chatHistory (ignoring tool results)
        if (!promptText && Array.isArray(this.chatHistory)) {
            for (let i = this.chatHistory.length - 1; i >= 0; i--) {
                const item = this.chatHistory[i];
                if (item.role === 'user' && typeof item.content === 'string' && !item.content.startsWith('[')) {
                    promptText = item.content;
                    break;
                }
            }
        }

        // 3. Fallback to latest .agent-msg-user in DOM
        if (!promptText) {
            const userBubbles = document.querySelectorAll('.agent-msg-user');
            if (userBubbles.length > 0) {
                promptText = userBubbles[userBubbles.length - 1].innerText.trim();
            }
        }

        if (promptText) {
            console.log('[AutoPilot] Regenerating response for prompt:', promptText);
            this.sendMessage(promptText);
        }
    },

    rateFeedback(btn, type) {
        const parentActions = btn.closest('.agent-msg-actions');
        if (!parentActions) return;

        const likeBtn = parentActions.querySelector('button[title="إعجاب"]');
        const dislikeBtn = parentActions.querySelector('button[title="لم يعجبني"]');

        if (type === 'like') {
            const isAlreadyActive = btn.classList.contains('active-like');
            if (likeBtn) likeBtn.classList.toggle('active-like', !isAlreadyActive);
            if (dislikeBtn) dislikeBtn.classList.remove('active-dislike');
            if (!isAlreadyActive && typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('شكراً على تقييمك الإيجابي!', 'info');
            }
        } else {
            const isAlreadyActive = btn.classList.contains('active-dislike');
            if (dislikeBtn) dislikeBtn.classList.toggle('active-dislike', !isAlreadyActive);
            if (likeBtn) likeBtn.classList.remove('active-like');
            if (!isAlreadyActive && typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('شكراً على ملاحظتك، سنعمل على تحسين جودة الإجابة.', 'warning');
            }
        }
    },

    editPrompt(btn) {
        const userMsgDiv = btn.closest('.agent-user-msg-container') || btn.closest('.agent-msg-user-row') || btn.closest('.flex-col') || btn.parentElement;
        const bubble = userMsgDiv?.querySelector('.agent-msg-user');
        const promptText = (bubble ? bubble.innerText : userMsgDiv?.innerText || '').trim();
        const input = document.getElementById('agent-input');
        if (input && promptText) {
            input.value = promptText;
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            if (typeof window.handleInputTyping === 'function') {
                window.handleInputTyping(input);
            }
            if (typeof window.setCapsuleActionState === 'function') {
                window.setCapsuleActionState('send');
            }
            this.scrollToBottom(true);
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('تم وضع الرسالة في حقل الكتابة للتعديل', 'info');
            }
        }
    },

    copyUserPrompt(btn) {
        const userMsgDiv = btn.closest('.agent-user-msg-container') || btn.closest('.agent-msg-user-row') || btn.closest('.flex-col') || btn.parentElement;
        const bubble = userMsgDiv?.querySelector('.agent-msg-user');
        const promptText = (bubble ? bubble.innerText : userMsgDiv?.innerText || '').trim();
        if (!promptText) return;

        this._copyToClipboard(promptText).then(() => {
            const svg = btn.querySelector('svg');
            const icon = btn.querySelector('.material-symbols-outlined');
            if (typeof Morphicons !== 'undefined' && svg) {
                Morphicons.morph(svg, 'Check');
                svg.classList.add('text-green-500');
                setTimeout(() => {
                    Morphicons.morph(svg, 'Copy');
                    svg.classList.remove('text-green-500');
                }, 1800);
            } else if (icon) {
                const prev = icon.textContent;
                icon.textContent = 'check';
                icon.classList.add('text-green-500');
                setTimeout(() => {
                    icon.textContent = prev;
                    icon.classList.remove('text-green-500');
                }, 1800);
            }
            if (typeof Utils !== 'undefined' && Utils.showToast) {
                Utils.showToast('تم نسخ رسالتك بنجاح', 'success');
            }
        }).catch(err => {
            console.error('[AutoPilot] Copy user prompt failed:', err);
        });
    },

    stopGeneration() {
        this.isUserAborted = true;
        if (this.activeAbortController) {
            console.log('[AutoPilot] Stopping active generation by user request...');
            try {
                this.activeAbortController.abort();
            } catch (err) { }
            this.activeAbortController = null;
        }

        this.isStreaming = false;
        this.setStatus('جاهز للمساعدة', false);

        if (typeof window.syncCapsuleActionState === 'function') {
            window.syncCapsuleActionState();
        }

        const activeThinkingPill = document.querySelector('.agent-thinking-pill');
        if (activeThinkingPill && typeof ThinkingOrbs !== 'undefined') {
            ThinkingOrbs.completeBadge(activeThinkingPill);
        }

        const input = document.getElementById('agent-input');
        if (typeof window.handleInputTyping === 'function' && input) {
            window.handleInputTyping(input);
        }
    },

    addLoadingIndicator(promptText = '') {
        const messages = document.getElementById('agent-messages');
        const initState = 'composing';
        const initText = 'Thinking....';

        if (typeof ThinkingOrbs !== 'undefined') {
            const pill = ThinkingOrbs.createBadge(initState, initText);
            messages.appendChild(pill);
            this.scrollToBottom(true);
            return pill;
        }

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
            <div class="loading-text text-xs text-neutral-600 dark:text-white/70 font-semibold">جاري التفكير...</div>
        `;

        messages.appendChild(div);
        this.scrollToBottom(true);
        return div;
    },

    // ═══════════════════════════════════════════════════
    // محلل الأوامر - الإصلاح الرئيسي + منطق قوي
    // ═══════════════════════════════════════════════════
    async handleAIResponse(rawText) {
        const CMD_REGEX = /\|{1,3}COMMAND\|{1,3}|COMMAND\|{1,3}|\|{1,3}COMMAND/i;
        const parts = rawText.split(CMD_REGEX);

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
                        if (typeof Telemetry !== 'undefined' && typeof Telemetry.logError === 'function') {
                            Telemetry.logError('AI_AGENT', `فشل تحليل وتنفيذ أمر الوكيل: ${e2.message}`, e2, { rawCommand: cmdStr });
                        }
                        this._showCommandError(cmdStr);
                    }
                } else {
                    if (typeof Telemetry !== 'undefined' && typeof Telemetry.logError === 'function') {
                        Telemetry.logError('AI_AGENT', `فشل استخراج صيغة JSON لأمر الوكيل: ${e.message}`, e, { rawCommand: cmdStr });
                    }
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
        console.warn('[AutoPilot] Command could not be parsed:', cmdStr);
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
            if (this.isMutativeDbAction(cmd) && !cmd._confirmed && this.isConfirmationRequired() && messages) {
                this._renderRecommendationCard(messages, cmd);
                return;
            }
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
            const isEnabled = await this.isFaceAnalysisEnabled();
            if (!isEnabled) {
                this.lastIdentifyResult = {
                    success: false,
                    error: 'أداة غير معرّفة أو غير مدعومة في هذا النظام.'
                };
            } else {
                await this._handleIdentifyStudent(messages, cmd);
            }
        } else {
            console.warn('Unknown command type:', cmd.type);
        }
    },

    async _handleIdentifyStudent(messages, cmd) {
        try {
            if (!(await this.isFaceAnalysisEnabled())) {
                this.lastIdentifyResult = {
                    success: false,
                    error: 'خاصية تحليل الوجه معطلة بالكامل في هذا النظام.'
                };
                return;
            }
            if (!this.lastUploadedImageForTools) {
                throw new Error("لم يتم العثور على أي صورة مرفوعة حالياً للتعرف عليها.");
            }

            const img = new Image();
            img.src = this.lastUploadedImageForTools;

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = () => reject(new Error("فشل تحميل الصورة المرفوعة لمعالجتها."));
            });

            // Decide distance / slicing mode:
            // Single student: enableSlicing = false
            // Multiple students / classroom / default: enableSlicing = true
            const enableSlicing = (cmd.mode !== 'single');

            const detectionResult = await FaceDetection.detectFaces(img, {
                enableSlicing: enableSlicing,
                scoreThreshold: 0.25,
                maxResults: 100,
                computeDescriptors: true
            });

            if (!detectionResult.faces || detectionResult.faces.length === 0) {
                this.lastIdentifyResult = {
                    success: true,
                    faceDetected: false,
                    totalFaces: 0,
                    modeUsed: enableSlicing ? 'multiple' : 'single'
                };
                return;
            }

            const allStudents = await DB.getStudents();
            const matchSummary = FaceDetection.matchAllFaces(detectionResult.faces, allStudents, 0.55);

            this.lastIdentifyResult = {
                success: true,
                faceDetected: true,
                totalFaces: detectionResult.faces.length,
                modeUsed: enableSlicing ? 'multiple' : 'single',
                matchedStudents: matchSummary.matches.map(m => m.student),
                unmatchedCount: matchSummary.unmatched.length,
                match: matchSummary.matches.length > 0 ? matchSummary.matches[0].student : null,
                fingerprint: detectionResult.faces[0]?.descriptor || null
            };
        } catch (e) {
            console.error('Face Identification Error in Agent:', e);
            this.lastIdentifyResult = { success: false, error: e.message };
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
                    DB.getStudents(), DB.getClasses(), DB.getTeachers(), DB.getRecentRecords(60)
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
        try {
            await this.sendEmail(cmd.to, cmd.subject, cmd.message);
        } catch (e) {
            console.error('Email Error:', e);
            throw e;
        }
    },

    async sendEmail(to, subject, message) {
        throw new Error('ميزة إرسال البريد الإلكتروني معطلة مؤقتاً وقيد التجهيز للإطلاق الرسمي. يمكنك استخدام روابط WhatsApp المباشرة أو تصدير التقارير (Word/Excel).');
    },

    async _handleSendNotification(messages, cmd) {
        try {
            if (typeof NotificationManager !== 'undefined') {
                await NotificationManager.sendLocalNotification(cmd.title, cmd.body, cmd.url || '/');
            } else {
                throw new Error('NotificationManager is not loaded');
            }
        } catch (e) {
            console.error('Notification Error:', e);
            throw e;
        }
    },

    async _handleDatabaseAction(messages, cmd) {
        // التحقق من المعرفات الوهمية (Placeholders)
        const placeholderIds = ['ID_HERE', 'STUDENT_ID', 'TEACHER_ID', 'CLASS_ID', 'ID_CLASS', 'NEW_ID'];
        if (cmd.id && placeholderIds.includes(cmd.id)) {
            throw new Error(`حاول الوكيل استخدام معرف غير حقيقي (${cmd.id}). يرجى تزويده بالمعرف الصحيح.`);
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
            if (cmd.action === 'select') {
                const query = (cmd.query || cmd.id || '').toLowerCase().trim();
                let results = [];

                if (cmd.table === 'students') {
                    const [studentsList, classesList] = await Promise.all([
                        DB.getStudents(),
                        DB.getClasses()
                    ]);

                    const matchingClassIds = classesList
                        .filter(c => (c.id && c.id.toLowerCase() === query) || (c.name && Agent.matchArabicNames(c.name, query)) || (c.name && c.name.toLowerCase().includes(query)))
                        .map(c => c.id);

                    const enrichedStudents = studentsList.map(s => {
                        const cls = classesList.find(c => c.id === s.classId);
                        const nameParts = (s.name || '').trim().split(/\s+/).filter(Boolean);
                        const firstName = nameParts[0] || '';
                        const fatherName = nameParts.length > 1 ? nameParts[1] : '';
                        const grandfatherName = nameParts.length > 2 ? nameParts[2] : '';
                        const familyName = nameParts.length > 3 ? nameParts.slice(3).join(' ') : (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');

                        return {
                            ...s,
                            className: cls ? cls.name : 'غير محدد',
                            section: cls ? cls.section : '',
                            fatherName: fatherName || s.fatherName || 'غير محدد',
                            grandfatherName: grandfatherName || 'غير محدد',
                            familyName: familyName || 'غير محدد'
                        };
                    });

                    if (!query || query === 'all' || query === 'كل' || query === 'الكل') {
                        results = enrichedStudents;
                    } else {
                        const directMatches = enrichedStudents.filter(s =>
                            (s.id && s.id.toLowerCase() === query) ||
                            (s.academicId && (s.academicId.toLowerCase() === query || s.academicId === query)) ||
                            (s.classId && (s.classId.toLowerCase() === query || matchingClassIds.includes(s.classId)))
                        );

                        if (directMatches.length > 0) {
                            results = directMatches;
                        } else {
                            results = Agent.filterAndRankMatches(enrichedStudents, query);
                        }
                    }
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    if (!query || query === 'all' || query === 'كل' || query === 'الكل') {
                        results = list;
                    } else {
                        const byId = list.filter(t =>
                            (t.id && t.id.toLowerCase() === query) ||
                            (t.ministryId && (t.ministryId.toLowerCase() === query || t.ministryId === query))
                        );
                        if (byId.length > 0) {
                            results = byId;
                        } else {
                            results = Agent.filterAndRankMatches(list, query);
                        }
                    }
                } else if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    if (!query || query === 'all' || query === 'كل' || query === 'الكل') {
                        results = list;
                    } else {
                        const byId = list.filter(c => c.id && c.id.toLowerCase() === query);
                        if (byId.length > 0) {
                            results = byId;
                        } else {
                            results = Agent.filterAndRankMatches(list, query);
                        }
                    }
                } else if (cmd.table === 'records' || cmd.table === 'reports') {
                    const [recordsList, classesList, studentsList, teachersList] = await Promise.all([
                        DB.getRecentRecords(30),
                        DB.getClasses(),
                        DB.getStudents(),
                        DB.getTeachers()
                    ]);

                    const matchingClassIds = classesList
                        .filter(c => (c.id && c.id.toLowerCase() === query) || (c.name && Agent.matchArabicNames(c.name, query)) || (c.name && c.name.toLowerCase().includes(query)))
                        .map(c => c.id);

                    const matchingStudentIds = studentsList
                        .filter(s => s.id === query || s.academicId === query || (s.name && Agent.matchArabicNames(s.name, query)))
                        .map(s => s.id);

                    const enriched = recordsList.map(r => {
                        const cls = classesList.find(c => c.id === r.classId);
                        const className = cls ? cls.name : 'غير محدد';
                        const teacher = teachersList.find(t => t.id === r.teacherId);

                        const details = (r.details || []).map(d => {
                            const stu = studentsList.find(s => s.id === d.studentId || s.academicId === d.studentId || (s.name && Agent.matchArabicNames(s.name, d.studentId)));
                            return {
                                studentId: d.studentId,
                                studentName: stu ? stu.name : (d.name || d.studentName || 'غير معروف'),
                                academicId: stu ? stu.academicId : '',
                                status: d.status,
                                statusArabic: d.status === 'present' ? 'حاضر' : 'غائب',
                                notes: d.notes || ''
                            };
                        });

                        return {
                            id: r.id,
                            date: r.date,
                            classId: r.classId,
                            className: className,
                            teacherName: teacher ? teacher.name : 'غير محدد',
                            periodNumber: r.periodNumber || null,
                            totalStudents: details.length,
                            presentCount: details.filter(d => d.status === 'present').length,
                            absentCount: details.filter(d => d.status === 'absent').length,
                            details: details,
                            notes: r.notes || '',
                            timestamp: r.timestamp
                        };
                    });

                    if (!query || query === 'all' || query === 'كل' || query === 'الكل') {
                        results = enriched;
                    } else {
                        results = enriched.filter(r => {
                            if (r.date && (r.date.toLowerCase() === query || r.date.includes(query))) return true;
                            if (r.classId && r.classId.toLowerCase() === query) return true;
                            if (matchingClassIds.includes(r.classId)) return true;
                            if (r.className && (Agent.matchArabicNames(r.className, query) || r.className.toLowerCase().includes(query))) return true;
                            if (r.details && r.details.some(d => (d.studentName && Agent.matchArabicNames(d.studentName, query)) || d.academicId === query || d.studentId === query || matchingStudentIds.includes(d.studentId))) return true;
                            if (r.id && r.id.toLowerCase() === query) return true;
                            return false;
                        });

                        if (results.length === 0) {
                            results = enriched.filter(r => {
                                return (r.className && Agent.matchArabicNames(r.className, query)) ||
                                       (r.details && r.details.some(d => d.studentName && Agent.matchArabicNames(d.studentName, query)));
                            });
                        }
                    }
                }

                Agent.lastQueryResult = {
                    success: true,
                    query: cmd.query || cmd.id,
                    table: cmd.table,
                    data: results
                };
            } else if (cmd.action === 'insert') {
                const dataItems = Array.isArray(cmd.data) ? cmd.data : [cmd.data];
                if (dataItems.length > 1) {
                    if (typeof DB.insertBatch === 'function') {
                        await DB.insertBatch(cmd.table, dataItems);
                    } else if (typeof DB.batchInsert === 'function') {
                        await DB.batchInsert(cmd.table, dataItems);
                    } else {
                        for (const item of dataItems) {
                            await DB.insert(cmd.table, item);
                        }
                    }
                } else if (dataItems.length === 1) {
                    await DB.insert(cmd.table, dataItems[0]);
                }
            } else {
                // الحذف والتعديل يتطلب معرفات - مع حل ذكي للأسماء العربية
                const rawIds = cmd.ids || [cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId];
                const validIds = rawIds.filter(id => id && !placeholderIds.includes(id));

                if (validIds.length === 0) {
                    throw new Error('لم يتم تزويد أي معرفات (IDs) صالحة للعملية. يرجى تزويد حقل "id"');
                }

                const resolvedIds = [];
                for (const rawId of validIds) {
                    const resolved = await this._resolveTargetIds(cmd.table, rawId);
                    resolvedIds.push(...resolved);
                }

                const finalTargetIds = Array.from(new Set(resolvedIds));
                if (finalTargetIds.length === 0) {
                    throw new Error(`لم يتم العثور على أي سجل يطابق "${validIds.join(', ')}" في جدول ${cmd.table}`);
                }

                if (cmd.action === 'delete' && finalTargetIds.length > 1 && typeof DB.batchDelete === 'function') {
                    await DB.batchDelete(cmd.table, finalTargetIds);
                } else if (cmd.action === 'update' && finalTargetIds.length > 1 && typeof DB.batchUpdate === 'function') {
                    const updatePayloads = finalTargetIds.map(id => ({ id, data: cmd.data }));
                    await DB.batchUpdate(cmd.table, updatePayloads);
                } else {
                    for (const finalId of finalTargetIds) {
                        if (cmd.action === 'update') {
                            await DB.update(cmd.table, finalId, cmd.data);
                        } else if (cmd.action === 'delete') {
                            await DB.delete(cmd.table, finalId);
                        }
                    }
                }
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
            console.error('DB Action error:', e);
            throw e;
        }
    },

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    _renderMeter(signal, tone) {
        return `
            <span class="agent-meter">
                ${[0, 1, 2].map(bar => `
                    <span class="agent-meter-bar ${bar < signal ? '' : 'agent-meter-bar-inactive'}"
                          style="background-color: ${bar < signal ? tone : ''};"></span>
                `).join('')}
            </span>
        `;
    },

    _buildRecommendationOptions(cmd) {
        let defaultTitle = 'طلب إذن: هل تريد إضافة هذه البيانات؟';
        let targetTable = cmd.table || 'البيانات';
        let tableArabic = targetTable === 'students' ? 'الطلاب'
                        : targetTable === 'teachers' ? 'المعلمين'
                        : targetTable === 'classes' ? 'الفصول'
                        : targetTable === 'records' ? 'سجلات الحضور'
                        : targetTable;

        if (cmd.action === 'update') {
            defaultTitle = 'طلب إذن: هل تريد اعتماد وتعديل هذه البيانات؟';
        } else if (cmd.action === 'delete') {
            defaultTitle = '⚠️ طلب إذن: هل تريد حذف هذه السجلات نهائياً؟';
        }

        let primaryBodyHtml = '';
        let shortDesc = '';
        let primaryCtaText = 'اعتماد وتنفيذ';
        let primaryCtaVariant = cmd.action === 'delete' ? 'btn-danger' : 'btn-accent';

        // 1. حالات الإضافة (insert)
        if (cmd.action === 'insert') {
            if (cmd.table === 'students') {
                const items = Array.isArray(cmd.data) ? cmd.data : [cmd.data];
                if (items.length > 1) {
                    const sampleNames = items.slice(0, 3).map(s => s.name || 'طالب').join('، ');
                    const remaining = items.length - 3;
                    const sampleNote = remaining > 0 ? ` (منهم: ${sampleNames} وغيرهم)` : ` (${sampleNames})`;
                    primaryBodyHtml = `إضافة دفعة طلابية تتضمن <span class="agent-value-pill pill-green">${items.length} طالباً</span> إلى سجلات المدرسة${sampleNote} وحفظ أرقامهم الأكاديمية وربطهم بالصف.`;
                    shortDesc = `إضافة دفعة من ${items.length} طالب`;
                    defaultTitle = `طلب إذن: هل تريد إضافة هذه الدفعة (${items.length} طالب)؟`;
                } else {
                    const s = items[0] || {};
                    const name = s.name || 'طالب جديد';
                    const academicId = s.academicId || s.id || 'غير محدد';
                    const classId = s.className || s.classId || 'غير محدد';
                    primaryBodyHtml = `إضافة طالب جديد: <span class="agent-entity-chip"><span class="agent-entity-chip-dot"></span>${this._escapeHtml(name)}</span> بالرقم الأكاديمي <span class="agent-value-pill pill-green">${this._escapeHtml(academicId)}</span> إلى الصف <span class="agent-value-pill pill-blue">${this._escapeHtml(classId)}</span>.`;
                    shortDesc = `إضافة الطالب ${name} · ${academicId}`;
                    defaultTitle = `طلب إذن: هل تريد إضافة الطالب "${name}"؟`;
                }
            } else if (cmd.table === 'classes') {
                const c = cmd.data || {};
                const name = c.name || c.className || 'صف جديد';
                const section = c.section ? ` الشعبة <span class="agent-value-pill pill-blue">${this._escapeHtml(c.section)}</span>` : '';
                primaryBodyHtml = `إنشاء صف دراسي جديد: <span class="agent-entity-chip"><span class="agent-entity-chip-dot"></span>${this._escapeHtml(name)}</span>${section} وتجهيزه لاستقبال الطلاب والسجلات.`;
                shortDesc = `إنشاء الصف ${name}${c.section ? ' (' + c.section + ')' : ''}`;
                defaultTitle = `طلب إذن: هل تريد إنشاء الصف "${name}"؟`;
            } else if (cmd.table === 'teachers') {
                const t = cmd.data || {};
                const name = t.name || 'معلم جديد';
                const ministryId = t.ministryId || t.id || 'غير محدد';
                const role = t.role === 'admin' ? 'مدير' : 'معلم';
                primaryBodyHtml = `إضافة كادر تدريسي جديد: <span class="agent-entity-chip"><span class="agent-entity-chip-dot"></span>${this._escapeHtml(name)}</span> بالرقم الوزاري <span class="agent-value-pill pill-green">${this._escapeHtml(ministryId)}</span> ورتبة <span class="agent-value-pill pill-neutral">${role}</span>.`;
                shortDesc = `إضافة المعلم ${name} · ${ministryId}`;
                defaultTitle = `طلب إذن: هل تريد إضافة المعلم "${name}"؟`;
            } else if (cmd.table === 'records') {
                const r = cmd.data || {};
                const date = r.date || 'اليوم';
                const count = Array.isArray(r.details) ? r.details.length : 0;
                const present = Array.isArray(r.details) ? r.details.filter(d => d.status === 'present').length : 0;
                const absent = Array.isArray(r.details) ? r.details.filter(d => d.status === 'absent').length : 0;
                primaryBodyHtml = `تسجيل تقرير حضور وغياب بتاريخ <span class="agent-value-pill pill-blue">${this._escapeHtml(date)}</span> يتضمن <span class="agent-value-pill pill-green">${present} حاضر</span> و <span class="agent-value-pill pill-red">${absent} غائب</span> (إجمالي <span class="agent-entity-chip"><span class="agent-entity-chip-dot"></span>${count} طالب</span>).`;
                shortDesc = `تسجيل كشف حضور · ${date}`;
                defaultTitle = `طلب إذن: هل تريد حفظ تقرير الحضور بتاريخ ${date}؟`;
            } else {
                primaryBodyHtml = `إضافة سجل جديد إلى جدول <span class="agent-entity-chip"><span class="agent-entity-chip-dot"></span>${this._escapeHtml(tableArabic)}</span> بالبيانات المستخرجة.`;
                shortDesc = `إضافة بيانات إلى ${tableArabic}`;
            }
        }
        // 2. حالات التعديل (update)
        else if (cmd.action === 'update') {
            const rawId = cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || 'السجل المطلوب';
            const dataObj = cmd.data || {};
            const fieldsPills = Object.keys(dataObj).filter(k => k !== 'id' && k !== 'schoolId').slice(0, 3).map(k => {
                const val = typeof dataObj[k] === 'object' ? 'بيانات مخصصة' : String(dataObj[k]);
                return `<span class="agent-value-pill pill-orange">${this._escapeHtml(k)}: ${this._escapeHtml(val)}</span>`;
            }).join(' ');

            primaryBodyHtml = `تعديل بيانات في جدول <span class="agent-value-pill pill-neutral">${this._escapeHtml(tableArabic)}</span> للسجل <span class="agent-entity-chip"><span class="agent-entity-chip-dot"></span>${this._escapeHtml(rawId)}</span> وتحديث: ${fieldsPills || 'الحقول المحددة'}.`;
            shortDesc = `تعديل في ${tableArabic} · ${rawId}`;
            defaultTitle = `طلب إذن: هل تريد تعديل بيانات "${rawId}"؟`;
        }
        // 3. حالات الحذف (delete)
        else if (cmd.action === 'delete') {
            const rawIds = cmd.ids || [cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || 'السجل المطلوب'];
            const idsList = Array.isArray(rawIds) ? rawIds.join('، ') : rawIds;
            primaryBodyHtml = `حذف نهائي لسجل <span class="agent-entity-chip"><span class="agent-entity-chip-dot"></span>${this._escapeHtml(idsList)}</span> من جدول <span class="agent-value-pill pill-red">${this._escapeHtml(tableArabic)}</span>. <strong>تنبيه:</strong> لن تتمكن من التراجع عن هذه الخطوة.`;
            shortDesc = `حذف نهائي من ${tableArabic} · ${idsList}`;
            defaultTitle = `⚠️ تأكيد حذف: هل تريد حذف "${idsList}" نهائياً؟`;
            primaryCtaText = 'تأكيد الحذف النهائي';
        }

        const options = [
            {
                key: 'high',
                body: primaryBodyHtml,
                short: shortDesc || 'اعتماد وحفظ التغييرات في النظام',
                signal: 3,
                tone: cmd.action === 'delete' ? '#ef4444' : '#10b981',
                label: cmd.action === 'delete' ? 'تأكيد الحذف' : 'ثقة عالية',
                cta: primaryCtaText,
                ctaVariant: primaryCtaVariant
            },
            {
                key: 'review',
                body: `يمكنك مراجعة أو تغيير أي تفاصيل إضافية قبل الحفظ، بكتابة ما ترغب بتعديله مباشرة في المحادثة.`,
                short: 'مراجعة أو تعديل البيانات في المحادثة',
                signal: 2,
                tone: '#f59e0b',
                label: 'بانتظار المراجعة',
                cta: 'تعديل في المحادثة',
                ctaVariant: 'btn-primary'
            },
            {
                key: 'none',
                body: `إلغاء هذا الإجراء بالكامل والتراجع عنه دون كتابة أو تعديل أي بيانات في النظام.`,
                short: 'إلغاء العملية والتراجع الكامل',
                signal: 0,
                tone: '#94a3b8',
                label: 'إلغاء الأمر',
                cta: 'إلغاء العملية',
                ctaVariant: 'btn-secondary'
            }
        ];

        return {
            title: defaultTitle,
            labels: {
                title: defaultTitle,
                alternatives: 'البدائل',
                otherOptions: 'خيارات أخرى',
                accepted: 'تم الاعتماد والتنفيذ ✓'
            },
            options
        };
    },

    _renderRecommendationCard(messages, cmd) {
        const { title, labels, options } = this._buildRecommendationOptions(cmd);
        let selectedIndex = 0;
        let isDrawerOpen = false;
        let isAccepted = false;
        let isCanceled = false;

        const cardEl = document.createElement('div');
        cardEl.className = 'agent-recommendation-card';

        const renderCardContent = () => {
            const active = options[selectedIndex];
            const others = options
                .map((o, i) => ({ o, i }))
                .filter(({ i }) => i !== selectedIndex);

            cardEl.innerHTML = `
                <div class="agent-card-pad">
                    <span class="agent-card-title">
                        <span class="material-symbols-outlined text-[17px] text-amber-500">verified_user</span>
                        ${title}
                    </span>
                    <div class="agent-card-body">
                        ${active.body}
                    </div>
                </div>

                <!-- alternatives drawer -->
                <div class="agent-alternatives-drawer ${isDrawerOpen ? 'is-open' : ''}">
                    <div class="agent-alternatives-inner">
                        <div class="agent-alternatives-content">
                            <p class="agent-alternatives-header">${labels.otherOptions}</p>
                            <div class="agent-alternatives-list flex flex-col gap-1">
                                ${others.map(({ o, i }) => `
                                    <button type="button" class="agent-alt-option-btn" data-index="${i}">
                                        ${this._renderMeter(o.signal, o.tone)}
                                        <span class="agent-alt-option-text">${o.short}</span>
                                        <span class="agent-alt-option-label">${o.label}</span>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- card footer -->
                <div class="agent-card-footer">
                    <div class="agent-card-footer-info">
                        ${this._renderMeter(active.signal, active.tone)}
                        <span class="agent-card-footer-label">${active.label}</span>
                    </div>

                    <div class="agent-card-footer-actions">
                        <button type="button"
                                class="agent-card-btn btn-secondary agent-btn-alternatives"
                                aria-expanded="${isDrawerOpen}"
                                ${isAccepted || isCanceled ? 'disabled' : ''}>
                            ${labels.alternatives}
                        </button>

                        <button type="button"
                                class="agent-card-btn ${isAccepted ? 'btn-success is-accepted' : active.ctaVariant} agent-btn-cta"
                                ${isAccepted || isCanceled ? 'disabled' : ''}>
                            ${isAccepted ? labels.accepted : isCanceled ? 'تم الإلغاء ✕' : active.cta}
                        </button>
                    </div>
                </div>
            `;

            // Attach event listeners
            const altBtn = cardEl.querySelector('.agent-btn-alternatives');
            if (altBtn) {
                altBtn.addEventListener('click', () => {
                    isDrawerOpen = !isDrawerOpen;
                    renderCardContent();
                });
            }

            const ctaBtn = cardEl.querySelector('.agent-btn-cta');
            if (ctaBtn) {
                ctaBtn.addEventListener('click', async () => {
                    if (isAccepted || isCanceled) return;

                    if (active.key === 'high') {
                        // Execute confirmed action
                        ctaBtn.disabled = true;
                        ctaBtn.innerHTML = `<span class="material-symbols-outlined text-[13px] animate-spin">progress_activity</span> جاري التنفيذ...`;
                        try {
                            await this._executeConfirmedAction(cmd, cardEl);
                            isAccepted = true;
                            isDrawerOpen = false;
                            renderCardContent();
                        } catch (err) {
                            console.error('[Agent] Confirmed execution error:', err);
                            ctaBtn.disabled = false;
                            ctaBtn.innerHTML = `فشل التنفيذ ✕`;
                            ctaBtn.className = 'agent-card-btn btn-danger agent-btn-cta';
                        }
                    } else if (active.key === 'review') {
                        // Review / Configure in chat
                        this._handleRecommendationReview(cmd, cardEl);
                    } else if (active.key === 'none') {
                        // Cancel action
                        this._cancelRecommendationAction(cmd, cardEl);
                        isCanceled = true;
                        isDrawerOpen = false;
                        renderCardContent();
                    }
                });
            }

            const optionButtons = cardEl.querySelectorAll('.agent-alt-option-btn');
            optionButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-index'), 10);
                    if (!isNaN(idx)) {
                        selectedIndex = idx;
                        isDrawerOpen = false;
                        renderCardContent();
                    }
                });
            });
        };

        renderCardContent();

        if (messages) {
            messages.appendChild(cardEl);
            this.scrollToBottom(true);
        }

        return cardEl;
    },

    async _executeConfirmedAction(cmd, cardEl) {
        cmd._confirmed = true;
        const result = await this._executeCommandWithVerification(cmd);
        if (!result || !result.success) {
            throw new Error(result?.executionError || result?.verification?.reason || 'فشل التحقق من صحة حفظ البيانات');
        }

        // Post a clean success message in chat
        let successMsg = 'تم اعتماد وتنفيذ العملية بنجاح وتحديث قاعدة البيانات. ✅';
        if (cmd.action === 'insert') {
            if (cmd.table === 'students') {
                const count = Array.isArray(cmd.data) ? cmd.data.length : 1;
                successMsg = count > 1 
                    ? `تم بحمد الله اعتماد وإضافة كافة طلاب الدفعة (${count} طالباً) إلى قاعدة البيانات بنجاح. ✅`
                    : `تم بحمد الله اعتماد وإضافة الطالب إلى قاعدة البيانات بنجاح. ✅`;
            } else if (cmd.table === 'classes') {
                successMsg = `تم إنشاء الصف الدراسي "${cmd.data?.name || ''}" وتثبيته في قاعدة البيانات بنجاح. ✅`;
            } else if (cmd.table === 'teachers') {
                successMsg = `تمت إضافة المعلم "${cmd.data?.name || ''}" وتثبيته في السجلات بنجاح. ✅`;
            } else if (cmd.table === 'records') {
                successMsg = `تم حفظ وتأكيد تقرير الحضور والغياب بنجاح في قاعدة البيانات. ✅`;
            }
        } else if (cmd.action === 'update') {
            successMsg = `تم تحديث البيانات وتثبيت التعديل في قاعدة البيانات بنجاح. ✅`;
        } else if (cmd.action === 'delete') {
            successMsg = `تم حذف السجل المطلوب نهائياً من قاعدة البيانات. ✅`;
        }

        this.addMessagePlain(successMsg);

        if (typeof window.renderAll === 'function') {
            await window.renderAll();
        }
        if (typeof UI !== 'undefined' && typeof UI.toast === 'function') {
            UI.toast('تم الاعتماد والتنفيذ بنجاح ✨', 'success');
        }

        return result;
    },

    _handleRecommendationReview(cmd, cardEl) {
        const input = document.getElementById('agent-input');
        if (input) {
            let hint = 'أريد تعديل البيانات التالية قبل الحفظ: ';
            if (cmd.table === 'students' && cmd.data) {
                const name = Array.isArray(cmd.data) ? `${cmd.data.length} طلاب` : (cmd.data.name || '');
                hint = `أريد تعديل بيانات الطالب (${name}) كالآتي: `;
            } else if (cmd.table === 'classes' && cmd.data) {
                hint = `أريد تعديل بيانات الصف (${cmd.data.name || ''}) كالآتي: `;
            }
            input.value = hint;
            input.focus();
            if (typeof window.handleInputTyping === 'function') {
                window.handleInputTyping(input);
            }
        }
        if (typeof UI !== 'undefined' && typeof UI.toast === 'function') {
            UI.toast('يمكنك كتابة التعديلات المطلوبة في المحادثة أدناه', 'info');
        }
    },

    _cancelRecommendationAction(cmd, cardEl) {
        this.addMessagePlain('تم إلغاء العملية بناءً على طلبك، ولم يتم إجراء أي تغيير على قاعدة البيانات. ✕');
        if (typeof UI !== 'undefined' && typeof UI.toast === 'function') {
            UI.toast('تم إلغاء العملية', 'info');
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
            return { prompt: "0", completion: "0" };
        }
        return { prompt: "0", completion: "0" };
    },

    async _callHiddenAgent(systemContext, userMessage, chatHistory = [], modelOverride = null, useFreshMemory = false, onChunk = null, isRetry = false) {
        const currentProvider = this.getEffectiveProvider();
        const modelName = modelOverride || (await this.getEffectiveModel());
        this.defaultModel = modelName;
        const providers = {
            inworld: {
                url: "https://api.inworld.ai/v1/chat/completions",
                key: this.getApiKey('inworld'),
                headers: {},
                body: { model: modelName }
            },
            openrouter: {
                url: "https://openrouter.ai/api/v1/chat/completions",
                key: this.getApiKey('openrouter'),
                headers: {
                    "HTTP-Referer": (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:3000'),
                    "X-Title": "Attendance AI Agent"
                },
                body: {
                    model: modelName
                }
            },
            deepinfra: {
                url: "https://api.deepinfra.com/v1/openai/chat/completions",
                key: this.getApiKey('deepinfra'),
                headers: {},
                body: {
                    model: modelName
                }
            }
        };

        const config = providers[currentProvider];
        if (!config || !config.key) {
            throw new Error(`مفتاح الذكاء الاصطناعي (${currentProvider}) غير معرّف أو مفقود. يرجى إضافة المفتاح داخل ملف .env (OPENROUTER_API_KEY=sk-or-v1-...) أو عبر التخزين المحلي.`);
        }

        let originalMessages = [];
        if (useFreshMemory) {
            originalMessages = [
                { role: 'system', content: systemContext },
                { role: 'user', content: userMessage }
            ];
        } else {
            originalMessages = [
                { role: 'system', content: systemContext },
                ...chatHistory.filter(h => h.role !== 'system'),
                { role: 'user', content: userMessage }
            ];
        }

        // Deep copy messages so we don't mutate external objects
        let messages = JSON.parse(JSON.stringify(originalMessages));

        // Check if the model supports vision or if this is a retry
        const supportsVision = this.isVisionModel(modelName) && !isRetry;

        if (!supportsVision) {
            const faceEnabled = this.isFaceAnalysisEnabledSync();
            messages = messages.map(msg => {
                if (Array.isArray(msg.content)) {
                    const textObj = msg.content.find(p => p.type === 'text');
                    const textContent = textObj ? (textObj.text || '') : '';
                    if (faceEnabled) {
                        return {
                            ...msg,
                            content: textContent + `\n\n[ملاحظة النظام: قام المستخدم برفع صورة. بما أن هذا النموذج لا يدعم رؤية الصور مباشرة، يرجى تشغيل أداة التعرف على الوجه المحلية (identify_student) لمعالجة الصورة. إذا كانت الصورة لطالب واحد استخدم mode: "single"، وإذا كانت لعدة طلاب أو صف كامل أو لم تكن متأكداً فاستخدم الافتراضي mode: "multiple":\n|||COMMAND|||\n{"type": "identify_student", "mode": "multiple"}\n]`
                        };
                    } else {
                        return {
                            ...msg,
                            content: textContent + `\n\n[ملاحظة النظام: قام المستخدم برفع صورة. بما أن هذا النموذج لا يدعم رؤية الصور مباشرة، يرجى معالجة النص أو المستند المرفوع مباشرة دون استدعاء أي أداة لتحليل الوجه.]`
                        };
                    }
                }
                return msg;
            });
        }

        const requestBody = {
            messages: messages,
            temperature: 0.1,
            max_tokens: 8192,
            ...config.body
        };

        // Keep reasoning fast and reliable on Nemotron models (free tier is slow at high effort)
        if (currentProvider === 'openrouter' && modelName.toLowerCase().includes('nemotron')) {
            requestBody.reasoning_effort = 'medium';
        }

        if (onChunk) {
            requestBody.stream = true;
            if (currentProvider === 'openrouter') {
                requestBody.stream_options = { include_usage: true };
            }
        }

        // Set up AbortController for connection & idle timeout protection
        const controller = new AbortController();
        this.activeAbortController = controller;
        const signal = controller.signal;

        let idleTimeoutId = null;
        const resetIdleTimeout = () => {
            if (idleTimeoutId) clearTimeout(idleTimeoutId);
            idleTimeoutId = setTimeout(() => {
                console.warn('[AutoPilot] Request/Stream idle timeout reached (90s). Aborting request.');
                controller.abort();
            }, 90000); // 90 seconds timeout
        };

        resetIdleTimeout();

        try {
            const response = await fetch(config.url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${config.key}`,
                    "Content-Type": "application/json",
                    ...config.headers
                },
                body: JSON.stringify(requestBody),
                signal: signal
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

                        resetIdleTimeout(); // Reset the timer on every active chunk received!

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
                                        const reasoning = delta.reasoning_content || delta.reasoning || delta.thinking || '';
                                        const toolCalls = delta.tool_calls || null;

                                        if (content) fullText += content;
                                        if (reasoning) fullReasoningText += reasoning;

                                        onChunk({
                                            content: content,
                                            reasoning_content: reasoning,
                                            tool_calls: toolCalls,
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
                    if (streamErr.name === 'AbortError') {
                        throw new Error('انتهت مهلة استجابة الخادم أثناء قراءة البث (90 ثانية).');
                    }
                    console.error("Error reading stream:", streamErr);
                    throw streamErr;
                } finally {
                    if (idleTimeoutId) clearTimeout(idleTimeoutId);
                }

                return fullText;
            } else {
                const data = await response.json();
                if (idleTimeoutId) clearTimeout(idleTimeoutId);
                const resultText = data.choices?.[0]?.message?.content;
                if (!resultText) throw new Error('لم يأتِ رد من النموذج');
                return resultText;
            }
        } catch (fetchErr) {
            if (idleTimeoutId) clearTimeout(idleTimeoutId);
            if (fetchErr.name === 'AbortError') {
                if (this.isUserAborted) {
                    const abortErr = new Error('USER_ABORTED');
                    abortErr.name = 'UserAbortError';
                    throw abortErr;
                }
                throw new Error('انتهت مهلة استجابة الخادم (90 ثانية). يرجى التحقق من اتصال الإنترنت وإعادة المحاولة.');
            }

            // Retry fallback: if sending with image fails, retry with text-only prompts
            const hasImage = originalMessages.some(msg => Array.isArray(msg.content));
            if (hasImage && !isRetry) {
                console.warn('[AutoPilot] API call failed with image payload. Retrying with text-only fallback...');
                return await this._callHiddenAgent(systemContext, userMessage, chatHistory, modelOverride, useFreshMemory, onChunk, true);
            }

            throw fetchErr;
        }
    },

    async _streamHiddenAgent(msgEl, systemContext, userMessage, chatHistory = [], modelOverride = null, useFreshMemory = false, loadingDiv = null) {
        const bodyEl = msgEl.querySelector('.agent-msg-ai-body') || msgEl.querySelector('.agent-msg-ai') || msgEl;

        // Reset content and keep empty AI bubble hidden while thinking
        bodyEl.innerHTML = '';
        msgEl.style.display = 'none';

        const CMD_REGEX = /\|{1,3}COMMAND\|{1,3}|COMMAND\|{1,3}|\|{1,3}COMMAND/i;

        // Use the existing loading pill or create a new Thinking Orb badge
        let thinkingPill = loadingDiv;
        if (!thinkingPill && typeof ThinkingOrbs !== 'undefined') {
            thinkingPill = ThinkingOrbs.createBadge('composing', 'Thinking....');
            const messages = document.getElementById('agent-messages');
            if (messages) messages.appendChild(thinkingPill);
        }

        let isThinkingComplete = false;
        let hasScrolledForThisResponse = false;
        const modelName = modelOverride || (await this.getEffectiveModel());
        this.defaultModel = modelName;

        let contentContainer = null;

        const responseText = await this._callHiddenAgent(
            systemContext,
            userMessage,
            chatHistory,
            modelName,
            useFreshMemory,
            async (chunk) => {
                if (!hasScrolledForThisResponse) {
                    hasScrolledForThisResponse = true;
                    this.scrollToBottom(true);
                }

                // Stream actual final content
                if (chunk.content) {
                    // Clean raw <think> tags from model response so raw reasoning NEVER shows to the user
                    let cleanDisplay = chunk.fullContent
                        .replace(/<think>[\s\S]*?<\/think>/gi, '')
                        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                        .split(CMD_REGEX)[0]
                        .trim();

                    // Only reveal AI message if there is actual user-facing content (and not a pure command)
                    if (cleanDisplay && cleanDisplay.length > 0 && !CMD_REGEX.test(chunk.fullContent)) {
                        if (!isThinkingComplete) {
                            isThinkingComplete = true;
                            if (thinkingPill && typeof ThinkingOrbs !== 'undefined') {
                                ThinkingOrbs.completeBadge(thinkingPill);
                                thinkingPill = null;
                            }
                            // Reveal the AI response bubble
                            msgEl.style.display = '';
                        }

                        if (!contentContainer) {
                            contentContainer = document.createElement('div');
                            contentContainer.className = 'agent-actual-content';
                            bodyEl.appendChild(contentContainer);
                        }

                        if (typeof marked !== 'undefined') {
                            contentContainer.innerHTML = marked.parse(cleanDisplay || '&nbsp;');
                        } else {
                            contentContainer.innerHTML = cleanDisplay.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') || '&nbsp;';
                        }
                    }
                }

                // Handle token usage metrics if dev-mode is on
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

        const hasCommand = CMD_REGEX.test(responseText);

        if (hasCommand) {
            // If response contains a command, keep msgEl clean and hidden
            bodyEl.innerHTML = '';
            msgEl.style.display = 'none';
        } else {
            // Normal response or final follow-up response: complete thinking badge & show final response
            if (thinkingPill && typeof ThinkingOrbs !== 'undefined') {
                ThinkingOrbs.completeBadge(thinkingPill);
            }
            msgEl.style.display = '';

            // Render final clean text
            let finalClean = responseText
                .replace(/<think>[\s\S]*?<\/think>/gi, '')
                .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                .split(CMD_REGEX)[0]
                .trim();

            if (finalClean) {
                if (!contentContainer) {
                    contentContainer = document.createElement('div');
                    contentContainer.className = 'agent-actual-content';
                    bodyEl.appendChild(contentContainer);
                }
                if (typeof marked !== 'undefined') {
                    contentContainer.innerHTML = marked.parse(finalClean);
                } else {
                    contentContainer.innerHTML = finalClean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
                }
            }

            // Add action toolbar (Copy, Regenerate, Thumbs Up, Thumbs Down) if not present
            this._appendMsgActions(bodyEl);
        }

        return responseText;
    },

    _appendMsgActions(bodyEl) {
        if (!bodyEl || bodyEl.querySelector('.agent-msg-actions')) return;
        const mCopy = typeof Morphicons !== 'undefined' ? Morphicons.svg('Copy', 16) : '<span class="material-symbols-outlined text-[16px]">content_copy</span>';
        const mRetry = typeof Morphicons !== 'undefined' ? Morphicons.svg('RotateCcw', 16) : '<span class="material-symbols-outlined text-[16px]">refresh</span>';
        const mLike = typeof Morphicons !== 'undefined' ? Morphicons.svg('ThumbsUp', 16) : '<span class="material-symbols-outlined text-[16px]">thumb_up</span>';
        const mDislike = typeof Morphicons !== 'undefined' ? Morphicons.svg('ThumbsDown', 16) : '<span class="material-symbols-outlined text-[16px]">thumb_down</span>';

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'agent-msg-actions';
        actionsDiv.innerHTML = `
            <button class="agent-action-btn" onclick="Agent.copyMessage(this)" title="نسخ إلى الحافظة">
                ${mCopy}
            </button>
            <button class="agent-action-btn" onclick="Agent.regenerateLastResponse(this)" title="إعادة التوليد">
                ${mRetry}
            </button>
            <button class="agent-action-btn" onclick="Agent.rateFeedback(this, 'like')" title="إعجاب">
                ${mLike}
            </button>
            <button class="agent-action-btn" onclick="Agent.rateFeedback(this, 'dislike')" title="لم يعجبني">
                ${mDislike}
            </button>
        `;
        bodyEl.appendChild(actionsDiv);
    },

    async _verifyDatabaseState(cmd) {
        if (!cmd || cmd.type !== 'database_action') {
            return { success: true };
        }

        const placeholderIds = ['ID_HERE', 'STUDENT_ID', 'TEACHER_ID', 'CLASS_ID', 'ID_CLASS', 'NEW_ID'];
        if (cmd.id && placeholderIds.includes(cmd.id)) {
            return { success: false, reason: `معرف وهمي غير صالح: ${cmd.id}` };
        }

        const normalizeArabic = (s) => Agent.normalizeArabic ? Agent.normalizeArabic(s) : String(s || '').trim().toLowerCase();

        try {
            if (cmd.action === 'insert') {
                const dataItems = Array.isArray(cmd.data) ? cmd.data : [cmd.data];

                if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    for (const item of dataItems) {
                        const name = item.name || item.className || item.title || item.Name || item.ClassName;
                        const section = item.section || item.group || item.Section;
                        const exists = list.some(c => {
                            const nameMatch = c.name === name || (name && Agent.matchArabicNames(c.name, name)) || (name && normalizeArabic(c.name) === normalizeArabic(name));
                            const sectionMatch = !section || c.section === section;
                            return nameMatch && sectionMatch;
                        });
                        if (!exists) return { success: false, reason: `الصف "${name}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    for (const item of dataItems) {
                        const name = item.name || item.studentName || item.Name || item.StudentName;
                        const academicId = item.academicId || item.id || item.AcademicId || item.studentId;
                        const exists = list.some(s => {
                            const idMatch = academicId && (String(s.academicId) === String(academicId) || String(s.id) === String(academicId));
                            const nameMatch = name && (s.name === name || Agent.matchArabicNames(s.name, name) || normalizeArabic(s.name) === normalizeArabic(name));
                            return idMatch || nameMatch;
                        });
                        if (!exists) return { success: false, reason: `الطالب "${name || academicId}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    for (const item of dataItems) {
                        const name = item.name || item.teacherName || item.Name || item.TeacherName;
                        const ministryId = item.ministryId || item.ministryNumber || item.id || item.MinistryId || item.MinistryNumber;
                        const exists = list.some(t => {
                            const idMatch = ministryId && (String(t.ministryId) === String(ministryId) || String(t.id) === String(ministryId));
                            const nameMatch = name && (t.name === name || Agent.matchArabicNames(t.name, name) || normalizeArabic(t.name) === normalizeArabic(name));
                            return idMatch || nameMatch;
                        });
                        if (!exists) return { success: false, reason: `المعلم "${name || ministryId}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                } else if (cmd.table === 'records' || cmd.table === 'reports') {
                    const list = await DB.getRecentRecords(30);
                    for (const item of dataItems) {
                        const date = item.date;
                        const classId = item.classId;
                        const exists = list.some(r => r.date === date && (!classId || r.classId === classId || String(r.classId) === String(classId)));
                        if (!exists) return { success: false, reason: `تقرير الحضور بتاريخ "${date}" للفصل "${classId}" لم يظهر في قاعدة البيانات بعد الإضافة` };
                    }
                }
            } else if (cmd.action === 'update') {
                const id = cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId;
                if (!id) return { success: false, reason: 'لم يتم توفير معرف للتعديل' };

                const resolveField = (obj, key) => {
                    if (obj == null) return undefined;
                    if (obj[key] !== undefined) return obj[key];
                    const lower = key.toLowerCase();
                    if ((lower === 'name' || lower === 'studentname' || lower === 'teachername' || lower === 'classname') && obj.name !== undefined) return obj.name;
                    if ((lower === 'ministryid' || lower === 'ministrynumber') && obj.ministryId !== undefined) return obj.ministryId;
                    if ((lower === 'academicid' || lower === 'studentid') && obj.academicId !== undefined) return obj.academicId;
                    for (const k of Object.keys(obj)) {
                        if (k.toLowerCase() === lower) return obj[k];
                    }
                    return undefined;
                };

                if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    const item = list.find(c => String(c.id) === String(id) || Agent.matchArabicNames(c.name, id) || normalizeArabic(c.name) === normalizeArabic(id));
                    if (!item) return { success: false, reason: `الفصل ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in (cmd.data || {})) {
                        const expected = cmd.data[key];
                        const actual = resolveField(item, key);
                        if (actual !== undefined && expected !== undefined && !this._deepEqual(actual, expected)) {
                            return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                        }
                    }
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    const item = list.find(s => String(s.id) === String(id) || String(s.academicId) === String(id) || (s.name && (Agent.matchArabicNames(s.name, id) || normalizeArabic(s.name) === normalizeArabic(id))));
                    if (!item) return { success: false, reason: `الطالب ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in (cmd.data || {})) {
                        const expected = cmd.data[key];
                        const actual = resolveField(item, key);
                        if (actual !== undefined && expected !== undefined && !this._deepEqual(actual, expected)) {
                            return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                        }
                    }
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    const item = list.find(t => String(t.id) === String(id) || String(t.ministryId) === String(id) || (t.name && (Agent.matchArabicNames(t.name, id) || normalizeArabic(t.name) === normalizeArabic(id))));
                    if (!item) return { success: false, reason: `المعلم ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                    for (const key in (cmd.data || {})) {
                        const expected = cmd.data[key];
                        const actual = resolveField(item, key);
                        if (actual !== undefined && expected !== undefined && !this._deepEqual(actual, expected)) {
                            return { success: false, reason: `الحقل ${key} لم يتغير إلى القيمة الجديدة` };
                        }
                    }
                } else if (cmd.table === 'records' || cmd.table === 'reports') {
                    const list = await DB.getRecentRecords(30);
                    const item = list.find(r => String(r.id) === String(id));
                    if (!item) return { success: false, reason: `تقرير الحضور ذو المعرف ${id} غير موجود للتأكد من التعديل` };
                }
            } else if (cmd.action === 'delete') {
                const ids = cmd.ids || [cmd.id || cmd.ID || cmd.studentId || cmd.teacherId || cmd.classId || cmd.academicId];
                const validIds = ids.filter(id => id && !placeholderIds.includes(id)).map(String);
                if (validIds.length === 0) return { success: false, reason: 'لم يتم توفير معرفات صالحة للحذف' };

                if (cmd.table === 'classes') {
                    const list = await DB.getClasses();
                    const remains = list.some(c => {
                        if (validIds.includes(String(c.id))) return true;
                        return validIds.some(v => {
                            const vNorm = normalizeArabic(v);
                            const cNorm = normalizeArabic(c.name || '');
                            return vNorm && cNorm && vNorm === cNorm;
                        });
                    });
                    if (remains) return { success: false, reason: 'الفصل المحذوف لا يزال موجوداً في قاعدة البيانات' };
                } else if (cmd.table === 'students') {
                    const list = await DB.getStudents();
                    const remains = list.some(s => {
                        if (validIds.includes(String(s.id)) || (s.academicId && validIds.includes(String(s.academicId)))) return true;
                        return validIds.some(v => {
                            const vNorm = normalizeArabic(v);
                            const sNorm = normalizeArabic(s.name || '');
                            return vNorm && sNorm && vNorm === sNorm;
                        });
                    });
                    if (remains) return { success: false, reason: 'الطالب المحذوف لا يزال موجوداً في قاعدة البيانات' };
                } else if (cmd.table === 'teachers') {
                    const list = await DB.getTeachers();
                    const remains = list.some(t => {
                        if (validIds.includes(String(t.id)) || (t.ministryId && validIds.includes(String(t.ministryId)))) return true;
                        return validIds.some(v => {
                            const vNorm = normalizeArabic(v);
                            const tNorm = normalizeArabic(t.name || '');
                            return vNorm && tNorm && vNorm === tNorm;
                        });
                    });
                    if (remains) return { success: false, reason: 'المعلم المحذوف لا يزال موجوداً في قاعدة البيانات' };
                } else if (cmd.table === 'records' || cmd.table === 'reports') {
                    const list = await DB.getRecentRecords(30);
                    const remains = list.some(r => validIds.includes(String(r.id)));
                    if (remains) return { success: false, reason: 'تقرير الحضور المحذوف لا يزال موجوداً في قاعدة البيانات' };
                }
            }
            return { success: true };
        } catch (e) {
            return { success: false, reason: `خطأ أثناء التحقق من قاعدة البيانات: ${e.message}` };
        }
    },

    async _executeCommandWithVerification(cmd) {
        let executionError = null;
        try {
            if (cmd) cmd._confirmed = true;
            await this.executeCommand(cmd);
        } catch (e) {
            executionError = e.message;
            console.error('[Agent] Command execution error:', e);
        }

        // Fast responsive yield for storage settle
        await new Promise(resolve => setTimeout(resolve, 50));

        const verification = await this._verifyDatabaseState(cmd);

        return {
            success: !executionError && verification.success,
            executionError,
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
            console.warn('[AutoPilot] Firestore diagnostic log fallback skipped:', dbErr?.message || dbErr);
        }

        // توثيق الخطأ في منظومة المتابعة الفنية للوزارة (Telemetry v2_system_logs)
        if (typeof Telemetry !== 'undefined' && typeof Telemetry.logError === 'function') {
            try {
                const errorMsg = errorDetails?.error || 'تقرير تشخيصي لعطل في الوكيل الذكي';
                Telemetry.logError('AI_AGENT', errorMsg, null, {
                    source: 'AgentEngine._silentLogToGoogleSheets',
                    userPrompt: errorDetails?.userPrompt || '',
                    provider: errorDetails?.provider || '',
                    diagnosticData: errorDetails
                });
            } catch (telErr) {
                console.warn('[AutoPilot] Telemetry report failed:', telErr);
            }
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
        if (!(await this.isFaceAnalysisEnabled())) {
            return { success: false, error: 'خاصية تحليل الوجه معطلة بالكامل في هذا النظام.' };
        }
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
        if (!messages) return;
        // Suppress diagnostics card from user chat unless dev-mode is explicitly active
        try {
            const devMode = (typeof localStorage !== 'undefined' && localStorage.getItem('hodoori_dev_mode') === 'true');
            if (!devMode) return;
        } catch (_) { return; }

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
                        ${attempt.action ? `<div class="text-[10px] text-gray-400 font-mono mt-1 leading-normal break-all text-left" dir="ltr">${attempt.action}</div>` : ''}
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

if (typeof window !== 'undefined') {
    window.Agent = Agent;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Agent;
}
