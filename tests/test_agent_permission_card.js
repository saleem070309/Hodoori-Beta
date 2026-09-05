/**
 * @fileoverview Test Suite for AI Agent User Permission & Recommendation Card
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 */

const assert = require('assert');
const path = require('path');

// ─── Setup Mock Environment ───
class MockElement {
    constructor(tag, id = '') {
        this.tagName = tag.toUpperCase();
        this.id = id;
        this.className = '';
        this._innerHTML = '';
        this.textContent = '';
        this.children = [];
        this.style = {};
        this.attributes = new Map();
        this.eventListeners = new Map();
        this.disabled = false;
        this.value = '';
    }

    get innerHTML() {
        return this._innerHTML;
    }

    set innerHTML(val) {
        this._innerHTML = val;
        this.children = [];
        const parsedChildren = parseHTML(val, this);
        for (const child of parsedChildren) {
            this.appendChild(child);
        }
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }

    addEventListener(evt, fn) {
        if (!this.eventListeners.has(evt)) this.eventListeners.set(evt, []);
        this.eventListeners.get(evt).push(fn);
    }

    async click() {
        const list = this.eventListeners.get('click') || [];
        for (const fn of list) {
            await fn({ target: this });
        }
    }

    appendChild(child) {
        if (child) {
            child.parentNode = this;
            this.children.push(child);
        }
        return child;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        const matches = [];
        const isClass = selector.startsWith('.');
        const isTag = /^[a-zA-Z]+$/.test(selector);
        const className = isClass ? selector.slice(1) : '';

        const checkMatch = (el) => {
            if (isClass && el.className && el.className.split(/\s+/).includes(className)) {
                return true;
            }
            if (isTag && el.tagName === selector.toUpperCase()) {
                return true;
            }
            if (selector.includes('.')) {
                const parts = selector.split('.').filter(Boolean);
                const matchesAll = parts.every(p => el.className && el.className.split(/\s+/).includes(p));
                if (matchesAll) return true;
            }
            return false;
        };

        const traverse = (el) => {
            if (checkMatch(el) && !matches.includes(el)) {
                matches.push(el);
            }
            for (const c of el.children) {
                traverse(c);
            }
        };

        for (const c of this.children) {
            traverse(c);
        }
        return matches;
    }
}

function parseHTML(html, parentEl) {
    const root = new MockElement('root');
    const stack = [root];
    const regex = /<(\/)?([a-zA-Z0-9-]+)((?:\s+[a-zA-Z0-9-]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
        const isClosing = !!match[1];
        const tagName = match[2].toLowerCase();
        const rawAttrs = match[3] || '';
        const isSelfClosing = !!match[4] || ['img', 'br', 'hr', 'input'].includes(tagName);

        if (isClosing) {
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].tagName.toLowerCase() === tagName) {
                    stack.splice(i);
                    break;
                }
            }
        } else {
            const el = new MockElement(tagName);
            if (rawAttrs) {
                const attrRegex = /([a-zA-Z0-9-]+)(?:=(?:["']([^"']*)["']|([^\s>]+)))?/g;
                let attrMatch;
                while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
                    const attrName = attrMatch[1];
                    const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : (attrMatch[3] !== undefined ? attrMatch[3] : '');
                    el.setAttribute(attrName, attrVal);
                    if (attrName === 'class') el.className = attrVal;
                    if (attrName === 'id') el.id = attrVal;
                    if (attrName === 'disabled') el.disabled = true;
                }
            }

            stack[stack.length - 1].appendChild(el);

            if (!isSelfClosing) {
                stack.push(el);
            }
        }
    }
    return root.children;
}

// Global Mocks
const domStore = new Map();
global.document = {
    createElement(tag) {
        return new MockElement(tag);
    },
    getElementById(id) {
        return domStore.get(id) || null;
    }
};

global.window = {
    renderAll: async () => {},
    localStorage: {
        store: new Map(),
        getItem(k) { return this.store.get(k) || null; },
        setItem(k, v) { this.store.set(k, String(v)); },
        removeItem(k) { this.store.delete(k); }
    }
};
global.localStorage = global.window.localStorage;
global.UI = {
    toast: (msg, type) => {}
};

// Mock DB
const dbStorage = {
    students: [],
    classes: [],
    teachers: [],
    records: []
};
global.DB = {
    async insert(table, item) {
        if (!dbStorage[table]) dbStorage[table] = [];
        dbStorage[table].push(item);
        return { success: true, id: item.id || 'id_' + Date.now() };
    },
    async insertBatch(table, items) {
        if (!dbStorage[table]) dbStorage[table] = [];
        dbStorage[table].push(...items);
        return { success: true, count: items.length };
    },
    async update(table, id, data) {
        const list = dbStorage[table] || [];
        const idx = list.findIndex(i => i.id === id || i.academicId === id);
        if (idx !== -1) {
            list[idx] = { ...list[idx], ...data };
            return { success: true };
        }
        return { success: false };
    },
    async delete(table, id) {
        const list = dbStorage[table] || [];
        dbStorage[table] = list.filter(i => i.id !== id && i.academicId !== id);
        return { success: true };
    },
    async getStudents() { return dbStorage.students; },
    async getClasses() { return dbStorage.classes; },
    async getTeachers() { return dbStorage.teachers; },
    async getRecentRecords() { return dbStorage.records; }
};

// Load Agent and Prompt Modules
const AgentInstructions = require('../scripts/module-ai-prompt.js');
const Agent = require('../scripts/module-ai-agent.js');

async function runSuite() {
    console.log('===============================================================');
    console.log('🧪 RUNNING AI AGENT USER PERMISSION & RECOMMENDATION CARD SUITE');
    console.log('===============================================================\n');

    let passed = 0;
    let failed = 0;

    function check(name, condition, details = '') {
        if (condition) {
            console.log(`  ✓ PASS: ${name}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${name} ${details ? '(' + details + ')' : ''}`);
            failed++;
        }
    }

    // ─── GROUP 1: Mutative vs Non-Mutative Discrimination ───
    console.log('▶ [GROUP 1] Action Classification (Mutative vs Read-Only)');
    {
        check('insert is mutative', Agent.isMutativeDbAction({ type: 'database_action', action: 'insert' }));
        check('update is mutative', Agent.isMutativeDbAction({ type: 'database_action', action: 'update' }));
        check('delete is mutative', Agent.isMutativeDbAction({ type: 'database_action', action: 'delete' }));
        check('select is NOT mutative', !Agent.isMutativeDbAction({ type: 'database_action', action: 'select' }));
        check('chart is NOT mutative', !Agent.isMutativeDbAction({ type: 'chart' }));
        check('export_excel is NOT mutative', !Agent.isMutativeDbAction({ type: 'export_excel' }));
        check('stats is NOT mutative', !Agent.isMutativeDbAction({ type: 'stats' }));
        check('identify_student is NOT mutative', !Agent.isMutativeDbAction({ type: 'identify_student' }));
    }

    // ─── GROUP 2: Confirmation Requirement State ───
    console.log('\n▶ [GROUP 2] Confirmation State & Configuration');
    {
        Agent.requireConfirmation = true;
        check('Default requirement is true', Agent.isConfirmationRequired() === true);

        Agent.requireConfirmation = false;
        check('Explicit false disables confirmation', Agent.isConfirmationRequired() === false);

        Agent.requireConfirmation = undefined;
        localStorage.setItem('agent_require_confirmation', 'false');
        check('LocalStorage false disables confirmation', Agent.isConfirmationRequired() === false);

        localStorage.setItem('agent_require_confirmation', 'true');
        check('LocalStorage true enables confirmation', Agent.isConfirmationRequired() === true);

        // Reset
        Agent.requireConfirmation = true;
    }

    // ─── GROUP 3: Recommendation Options Builder & Formatting ───
    console.log('\n▶ [GROUP 3] Recommendation Options & Component Formatting');
    {
        // 1. Single Student Insert
        const stuCmd = {
            type: 'database_action',
            action: 'insert',
            table: 'students',
            data: { name: 'أحمد سالم الخديوي', academicId: '20240901', className: 'العاشر أ' }
        };
        const stuOpts = Agent._buildRecommendationOptions(stuCmd);
        check('Student insert title contains name', stuOpts.title.includes('أحمد سالم الخديوي'));
        check('Body includes EntityChip', stuOpts.options[0].body.includes('agent-entity-chip'));
        check('Body includes ValuePill', stuOpts.options[0].body.includes('agent-value-pill'));
        check('Option 1 has signal 3', stuOpts.options[0].signal === 3);
        check('Option 1 has tone green', stuOpts.options[0].tone === '#10b981');
        check('Option 2 has signal 2 (needs review)', stuOpts.options[1].signal === 2);
        check('Option 3 has signal 0 (cancel)', stuOpts.options[2].signal === 0);

        // 2. Batch Student Insert
        const batchCmd = {
            type: 'database_action',
            action: 'insert',
            table: 'students',
            data: [
                { name: 'سليم', academicId: '101' },
                { name: 'عمر', academicId: '102' },
                { name: 'خالد', academicId: '103' },
                { name: 'زيد', academicId: '104' }
            ]
        };
        const batchOpts = Agent._buildRecommendationOptions(batchCmd);
        check('Batch insert detects count (4 طلاب)', batchOpts.options[0].body.includes('4 طالباً'));
        check('Batch insert title mentions count', batchOpts.title.includes('4 طالب'));

        // 3. Class Insert
        const clsCmd = {
            type: 'database_action',
            action: 'insert',
            table: 'classes',
            data: { name: 'الصف الحادي عشر', section: 'أ' }
        };
        const clsOpts = Agent._buildRecommendationOptions(clsCmd);
        check('Class insert mentions class name', clsOpts.options[0].body.includes('الصف الحادي عشر'));
        check('Class insert includes section pill', clsOpts.options[0].body.includes('الشعبة'));

        // 4. Update
        const updateCmd = {
            type: 'database_action',
            action: 'update',
            table: 'students',
            id: '20240901',
            data: { phone: '0791234567' }
        };
        const updateOpts = Agent._buildRecommendationOptions(updateCmd);
        check('Update title contains ID', updateOpts.title.includes('20240901'));
        check('Update body contains updated field pill', updateOpts.options[0].body.includes('0791234567'));

        // 5. Delete
        const deleteCmd = {
            type: 'database_action',
            action: 'delete',
            table: 'students',
            id: '20240901'
        };
        const delOpts = Agent._buildRecommendationOptions(deleteCmd);
        check('Delete title has warning', delOpts.title.includes('تأكيد حذف'));
        check('Delete CTA variant is danger', delOpts.options[0].ctaVariant === 'btn-danger');
        check('Delete CTA text is confirm delete', delOpts.options[0].cta === 'تأكيد الحذف النهائي');
    }

    // ─── GROUP 4: RecommendationCard DOM & Interaction ───
    console.log('\n▶ [GROUP 4] RecommendationCard UI & Drawer Interactions');
    {
        const mockMessages = new MockElement('div', 'agent-messages');
        domStore.set('agent-messages', mockMessages);

        const testCmd = {
            type: 'database_action',
            action: 'insert',
            table: 'students',
            data: { id: 's999', name: 'طارق زياد', academicId: '2024999', className: 'العاشر ب' }
        };

        const card = Agent._renderRecommendationCard(mockMessages, testCmd);
        check('Card rendered and appended to messages', mockMessages.children.includes(card));
        check('Card has agent-recommendation-card class', card.className.includes('agent-recommendation-card'));

        const cardTitle = card.querySelector('.agent-card-title');
        check('Card title element exists', !!cardTitle);

        const cardBody = card.querySelector('.agent-card-body');
        check('Card body element exists', !!cardBody);
        check('Card body contains EntityChip', card._innerHTML.includes('agent-entity-chip'));
        check('Card body contains ValuePill', card._innerHTML.includes('agent-value-pill'));

        const meter = card.querySelector('.agent-meter');
        check('Card has 3-bar signal meter', !!meter);

        const altBtn = card.querySelector('.agent-btn-alternatives');
        check('Alternatives button exists with aria-expanded="false"', altBtn && altBtn.getAttribute('aria-expanded') === 'false');

        const ctaBtn = card.querySelector('.agent-btn-cta');
        check('CTA button exists with initial text "اعتماد وتنفيذ"', ctaBtn && card._innerHTML.includes('اعتماد وتنفيذ'));

        // Toggle alternatives drawer
        await altBtn.click();
        const drawer = card.querySelector('.agent-alternatives-drawer');
        check('Clicking alternatives button opens drawer (is-open)', drawer && drawer.className.includes('is-open'));
        const updatedAltBtn = card.querySelector('.agent-btn-alternatives');
        check('Aria-expanded becomes "true"', updatedAltBtn && updatedAltBtn.getAttribute('aria-expanded') === 'true');

        // Alternatives list
        const altOptions = card.querySelectorAll('.agent-alt-option-btn');
        check('Drawer displays 2 other options', altOptions.length === 2);

        // Click Option 2 (Needs review / Configure)
        const optReview = altOptions.find(o => o.getAttribute('data-index') === '1');
        check('Option 2 found in drawer', !!optReview);
        await optReview.click();

        // Check promotion of Option 2 to active
        check('Option 2 promoted: CTA becomes "تعديل في المحادثة"', card._innerHTML.includes('تعديل في المحادثة'));
        const newFooterLabel = card.querySelector('.agent-card-footer-label');
        check('Footer label becomes "بانتظار المراجعة"', newFooterLabel && card._innerHTML.includes('بانتظار المراجعة'));
    }

    // ─── GROUP 5: Execution Confirmation & DB State Mutation ───
    console.log('\n▶ [GROUP 5] Execution Confirmation & Mutation Safety');
    {
        const mockMessages = new MockElement('div', 'agent-messages');
        domStore.set('agent-messages', mockMessages);

        dbStorage.students = [];
        const studentToInsert = {
            id: 's777',
            name: 'عبدالله يوسف',
            academicId: '20240777',
            classId: 'c1'
        };

        const cmd = {
            type: 'database_action',
            action: 'insert',
            table: 'students',
            data: studentToInsert
        };

        // Render card
        const card = Agent._renderRecommendationCard(mockMessages, cmd);

        // Verify DB was NOT modified upon card rendering
        check('Before user confirmation, DB students count is 0', dbStorage.students.length === 0);

        // Simulate user clicking "اعتماد وتنفيذ"
        const ctaBtn = card.querySelector('.agent-btn-cta');
        await ctaBtn.click();

        // Verify DB was modified after confirmation
        check('After user confirmation, student is saved in DB', dbStorage.students.length === 1);
        check('Saved student name matches', dbStorage.students[0].name === 'عبدالله يوسف');

        // Verify card UI state updated to accepted
        check('CTA button is now accepted', card._innerHTML.includes('تم الاعتماد والتنفيذ ✓'));
        const finalCta = card.querySelector('.agent-btn-cta');
        check('CTA button has is-accepted and btn-success classes', finalCta && finalCta.className.includes('btn-success') && finalCta.className.includes('is-accepted'));
        check('CTA button is disabled to prevent duplicate writes', finalCta && finalCta.disabled === true);
    }

    // ─── GROUP 6: Cancel Action Discard Safety ───
    console.log('\n▶ [GROUP 6] Cancel Action Discard Safety');
    {
        const mockMessages = new MockElement('div', 'agent-messages');
        domStore.set('agent-messages', mockMessages);

        dbStorage.classes = [];
        const classCmd = {
            type: 'database_action',
            action: 'insert',
            table: 'classes',
            data: { id: 'c_cancelled', name: 'الصف المهمل' }
        };

        const card = Agent._renderRecommendationCard(mockMessages, classCmd);

        // Open drawer
        const altBtn = card.querySelector('.agent-btn-alternatives');
        await altBtn.click();

        // Select Cancel option (index 2)
        const altOptions = card.querySelectorAll('.agent-alt-option-btn');
        const cancelOption = altOptions.find(o => o.getAttribute('data-index') === '2');
        check('Cancel option exists in drawer', !!cancelOption);
        await cancelOption.click();

        // Click cancel CTA
        check('CTA promotes to "إلغاء العملية"', card._innerHTML.includes('إلغاء العملية'));
        const cancelCta = card.querySelector('.agent-btn-cta');
        await cancelCta.click();

        // Verify 0 database mutations
        check('Cancelled action leaves DB untouched (0 classes)', dbStorage.classes.length === 0);
        check('CTA button states "تم الإلغاء ✕"', card._innerHTML.includes('تم الإلغاء ✕'));
    }

    // ─── GROUP 7: Prompt Rule Integration ───
    console.log('\n▶ [GROUP 7] System Prompt Rule Verification');
    {
        const prompt = AgentInstructions.getTemplate();
        check('Prompt template contains User Approval policy', prompt.includes('سياسة استئذان وموافقة المستخدم'));
        check('Prompt template mentions Recommendation Card', prompt.includes('Recommendation Card'));
    }

    // ─── Summary ───
    console.log('\n===============================================================');
    console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('===============================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runSuite().catch(err => {
    console.error('Test Suite Unhandled Error:', err);
    process.exit(1);
});
