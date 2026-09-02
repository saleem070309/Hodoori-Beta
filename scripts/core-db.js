/**
 * @fileoverview High-Performance Data Management Layer, Multi-Tab Offline Persistence & Smart L1 Caching
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Saleem Yasser Saleem Al-Khadiwi (سليم ياسر سليم الخديوي)
 * @copyright © 2025-2026 Saleem Yasser Saleem Al-Khadiwi. All rights reserved.
 * @license Proprietary - All rights reserved.
 */

const DB = {
    KEYS: {
        STUDENTS: 'v2_students',
        TEACHERS: 'v2_teachers',
        CLASSES: 'v2_classes',
        RECORDS: 'v2_records',
        REPORTS: 'v2_records', // AI Alias
        HOLIDAYS: 'v2_holidays',
        NOTIFICATIONS: 'v2_notifications',
        SETTINGS: 'v2_settings',
        SCHOOLS: 'v2_schools',
        SCHEDULE: 'v2_schedule',
        CURRENT_USER: 'attendance_current_user' // Keep local for session
    },

    // Configurable TTL Matrix (Milliseconds)
    TTL: {
        SETTINGS: 15 * 60 * 1000,     // 15 Minutes (Eliminates recurring interval cloud polling)
        SCHOOLS: 30 * 60 * 1000,      // 30 Minutes
        HOLIDAYS: 30 * 60 * 1000,     // 30 Minutes
        CLASSES: 10 * 60 * 1000,      // 10 Minutes
        TEACHERS: 10 * 60 * 1000,     // 10 Minutes
        SCHEDULE: 10 * 60 * 1000,     // 10 Minutes
        STUDENTS: 5 * 60 * 1000,      // 5 Minutes
        RECORDS: 3 * 60 * 1000,       // 3 Minutes
        NOTIFICATIONS: 2 * 60 * 1000, // 2 Minutes
        DEFAULT: 5 * 60 * 1000        // 5 Minutes Default Fallback
    },

    dbInstance: null,
    _initPromise: null,
    _persistenceConfigured: false,
    _persistenceState: 'none', // 'none' | 'multi-tab' | 'single-tab' | 'memory' | 'unsupported'
    _tabId: 'tab_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36),
    _broadcastChannel: null,
    _broadcastInitialized: false,
    _l1Cache: new Map(),           // CacheKey -> L1CacheEntry
    _inflightQueries: new Map(),   // CacheKey -> Promise
    _syncMetaCache: new Map(),     // MetaKey -> SyncMetadata

    _stats: {
        hits: 0,
        misses: 0,
        expirations: 0,
        invalidations: 0,
        broadcastsSent: 0,
        broadcastsReceived: 0
    },

    // ==========================================
    // 1. Script Loading, Persistence & Initialization
    // ==========================================

    async loadFirebaseScripts() {
        if (typeof window === 'undefined') return;
        if (window.firebase && typeof window.firebase.firestore === 'function') return;
        const loadScript = (src) => new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (window.firebase && typeof window.firebase.firestore === 'function') return resolve();
            }
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });

        if (!window.firebase) {
            await loadScript("https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js");
        }
        if (!window.firebase || typeof window.firebase.firestore !== 'function') {
            await loadScript("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-compat.js");
        }
    },

    /**
     * Initializes Firestore offline persistence with multi-tab support and cascade fallbacks.
     * Must be invoked before any Firestore queries or listeners are initiated.
     * @private
     */
    async _initPersistence() {
        if (this._persistenceConfigured) return;
        this._persistenceConfigured = true;

        if (!this.dbInstance) return;

        // 1. Configure cache size
        try {
            if (typeof this.dbInstance.settings === 'function') {
                const unlimitedCache = (typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.CACHE_SIZE_UNLIMITED) 
                    ? firebase.firestore.CACHE_SIZE_UNLIMITED 
                    : -1;
                this.dbInstance.settings({
                    cacheSizeBytes: unlimitedCache
                });
            }
        } catch (settingsErr) {
            console.warn("Hodoori DB: Firestore settings configuration notice:", settingsErr ? settingsErr.message : settingsErr);
        }

        // 2. Enable multi-tab persistence
        if (typeof this.dbInstance.enablePersistence === 'function') {
            try {
                await this.dbInstance.enablePersistence({ synchronizeTabs: true });
                this._persistenceState = 'multi-tab';
                console.log("Hodoori DB: Multi-tab IndexedDB persistence enabled successfully.");
                return;
            } catch (err) {
                if (err && err.code === 'failed-precondition') {
                    console.warn("Hodoori DB: Multi-tab persistence failed-precondition. Attempting single-tab fallback...");
                    try {
                        await this.dbInstance.enablePersistence();
                        this._persistenceState = 'single-tab';
                        console.log("Hodoori DB: Single-tab IndexedDB persistence enabled.");
                        return;
                    } catch (singleTabErr) {
                        this._persistenceState = 'memory';
                        console.warn("Hodoori DB: Persistence unavailable across tabs. Running in memory-only mode.", singleTabErr ? singleTabErr.message : singleTabErr);
                    }
                } else if (err && err.code === 'unimplemented') {
                    this._persistenceState = 'unsupported';
                    console.warn("Hodoori DB: Browser does not support IndexedDB persistence (Private Browsing / Restricted). Using L1 memory cache.");
                } else {
                    this._persistenceState = 'memory';
                    console.warn("Hodoori DB: Offline persistence initialization notice:", err ? err.message : err);
                }
            }
        }
    },

    /**
     * Initializes Cross-Tab synchronization using BroadcastChannel with localStorage fallback.
     * @private
     */
    _initBroadcast() {
        if (this._broadcastInitialized || typeof window === 'undefined') return;
        this._broadcastInitialized = true;

        // 1. Initialize BroadcastChannel if supported
        try {
            if ('BroadcastChannel' in window && !this._broadcastChannel) {
                this._broadcastChannel = new BroadcastChannel('hodoori_db_cache_sync');
                this._broadcastChannel.onmessage = (event) => {
                    this._handleSyncMessage(event.data);
                };
                this._broadcastChannel.onmessageerror = (err) => {
                    console.warn("Hodoori DB: BroadcastChannel error:", err);
                };
            }
        } catch (e) {
            console.warn("Hodoori DB: BroadcastChannel initialization failed. Relying on storage fallback.", e);
        }

        // 2. Storage event listener (secondary / fallback)
        try {
            if (typeof window.addEventListener === 'function') {
                window.addEventListener('storage', (event) => {
                    if (event.key === '__hodoori_cache_inval__' && event.newValue) {
                        try {
                            const payload = JSON.parse(event.newValue);
                            this._handleSyncMessage(payload);
                        } catch (_) {}
                    }
                });
            }
        } catch (_) {}
    },

    /**
     * Internal handler for incoming cross-tab synchronization messages.
     * @private
     */
    _handleSyncMessage(payload) {
        if (!payload || typeof payload !== 'object') return;
        // Suppress loopback / echoes from self
        if (payload.senderTabId === this._tabId) return;

        this._stats.broadcastsReceived++;

        if (payload.type === 'GLOBAL_SECURITY_LOCKDOWN') {
            console.warn("🔒 Hodoori: Remote security lockdown triggered. Purging local session.");
            this._l1Cache.clear();
            this._inflightQueries.clear();
            this._syncMetaCache.clear();
            if (typeof CryptoEngine !== 'undefined') CryptoEngine.destroySessionKey();
            try { localStorage.removeItem(this.KEYS.CURRENT_USER); } catch (_) {}
            if (typeof window !== 'undefined' && !window.location.pathname.endsWith('index.html')) {
                window.location.href = 'index.html';
            }
            return;
        }

        if (payload.type === 'CLEAR_ALL') {
            this._purgeL1Local(null);
        } else if (payload.type === 'INVALIDATE') {
            this._purgeL1Local(payload.collection, payload.schoolId, payload.docId);
            if (Array.isArray(payload.extraCollections)) {
                for (const col of payload.extraCollections) {
                    this._purgeL1Local(col, payload.schoolId);
                }
            }
        }

        // Dispatch DOM CustomEvent for UI reactivity if dashboards wish to subscribe
        try {
            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('hodoori:db:invalidated', { detail: payload }));
            }
        } catch (_) {}
    },

    async init() {
        this._initBroadcast();

        if (this.dbInstance && this._persistenceConfigured) return;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            await this.loadFirebaseScripts();

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
            const firebaseConfig = {
                apiKey: "AIzaSyDNsQSska2D5Qevmcp9GPk70q0RMk9bSFo",
                authDomain: "hodoori-test.firebaseapp.com",
                projectId: "hodoori-test",
                storageBucket: "hodoori-test.firebasestorage.app",
                messagingSenderId: "315718012992",
                appId: "1:315718012992:web:4626e8b48210fb18c24fa5",
                measurementId: "G-0X885XSK0H"
            };

            if (typeof firebase !== 'undefined') {
                if (!firebase.apps || !firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                this.dbInstance = firebase.firestore();
            }

            // Initialize multi-tab persistence BEFORE any Firestore queries
            await this._initPersistence();
        })();

        return this._initPromise;
    },

    async seedData() {
        if (!this.dbInstance) return;
        const batch = this.dbInstance.batch();

        const schoolRef = this.dbInstance.collection(this.KEYS.SCHOOLS).doc('s1');
        batch.set(schoolRef, { name: 'المدرسة النموذجية', address: 'عمان', principal: 'د. أحمد', timestamp: new Date().toISOString() });

        const mRef = this.dbInstance.collection(this.KEYS.TEACHERS).doc('ministry_1');
        batch.set(mRef, { name: 'مسؤول الوزارة', ministryId: '000', password: 'admin', role: 'ministry', schoolId: 'ministry' });

        const tRef = this.dbInstance.collection(this.KEYS.TEACHERS).doc('1');
        batch.set(tRef, { name: 'مدير المدرسة', ministryId: '100', password: 'admin', role: 'admin', schoolId: 's1' });

        const c1Ref = this.dbInstance.collection(this.KEYS.CLASSES).doc('c1');
        batch.set(c1Ref, { name: 'الصف العاشر', section: 'أ', schoolId: 's1' });

        const c2Ref = this.dbInstance.collection(this.KEYS.CLASSES).doc('c2');
        batch.set(c2Ref, { name: 'الصف الحادي عشر', section: 'ب', schoolId: 's1' });

        const s1Ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc('2024001');
        batch.set(s1Ref, { academicId: '2024001', name: 'أحمد المحمدي', classId: 'c1', schoolId: 's1', avatar: 'https://i.pravatar.cc/150?u=1' });

        const s2Ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc('2024042');
        batch.set(s2Ref, { academicId: '2024042', name: 'سارة خالد', classId: 'c1', schoolId: 's1', avatar: 'https://i.pravatar.cc/150?u=2' });

        await batch.commit();
        this.clearAllCaches();
    },

    getCurrentUserSchoolId() {
        try {
            if (typeof localStorage !== 'undefined') {
                const user = JSON.parse(localStorage.getItem(this.KEYS.CURRENT_USER) || '{}');
                return user.schoolId || null;
            }
            return null;
        } catch (_) {
            return null;
        }
    },

    // ==========================================
    // 2. L1 In-Memory Cache Core Engine
    // ==========================================

    /**
     * Resolves default TTL duration for a given collection name.
     * @param {string} collectionName
     * @returns {number} TTL in milliseconds
     */
    _getTTL(collectionName) {
        if (!collectionName) return this.TTL.DEFAULT;
        for (const [key, val] of Object.entries(this.KEYS)) {
            if (val === collectionName && this.TTL[key]) {
                return this.TTL[key];
            }
        }
        const clean = String(collectionName).replace(/^v2_/, '').toUpperCase();
        return this.TTL[clean] || this.TTL.DEFAULT;
    },

    /**
     * Reads from L1 in-memory cache with TTL check and defensive cloning.
     * @param {string} key
     * @returns {any|null}
     */
    _getL1(key) {
        if (!this._l1Cache.has(key)) {
            this._stats.misses++;
            return null;
        }

        const entry = this._l1Cache.get(key);
        const now = Date.now();

        // Verify TTL Expiration
        if (now > entry.expiresAt) {
            this._l1Cache.delete(key);
            this._stats.misses++;
            this._stats.expirations++;
            return null;
        }

        entry.hits++;
        this._stats.hits++;

        // Defensive clone on read to prevent consumer mutation of cached arrays/objects
        if (Array.isArray(entry.data)) {
            return entry.data.map(item => (typeof item === 'object' && item !== null ? { ...item } : item));
        }
        if (typeof entry.data === 'object' && entry.data !== null) {
            return { ...entry.data };
        }
        return entry.data;
    },

    /**
     * Writes to L1 in-memory cache with defensive cloning and metadata tracking.
     * @param {string} key
     * @param {any} data
     * @param {string} [collectionName=null]
     * @param {string} [schoolId=null]
     * @param {number} [customTTL=null]
     */
    _setL1(key, data, collectionName = null, schoolId = null, customTTL = null) {
        const col = collectionName || key.split('::')[0] || 'default';
        const ttl = (typeof customTTL === 'number' && customTTL > 0) ? customTTL : this._getTTL(col);
        const now = Date.now();
        const effectiveSchoolId = schoolId || (key.split('::')[1] || this.getCurrentUserSchoolId() || 'global');

        let clonedData;
        if (Array.isArray(data)) {
            clonedData = data.map(item => (typeof item === 'object' && item !== null ? { ...item } : item));
        } else if (typeof data === 'object' && data !== null) {
            clonedData = { ...data };
        } else {
            clonedData = data;
        }

        const entry = {
            data: clonedData,
            cachedAt: now,
            expiresAt: now + ttl,
            ttlMs: ttl,
            collection: col,
            schoolId: effectiveSchoolId,
            key: key,
            hits: 0
        };

        this._l1Cache.set(key, entry);
        return data;
    },

    /**
     * Purges entries from local L1 cache matching a collection name or pattern.
     * @private
     */
    _purgeL1Local(collectionName = null, schoolId = null, docId = null) {
        let count = 0;
        if (!collectionName) {
            count = this._l1Cache.size;
            this._l1Cache.clear();
            this._stats.invalidations += count;
            this._syncMetaCache.clear();
            return count;
        }

        const canonicalCol = this.KEYS[String(collectionName).toUpperCase()] || collectionName;
        const prefix = `${canonicalCol}::`;

        for (const [key, entry] of this._l1Cache.entries()) {
            if (key.startsWith(prefix) || key.includes(canonicalCol)) {
                if (!schoolId || schoolId === 'global' || schoolId === 'ministry' || entry.schoolId === schoolId || entry.schoolId === 'global' || !entry.schoolId) {
                    this._l1Cache.delete(key);
                    count++;
                }
            }
        }

        if (docId) {
            const docKey = `${canonicalCol}::doc_${docId}`;
            if (this._l1Cache.has(docKey)) {
                this._l1Cache.delete(docKey);
                count++;
            }
        }

        this._stats.invalidations += count;
        return count;
    },

    // ==========================================
    // 3. In-Flight Request Coalescing Wrapper
    // ==========================================

    /**
     * Core In-Flight Request Coalescing & Caching Wrapper.
     * Ensures identical simultaneous queries share the same executing Promise.
     * 
     * @param {string} cacheKey - Standardized query cache key
     * @param {Function} fetcherFn - Async function executing the underlying Firestore query
     * @param {Object|number} [options={}] - Query options: { forceRefresh: false, bypassCache: false, ttl: null } or custom TTL number
     * @param {string} [collectionName=null]
     * @param {string} [schoolId=null]
     * @returns {Promise<any>}
     */
    async _coalesce(cacheKey, fetcherFn, options = {}, collectionName = null, schoolId = null) {
        const opts = (typeof options === 'object' && options !== null) ? options : {};
        const forceRefresh = Boolean(opts.forceRefresh);
        const bypassCache = Boolean(opts.bypassCache);
        const customTTL = typeof options === 'number' ? options : (typeof opts.ttl === 'number' ? opts.ttl : null);

        // 1. Return fresh L1 cache result if available
        if (!forceRefresh && !bypassCache) {
            const cached = this._getL1(cacheKey);
            if (cached !== null && cached !== undefined) {
                return cached;
            }
        }

        // 2. Return existing in-flight Promise if identical query is currently executing
        if (this._inflightQueries.has(cacheKey)) {
            return this._inflightQueries.get(cacheKey);
        }

        // 3. Initiate single query execution
        const queryPromise = (async () => {
            try {
                const data = await fetcherFn();
                if (!bypassCache) {
                    const col = collectionName || cacheKey.split('::')[0] || 'default';
                    const sId = schoolId || (cacheKey.split('::')[1] || null);
                    this._setL1(cacheKey, data, col, sId, customTTL);
                }
                return data;
            } finally {
                // Ensure in-flight map is always cleared for this key upon settlement
                this._inflightQueries.delete(cacheKey);
            }
        })();

        this._inflightQueries.set(cacheKey, queryPromise);
        return queryPromise;
    },

    // ==========================================
    // 4. Delta Synchronization Helpers (v2_records)
    // ==========================================

    _getSyncMeta(metaKey) {
        if (this._syncMetaCache.has(metaKey)) {
            return this._syncMetaCache.get(metaKey);
        }
        try {
            if (typeof localStorage !== 'undefined') {
                const allMeta = JSON.parse(localStorage.getItem('__hodoori_sync_meta__') || '{}');
                const meta = allMeta[metaKey] || null;
                if (meta) this._syncMetaCache.set(metaKey, meta);
                return meta;
            }
        } catch (_) {}
        return null;
    },

    _setSyncMeta(metaKey, meta) {
        this._syncMetaCache.set(metaKey, meta);
        try {
            if (typeof localStorage !== 'undefined') {
                const allMeta = JSON.parse(localStorage.getItem('__hodoori_sync_meta__') || '{}');
                allMeta[metaKey] = meta;
                localStorage.setItem('__hodoori_sync_meta__', JSON.stringify(allMeta));
            }
        } catch (_) {}
    },

    _computeSafeTimestamp(isoString, marginMs = 5000) {
        try {
            const time = new Date(isoString).getTime();
            if (isNaN(time)) return isoString;
            return new Date(Math.max(0, time - marginMs)).toISOString();
        } catch (_) {
            return isoString;
        }
    },

    _extractMaxTimestamp(docs, fallback) {
        if (!docs || docs.length === 0) return fallback;
        let maxTs = '';
        for (const doc of docs) {
            const ts = doc.timestamp || doc.date || '';
            if (ts > maxTs) maxTs = ts;
        }
        return maxTs || fallback;
    },

    _mergeDeltaIntoBaseline(baseline, delta) {
        const docMap = new Map();

        if (Array.isArray(baseline)) {
            for (let i = 0; i < baseline.length; i++) {
                const doc = baseline[i];
                if (doc && doc.id) {
                    docMap.set(doc.id, doc);
                }
            }
        }

        if (Array.isArray(delta)) {
            for (let i = 0; i < delta.length; i++) {
                const doc = delta[i];
                if (doc && doc.id) {
                    docMap.set(doc.id, doc);
                }
            }
        }

        const merged = Array.from(docMap.values());
        merged.sort((a, b) => {
            const tsA = a.timestamp || a.date || '';
            const tsB = b.timestamp || b.date || '';
            return tsB.localeCompare(tsA);
        });

        return merged;
    },

    async _syncDeltaCollection(collectionName, schoolId, options = {}) {
        const metaKey = `${collectionName}::${schoolId || 'global'}`;
        const baselineCacheKey = `${metaKey}::baseline`;

        const meta = this._getSyncMeta(metaKey);
        const cachedBaseline = this._getL1(baselineCacheKey);
        const queryStartTime = new Date().toISOString();

        if (!meta || !meta.lastSync || !cachedBaseline || cachedBaseline.length === 0 || options.forceFullSync) {
            let fullQuery = this.dbInstance.collection(collectionName);
            if (schoolId && schoolId !== 'ministry') {
                fullQuery = fullQuery.where('schoolId', '==', schoolId);
            }

            const snap = await fullQuery.get();
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            const maxDocTimestamp = this._extractMaxTimestamp(docs, queryStartTime);
            this._setL1(baselineCacheKey, docs, collectionName, schoolId, this.TTL.RECORDS);
            this._setSyncMeta(metaKey, {
                lastSync: maxDocTimestamp,
                updatedAt: Date.now(),
                docCount: docs.length,
                version: 1
            });

            return docs;
        }

        const safeLastSync = this._computeSafeTimestamp(meta.lastSync, 5000);
        let deltaQuery = this.dbInstance.collection(collectionName);
        if (schoolId && schoolId !== 'ministry') {
            deltaQuery = deltaQuery.where('schoolId', '==', schoolId);
        }
        deltaQuery = deltaQuery.where('timestamp', '>', safeLastSync);

        try {
            const deltaSnap = await deltaQuery.get();

            if (deltaSnap.empty) {
                meta.lastSync = queryStartTime;
                meta.updatedAt = Date.now();
                this._setSyncMeta(metaKey, meta);
                this._setL1(baselineCacheKey, cachedBaseline, collectionName, schoolId, this.TTL.RECORDS);
                return cachedBaseline;
            }

            const deltaDocs = deltaSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const mergedDocs = this._mergeDeltaIntoBaseline(cachedBaseline, deltaDocs);
            const newMaxTimestamp = this._extractMaxTimestamp(deltaDocs, queryStartTime);

            this._setL1(baselineCacheKey, mergedDocs, collectionName, schoolId, this.TTL.RECORDS);
            this._setSyncMeta(metaKey, {
                lastSync: newMaxTimestamp,
                updatedAt: Date.now(),
                docCount: mergedDocs.length,
                version: 1
            });

            return mergedDocs;
        } catch (networkError) {
            console.warn(`Hodoori DB: Delta sync query failed for ${metaKey}, falling back to cached baseline:`, networkError);
            return cachedBaseline;
        }
    },

    // ==========================================
    // 5. Data Reading Methods (L1 Cached + Coalesced)
    // ==========================================

    /**
     * Fetches an entire collection with L1 caching and in-flight promise coalescing.
     * @param {string} collectionName
     * @param {boolean} [filterBySchool=true]
     * @param {Object} [options={}] - { forceRefresh: false, bypassCache: false }
     * @returns {Promise<Array<Object>>}
     */
    async getCollection(collectionName, filterBySchool = true, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (filterBySchool && schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        const cacheKey = `${collectionName}::${effectiveSchool}::all`;

        return this._coalesce(cacheKey, async () => {
            let query = this.dbInstance.collection(collectionName);
            if (filterBySchool && schoolId && schoolId !== 'ministry') {
                query = query.where('schoolId', '==', schoolId);
            }
            const snap = await query.get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }, options, collectionName, effectiveSchool);
    },

    /**
     * Fetches students with class scoping, smart memory filter optimization, and request coalescing.
     * @param {string|null} [classId=null]
     * @param {Object} [options={}] - { forceRefresh: false, bypassCache: false }
     * @returns {Promise<Array<Object>>}
     */
    async getStudents(classId = null, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';

        // Memory optimization: If classId is specified and we already have all students in L1 cache, filter in memory
        if (classId && !options.forceRefresh && !options.bypassCache) {
            const allCached = this._getL1(`${this.KEYS.STUDENTS}::${effectiveSchool}::all`);
            if (allCached && Array.isArray(allCached)) {
                return allCached.filter(s => s.classId === classId || s.classid === classId);
            }
        }

        const cacheKey = `${this.KEYS.STUDENTS}::${effectiveSchool}::${classId ? 'class_' + classId : 'all'}`;

        return this._coalesce(cacheKey, async () => {
            let query = this.dbInstance.collection(this.KEYS.STUDENTS);
            if (schoolId && schoolId !== 'ministry') {
                query = query.where('schoolId', '==', schoolId);
            }
            if (classId) {
                query = query.where('classId', '==', classId);
            }
            const snap = await query.get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }, options, this.KEYS.STUDENTS, effectiveSchool);
    },

    async getTeachers(options = {}) {
        return await this.getCollection(this.KEYS.TEACHERS, true, options);
    },

    async getClasses(options = {}) {
        return await this.getCollection(this.KEYS.CLASSES, true, options);
    },

    /**
     * Fetches a single teacher record by ministry ID using targeted equality query.
     * Replaces full collection scans during login.
     * @param {string} ministryId
     * @param {Object} [options={}]
     * @returns {Promise<Object|null>}
     */
    async getTeacherByMinistryId(ministryId, options = {}) {
        if (!ministryId) return null;
        await this.init();
        const cleanId = String(ministryId).trim();
        const cacheKey = `${this.KEYS.TEACHERS}::ministryId_${cleanId}`;

        return this._coalesce(cacheKey, async () => {
            const snap = await this.dbInstance.collection(this.KEYS.TEACHERS)
                .where('ministryId', '==', cleanId)
                .limit(1)
                .get();
            if (snap.empty) return null;
            const doc = snap.docs[0];
            return { id: doc.id, ...doc.data() };
        }, options, this.KEYS.TEACHERS, 'global');
    },

    /**
     * Fetches students linked to a parent's phone number using targeted equality query.
     * @param {string} phone
     * @param {Object} [options={}]
     * @returns {Promise<Array<Object>>}
     */
    async getStudentsByPhone(phone, options = {}) {
        if (!phone) return [];
        await this.init();
        const cleanPhone = String(phone).trim();
        const cacheKey = `${this.KEYS.STUDENTS}::phone_${cleanPhone}`;

        return this._coalesce(cacheKey, async () => {
            const snap = await this.dbInstance.collection(this.KEYS.STUDENTS)
                .where('phone', '==', cleanPhone)
                .get();
            return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }, options, this.KEYS.STUDENTS, 'global');
    },

    /**
     * Fetches a single student by academic ID or document ID using targeted lookup.
     * @param {string} identifier
     * @param {Object} [options={}]
     * @returns {Promise<Object|null>}
     */
    async getStudentByAcademicId(identifier, options = {}) {
        if (!identifier) return null;
        await this.init();
        const cleanId = String(identifier).trim();
        const cacheKey = `${this.KEYS.STUDENTS}::academicId_${cleanId}`;

        return this._coalesce(cacheKey, async () => {
            // 1. Direct document lookup by doc ID
            const docRef = await this.dbInstance.collection(this.KEYS.STUDENTS).doc(cleanId).get();
            if (docRef.exists) {
                return { id: docRef.id, ...docRef.data() };
            }
            // 2. Targeted query on academicId field
            const snap = await this.dbInstance.collection(this.KEYS.STUDENTS)
                .where('academicId', '==', cleanId)
                .limit(1)
                .get();
            if (!snap.empty) {
                const doc = snap.docs[0];
                return { id: doc.id, ...doc.data() };
            }
            return null;
        }, options, this.KEYS.STUDENTS, 'global');
    },

    /**
     * Fetches attendance records with date and class scoping, L1 caching, and request coalescing.
     * @param {string|null} [date=null]
     * @param {string|null} [classId=null]
     * @param {Object} [options={}]
     * @returns {Promise<Array<Object>>}
     */
    async getRecords(date = null, classId = null, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';

        if (!date && !classId && options.useDeltaSync) {
            return await this._syncDeltaCollection(this.KEYS.RECORDS, effectiveSchool, options);
        }

        const cacheKey = `${this.KEYS.RECORDS}::${effectiveSchool}::date_${date || 'all'}__class_${classId || 'all'}`;

        return this._coalesce(cacheKey, async () => {
            let q = this.dbInstance.collection(this.KEYS.RECORDS);
            if (schoolId && schoolId !== 'ministry') {
                q = q.where('schoolId', '==', schoolId);
            }
            if (date) q = q.where('date', '==', date);
            if (classId) q = q.where('classId', '==', classId);
            try {
                const snap = await q.get();
                return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (err) {
                const isIndexError = err && (
                    (err.message && (err.message.includes('requires an index') || err.message.includes('create_composite'))) ||
                    err.code === 'failed-precondition' ||
                    err.code === 9
                );
                if (isIndexError) {
                    console.warn('Hodoori DB: Composite index missing for getRecords, falling back to client-side filtering:', err.message);
                    let fallbackQuery = this.dbInstance.collection(this.KEYS.RECORDS);
                    if (schoolId && schoolId !== 'ministry') {
                        fallbackQuery = fallbackQuery.where('schoolId', '==', schoolId);
                    }
                    const fallbackSnap = await fallbackQuery.get();
                    let rawRecords = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    if (date) rawRecords = rawRecords.filter(r => r.date === date);
                    if (classId) rawRecords = rawRecords.filter(r => r.classId === classId);
                    return rawRecords;
                }
                throw err;
            }
        }, options, this.KEYS.RECORDS, effectiveSchool);
    },

    /**
     * Queries attendance records within a specific inclusive date range.
     * @param {string} startDate - 'YYYY-MM-DD'
     * @param {string} endDate - 'YYYY-MM-DD'
     * @param {string|null} [classId=null]
     * @param {Object} [options={}]
     * @returns {Promise<Array<Object>>}
     */
    async getRecordsRange(startDate, endDate, classId = null, options = {}) {
        await this.init();

        if (!startDate && !endDate) {
            return await this.getRecords(null, classId, options);
        }

        let start = startDate || endDate;
        let end = endDate || startDate;
        if (start > end) {
            const temp = start;
            start = end;
            end = temp;
        }

        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        const cacheKey = `${this.KEYS.RECORDS}::${effectiveSchool}::range_${start}_${end}__class_${classId || 'all'}`;

        return this._coalesce(cacheKey, async () => {
            let q = this.dbInstance.collection(this.KEYS.RECORDS);
            if (schoolId && schoolId !== 'ministry') {
                q = q.where('schoolId', '==', schoolId);
            }
            if (classId) {
                q = q.where('classId', '==', classId);
            }

            if (start === end) {
                q = q.where('date', '==', start);
            } else {
                q = q.where('date', '>=', start).where('date', '<=', end);
            }

            try {
                const snap = await q.get();
                const records = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // Sort descending by date, then periodNumber or timestamp
                records.sort((a, b) => {
                    const dateCmp = (b.date || '').localeCompare(a.date || '');
                    if (dateCmp !== 0) return dateCmp;
                    return (b.periodNumber || 0) - (a.periodNumber || 0);
                });

                return records;
            } catch (err) {
                const isIndexError = err && (
                    (err.message && (err.message.includes('requires an index') || err.message.includes('create_composite'))) ||
                    err.code === 'failed-precondition' ||
                    err.code === 9
                );
                if (isIndexError) {
                    console.warn('Hodoori DB: Composite index missing for getRecordsRange, falling back to client-side date filtering while index is created:', err.message);
                    let fallbackQuery = this.dbInstance.collection(this.KEYS.RECORDS);
                    if (schoolId && schoolId !== 'ministry') {
                        fallbackQuery = fallbackQuery.where('schoolId', '==', schoolId);
                    }
                    if (classId) {
                        fallbackQuery = fallbackQuery.where('classId', '==', classId);
                    }
                    const fallbackSnap = await fallbackQuery.get();
                    let rawRecords = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    let filtered = rawRecords.filter(r => {
                        if (start === end) return r.date === start;
                        return r.date >= start && r.date <= end;
                    });
                    filtered.sort((a, b) => {
                        const dateCmp = (b.date || '').localeCompare(a.date || '');
                        if (dateCmp !== 0) return dateCmp;
                        return (b.periodNumber || 0) - (a.periodNumber || 0);
                    });
                    return filtered;
                }
                throw err;
            }
        }, options, this.KEYS.RECORDS, effectiveSchool);
    },

    /**
     * Shorthand helper to fetch today's attendance records for the active school.
     * @param {string|null} [classId=null]
     * @param {Object} [options={}]
     * @returns {Promise<Array<Object>>}
     */
    async getTodayRecords(classId = null, options = {}) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        return await this.getRecords(today, classId, options);
    },

    /**
     * Fetches attendance records for the last N calendar days.
     * @param {number} [days=30]
     * @param {string|null} [classId=null]
     * @param {Object} [options={}]
     * @returns {Promise<Array<Object>>}
     */
    async getRecentRecords(days = 30, classId = null, options = {}) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const endDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        
        const past = new Date(now.getTime() - (Math.max(1, days) * 24 * 60 * 60 * 1000));
        const startDate = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`;

        return await this.getRecordsRange(startDate, endDate, classId, options);
    },

    /**
     * Fetches a single attendance record by document ID directly.
     * @param {string} id
     * @param {Object} [options={}]
     * @returns {Promise<Object|null>}
     */
    async getRecordById(id, options = {}) {
        if (!id) return null;
        await this.init();
        const cacheKey = `${this.KEYS.RECORDS}::doc_${id}`;

        return this._coalesce(cacheKey, async () => {
            const doc = await this.dbInstance.collection(this.KEYS.RECORDS).doc(id).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : null;
        }, options, this.KEYS.RECORDS, 'global');
    },

    /**
     * Fetches school settings with 15-minute L1 TTL caching and request coalescing.
     * Eliminates 60s background polling cloud reads entirely.
     * @param {Object} [options={}]
     * @returns {Promise<Object>}
     */
    async getSettings(options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const docId = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        const cacheKey = `${this.KEYS.SETTINGS}::${docId}::doc_${docId}`;

        return this._coalesce(cacheKey, async () => {
            const doc = await this.dbInstance.collection(this.KEYS.SETTINGS).doc(docId).get();
            return doc.exists ? doc.data() : {};
        }, options, this.KEYS.SETTINGS, docId);
    },

    async getSchools(options = {}) {
        return await this.getCollection(this.KEYS.SCHOOLS, false, options);
    },

    async getSchool(id, options = {}) {
        if (!id) return null;
        await this.init();
        const cacheKey = `${this.KEYS.SCHOOLS}::global::doc_${id}`;

        return this._coalesce(cacheKey, async () => {
            const doc = await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).get();
            return doc.exists ? { id: doc.id, ...doc.data() } : null;
        }, options, this.KEYS.SCHOOLS, 'global');
    },

    async getSchedule(options = {}) {
        return await this.getCollection(this.KEYS.SCHEDULE, true, options);
    },

    async getHolidays(options = {}) {
        return await this.getCollection(this.KEYS.HOLIDAYS, true, options);
    },

    async isHoliday(dateString, options = {}) {
        const date = new Date(dateString);
        const day = date.getDay();
        if (day === 5 || day === 6) return true; // Friday / Saturday weekend

        const holidays = await this.getCollection(this.KEYS.HOLIDAYS, false, options);
        return holidays.some(h => h.date === dateString);
    },

    /**
     * Fetches targeted or broadcast notifications with L1 caching and request coalescing.
     * @param {Object} [target={}] - { id, classId, isParent }
     * @param {Object} [options={}]
     * @returns {Promise<Array<Object>>}
     */
    async getNotifications(target = {}, options = {}) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const effectiveSchool = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        
        const targetKey = (target.id || target.classId) 
            ? `target_id_${target.id || ''}_class_${target.classId || ''}_parent_${!!target.isParent}` 
            : 'all';
        const cacheKey = `${this.KEYS.NOTIFICATIONS}::${effectiveSchool}::${targetKey}`;

        return this._coalesce(cacheKey, async () => {
            const getBase = () => {
                let q = this.dbInstance.collection(this.KEYS.NOTIFICATIONS);
                if (schoolId && schoolId !== 'ministry') {
                    q = q.where('schoolId', '==', schoolId);
                }
                return q;
            };

            if (target.id || target.classId) {
                const q1 = await getBase().where('targetType', '==', 'all').get();
                let results = q1.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                if (target.classId) {
                    const q2 = await getBase().where('targetType', '==', 'class').where('targetId', '==', target.classId).get();
                    results = [...results, ...q2.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
                }

                if (target.id) {
                    const q3 = await getBase().where('targetType', '==', 'student').where('targetId', '==', target.id).get();
                    results = [...results, ...q3.docs.map(doc => ({ id: doc.id, ...doc.data() }))];

                    if (target.isParent) {
                        const q4 = await getBase().where('targetType', '==', 'parent').where('targetId', '==', target.id).get();
                        results = [...results, ...q4.docs.map(doc => ({ id: doc.id, ...doc.data() }))];
                    }
                }

                const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());
                return uniqueResults.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            }

            const snap = await getBase().get();
            const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }, options, this.KEYS.NOTIFICATIONS, effectiveSchool);
    },

    // ==========================================
    // 6. Write Operations (Auto-Invalidating)
    // ==========================================

    async saveAttendance(date, classId, attendanceList, teacherId, periodNumber = null, image = null, notes = null) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();

        let query = this.dbInstance.collection(this.KEYS.RECORDS)
            .where('date', '==', date)
            .where('classId', '==', classId)
            .where('schoolId', '==', schoolId);

        const existing = await query.get();

        let docRef;
        if (periodNumber !== null) {
            const periodDoc = existing.docs.find(d => d.data().periodNumber === periodNumber);
            docRef = periodDoc ? periodDoc.ref : this.dbInstance.collection(this.KEYS.RECORDS).doc();
        } else {
            if (!existing.empty) {
                docRef = existing.docs[0].ref;
            } else {
                docRef = this.dbInstance.collection(this.KEYS.RECORDS).doc();
            }
        }

        const report = {
            date,
            classId,
            teacherId,
            schoolId,
            details: attendanceList,
            image,
            notes,
            timestamp: new Date().toISOString()
        };

        if (periodNumber !== null) report.periodNumber = periodNumber;

        await docRef.set(report);
        this.invalidateCache(this.KEYS.RECORDS, docRef.id);
    },

    async deleteRecord(id) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.RECORDS).doc(id).delete();
        this.invalidateCache(this.KEYS.RECORDS, id);
    },

    async updateRecordDetails(id, newDetails) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.RECORDS).doc(id).update({
            details: newDetails
        });
        this.invalidateCache(this.KEYS.RECORDS, id);
    },

    async addStudent(student) {
        await this.init();
        const id = student.academicId || (Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7));
        student.academicId = id;
        student.name = student.name || 'طالب مجهول';
        if (!student.schoolId) {
            student.schoolId = this.getCurrentUserSchoolId();
        }

        // Defensive data normalization
        if (student.classid && !student.classId) student.classId = student.classid;

        await this.dbInstance.collection(this.KEYS.STUDENTS).doc(id).set(student);
        this.invalidateCache(this.KEYS.STUDENTS, id);
    },

    async deleteStudent(id) {
        await this.init();
        const ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.delete();
            this.invalidateCache(this.KEYS.STUDENTS, id);
            return;
        }

        // Fallback 1: lookup by academicId
        const snap = await this.dbInstance.collection(this.KEYS.STUDENTS).where('academicId', '==', id).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await d.ref.delete();
            }
            this.invalidateCache(this.KEYS.STUDENTS, id);
            return;
        }

        // Fallback 2: smart lookup by Arabic name
        const all = await this.getStudents();
        const matched = all.filter(s => s.name && this.matchArabicNames(s.name, id));
        for (const m of matched) {
            await this.dbInstance.collection(this.KEYS.STUDENTS).doc(m.id).delete();
        }
        this.invalidateCache(this.KEYS.STUDENTS);
    },

    async updateStudent(id, updatedData) {
        await this.init();
        if (updatedData.classid && !updatedData.classId) updatedData.classId = updatedData.classid;

        const ref = this.dbInstance.collection(this.KEYS.STUDENTS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.update(updatedData);
            this.invalidateCache(this.KEYS.STUDENTS, id);
            return;
        }

        // Fallback 1: lookup by academicId
        const snap = await this.dbInstance.collection(this.KEYS.STUDENTS).where('academicId', '==', id).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await d.ref.update(updatedData);
            }
            this.invalidateCache(this.KEYS.STUDENTS, id);
            return;
        }

        // Fallback 2: smart lookup by Arabic name
        const all = await this.getStudents();
        const matched = all.filter(s => s.name && this.matchArabicNames(s.name, id));
        for (const m of matched) {
            await this.dbInstance.collection(this.KEYS.STUDENTS).doc(m.id).update(updatedData);
        }
        this.invalidateCache(this.KEYS.STUDENTS);
    },

    async addTeacher(teacher) {
        await this.init();
        const id = teacher.id || (Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7));

        if (teacher.ministryNumber && !teacher.ministryId) teacher.ministryId = teacher.ministryNumber;
        if (!teacher.schoolId) {
            teacher.schoolId = this.getCurrentUserSchoolId();
        }

        await this.dbInstance.collection(this.KEYS.TEACHERS).doc(id).set(teacher);
        this.invalidateCache(this.KEYS.TEACHERS, id);
    },

    async deleteTeacher(id) {
        await this.init();
        const ref = this.dbInstance.collection(this.KEYS.TEACHERS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.delete();
            this.invalidateCache(this.KEYS.TEACHERS, id);
            return;
        }

        // Fallback 1: lookup by ministryId
        const snap = await this.dbInstance.collection(this.KEYS.TEACHERS).where('ministryId', '==', id).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await d.ref.delete();
            }
            this.invalidateCache(this.KEYS.TEACHERS, id);
            return;
        }

        // Fallback 2: smart lookup by Arabic name
        const all = await this.getTeachers();
        const matched = all.filter(t => t.name && this.matchArabicNames(t.name, id));
        for (const m of matched) {
            await this.dbInstance.collection(this.KEYS.TEACHERS).doc(m.id).delete();
        }
        this.invalidateCache(this.KEYS.TEACHERS);
    },

    async updateTeacher(id, updatedData) {
        await this.init();
        if (updatedData.ministryNumber && !updatedData.ministryId) updatedData.ministryId = updatedData.ministryNumber;

        const ref = this.dbInstance.collection(this.KEYS.TEACHERS).doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            await ref.update(updatedData);
            this.invalidateCache(this.KEYS.TEACHERS, id);
            return;
        }

        // Fallback 1: lookup by ministryId
        const snap = await this.dbInstance.collection(this.KEYS.TEACHERS).where('ministryId', '==', id).get();
        if (!snap.empty) {
            for (const d of snap.docs) {
                await d.ref.update(updatedData);
            }
            this.invalidateCache(this.KEYS.TEACHERS, id);
            return;
        }

        // Fallback 2: smart lookup by Arabic name
        const all = await this.getTeachers();
        const matched = all.filter(t => t.name && this.matchArabicNames(t.name, id));
        for (const m of matched) {
            await this.dbInstance.collection(this.KEYS.TEACHERS).doc(m.id).update(updatedData);
        }
        this.invalidateCache(this.KEYS.TEACHERS);
    },

    async addClass(cls) {
        await this.init();
        const id = cls.id || ('c' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
        const normalized = {
            name: cls.name || cls.className || cls.title || 'صف جديد',
            section: cls.section || cls.group || '-',
            schoolId: cls.schoolId || this.getCurrentUserSchoolId()
        };
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).set(normalized);
        this.invalidateCache(this.KEYS.CLASSES, id);
    },

    async deleteClass(id) {
        await this.init();
        const students = await this.getStudents(id);
        for (const s of students) {
            await this.deleteStudent(s.id);
        }
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).delete();
        // Cascade invalidation: classes AND students
        this.invalidateCache(this.KEYS.CLASSES, id, { extraCollections: [this.KEYS.STUDENTS] });
    },

    async updateClass(id, updatedData) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.CLASSES).doc(id).update(updatedData);
        this.invalidateCache(this.KEYS.CLASSES, id);
    },

    async saveSettings(settings) {
        await this.init();
        const schoolId = this.getCurrentUserSchoolId();
        const docId = (schoolId && schoolId !== 'ministry') ? schoolId : 'global';
        await this.dbInstance.collection(this.KEYS.SETTINGS).doc(docId).set(settings, { merge: true });
        this.invalidateCache(this.KEYS.SETTINGS, docId);
    },

    async addSchool(school) {
        await this.init();
        const id = school.id || ('s' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
        school.timestamp = new Date().toISOString();
        await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).set(school);
        this.invalidateCache(this.KEYS.SCHOOLS, id);
        return id;
    },

    async deleteSchool(id) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).delete();
        this.invalidateCache(this.KEYS.SCHOOLS, id);
    },

    async updateSchool(id, data) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.SCHOOLS).doc(id).update(data);
        this.invalidateCache(this.KEYS.SCHOOLS, id);
    },

    async saveScheduleEntry(entry) {
        await this.init();
        const id = entry.id || ('sch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
        if (!entry.schoolId) {
            entry.schoolId = this.getCurrentUserSchoolId();
        }
        await this.dbInstance.collection(this.KEYS.SCHEDULE).doc(id).set(entry);
        this.invalidateCache(this.KEYS.SCHEDULE, id);
        return id;
    },

    async updateScheduleEntry(id, data) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.SCHEDULE).doc(id).update(data);
        this.invalidateCache(this.KEYS.SCHEDULE, id);
    },

    async deleteScheduleEntry(id) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.SCHEDULE).doc(id).delete();
        this.invalidateCache(this.KEYS.SCHEDULE, id);
    },

    async addNotification(notification) {
        await this.init();
        notification.timestamp = notification.timestamp || new Date().toISOString();
        if (!notification.schoolId) {
            notification.schoolId = this.getCurrentUserSchoolId();
        }
        const ref = await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).add(notification);
        this.invalidateCache(this.KEYS.NOTIFICATIONS, ref.id);
        return ref.id;
    },

    async updateNotification(id, data) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).doc(id).update(data);
        this.invalidateCache(this.KEYS.NOTIFICATIONS, id);
    },

    async deleteNotification(id) {
        await this.init();
        await this.dbInstance.collection(this.KEYS.NOTIFICATIONS).doc(id).delete();
        this.invalidateCache(this.KEYS.NOTIFICATIONS, id);
    },

    async insert(table, data, options = {}) {
        if (Array.isArray(data)) {
            if (typeof this.insertBatch === 'function') {
                return await this.insertBatch(table, data, options);
            }
            const ids = [];
            for (const item of data) {
                ids.push(await this.insert(table, item, options));
            }
            return { success: true, count: ids.length, ids };
        }
        if (table === 'students') return await this.addStudent(data);
        if (table === 'teachers') return await this.addTeacher(data);
        if (table === 'classes') return await this.addClass(data);

        await this.init();
        if (!data.schoolId) data.schoolId = this.getCurrentUserSchoolId();
        if (!data.timestamp) data.timestamp = new Date().toISOString();
        if (table === 'records' && !data.date) data.date = new Date().toISOString().split('T')[0];

        const col = this.KEYS[table.toUpperCase()] || table;
        const ref = await this.dbInstance.collection(col).add(data);
        this.invalidateCache(col, ref.id, options);
        return ref.id;
    },

    /**
     * Inserts an array of items in atomic batches (chunked <= 500 items).
     * Normalizes entity fields, assigns unique IDs, and executes a single cache invalidation.
     * @param {string} table
     * @param {Array<Object>} itemsArray
     * @param {Object} [options={}]
     * @returns {Promise<{ success: boolean, count: number, ids: string[] }>}
     */
    async insertBatch(table, itemsArray, options = {}) {
        if (!itemsArray || !Array.isArray(itemsArray) || itemsArray.length === 0) {
            return { success: true, count: 0, ids: [] };
        }

        await this.init();
        const canonicalCol = this.KEYS[table.toUpperCase()] || table;
        const defaultSchoolId = this.getCurrentUserSchoolId();
        const now = new Date().toISOString();

        const normalizedItems = itemsArray.map((rawItem, idx) => {
            const item = { ...rawItem };
            let id = item.id || item.academicId;

            if (table === 'students' || canonicalCol === this.KEYS.STUDENTS) {
                if (!id) {
                    id = (Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 7));
                }
                item.academicId = String(item.academicId || id);
                item.id = item.academicId;
                item.name = item.name || item.studentName || 'طالب مجهول';
                if (item.classid && !item.classId) item.classId = item.classid;
                if (!item.schoolId) item.schoolId = defaultSchoolId;
                if (!item.timestamp) item.timestamp = now;
            } else if (table === 'teachers' || canonicalCol === this.KEYS.TEACHERS) {
                if (!id) {
                    id = (Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 7));
                }
                item.id = String(id);
                if (item.ministryNumber && !item.ministryId) item.ministryId = item.ministryNumber;
                item.name = item.name || item.teacherName || 'معلم جديد';
                if (!item.schoolId) item.schoolId = defaultSchoolId;
                if (!item.timestamp) item.timestamp = now;
            } else if (table === 'classes' || canonicalCol === this.KEYS.CLASSES) {
                if (!id) {
                    id = ('c' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 7));
                }
                item.id = String(id);
                item.name = item.name || item.className || item.title || 'صف جديد';
                item.section = item.section || item.group || '-';
                if (!item.schoolId) item.schoolId = defaultSchoolId;
                if (!item.timestamp) item.timestamp = now;
            } else if (table === 'records' || canonicalCol === this.KEYS.RECORDS) {
                if (!id) {
                    id = ('r' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 7));
                }
                item.id = String(id);
                if (!item.date) item.date = now.split('T')[0];
                if (!item.schoolId) item.schoolId = defaultSchoolId;
                if (!item.timestamp) item.timestamp = now;
            } else {
                if (!id) {
                    id = (Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 7));
                }
                item.id = String(id);
                if (!item.schoolId) item.schoolId = defaultSchoolId;
                if (!item.timestamp) item.timestamp = now;
            }
            return item;
        });

        const CHUNK_SIZE = 500;
        const ids = [];

        for (let i = 0; i < normalizedItems.length; i += CHUNK_SIZE) {
            const chunk = normalizedItems.slice(i, i + CHUNK_SIZE);
            const batch = this.dbInstance.batch();
            for (const item of chunk) {
                const docId = String(item.id || item.academicId);
                ids.push(docId);
                const docRef = this.dbInstance.collection(canonicalCol).doc(docId);
                batch.set(docRef, item);
            }
            await batch.commit();
        }

        const extraCollections = (canonicalCol === this.KEYS.CLASSES || table === 'classes') ? [this.KEYS.STUDENTS] : [];
        this.invalidateCache(canonicalCol, null, { ...options, extraCollections: options.extraCollections || extraCollections });

        return { success: true, count: normalizedItems.length, ids };
    },

    async batchInsert(table, itemsArray, options = {}) {
        return await this.insertBatch(table, itemsArray, options);
    },

    /**
     * Updates an array of items in atomic batches (chunked <= 500 items).
     * @param {string} table
     * @param {Array<Object>} updatesArray - Array of { id, data } or { id, ...fields }
     * @param {Object} [options={}]
     * @returns {Promise<{ success: boolean, count: number }>}
     */
    async batchUpdate(table, updatesArray, options = {}) {
        if (!updatesArray || !Array.isArray(updatesArray) || updatesArray.length === 0) {
            return { success: true, count: 0 };
        }

        await this.init();
        const canonicalCol = this.KEYS[table.toUpperCase()] || table;
        const CHUNK_SIZE = 500;

        for (let i = 0; i < updatesArray.length; i += CHUNK_SIZE) {
            const chunk = updatesArray.slice(i, i + CHUNK_SIZE);
            const batch = this.dbInstance.batch();
            for (const u of chunk) {
                const docId = String(u.id || u.academicId);
                const docData = u.data || u;
                const updatePayload = { ...docData };
                delete updatePayload.id;

                const docRef = this.dbInstance.collection(canonicalCol).doc(docId);
                if (typeof batch.update === 'function') {
                    batch.update(docRef, updatePayload);
                } else if (typeof batch.set === 'function') {
                    batch.set(docRef, updatePayload, { merge: true });
                } else {
                    await docRef.update(updatePayload);
                }
            }
            await batch.commit();
        }

        this.invalidateCache(canonicalCol, null, options);
        return { success: true, count: updatesArray.length };
    },

    /**
     * Deletes an array of items in atomic batches (chunked <= 500 items).
     * @param {string} table
     * @param {Array<string|Object>} idsArray
     * @param {Object} [options={}]
     * @returns {Promise<{ success: boolean, count: number }>}
     */
    async batchDelete(table, idsArray, options = {}) {
        if (!idsArray || !Array.isArray(idsArray) || idsArray.length === 0) {
            return { success: true, count: 0 };
        }

        await this.init();
        const canonicalCol = this.KEYS[table.toUpperCase()] || table;
        const CHUNK_SIZE = 500;

        for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
            const chunk = idsArray.slice(i, i + CHUNK_SIZE);
            const batch = this.dbInstance.batch();
            for (const rawId of chunk) {
                const docId = String(typeof rawId === 'object' ? (rawId.id || rawId.academicId) : rawId);
                const docRef = this.dbInstance.collection(canonicalCol).doc(docId);
                if (typeof batch.delete === 'function') {
                    batch.delete(docRef);
                } else {
                    await docRef.delete();
                }
            }
            await batch.commit();
        }

        const extraCollections = (canonicalCol === this.KEYS.CLASSES || table === 'classes') ? [this.KEYS.STUDENTS] : [];
        this.invalidateCache(canonicalCol, null, { ...options, extraCollections: options.extraCollections || extraCollections });
        return { success: true, count: idsArray.length };
    },

    async update(table, id, data) {
        if (table === 'students') return await this.updateStudent(id, data);
        if (table === 'teachers') return await this.updateTeacher(id, data);
        if (table === 'classes') return await this.updateClass(id, data);

        await this.init();
        const col = this.KEYS[table.toUpperCase()] || table;
        const res = await this.dbInstance.collection(col).doc(id).update(data);
        this.invalidateCache(col, id);
        return res;
    },

    async delete(table, id) {
        if (table === 'students') return await this.deleteStudent(id);
        if (table === 'teachers') return await this.deleteTeacher(id);
        if (table === 'classes') return await this.deleteClass(id);
        if (table === 'records') return await this.deleteRecord(id);
        if (table === 'notifications') return await this.deleteNotification(id);

        await this.init();
        const col = this.KEYS[table.toUpperCase()] || table;
        const res = await this.dbInstance.collection(col).doc(id).delete();
        this.invalidateCache(col, id);
        return res;
    },

    // ==========================================
    // 7. Manual Cache Eviction & Telemetry API
    // ==========================================

    /**
     * Public API to invalidate cache locally and broadcast to other open tabs.
     * @param {string|null} [collectionName=null]
     * @param {string|Object|null} [docId=null]
     * @param {Object} [options={}]
     * @returns {number} Count of evicted cache entries
     */
    invalidateCache(collectionName = null, docId = null, options = {}) {
        let opts = options;
        let documentId = docId;

        if (docId && typeof docId === 'object' && !Array.isArray(docId)) {
            opts = docId;
            documentId = null;
        }

        const schoolId = (opts && opts.schoolId) || this.getCurrentUserSchoolId() || null;
        const extraCollections = (opts && opts.extraCollections) || [];
        const broadcast = opts ? opts.broadcast !== false : true;

        const canonicalCol = collectionName ? (this.KEYS[String(collectionName).toUpperCase()] || collectionName) : null;

        // 1. Purge locally
        const evictedCount = this._purgeL1Local(canonicalCol, schoolId, documentId);
        for (const col of extraCollections) {
            const canonicalExtra = this.KEYS[String(col).toUpperCase()] || col;
            this._purgeL1Local(canonicalExtra, schoolId);
        }

        // 2. Broadcast to other tabs
        if (broadcast) {
            const payload = {
                type: 'INVALIDATE',
                collection: canonicalCol,
                docId: documentId,
                schoolId: schoolId,
                extraCollections: extraCollections.map(c => this.KEYS[String(c).toUpperCase()] || c),
                senderTabId: this._tabId,
                timestamp: Date.now()
            };

            this._stats.broadcastsSent++;

            try {
                if (this._broadcastChannel && typeof this._broadcastChannel.postMessage === 'function') {
                    this._broadcastChannel.postMessage(payload);
                }
            } catch (_) {}

            try {
                if (typeof localStorage !== 'undefined' && localStorage.setItem) {
                    localStorage.setItem('__hodoori_cache_inval__', JSON.stringify(payload));
                }
            } catch (_) {}
        }

        return evictedCount;
    },

    /**
     * Clears all in-memory caches and active in-flight query promises.
     * @param {Object} [options={}]
     * @returns {boolean}
     */
    clearAllCaches(options = {}) {
        const broadcast = options && options.broadcast !== false;
        this._l1Cache.clear();
        this._inflightQueries.clear();
        this._syncMetaCache.clear();

        if (broadcast) {
            const payload = {
                type: 'CLEAR_ALL',
                senderTabId: this._tabId,
                timestamp: Date.now()
            };

            this._stats.broadcastsSent++;

            try {
                if (this._broadcastChannel && typeof this._broadcastChannel.postMessage === 'function') {
                    this._broadcastChannel.postMessage(payload);
                }
            } catch (_) {}

            try {
                if (typeof localStorage !== 'undefined' && localStorage.setItem) {
                    localStorage.setItem('__hodoori_cache_inval__', JSON.stringify(payload));
                }
            } catch (_) {}
        }

        return true;
    },

    /**
     * Returns detailed cache observability and hit ratio statistics.
     * @returns {Object}
     */
    getCacheStats() {
        const now = Date.now();
        const entries = [];
        for (const [key, entry] of this._l1Cache.entries()) {
            entries.push({
                key: key,
                collection: entry.collection,
                schoolId: entry.schoolId,
                ageMs: now - entry.cachedAt,
                remainingTtlMs: Math.max(0, entry.expiresAt - now),
                isExpired: now > entry.expiresAt,
                hits: entry.hits,
                itemCount: Array.isArray(entry.data) ? entry.data.length : 1
            });
        }

        const totalRequests = this._stats.hits + this._stats.misses;
        const hitRatio = totalRequests > 0 ? ((this._stats.hits / totalRequests) * 100).toFixed(1) + '%' : '0.0%';

        return {
            tabId: this._tabId,
            totalEntries: this._l1Cache.size,
            hitRatio: hitRatio,
            hits: this._stats.hits,
            misses: this._stats.misses,
            expirations: this._stats.expirations,
            invalidations: this._stats.invalidations,
            broadcastsSent: this._stats.broadcastsSent,
            broadcastsReceived: this._stats.broadcastsReceived,
            entries: entries
        };
    },

    // ==========================================
    // 8. Arabic Search & Matching Helpers (Verbatim Preserved)
    // ==========================================

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

    /**
     * Complete Security Lockdown & Memory Purge on Logout
     * Wipes L1 caches, inflight queries, metadata, active listeners, and destroys session encryption keys.
     */
    async lockAndPurge() {
        console.log("🔒 Hodoori Security: Executing full database lockdown and memory purge...");
        
        // 1. Flush in-memory L1 cache and inflight promises
        this._l1Cache.clear();
        this._inflightQueries.clear();
        this._syncMetaCache.clear();

        // 2. Destroy cryptographic session key
        if (typeof CryptoEngine !== 'undefined' && CryptoEngine.destroySessionKey) {
            CryptoEngine.destroySessionKey();
        }

        // 3. Teardown all page lifecycle intervals and listeners
        if (typeof PageLifecycle !== 'undefined' && PageLifecycle.cleanupAll) {
            PageLifecycle.cleanupAll();
        }

        // 4. Notify all other open tabs to lockdown immediately
        if (this._broadcastChannel) {
            try {
                this._broadcastChannel.postMessage({
                    type: 'GLOBAL_SECURITY_LOCKDOWN',
                    senderTabId: this._tabId,
                    timestamp: Date.now()
                });
            } catch (_) {}
        }
    }
};

/**
 * Universal Page Visibility & Resource Lifecycle Manager
 * Handles tab visibility states, interval pausing, and listener unsubscriptions.
 */
const PageLifecycle = {
    _intervals: new Map(),     // id -> { id, callback, ms, runOnResume, timerId, lastRun }
    _listeners: new Set(),     // Set<Function> (unsubscribe functions)
    isPageVisible: typeof document !== 'undefined' ? !document.hidden : true,
    _initialized: false,

    init() {
        if (this._initialized) return;
        this._initialized = true;
        this.isPageVisible = typeof document !== 'undefined' ? !document.hidden : true;

        // 1. Visibility Change Listener
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', () => {
                const wasHidden = !this.isPageVisible;
                this.isPageVisible = !document.hidden;

                if (document.hidden) {
                    this.pauseAll();
                } else if (wasHidden) {
                    this.resumeAll();
                }
            });
        }

        // 2. Teardown on Page Navigation / Unload
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            const cleanup = () => this.cleanupAll();
            window.addEventListener('beforeunload', cleanup);
            window.addEventListener('pagehide', cleanup);
        }
    },

    /**
     * Registers a recurring interval with visibility pausing.
     * @param {string} id - Unique identifier for the interval
     * @param {Function} callback - Function to execute
     * @param {number} ms - Frequency in milliseconds
     * @param {boolean} [runOnResume=false] - Whether to execute callback immediately when tab becomes visible
     * @returns {Object} Interval descriptor
     */
    registerInterval(id, callback, ms, runOnResume = false) {
        this.init();
        if (this._intervals.has(id)) {
            this.clearInterval(id);
        }

        const descriptor = {
            id,
            callback,
            ms,
            runOnResume,
            timerId: null,
            lastRun: Date.now()
        };

        this._intervals.set(id, descriptor);

        if (this.isPageVisible) {
            descriptor.timerId = setInterval(async () => {
                descriptor.lastRun = Date.now();
                try {
                    await callback();
                } catch (err) {
                    console.error(`[Lifecycle] Error in interval '${id}':`, err);
                }
            }, ms);
        }
        return descriptor;
    },

    clearInterval(id) {
        if (this._intervals.has(id)) {
            const descriptor = this._intervals.get(id);
            if (descriptor.timerId) {
                clearInterval(descriptor.timerId);
                descriptor.timerId = null;
            }
            this._intervals.delete(id);
        }
    },

    /**
     * Registers an unsubscribe function for a realtime listener.
     * @param {Function} unsubscribeFn
     * @returns {Function} Wrapped disposer function
     */
    registerListener(unsubscribeFn) {
        if (typeof unsubscribeFn !== 'function') return () => {};
        this.init();
        this._listeners.add(unsubscribeFn);
        return () => {
            try { unsubscribeFn(); } catch (_) {}
            this._listeners.delete(unsubscribeFn);
        };
    },

    pauseAll() {
        this._intervals.forEach(desc => {
            if (desc.timerId) {
                clearInterval(desc.timerId);
                desc.timerId = null;
            }
        });
    },

    resumeAll() {
        const now = Date.now();
        this._intervals.forEach(desc => {
            if (!desc.timerId) {
                const elapsed = now - (desc.lastRun || 0);
                if (desc.runOnResume || elapsed >= desc.ms) {
                    desc.lastRun = now;
                    try {
                        desc.callback();
                    } catch (err) {
                        console.error(`[Lifecycle] Error in resume callback '${desc.id}':`, err);
                    }
                }
                desc.timerId = setInterval(async () => {
                    desc.lastRun = Date.now();
                    try {
                        await desc.callback();
                    } catch (err) {
                        console.error(`[Lifecycle] Error in interval '${desc.id}':`, err);
                    }
                }, desc.ms);
            }
        });
    },

    cleanupAll() {
        this.pauseAll();
        this._intervals.clear();
        this._listeners.forEach(unsub => {
            try {
                if (typeof unsub === 'function') unsub();
            } catch (_) {}
        });
        this._listeners.clear();
    }
};

DB.PageLifecycle = PageLifecycle;

if (typeof window !== 'undefined') {
    window.DB = DB;
    window.PageLifecycle = PageLifecycle;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => PageLifecycle.init());
        } else {
            PageLifecycle.init();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DB;
    module.exports.DB = DB;
    module.exports.PageLifecycle = PageLifecycle;
}
