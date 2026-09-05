/**
 * @fileoverview System Telemetry & Error Tracking Module
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

var Telemetry = (typeof window !== 'undefined' && window.Telemetry) || {
    STORAGE_KEY: 'hodoori_telemetry_logs_v1',
    FIRESTORE_COLLECTION: 'v2_system_logs',
    MAX_LOCAL_LOGS: 150,
    breadcrumbs: [],
    MAX_BREADCRUMBS: 8,
    isInitialized: false,

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        // 1. Capture Uncaught JavaScript Errors
        window.addEventListener('error', (event) => {
            try {
                // Ignore benign resize observer loops or 3rd party extension noise
                if (event.message && (
                    event.message.includes('ResizeObserver') ||
                    event.message.includes('Script error.')
                )) return;

                const category = this._categorizeError(event.message, event.filename);
                this.logError(category, event.message || 'خطأ برمجي غير معالج', event.error || {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                }, {
                    sourceFile: event.filename,
                    line: event.lineno,
                    column: event.colno
                });
            } catch (e) {
                console.error("Telemetry error handler failed:", e);
            }
        });

        // 2. Capture Unhandled Promise Rejections (Async/Await crashes)
        window.addEventListener('unhandledrejection', (event) => {
            try {
                const reason = event.reason;
                const message = typeof reason === 'string' ? reason : (reason?.message || 'خطأ في عملية غير متزامنة (Promise Rejection)');
                const category = this._categorizeError(message, reason?.stack);

                this.logError(category, message, reason instanceof Error ? reason : { message, reason }, {
                    type: 'unhandledrejection'
                });
            } catch (e) {
                console.error("Telemetry promise rejection handler failed:", e);
            }
        });

        // 3. Lightweight User Action Breadcrumbs (Without logging PII or text inputs)
        document.addEventListener('click', (e) => {
            try {
                const target = e.target.closest('button, a, [role="button"], input[type="submit"]');
                if (target) {
                    const text = target.innerText?.trim()?.slice(0, 30) || target.title || target.getAttribute('aria-label') || target.id || target.tagName;
                    this.addBreadcrumb(`Click: ${text}`);
                }
            } catch (_) {}
        }, { passive: true });

        // 4. Intercept console.error & meaningful console.warn with deduplication
        const origConsoleError = console.error;
        const origConsoleWarn = console.warn;
        const recentLogged = new Map();

        console.error = (...args) => {
            try {
                origConsoleError.apply(console, args);
                const msg = args.map(a => (a instanceof Error ? a.message + '\n' + a.stack : String(a))).join(' ');
                const key = msg.slice(0, 100);
                const now = Date.now();
                if (!recentLogged.has(key) || (now - recentLogged.get(key)) > 15000) {
                    recentLogged.set(key, now);
                    const category = this._categorizeError(msg);
                    this.logError(category, msg, args.find(a => a instanceof Error) || null, { level: 'ERROR', source: 'console.error' });
                }
            } catch (_) {}
        };

        console.warn = (...args) => {
            try {
                origConsoleWarn.apply(console, args);
                const msg = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
                // Skip benign non-actionable warnings & Firestore/WebGL normal backend notices
                if (
                    msg.includes('cdn.tailwindcss.com') ||
                    msg.includes('ResizeObserver') ||
                    msg.includes('deprecated') ||
                    msg.includes('WebChannelConnection') ||
                    msg.includes('@firebase/firestore') ||
                    msg.includes('Firestore error sync failed') ||
                    msg.includes('Telemetry:') ||
                    msg.includes('Missing or insufficient permissions') ||
                    msg.includes('Listen') ||
                    msg.includes('transport errored') ||
                    msg.includes('WEBGL_FLUSH_THRESHOLD') ||
                    msg.includes('WebGL backend optimization') ||
                    msg.includes('Google Identity Services')
                ) return;

                const key = msg.slice(0, 100);
                const now = Date.now();
                if (!recentLogged.has(key) || (now - recentLogged.get(key)) > 15000) {
                    recentLogged.set(key, now);
                    const category = this._categorizeError(msg);
                    this.logError(category, msg, null, { level: 'WARN', source: 'console.warn' });
                }
            } catch (_) {}
        };

        console.log("Hodoori: Telemetry & Error Tracking Engine initialized.");

        // Periodic & Event-based Pending Logs Synchronization
        if (typeof window !== 'undefined') {
            const self = this;
            const safeFlush = () => {
                try {
                    if (typeof self.flushPendingLogs === 'function') {
                        self.flushPendingLogs();
                    } else if (typeof Telemetry !== 'undefined' && typeof Telemetry.flushPendingLogs === 'function') {
                        Telemetry.flushPendingLogs();
                    }
                } catch (_) {}
            };
            window.addEventListener('online', safeFlush);
            if (typeof setTimeout === 'function') {
                const t = setTimeout(safeFlush, 2500);
                if (t && typeof t.unref === 'function') t.unref();
            }
            if (typeof setInterval === 'function') {
                const i = setInterval(safeFlush, 60000);
                if (i && typeof i.unref === 'function') i.unref();
            }
        }
    },

    addBreadcrumb(action) {
        this.breadcrumbs.push({
            time: new Date().toLocaleTimeString('ar-EG', { hour12: false }),
            action: this._sanitizeString(action)
        });
        if (this.breadcrumbs.length > this.MAX_BREADCRUMBS) {
            this.breadcrumbs.shift();
        }
    },

    /**
     * Categorizes errors automatically based on context
     */
    _categorizeError(message = '', stack = '') {
        const text = (message + ' ' + stack).toLowerCase();
        if (text.includes('face') || text.includes('webgl') || text.includes('tensor') || text.includes('ssd') || text.includes('landmark')) {
            return 'FACE_AI';
        }
        if (text.includes('firebase') || text.includes('firestore') || text.includes('network') || text.includes('fetch') || text.includes('offline') || text.includes('cors')) {
            return 'NETWORK_DB';
        }
        if (text.includes('auth') || text.includes('permission') || text.includes('camera') || text.includes('notallowederror')) {
            return 'AUTH_CAMERA';
        }
        if (text.includes('agent') || text.includes('openrouter') || text.includes('prompt')) {
            return 'AI_AGENT';
        }
        return 'JS_RUNTIME';
    },

    /**
     * Strictly sanitizes any data payload to guarantee ZERO PII or biometric leakage
     */
    _sanitizeObject(obj, depth = 0) {
        if (!obj || depth > 3) return null;
        if (typeof obj !== 'object') return this._sanitizeString(String(obj));

        const clean = Array.isArray(obj) ? [] : {};
        const forbiddenKeys = ['descriptor', 'descriptors', 'embedding', 'embeddings', 'password', 'nationalid', 'token', 'apikey', 'secret', 'phone', 'email'];

        for (let key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
            const lowerKey = key.toLowerCase();

            if (forbiddenKeys.some(fk => lowerKey.includes(fk))) {
                clean[key] = '[REDACTED_PROTECTED_DATA]';
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                clean[key] = this._sanitizeObject(obj[key], depth + 1);
            } else if (typeof obj[key] === 'string') {
                clean[key] = this._sanitizeString(obj[key]);
            } else {
                clean[key] = obj[key];
            }
        }
        return clean;
    },

    _sanitizeString(str) {
        if (!str) return '';
        return String(str)
            .replace(/\b\d{10,14}\b/g, '[REDACTED_ID]')
            .slice(0, 2000);
    },

    /**
     * Generate normalized fingerprint for error grouping & deduplication
     */
    _generateFingerprint(category, message, page, stack) {
        const normalizedMsg = (message || '')
            .replace(/0x[0-9a-fA-F]+/g, '')
            .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '')
            .replace(/\b\d{5,}\b/g, '')
            .slice(0, 150)
            .trim();

        const firstStackLine = (stack || '').split('\n')[0]?.slice(0, 80) || '';
        return `${category}__${page}__${normalizedMsg}__${firstStackLine}`;
    },

    /**
     * Automatically determine error severity level
     */
    _determineSeverity(category, message, stack, extraContext) {
        if (extraContext?.level === 'WARN') return 'MEDIUM';
        if (extraContext?.level === 'INFO') return 'LOW';

        const fullText = (message + ' ' + (stack || '')).toLowerCase();
        
        // Critical crashes
        if (
            fullText.includes('uncaught') ||
            fullText.includes('typeerror') ||
            fullText.includes('referenceerror') ||
            fullText.includes('rangeerror') ||
            fullText.includes('quotaexceeded') ||
            fullText.includes('fatal')
        ) {
            return 'CRITICAL';
        }

        // High priority issues
        if (
            category === 'FACE_AI' ||
            category === 'AUTH_CAMERA' ||
            category === 'AI_AGENT' ||
            category === 'NETWORK_DB'
        ) {
            return 'HIGH';
        }

        return 'MEDIUM';
    },

    /**
     * Public method to record an error with rich telemetry context
     */
    async logError(category = 'JS_RUNTIME', message = 'Unknown Error', errorObj = null, extraContext = {}) {
        try {
            const timestamp = new Date().toISOString();
            const logId = 'err_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            const pageName = window.location.pathname.split('/').pop() || 'index.html';

            // Extract formatted stack trace
            let stackTrace = '';
            if (errorObj instanceof Error) {
                stackTrace = errorObj.stack || '';
            } else if (errorObj?.stack) {
                stackTrace = String(errorObj.stack);
            }

            // Generate unique fingerprint for grouping & determine severity
            const fingerprint = this._generateFingerprint(category, message, pageName, stackTrace);
            const severity = this._determineSeverity(category, message, stackTrace, extraContext);

            // Determine user role safely if DB/Auth available
            let userRole = 'anonymous';
            let schoolId = 'unknown';
            try {
                const currentUser = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null;
                if (currentUser) {
                    userRole = currentUser.role || 'user';
                    schoolId = currentUser.schoolId || 'unknown';
                }
            } catch (_) {}

            const errorRecord = {
                id: logId,
                fingerprint,
                severity, // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
                occurrences: 1,
                timestamp,
                firstSeen: timestamp,
                lastSeen: timestamp,
                dateDisplay: new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'medium' }),
                category,
                message: this._sanitizeString(message),
                stack: this._sanitizeString(stackTrace),
                page: pageName,
                url: window.location.href,
                user: {
                    role: userRole,
                    schoolId: schoolId
                },
                environment: {
                    browser: this._getBrowserInfo(),
                    screen: `${window.innerWidth}x${window.innerHeight}`,
                    online: navigator.onLine,
                    memory: (performance && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)) + 'MB' : 'N/A'
                },
                breadcrumbs: [...this.breadcrumbs],
                extra: this._sanitizeObject(extraContext)
            };

            // 1. Save to Local Storage with smart grouping
            const finalRecord = this._saveLocal(errorRecord);

            // 2. Real-time Cross-tab and Dashboard Notification
            this._broadcastError(finalRecord);

            // 3. Asynchronously Sync with Firestore if online & available
            this._syncWithFirestore(finalRecord).catch(err => {
                console.warn("Firestore error sync failed (kept local):", err);
            });

            return finalRecord;
        } catch (err) {
            console.error("Telemetry failed to record error:", err);
            return null;
        }
    },

    _broadcastError(record) {
        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('hodoori:telemetry_error', { detail: record }));
                if (typeof BroadcastChannel !== 'undefined') {
                    if (!this._bc) {
                        this._bc = new BroadcastChannel('hodoori_telemetry_channel');
                    }
                    this._bc.postMessage({ type: 'NEW_ERROR', record });
                }
            }
        } catch (_) {}
    },

    _getBrowserInfo() {
        const ua = navigator.userAgent;
        let browser = "متصفح غير معروف";
        if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
        else if (ua.includes("Edg")) browser = "Edge";
        else if (ua.includes("Firefox")) browser = "Firefox";
        else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";

        let os = "نظام غير محدد";
        if (ua.includes("Win")) os = "Windows";
        else if (ua.includes("Android")) os = "Android";
        else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
        else if (ua.includes("Mac")) os = "macOS";
        else if (ua.includes("Linux")) os = "Linux";

        return `${browser} (${os})`;
    },

    _saveLocal(record) {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            let list = raw ? JSON.parse(raw) : [];

            // Mark initial sync state as pending
            if (typeof record.synced === 'undefined') {
                record.synced = false;
            }

            // Check if identical error fingerprint exists -> group & increment counter
            const existingIndex = list.findIndex(item => item.fingerprint === record.fingerprint);

            if (existingIndex !== -1) {
                const existing = list[existingIndex];
                existing.occurrences = (existing.occurrences || 1) + 1;
                existing.lastSeen = record.timestamp;
                existing.dateDisplay = record.dateDisplay;
                existing.breadcrumbs = record.breadcrumbs;
                existing.environment = record.environment;
                existing.message = record.message;
                existing.synced = false; // Needs re-sync due to updated occurrence count
                if (record.stack) existing.stack = record.stack;

                // Move updated grouped error to the top of the list
                list.splice(existingIndex, 1);
                list.unshift(existing);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
                return existing;
            } else {
                record.occurrences = 1;
                record.firstSeen = record.timestamp;
                record.lastSeen = record.timestamp;
                record.synced = false;
                list.unshift(record);
                if (list.length > this.MAX_LOCAL_LOGS) {
                    list = list.slice(0, this.MAX_LOCAL_LOGS);
                }
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
                return record;
            }
        } catch (e) {
            console.warn("Telemetry localStorage write failed:", e);
            return record;
        }
    },

    async _syncWithFirestore(record) {
        if (!record || !record.id) return false;
        try {
            if (typeof DB !== 'undefined') {
                if (!DB.dbInstance && typeof DB.init === 'function') {
                    await DB.init();
                }
                if (DB.dbInstance) {
                    await DB.dbInstance.collection(this.FIRESTORE_COLLECTION).doc(record.id).set(record, { merge: true });
                    this._markSyncedLocal(record.id);
                    return true;
                }
            }
        } catch (e) {
            console.warn("Firestore error sync failed (kept local):", e);
        }
        return false;
    },

    _markSyncedLocal(id) {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return;
            const list = JSON.parse(raw);
            const item = list.find(l => l.id === id);
            if (item) {
                item.synced = true;
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
            }
        } catch (_) {}
    },

    async flushPendingLogs() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return;
            const list = JSON.parse(raw);
            const pending = list.filter(item => !item.synced);
            if (pending.length === 0) return;

            if (typeof DB !== 'undefined') {
                if (!DB.dbInstance && typeof DB.init === 'function') {
                    await DB.init();
                }
                if (DB.dbInstance) {
                    const batch = DB.dbInstance.batch();
                    const syncedIds = [];
                    // Sync up to 25 pending logs in a batch
                    pending.slice(0, 25).forEach(rec => {
                        const ref = DB.dbInstance.collection(this.FIRESTORE_COLLECTION).doc(rec.id);
                        batch.set(ref, rec, { merge: true });
                        syncedIds.push(rec.id);
                    });
                    await batch.commit();

                    const updatedList = list.map(item => {
                        if (syncedIds.includes(item.id)) item.synced = true;
                        return item;
                    });
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedList));
                }
            }
        } catch (err) {
            console.warn("Telemetry: flushPendingLogs error:", err);
        }
    },

    /**
     * Fetch all logs merged from Firestore and LocalStorage
     */
    async getLogs() {
        let localLogs = [];
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) localLogs = JSON.parse(raw);
        } catch (_) {}

        // Try getting remote Firestore logs if available
        if (typeof DB !== 'undefined') {
            try {
                if (!DB.dbInstance && typeof DB.init === 'function') {
                    await DB.init();
                }
            } catch (_) {}

            if (DB.dbInstance) {
                try {
                    const snap = await DB.dbInstance.collection(this.FIRESTORE_COLLECTION)
                        .orderBy('timestamp', 'desc')
                        .limit(100)
                        .get();

                    const remoteLogs = [];
                    snap.forEach(doc => remoteLogs.push(doc.data()));

                    // Merge and deduplicate by ID
                    const logMap = new Map();
                    [...remoteLogs, ...localLogs].forEach(item => {
                        if (item && item.id && !logMap.has(item.id)) {
                            logMap.set(item.id, item);
                        }
                    });

                    // Seamlessly include any previous v2_agentic_logs records
                    try {
                        const agenticSnap = await DB.dbInstance.collection('v2_agentic_logs')
                            .orderBy('timestamp', 'desc')
                            .limit(50)
                            .get();
                        agenticSnap.forEach(doc => {
                            const d = doc.data();
                            const id = (doc.id && String(doc.id).startsWith('agentic_')) ? String(doc.id) : ('agentic_' + doc.id);
                            if (!logMap.has(id)) {
                                logMap.set(id, {
                                    id: id,
                                    category: 'AI_AGENT',
                                    severity: 'HIGH',
                                    occurrences: 1,
                                    timestamp: d.timestamp || new Date().toISOString(),
                                    dateDisplay: d.timestamp ? new Date(d.timestamp).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'medium' }) : '',
                                    message: d.error || d.message || 'خطأ في معالجة الوكيل الذكي',
                                    page: 'agent.html',
                                    stack: d.error || d.stack || '',
                                    user: d.user || { role: 'admin', schoolId: 'unknown' },
                                    environment: {
                                        browser: 'متصفح النظام',
                                        screen: 'غير محدد',
                                        online: true,
                                        memory: 'N/A'
                                    },
                                    extra: {
                                        userPrompt: d.userPrompt,
                                        provider: d.provider,
                                        source: 'v2_agentic_logs'
                                    },
                                    synced: true
                                });
                            }
                        });
                    } catch (_) {}

                    return Array.from(logMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                } catch (err) {
                    console.warn("Telemetry: Could not load remote Firestore logs, using local:", err);
                }
            }
        }

        return localLogs;
    },

    /**
     * Delete a single error log by ID
     */
    async deleteLog(logId) {
        try {
            // 1. Delete from Local Storage
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                let list = JSON.parse(raw);
                list = list.filter(l => l.id !== logId);
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
            }

            // 2. Delete from Firestore if available
            if (typeof DB !== 'undefined' && DB.dbInstance) {
                try {
                    await DB.dbInstance.collection(this.FIRESTORE_COLLECTION).doc(logId).delete();
                } catch (_) {}
            }

            return true;
        } catch (e) {
            console.error("Telemetry delete failed:", e);
            return false;
        }
    },

    /**
     * Hide or Restore an error log
     */
    async toggleHideLog(logId, shouldHide = true) {
        try {
            // 1. Update Local Storage
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                let list = JSON.parse(raw);
                const target = list.find(l => l.id === logId);
                if (target) {
                    target.hidden = shouldHide;
                    target.hiddenAt = shouldHide ? new Date().toISOString() : null;
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
                }
            }

            // 2. Update Firestore if available
            if (typeof DB !== 'undefined' && DB.dbInstance) {
                try {
                    await DB.dbInstance.collection(this.FIRESTORE_COLLECTION).doc(logId).update({
                        hidden: shouldHide,
                        hiddenAt: shouldHide ? new Date().toISOString() : null
                    });
                } catch (_) {}
            }

            return true;
        } catch (e) {
            console.error("Telemetry toggle hide failed:", e);
            return false;
        }
    },

    /**
     * Clear all error logs
     */
    async clearAllLogs() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);

            if (typeof DB !== 'undefined' && DB.dbInstance) {
                try {
                    const snap = await DB.dbInstance.collection(this.FIRESTORE_COLLECTION).limit(150).get();
                    const batch = DB.dbInstance.batch();
                    snap.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                } catch (_) {}
            }
            return true;
        } catch (e) {
            console.error("Telemetry clear all failed:", e);
            return false;
        }
    },

    /**
     * Copy a single log to clipboard as formatted JSON
     */
    async copyLog(logId, logsList = null) {
        try {
            const logs = logsList || await this.getLogs();
            const target = logs.find(l => l.id === logId);
            if (!target) throw new Error("السجل غير موجود");

            const formatted = JSON.stringify(target, null, 2);
            await navigator.clipboard.writeText(formatted);
            return true;
        } catch (e) {
            console.error("Failed to copy log:", e);
            return false;
        }
    },

    /**
     * Copy all logs to clipboard as formatted JSON
     */
    async copyAllLogs(logsList = null) {
        try {
            const logs = logsList || await this.getLogs();
            if (!logs || logs.length === 0) throw new Error("لا توجد سجلات لنسخها");

            const formatted = JSON.stringify(logs, null, 2);
            await navigator.clipboard.writeText(formatted);
            return true;
        } catch (e) {
            console.error("Failed to copy all logs:", e);
            return false;
        }
    },

    /**
     * Export logs as a downloadable JSON file
     */
    async exportJSON(logsList = null) {
        try {
            const logs = logsList || await this.getLogs();
            const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hodoori_telemetry_errors_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return true;
        } catch (e) {
            console.error("Failed to export JSON:", e);
            return false;
        }
    },

    /**
     * Trigger a controlled test error to verify telemetry
     */
    triggerTestError() {
        const errorTypes = [
            { cat: 'FACE_AI', msg: 'خطأ تجريبي في معالجة مصفوفة كاشف الوجوه (WebGL Shader Timeout)', stack: 'Error: at Engine.processHierarchicalDetection (module-face-api.js:885:12)' },
            { cat: 'NETWORK_DB', msg: 'فشل مزامنة سجلات الحضور مع الخادم السحابي (Network Timeout 504)', stack: 'Error: at DB.syncRecord (core-db.js:142:18)' },
            { cat: 'AUTH_CAMERA', msg: 'تعذر الوصول إلى الكاميرا: تم رفض الإذن من المتصفح (Permission Denied)', stack: 'NotAllowedError: Camera permission dismissed by user' },
            { cat: 'AI_AGENT', msg: 'استجابة غير مكتملة من نموذج Nemotron 3.5 (Rate Limit Exceeded 429)', stack: 'Error: at AgentEngine.callAPI (module-ai-agent.js:612:9)' }
        ];

        const chosen = errorTypes[Math.floor(Math.random() * errorTypes.length)];
        return this.logError(chosen.cat, chosen.msg, { stack: chosen.stack }, { isSimulatedTest: true });
    }
};

// Initialize immediately
if (typeof window !== 'undefined') {
    window.Telemetry = Telemetry;
    Telemetry.init();
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Telemetry;
}
