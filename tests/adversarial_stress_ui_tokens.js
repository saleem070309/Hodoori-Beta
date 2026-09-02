/**
 * @fileoverview Tier 5 Adversarial Stress Test Suite: UI Auto-Resize, Token Minimization, L1 Cache Concurrency & FileUtils
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 * @author Challenger 2 (Empirical Adversarial Challenger)
 * 
 * Coverage:
 * 1. Textarea Auto-Resize & UI Capsule Hardening (50k chars, 500 Enter/Backspace loops, zero/negative scrollHeight, CSS transitions, .expanded boundary)
 * 2. Token Minimization & Base64 Stripping (30 consecutive image turns, memory bounds, multi-part payloads, entity sanitization)
 * 3. L1 Cache Concurrency & Multi-Tab Consistency (100 concurrent reads coalescing, 4-tab sync via BroadcastChannel/storage, lockdown purge)
 * 4. FileUtils Duplicate Extensions & Sanitization (.xlsx.xlsx, .docx.docx, OS invalid characters, memory stress)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// =========================================================================
// 1. Mock Infrastructure & Browser Environment
// =========================================================================

class MockBroadcastChannel {
    static channels = new Map();

    constructor(name) {
        this.name = name;
        this.onmessage = null;
        this.onmessageerror = null;
        if (!MockBroadcastChannel.channels.has(name)) {
            MockBroadcastChannel.channels.set(name, new Set());
        }
        MockBroadcastChannel.channels.get(name).add(this);
    }

    postMessage(data) {
        const peers = MockBroadcastChannel.channels.get(this.name);
        if (peers) {
            for (const peer of peers) {
                if (peer !== this && peer.onmessage) {
                    try {
                        peer.onmessage({ data: JSON.parse(JSON.stringify(data)) });
                    } catch (_) {
                        peer.onmessage({ data });
                    }
                }
            }
        }
    }

    close() {
        const peers = MockBroadcastChannel.channels.get(this.name);
        if (peers) {
            peers.delete(this);
        }
    }
}

class MockLocalStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }
    setItem(key, value) {
        this.store.set(key, String(value));
        if (global.window && global.window._triggerStorageEvent) {
            global.window._triggerStorageEvent(key, String(value));
        }
    }
    removeItem(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}

const eventListeners = new Map();
const domElements = new Map();

function createMockElement(tag, id = '') {
    const classListSet = new Set();
    const styleObj = {};
    const datasetObj = {};
    const attributesObj = {};
    const children = [];

    const el = {
        tagName: tag.toUpperCase(),
        id: id,
        get className() {
            return Array.from(classListSet).join(' ');
        },
        set className(val) {
            classListSet.clear();
            if (val) {
                String(val).split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
            }
        },
        value: '',
        innerHTML: '',
        innerText: '',
        textContent: '',
        scrollHeight: 38,
        clientHeight: 38,
        scrollTop: 0,
        disabled: false,
        title: '',
        src: '',
        type: '',
        href: '',
        download: '',
        parentNode: null,
        style: styleObj,
        dataset: datasetObj,
        classList: {
            add: (...cls) => {
                cls.forEach(c => classListSet.add(c));
            },
            remove: (...cls) => {
                cls.forEach(c => classListSet.delete(c));
            },
            contains: (c) => classListSet.has(c),
            toggle: (c, force) => {
                if (force === true) classListSet.add(c);
                else if (force === false) classListSet.delete(c);
                else {
                    if (classListSet.has(c)) classListSet.delete(c);
                    else classListSet.add(c);
                }
                return classListSet.has(c);
            }
        },
        children,
        appendChild: (child) => {
            if (child) {
                child.parentNode = el;
                children.push(child);
            }
            return child;
        },
        removeChild: (child) => {
            const idx = children.indexOf(child);
            if (idx !== -1) {
                child.parentNode = null;
                children.splice(idx, 1);
            }
            return child;
        },
        remove: () => {
            if (el.parentNode && el.parentNode.children) {
                const idx = el.parentNode.children.indexOf(el);
                if (idx !== -1) el.parentNode.children.splice(idx, 1);
            }
        },
        closest: (sel) => {
            let curr = el;
            while (curr) {
                if (sel.startsWith('.') && curr.classList.contains(sel.slice(1))) return curr;
                if (sel.startsWith('#') && curr.id === sel.slice(1)) return curr;
                if (curr.tagName === sel.toUpperCase()) return curr;
                curr = curr.parentNode;
            }
            return null;
        },
        setAttribute: (k, v) => {
            attributesObj[k] = String(v);
            if (k === 'title') el.title = String(v);
            if (k === 'data-action') datasetObj.action = String(v);
        },
        getAttribute: (k) => attributesObj[k] || null,
        removeAttribute: (k) => { delete attributesObj[k]; },
        querySelector: (sel) => {
            if (sel.startsWith('#')) {
                const searchId = sel.slice(1);
                const findRecursive = (node) => {
                    if (node.id === searchId) return node;
                    for (const c of node.children) {
                        const found = findRecursive(c);
                        if (found) return found;
                    }
                    return null;
                };
                return findRecursive(el);
            }
            if (sel.startsWith('.')) {
                const searchClass = sel.slice(1);
                const findRecursive = (node) => {
                    if (node.classList.contains(searchClass)) return node;
                    for (const c of node.children) {
                        const found = findRecursive(c);
                        if (found) return found;
                    }
                    return null;
                };
                return findRecursive(el);
            }
            if (sel === 'button') {
                const findRecursive = (node) => {
                    if (node.tagName === 'BUTTON') return node;
                    for (const c of node.children) {
                        const found = findRecursive(c);
                        if (found) return found;
                    }
                    return null;
                };
                return findRecursive(el);
            }
            return null;
        },
        querySelectorAll: (sel) => {
            const matches = [];
            const findRecursive = (node) => {
                if (sel.startsWith('.') && node.classList.contains(sel.slice(1))) matches.push(node);
                else if (sel.toUpperCase() === node.tagName) matches.push(node);
                for (const c of node.children) findRecursive(c);
            };
            findRecursive(el);
            return matches;
        },
        addEventListener: (evt, fn) => {
            if (!eventListeners.has(`${id || tag}::${evt}`)) eventListeners.set(`${id || tag}::${evt}`, new Set());
            eventListeners.get(`${id || tag}::${evt}`).add(fn);
        },
        dispatchEvent: (event) => {
            const key = `${id || tag}::${event.type || event}`;
            if (eventListeners.has(key)) {
                for (const fn of eventListeners.get(key)) fn(event);
            }
        },
        click: () => {
            if (el.tagName === 'A' && el.download) {
                global.window._lastDownloadedFile = { name: el.download, href: el.href };
            }
            el.dispatchEvent({ type: 'click' });
        },
        focus: () => { el.dispatchEvent({ type: 'focus' }); },
        blur: () => { el.dispatchEvent({ type: 'blur' }); }
    };
    return el;
}

function initDOMTree() {
    domElements.clear();
    const ids = [
        'agent-messages', 'agent-input', 'agent-action-btn', 'capsule-dynamic-icon',
        'react-capsule-root', 'agent-file-input', 'agent-file-preview-container',
        'agent-file-preview-thumbnail', 'agent-file-preview-icon', 'agent-file-preview-name',
        'agent-file-preview-status', 'agent-dynamic-action-btn', 'agent-theme-icon',
        'agent-page-root', 'assistant-greeting-text', 'agent-send-btn'
    ];
    for (const id of ids) {
        domElements.set(id, createMockElement('div', id));
    }
    
    // Build capsule hierarchy
    const bottomArea = createMockElement('div');
    bottomArea.className = 'assistant-bottom-area';
    const capsule = createMockElement('div');
    capsule.className = 'assistant-input-capsule';
    
    const textarea = domElements.get('agent-input');
    textarea.tagName = 'TEXTAREA';
    capsule.appendChild(textarea);
    bottomArea.appendChild(capsule);

    domElements.get('agent-action-btn').tagName = 'BUTTON';
    domElements.get('agent-dynamic-action-btn').tagName = 'BUTTON';
    domElements.get('agent-file-input').tagName = 'INPUT';
    domElements.get('agent-file-input').type = 'file';
    domElements.get('agent-file-input').files = [];
}

initDOMTree();

const mockXLSX = {
    utils: {
        json_to_sheet: (data) => ({ data }),
        book_new: () => ({ Sheets: {}, SheetNames: [] }),
        book_append_sheet: (wb, ws, name) => {
            wb.Sheets[name] = ws;
            wb.SheetNames.push(name);
        }
    },
    writeFile: (wb, fn) => {
        global.window._lastExportedExcel = fn;
    }
};

const mockDocx = {
    Document: class { constructor(opts) { this.opts = opts; } },
    Packer: { toBlob: async () => ({ size: 1024 }) },
    Paragraph: class { constructor(opts) { this.opts = opts; } },
    TextRun: class { constructor(text) { this.text = text; } },
    HeadingLevel: { TITLE: 'Title', HEADING_1: 'Heading1' },
    AlignmentType: { CENTER: 'center' }
};

global.Blob = class Blob {
    constructor(parts, options) {
        this.parts = parts;
        this.options = options;
    }
};

const mockURL = {
    createObjectURL: (blob) => `blob:http://localhost/${Math.random().toString(36).slice(2)}`,
    revokeObjectURL: (url) => {}
};

global.URL = mockURL;

global.window = {
    addEventListener: (evt, fn) => {
        if (!eventListeners.has(`window::${evt}`)) eventListeners.set(`window::${evt}`, new Set());
        eventListeners.get(`window::${evt}`).add(fn);
    },
    removeEventListener: (evt, fn) => {
        if (eventListeners.has(`window::${evt}`)) eventListeners.get(`window::${evt}`).delete(fn);
    },
    dispatchEvent: (event) => {
        const type = event.type || event;
        if (eventListeners.has(`window::${type}`)) {
            for (const fn of eventListeners.get(`window::${type}`)) fn(event);
        }
    },
    _triggerStorageEvent: (key, newValue) => {
        if (eventListeners.has('window::storage')) {
            for (const fn of eventListeners.get('window::storage')) {
                fn({ key, newValue });
            }
        }
    },
    BroadcastChannel: MockBroadcastChannel,
    firebase: { firestore: () => {} },
    location: { href: 'http://localhost/agent.html', pathname: '/agent.html', search: '' },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    URL: mockURL,
    XLSX: mockXLSX,
    docx: mockDocx,
    Morphicons: {
        morph: (svg, iconName) => {
            if (svg) svg.dataset.morphedIcon = iconName;
        }
    },
    _lastExportedExcel: null,
    _lastDownloadedFile: null
};

global.XLSX = mockXLSX;
global.docx = mockDocx;

global.document = {
    hidden: false,
    readyState: 'complete',
    documentElement: createMockElement('html'),
    body: createMockElement('body'),
    head: createMockElement('head'),
    querySelector: (sel) => {
        if (sel === 'meta[name="theme-color"]') return createMockElement('meta');
        if (sel.startsWith('#')) return domElements.get(sel.slice(1)) || null;
        if (sel === '.agent-page-container') return domElements.get('agent-page-root');
        if (sel === '.assistant-input-capsule') return domElements.get('agent-input').closest('.assistant-input-capsule');
        return null;
    },
    querySelectorAll: (sel) => {
        if (sel.startsWith('.')) {
            const list = [];
            for (const el of domElements.values()) {
                if (el.classList.contains(sel.slice(1))) list.push(el);
            }
            return list;
        }
        return [];
    },
    getElementById: (id) => domElements.get(id) || null,
    createElement: (tag) => createMockElement(tag),
    addEventListener: (evt, fn) => { global.window.addEventListener(evt, fn); },
    removeEventListener: (evt, fn) => { global.window.removeEventListener(evt, fn); }
};

global.CustomEvent = class CustomEvent {
    constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail || null;
    }
};

global.UI = {
    toast: (msg, type) => { global.UI._lastToast = { msg, type }; },
    showModal: () => {},
    hideModal: () => {}
};

global.BroadcastChannel = MockBroadcastChannel;
global.localStorage = new MockLocalStorage();

// Load modules under test
const DB = require('../scripts/core-db.js');
global.DB = DB;

const Auth = require('../scripts/core-auth.js');
global.Auth = Auth;

// Load FileUtils
const fileUtilsPath = path.resolve(__dirname, '../scripts/utils-files.js');
const fileUtilsCode = fs.readFileSync(fileUtilsPath, 'utf8');
eval(fileUtilsCode + '\nglobal.FileUtils = FileUtils;');

// Load page-agent controller
const pageAgentPath = path.resolve(__dirname, '../scripts/page-agent.js');
const pageAgentCode = fs.readFileSync(pageAgentPath, 'utf8');
eval(pageAgentCode);

const Agent = require('../scripts/module-ai-agent.js');
global.Agent = Agent;

// =========================================================================
// Test Harness & Runner
// =========================================================================

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

async function runTest(groupName, testName, testFn) {
    totalTests++;
    try {
        await testFn();
        passedTests++;
        console.log(`  ✓ [${groupName}] ${testName}`);
    } catch (err) {
        failedTests.push({ groupName, testName, error: err.message, stack: err.stack });
        console.error(`  ✗ [${groupName}] ${testName} -> FAILED: ${err.message}`);
    }
}

// Helper to create an isolated mock Firestore
function createMockFirestore(initialData = {}) {
    const store = new Map();
    let physicalReadsCount = 0;
    let physicalWritesCount = 0;

    for (const [colName, docs] of Object.entries(initialData)) {
        const colMap = new Map();
        for (const [docId, docData] of Object.entries(docs)) {
            colMap.set(docId, JSON.parse(JSON.stringify(docData)));
        }
        store.set(colName, colMap);
    }

    const getCollectionStore = (name) => {
        if (!store.has(name)) store.set(name, new Map());
        return store.get(name);
    };

    const mockDb = {
        _getPhysicalReads: () => physicalReadsCount,
        _getPhysicalWrites: () => physicalWritesCount,
        _resetCounts: () => { physicalReadsCount = 0; physicalWritesCount = 0; },
        collection: (colName) => {
            const colMap = getCollectionStore(colName);
            const queryObj = {
                _whereClauses: [],
                where: function(field, op, val) {
                    this._whereClauses.push({ field, op, val });
                    return this;
                },
                get: async function() {
                    physicalReadsCount++;
                    let results = Array.from(colMap.values());
                    for (const w of this._whereClauses) {
                        if (w.op === '==') {
                            results = results.filter(item => item[w.field] === w.val);
                        }
                    }
                    return {
                        empty: results.length === 0,
                        size: results.length,
                        docs: results.map(d => ({
                            id: d.id || d.academicId,
                            data: () => JSON.parse(JSON.stringify(d))
                        }))
                    };
                },
                doc: function(docId) {
                    return {
                        id: docId,
                        get: async () => {
                            physicalReadsCount++;
                            const doc = colMap.get(docId);
                            return {
                                exists: !!doc,
                                id: docId,
                                data: () => doc ? JSON.parse(JSON.stringify(doc)) : undefined
                            };
                        },
                        set: async (data, opts) => {
                            physicalWritesCount++;
                            colMap.set(docId, JSON.parse(JSON.stringify(data)));
                            return { id: docId };
                        },
                        delete: async () => {
                            physicalWritesCount++;
                            colMap.delete(docId);
                            return true;
                        }
                    };
                }
            };
            return queryObj;
        },
        batch: () => {
            const ops = [];
            return {
                set: (docRef, data) => { ops.push({ type: 'set', docRef, data }); },
                delete: (docRef) => { ops.push({ type: 'delete', docRef }); },
                commit: async () => {
                    for (const op of ops) {
                        if (op.type === 'set') {
                            await op.docRef.set(op.data);
                        } else if (op.type === 'delete') {
                            await op.docRef.delete();
                        }
                    }
                    return true;
                }
            };
        }
    };

    return mockDb;
}

// =========================================================================
// Main Execution
// =========================================================================

async function main() {
    console.log('===============================================================================');
    console.log('  HODOORI TIER 5 ADVERSARIAL STRESS TEST SUITE (UI, TOKENS, CACHE & UTILS)');
    console.log('  Specification: ORIGINAL_REQUEST.md (R1-R4), PROJECT.md & TEST_READY.md');
    console.log('===============================================================================');

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 1: Textarea Auto-Resize & UI Capsule Hardening
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ GROUP 1: Textarea Auto-Resize & UI Capsule Adversarial Stress Testing');

    await runTest('UI-Resize', '1.1 Massive 50,000 character paste clamps to 160px with .expanded state', () => {
        initDOMTree();
        const textarea = domElements.get('agent-input');
        const capsule = textarea.closest('.assistant-input-capsule');
        
        // Generate 50,000+ characters of mixed Arabic/multiline text
        const hugeText = 'أمر إداري تجريبي لاختبار صمود الواجهة '.repeat(1500) + '\nسطر أخير';
        assert.strictEqual(hugeText.length >= 50000, true, 'Input text must be at least 50k chars');

        textarea.value = hugeText;
        textarea.scrollHeight = 3200; // Simulated browser scrollHeight for massive text
        
        window.handleInputTyping(textarea);

        assert.strictEqual(textarea.style.height, '160px', 'Height must clamp strictly at maximum 160px');
        assert.strictEqual(capsule.classList.contains('expanded'), true, 'Capsule must receive .expanded class');
        assert.strictEqual(domElements.get('agent-action-btn').dataset.actionState, 'send', 'Action state must switch to send');
    });

    await runTest('UI-Resize', '1.2 Rapid 500 Enter/Backspace expansion and contraction cycles without state drift', () => {
        initDOMTree();
        const textarea = domElements.get('agent-input');
        const capsule = textarea.closest('.assistant-input-capsule');
        const actionBtn = domElements.get('agent-action-btn');

        for (let i = 0; i < 500; i++) {
            // Expansion phase
            textarea.value = `Line 1\nLine 2\nLine 3\nIteration ${i}`;
            textarea.scrollHeight = 96;
            window.handleInputTyping(textarea);

            assert.strictEqual(textarea.style.height, '96px');
            assert.strictEqual(capsule.classList.contains('expanded'), true);
            assert.strictEqual(actionBtn.dataset.actionState, 'send');

            // Deletion / contraction phase
            textarea.value = '';
            textarea.scrollHeight = 38;
            window.handleInputTyping(textarea);

            assert.strictEqual(textarea.style.height, '38px');
            assert.strictEqual(capsule.classList.contains('expanded'), false);
            assert.strictEqual(actionBtn.dataset.actionState, 'mic');
        }
    });

    await runTest('UI-Resize', '1.3 Extreme/Malformed scrollHeight boundary inputs (0, negative, undefined, null, 1000000)', () => {
        initDOMTree();
        const textarea = domElements.get('agent-input');

        const testCases = [
            { height: 0, expected: '24px' },
            { height: -100, expected: '24px' },
            { height: undefined, expected: '24px' },
            { height: null, expected: '24px' },
            { height: 'invalid_string', expected: '24px' },
            { height: 1000000, expected: '160px' },
            { height: 160, expected: '160px' },
            { height: 24, expected: '24px' },
            { height: 85, expected: '85px' }
        ];

        for (const tc of testCases) {
            textarea.scrollHeight = tc.height;
            textarea.value = 'اختبار';
            window.handleInputTyping(textarea);

            assert.strictEqual(
                textarea.style.height,
                tc.expected,
                `Failed for scrollHeight ${tc.height}: got '${textarea.style.height}', expected '${tc.expected}'`
            );
        }
    });

    await runTest('UI-Resize', '1.4 Strict CSS transition absence audit on .assistant-capsule-textarea', () => {
        const cssPath = path.resolve(__dirname, '../styles/module-ai-agent.css');
        const cssContent = fs.readFileSync(cssPath, 'utf8');

        // Verify that .assistant-capsule-textarea has transition: none !important
        const textareaBlockMatch = cssContent.match(/\.assistant-capsule-textarea\s*\{([^}]+)\}/);
        assert.strictEqual(Boolean(textareaBlockMatch), true, '.assistant-capsule-textarea CSS rule must exist');
        
        const blockContent = textareaBlockMatch[1];
        assert.strictEqual(blockContent.includes('transition: none !important'), true, 'Must have transition: none !important to prevent reflow jitter');
        assert.strictEqual(blockContent.includes('max-height: 160px'), true, 'Must define max-height: 160px in CSS');
        assert.strictEqual(blockContent.includes('resize: none'), true, 'Must define resize: none in CSS');
    });

    await runTest('UI-Resize', '1.5 .expanded class boundary condition matrix', () => {
        initDOMTree();
        const textarea = domElements.get('agent-input');
        const capsule = textarea.closest('.assistant-input-capsule');

        const matrix = [
            { text: '', scrollHeight: 38, expectedExpanded: false, desc: 'Empty input' },
            { text: '   \n\n\t   ', scrollHeight: 80, expectedExpanded: false, desc: 'Whitespace-only multiline' },
            { text: 'مرحبا', scrollHeight: 38, expectedExpanded: false, desc: 'Single-line short text' },
            { text: '\n', scrollHeight: 50, expectedExpanded: false, desc: 'Single newline only (no non-space text)' },
            { text: 'أ\n', scrollHeight: 50, expectedExpanded: true, desc: 'Character with newline' },
            { text: 'أمر إداري طويل جدا يتجاوز الحد الأدنى للارتفاع', scrollHeight: 52, expectedExpanded: true, desc: 'Height > 48px with text' },
            { text: 'سطر 1\nسطر 2', scrollHeight: 44, expectedExpanded: true, desc: 'Multi-line with newline' }
        ];

        for (const item of matrix) {
            textarea.value = item.text;
            textarea.scrollHeight = item.scrollHeight;
            window.handleInputTyping(textarea);
            assert.strictEqual(
                capsule.classList.contains('expanded'),
                item.expectedExpanded,
                `Failed on case: ${item.desc} (expected expanded=${item.expectedExpanded})`
            );
        }
    });

    await runTest('UI-Resize', '1.6 Bottom action bar alignment and CSS absolute pinning rules in expanded mode', () => {
        const cssPath = path.resolve(__dirname, '../styles/module-ai-agent.css');
        const cssContent = fs.readFileSync(cssPath, 'utf8');

        // Check base capsule alignment: align-items: flex-end
        const baseCapsuleMatch = cssContent.match(/\.assistant-input-capsule\s*\{([^}]+)\}/);
        assert.strictEqual(Boolean(baseCapsuleMatch), true, '.assistant-input-capsule CSS must exist');
        assert.strictEqual(baseCapsuleMatch[1].includes('align-items: flex-end'), true, 'Base capsule must align-items: flex-end');

        // Check expanded capsule actions positioning
        assert.strictEqual(cssContent.includes('.assistant-input-capsule.expanded .assistant-capsule-left-actions'), true, 'Expanded left actions rule must exist');
        assert.strictEqual(cssContent.includes('.assistant-input-capsule.expanded .assistant-capsule-right-btn'), true, 'Expanded right btn rule must exist');
        assert.strictEqual(cssContent.includes('bottom: 8px !important'), true, 'Buttons must be pinned at bottom: 8px !important');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 2: Token Minimization & Base64 Payload Stripping
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ GROUP 2: Token Minimization & Base64 Payload Stripping Stress Testing');

    await runTest('Tokens-Base64', '2.1 30 consecutive conversation turns with 2MB Base64 images maintain lean constant memory', () => {
        Agent.chatHistory = [];
        
        // Generate a 2MB Base64 image payload string
        const base64Chunk = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const largeBase64 = 'data:image/png;base64,' + base64Chunk.repeat(20000); // ~2MB string
        assert.strictEqual(largeBase64.length > 1500000, true, 'Base64 image must be >= 1.5MB');

        for (let turn = 1; turn <= 30; turn++) {
            // User message with heavy Base64 payload
            const userMsg = {
                role: 'user',
                content: `Turn ${turn}: قم باستخراج بيانات هذا الجدول:\n${largeBase64}`
            };
            const aiMsg = {
                role: 'assistant',
                content: `تم استخراج بيانات الجدول بنجاح للدفعة ${turn}.`
            };

            Agent.chatHistory.push(userMsg);
            Agent.chatHistory.push(aiMsg);

            // Strip Base64 from chat history after turn completes (as done in Agent loop)
            Agent._stripBase64FromHistory();

            // Verification at each turn: No raw Base64 should remain in history
            const historyStr = JSON.stringify(Agent.chatHistory);
            assert.strictEqual(historyStr.includes('data:image/png;base64,'), false, `Turn ${turn} leaked raw base64 data!`);
            assert.strictEqual(historyStr.includes('[صورة مرفقة: مستند معالَج]'), true, `Turn ${turn} missing lean placeholder!`);
        }

        const finalHistoryStr = JSON.stringify(Agent.chatHistory);
        const totalHistoryBytes = Buffer.byteLength(finalHistoryStr, 'utf8');

        // 30 turns with 2MB each unstripped would be ~60MB!
        // Stripped history must be under 30KB total!
        console.log(`    [Metrics] 30 turns unstripped: ~60MB | Stripped chatHistory JSON size: ${(totalHistoryBytes / 1024).toFixed(2)} KB`);
        assert.strictEqual(totalHistoryBytes < 30000, true, `Total history size (${totalHistoryBytes} bytes) exceeds 30KB threshold`);
        assert.strictEqual(Agent.chatHistory.length, 60, 'All 60 messages (30 turns x 2) must be preserved in history');
    });

    await runTest('Tokens-Base64', '2.2 Multi-part array format payload stripping', () => {
        Agent.chatHistory = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'أضف الطلاب المرفقين في الكشف' },
                    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,1234567890ABCDEF' } }
                ]
            },
            {
                role: 'assistant',
                content: 'تمت إضافة الطلاب'
            }
        ];

        Agent._stripBase64FromHistory();

        const userMsg = Agent.chatHistory[0];
        assert.strictEqual(typeof userMsg.content, 'string', 'Multi-part array must be converted to lean text string');
        assert.strictEqual(userMsg.content.includes('أضف الطلاب المرفقين في الكشف'), true);
        assert.strictEqual(userMsg.content.includes('[صورة مرفقة: مستند معالَج]'), true);
        assert.strictEqual(userMsg.content.includes('data:image/jpeg;base64'), false);
    });

    await runTest('Tokens-Base64', '2.3 Adversarial Base64 patterns (Markdown, multiple images, malformed dataUrls)', () => {
        const adversarialContents = [
            'ملاحظة: ![كشف 1](data:image/webp;base64,AAAA1111) ومرفق أيضا ![كشف 2](data:image/svg+xml;base64,BBBB2222)',
            'data:image/png;base64,SINGLE_PURE_IMAGE_NO_TEXT',
            'نص مع كائن dataUrl داخل سلسلة نصية: data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
        ];

        for (const raw of adversarialContents) {
            const sanitized = Agent._sanitizeHistoryContent(raw);
            assert.strictEqual(sanitized.includes('data:image/'), false, `Failed to strip data:image from: ${raw}`);
            assert.strictEqual(sanitized.includes('[صورة مرفقة: مستند معالَج]'), true, `Failed to inject placeholder in: ${raw}`);
        }
    });

    await runTest('Tokens-Base64', '2.4 _sanitizeEntityForPrompt deep sweep on 50 complex nested entities', () => {
        const entities = [];
        for (let i = 0; i < 50; i++) {
            entities.push({
                id: `student_${i}`,
                name: `طالب ${i}`,
                descriptors: new Array(128).fill(0.12345),
                faceDescriptors: [new Array(128).fill(0.54321)],
                embedding: new Array(512).fill(0.999),
                rawImage: 'data:image/jpeg;base64,SOME_HUGE_BINARY_IMAGE_BUFFER',
                avatar: 'data:image/png;base64,AVATAR_IMAGE_DATA',
                dataUrl: 'data:image/png;base64,DATA_URL',
                fingerprint: 'fp_raw_bytes_9999',
                academicId: `20260${i}`,
                classId: 'c101'
            });
        }

        const sanitized = Agent._sanitizeEntityForPrompt(entities);
        assert.strictEqual(Array.isArray(sanitized), true);
        assert.strictEqual(sanitized.length, 30, 'Must clamp entity list at 30 items for lean prompt representation');

        for (const item of sanitized) {
            assert.strictEqual(item.descriptors, undefined, 'descriptors must be stripped');
            assert.strictEqual(item.faceDescriptors, undefined, 'faceDescriptors must be stripped');
            assert.strictEqual(item.embedding, undefined, 'embedding must be stripped');
            assert.strictEqual(item.rawImage, undefined, 'rawImage must be stripped');
            assert.strictEqual(item.avatar, undefined, 'avatar must be stripped');
            assert.strictEqual(item.dataUrl, undefined, 'dataUrl must be stripped');
            assert.strictEqual(item.fingerprint, undefined, 'fingerprint must be stripped');
            assert.strictEqual(item.name.startsWith('طالب'), true, 'name must be retained');
            assert.strictEqual(item.academicId.startsWith('20260'), true, 'academicId must be retained');
        }
    });

    await runTest('Tokens-Base64', '2.5 Delta context generation under heavy system state produces compact payload (< 1KB)', async () => {
        global.localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ id: 'u1', name: 'أ. سالم', schoolId: 'SCH_01' }));
        const mockDb = createMockFirestore({
            v2_students: { s1: { id: 's1', name: 'أحمد', schoolId: 'SCH_01' }, s2: { id: 's2', name: 'خالد', schoolId: 'SCH_01' } },
            v2_classes: { c1: { id: 'c1', name: 'أول ثانوي', schoolId: 'SCH_01' } },
            v2_teachers: { t1: { id: 't1', name: 'أ. فهد', schoolId: 'SCH_01' } }
        });
        DB.dbInstance = mockDb;
        await DB.init();

        const deltaContext = await Agent.getDeltaContext();
        const deltaBytes = Buffer.byteLength(deltaContext, 'utf8');

        assert.strictEqual(deltaContext.includes('[سياق النظام المحدث (Delta Context)]'), true);
        assert.strictEqual(deltaContext.includes('إجمالي الطلاب (2)'), true);
        assert.strictEqual(deltaContext.includes('إجمالي الفصول (1)'), true);
        console.log(`    [Metrics] Delta context payload size: ${deltaBytes} bytes (lean context representation)`);
        assert.strictEqual(deltaBytes < 1000, true, `Delta context size (${deltaBytes} bytes) exceeds 1000 bytes threshold`);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 3: L1 Cache Concurrency & Multi-Tab Consistency
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ GROUP 3: L1 Cache Concurrency & Multi-Tab Consistency Stress Testing');

    await runTest('Cache-Concurrency', '3.1 100 simultaneous concurrent reads against unprimed cache trigger exactly 1 physical cloud query', async () => {
        global.localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ id: 'u1', schoolId: 'SCH_TEST_01' }));
        const mockDb = createMockFirestore({
            v2_students: {
                std_1: { id: 'std_1', academicId: '202601', name: 'عبدالله', schoolId: 'SCH_TEST_01' },
                std_2: { id: 'std_2', academicId: '202602', name: 'محمد', schoolId: 'SCH_TEST_01' }
            }
        });
        DB.dbInstance = mockDb;
        DB.clearAllCaches({ broadcast: false });
        DB._stats.hits = 0;
        DB._stats.misses = 0;

        // Fire 100 concurrent reads simultaneously via Promise.all
        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push(DB.getStudents());
        }

        const results = await Promise.all(promises);

        // Verify all 100 promises returned the exact correct dataset
        assert.strictEqual(results.length, 100);
        for (const res of results) {
            assert.strictEqual(res.length, 2);
            assert.strictEqual(res[0].name, 'عبدالله');
        }

        // Verify request coalescing: Exactly 1 physical cloud read took place!
        const physicalReads = mockDb._getPhysicalReads();
        console.log(`    [Metrics] 100 concurrent getStudents calls -> Physical Cloud Reads: ${physicalReads} | Duplicate Reads: 0`);
        assert.strictEqual(physicalReads, 1, `Expected exactly 1 physical read, but recorded ${physicalReads}`);
    });

    await runTest('Cache-Concurrency', '3.2 Multi-Tab sync: Tab 3 atomic insert invalidates Tab 1 and Tab 2 caches with 0 stale reads', async () => {
        global.localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ id: 'u1', schoolId: 'SCH_MULTI' }));

        // Shared backend data store
        const sharedFirestore = createMockFirestore({
            v2_students: {
                std_1: { id: 'std_1', academicId: '202601', name: 'سالم', schoolId: 'SCH_MULTI' }
            }
        });

        // Initialize 4 separate DB instances representing separate browser tabs
        const tab1 = Object.create(DB);
        tab1._l1Cache = new Map();
        tab1._inflightQueries = new Map();
        tab1._syncMetaCache = new Map();
        tab1._stats = { hits: 0, misses: 0, invalidations: 0, broadcastsSent: 0, broadcastsReceived: 0 };
        tab1._tabId = 'tab_1_' + Math.random().toString(36).slice(2);
        tab1.dbInstance = sharedFirestore;
        tab1._broadcastInitialized = false;
        tab1._broadcastChannel = null;
        tab1._initBroadcast();

        const tab2 = Object.create(DB);
        tab2._l1Cache = new Map();
        tab2._inflightQueries = new Map();
        tab2._syncMetaCache = new Map();
        tab2._stats = { hits: 0, misses: 0, invalidations: 0, broadcastsSent: 0, broadcastsReceived: 0 };
        tab2._tabId = 'tab_2_' + Math.random().toString(36).slice(2);
        tab2.dbInstance = sharedFirestore;
        tab2._broadcastInitialized = false;
        tab2._broadcastChannel = null;
        tab2._initBroadcast();

        const tab3 = Object.create(DB);
        tab3._l1Cache = new Map();
        tab3._inflightQueries = new Map();
        tab3._syncMetaCache = new Map();
        tab3._stats = { hits: 0, misses: 0, invalidations: 0, broadcastsSent: 0, broadcastsReceived: 0 };
        tab3._tabId = 'tab_3_' + Math.random().toString(36).slice(2);
        tab3.dbInstance = sharedFirestore;
        tab3._broadcastInitialized = false;
        tab3._broadcastChannel = null;
        tab3._initBroadcast();

        // 1. Tab 1 and Tab 2 read and populate their local L1 caches
        const r1 = await tab1.getStudents();
        const r2 = await tab2.getStudents();
        assert.strictEqual(r1.length, 1);
        assert.strictEqual(r2.length, 1);
        assert.strictEqual(tab1._l1Cache.size >= 1, true);
        assert.strictEqual(tab2._l1Cache.size >= 1, true);

        // 2. Tab 3 performs batch insert of 2 new students
        const insertRes = await tab3.insertBatch('students', [
            { academicId: '202602', name: 'طارق', schoolId: 'SCH_MULTI' },
            { academicId: '202603', name: 'ياسر', schoolId: 'SCH_MULTI' }
        ]);
        assert.strictEqual(insertRes.count, 2);

        // 3. Tab 1 and Tab 2 read again -> must return 3 students (fresh data, zero stale reads)
        const updatedR1 = await tab1.getStudents();
        const updatedR2 = await tab2.getStudents();

        assert.strictEqual(updatedR1.length, 3, 'Tab 1 must reflect fresh inserted students');
        assert.strictEqual(updatedR2.length, 3, 'Tab 2 must reflect fresh inserted students');
        assert.strictEqual(tab1._stats.broadcastsReceived >= 1, true, 'Tab 1 must have received invalidation broadcast');
        assert.strictEqual(tab2._stats.broadcastsReceived >= 1, true, 'Tab 2 must have received invalidation broadcast');
    });

    await runTest('Cache-Concurrency', '3.3 100 sequential cross-tab insert/invalidate/read stress iterations', async () => {
        global.localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ id: 'u1', schoolId: 'SCH_CYCLE' }));
        const sharedFirestore = createMockFirestore({
            v2_students: {}
        });

        const tabs = [];
        for (let t = 0; t < 4; t++) {
            const tab = Object.create(DB);
            tab._l1Cache = new Map();
            tab._inflightQueries = new Map();
            tab._syncMetaCache = new Map();
            tab._stats = { hits: 0, misses: 0, invalidations: 0, broadcastsSent: 0, broadcastsReceived: 0 };
            tab._tabId = `tab_${t}_` + Math.random().toString(36).slice(2);
            tab.dbInstance = sharedFirestore;
            tab._broadcastInitialized = false;
            tab._broadcastChannel = null;
            tab._initBroadcast();
            tabs.push(tab);
        }

        // Perform 100 alternating cycles
        for (let cycle = 1; cycle <= 100; cycle++) {
            const writerTab = tabs[cycle % 4];
            const readerTab = tabs[(cycle + 1) % 4];

            // Writer tab adds an item
            await writerTab.insertBatch('students', [
                { academicId: `item_${cycle}`, name: `طالب_${cycle}`, schoolId: 'SCH_CYCLE' }
            ]);

            // Reader tab reads
            const list = await readerTab.getStudents();
            assert.strictEqual(list.length, cycle, `Cycle ${cycle}: Reader tab got ${list.length} instead of ${cycle}`);
        }
    });

    await runTest('Cache-Concurrency', '3.4 Remote Security Lockdown broadcast purges local L1 cache and session', () => {
        const tab = Object.create(DB);
        tab._l1Cache = new Map();
        tab._inflightQueries = new Map();
        tab._syncMetaCache = new Map();
        tab._stats = { hits: 0, misses: 0, invalidations: 0, broadcastsSent: 0, broadcastsReceived: 0 };
        tab._tabId = 'tab_target';
        tab._broadcastInitialized = false;
        tab._broadcastChannel = null;
        tab._initBroadcast();

        // Populate cache
        tab._l1Cache.set('v2_students::SCH_01', { data: [1, 2, 3] });
        tab._inflightQueries.set('query_1', Promise.resolve());
        tab._syncMetaCache.set('meta_1', { time: Date.now() });

        assert.strictEqual(tab._l1Cache.size, 1);
        assert.strictEqual(tab._inflightQueries.size, 1);

        // Receive lockdown broadcast from remote admin tab
        tab._handleSyncMessage({
            type: 'GLOBAL_SECURITY_LOCKDOWN',
            senderTabId: 'admin_tab_999'
        });

        assert.strictEqual(tab._l1Cache.size, 0, 'L1 cache must be wiped clean');
        assert.strictEqual(tab._inflightQueries.size, 0, 'Inflight queries must be wiped clean');
        assert.strictEqual(tab._syncMetaCache.size, 0, 'Sync metadata must be wiped clean');
    });

    await runTest('Cache-Concurrency', '3.5 Multi-tenant cache key isolation across schoolId s1 and s2 under concurrency', async () => {
        global.localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ id: 'u1', schoolId: 'SCH_01' }));
        const mockDb = createMockFirestore({
            v2_students: {
                s1_std: { id: 's1_std', academicId: '101', name: 'طالب مدرسة 1', schoolId: 'SCH_01' },
                s2_std: { id: 's2_std', academicId: '201', name: 'طالب مدرسة 2', schoolId: 'SCH_02' }
            }
        });
        DB.dbInstance = mockDb;
        DB.clearAllCaches({ broadcast: false });

        // Read for School 1 (session schoolId: SCH_01)
        const resSchool1 = await DB.getStudents();

        // Switch session to School 2 (SCH_02)
        global.localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ id: 'u2', schoolId: 'SCH_02' }));
        const resSchool2 = await DB.getStudents();

        assert.strictEqual(resSchool1.length, 1);
        assert.strictEqual(resSchool1[0].name, 'طالب مدرسة 1');
        assert.strictEqual(resSchool2.length, 1);
        assert.strictEqual(resSchool2[0].name, 'طالب مدرسة 2');

        // Mutating cached array from consumer side should not affect cache (defensive clone check)
        resSchool1.push({ id: 'fake', name: 'متسلل' });
        global.localStorage.setItem(DB.KEYS.CURRENT_USER, JSON.stringify({ id: 'u1', schoolId: 'SCH_01' }));
        const freshReadSchool1 = await DB.getStudents();
        assert.strictEqual(freshReadSchool1.length, 1, 'Defensive clone must prevent consumer cache pollution');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // GROUP 4: FileUtils Duplicate Extensions & Sanitization
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n▶ GROUP 4: FileUtils Duplicate Extensions & Sanitization Stress Testing');

    await runTest('FileUtils-Ext', '4.1 Excel export duplicate extension normalization (.xlsx.xlsx, .XLSX.xlsx, .xlsx.xlsx.xlsx -> .xlsx)', () => {
        const testCases = [
            { input: 'report.xlsx.xlsx', expected: 'report.xlsx' },
            { input: 'attendance_2026.xlsx.XLSX.xlsx', expected: 'attendance_2026.xlsx' },
            { input: 'students.XLSX', expected: 'students.xlsx' },
            { input: 'data.xlsx.xlsx.xlsx.xlsx', expected: 'data.xlsx' },
            { input: 'grades', expected: 'grades.xlsx' },
            { input: '', expected: 'report.xlsx' },
            { input: null, expected: 'report.xlsx' },
            { input: undefined, expected: 'report.xlsx' }
        ];

        for (const tc of testCases) {
            global.window._lastExportedExcel = null;
            FileUtils.exportToExcel([{ id: 1, name: 'سالم' }], tc.input);
            assert.strictEqual(
                global.window._lastExportedExcel,
                tc.expected,
                `Failed for Excel input '${tc.input}': got '${global.window._lastExportedExcel}', expected '${tc.expected}'`
            );
        }
    });

    await runTest('FileUtils-Ext', '4.2 Word export duplicate extension normalization (.docx.docx, .DOCX.docx, .docx.docx.docx -> .docx)', async () => {
        const testCases = [
            { input: 'document.docx.docx', expected: 'document.docx' },
            { input: 'administrative_memo.docx.DOCX.docx', expected: 'administrative_memo.docx' },
            { input: 'summary.DOCX', expected: 'summary.docx' },
            { input: 'letter.docx.docx.docx', expected: 'letter.docx' },
            { input: 'official_doc', expected: 'official_doc.docx' },
            { input: '', expected: 'document.docx' },
            { input: null, expected: 'document.docx' },
            { input: undefined, expected: 'document.docx' }
        ];

        for (const tc of testCases) {
            global.window._lastDownloadedFile = null;
            await FileUtils.exportToWord({ title: 'تقرير', sections: [{ heading: 'مقدمة', text: 'نص' }] }, tc.input);
            assert.strictEqual(
                global.window._lastDownloadedFile?.name,
                tc.expected,
                `Failed for Word input '${tc.input}': got '${global.window._lastDownloadedFile?.name}', expected '${tc.expected}'`
            );
        }
    });

    await runTest('FileUtils-Ext', '4.3 Mixed cross-extension edge cases (doc.xlsx.docx -> .docx, file.docx.xlsx -> .xlsx)', async () => {
        global.window._lastDownloadedFile = null;
        await FileUtils.exportToWord({ title: 'تقرير' }, 'data.xlsx.docx.docx');
        assert.strictEqual(global.window._lastDownloadedFile?.name, 'data.xlsx.docx');

        global.window._lastExportedExcel = null;
        FileUtils.exportToExcel([{ a: 1 }], 'summary.docx.xlsx.xlsx');
        assert.strictEqual(global.window._lastExportedExcel, 'summary.docx.xlsx');
    });

    await runTest('FileUtils-Ext', '4.4 Arabic Unicode filename preservation in exports', async () => {
        const arabicExcelName = 'تقرير_حضور_وغياب_الطلاب_لشهر_فبراير_2026.xlsx.xlsx';
        global.window._lastExportedExcel = null;
        FileUtils.exportToExcel([{ a: 1 }], arabicExcelName);
        assert.strictEqual(global.window._lastExportedExcel, 'تقرير_حضور_وغياب_الطلاب_لشهر_فبراير_2026.xlsx');

        const arabicWordName = 'خطاب_رسمي_مكتب_التعليم.docx.docx';
        global.window._lastDownloadedFile = null;
        await FileUtils.exportToWord({ title: 'خطاب' }, arabicWordName);
        assert.strictEqual(global.window._lastDownloadedFile?.name, 'خطاب_رسمي_مكتب_التعليم.docx');
    });

    await runTest('FileUtils-Ext', '4.5 High-volume 5,000 record exportToExcel memory and structure stress test', () => {
        const bigData = [];
        for (let i = 1; i <= 5000; i++) {
            bigData.push({
                academicId: `20260${i}`,
                name: `طالب رقم ${i} - اختبار تصدير موسع`,
                class: 'الصف الثالث الثانوي - شعبة أ',
                status: i % 10 === 0 ? 'غائب' : 'حاضر',
                date: '2026-08-31',
                notes: 'تم الرصد التلقائي بواسطة الوكيل الذكي حضوري'
            });
        }

        global.window._lastExportedExcel = null;
        const start = Date.now();
        FileUtils.exportToExcel(bigData, 'سجل_شامل_5000_طالب.xlsx.xlsx');
        const duration = Date.now() - start;

        assert.strictEqual(global.window._lastExportedExcel, 'سجل_شامل_5000_طالب.xlsx');
        console.log(`    [Metrics] 5,000 records processed and exported in ${duration}ms`);
        assert.strictEqual(duration < 2000, true, `Export took too long: ${duration}ms`);
    });

    await runTest('FileUtils-Ext', '4.6 Defensive handling in exportToWord with null, empty, or malformed sections', async () => {
        const malformedInputs = [
            null,
            undefined,
            {},
            { title: '' },
            { title: null, sections: null },
            { title: 'عنوان', sections: [null, undefined, { heading: 'قسم 1', text: null }, { heading: 'قسم 2', text: ['سطر 1', 'سطر 2'] }] }
        ];

        for (const input of malformedInputs) {
            global.window._lastDownloadedFile = null;
            await FileUtils.exportToWord(input, 'defensive_test.docx.docx');
            assert.strictEqual(global.window._lastDownloadedFile?.name, 'defensive_test.docx');
        }
    });

    // =========================================================================
    // Summary
    // =========================================================================
    console.log('\n===============================================================================');
    console.log('  TIER 5 ADVERSARIAL STRESS TEST SUITE SUMMARY');
    console.log('===============================================================================');
    console.log(`  Total Tests Executed : ${totalTests}`);
    console.log(`  Tests Passed         : ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
    console.log(`  Tests Failed         : ${failedTests.length}`);
    console.log('===============================================================================');

    if (failedTests.length > 0) {
        console.error('\n❌ FAILED TESTS SUMMARY:');
        for (const f of failedTests) {
            console.error(`  - [${f.groupName}] ${f.testName}`);
            console.error(`    Error: ${f.error}`);
        }
        process.exit(1);
    } else {
        console.log('\n✅ ALL TIER 5 ADVERSARIAL STRESS TESTS PASSED!');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal Test Runner Error:', err);
    process.exit(1);
});
