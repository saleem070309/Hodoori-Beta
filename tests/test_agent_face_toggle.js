/**
 * Automated Verification Suite for Agent Face Analysis Toggle
 * Tests prompt decommissioning, tool suppression, and policy propagation.
 */

const assert = require('assert');
const path = require('path');

// Setup Node sandbox environment
global.window = global;
global.document = {
    querySelectorAll: () => [],
    getElementById: () => null
};
let mockLocalStorageData = {};
global.localStorage = {
    getItem: (k) => mockLocalStorageData[k] || null,
    setItem: (k, v) => { mockLocalStorageData[k] = String(v); },
    removeItem: (k) => { delete mockLocalStorageData[k]; },
    clear: () => { mockLocalStorageData = {}; }
};

let mockSettings = {};
let mockSchools = [];
let mockCurrentUser = { id: 'admin1', name: 'المدير', schoolId: 'school_1' };

global.DB = {
    KEYS: {
        STUDENTS: 'students',
        CLASSES: 'classes',
        RECORDS: 'records',
        TEACHERS: 'teachers',
        SETTINGS: 'settings',
        SCHOOLS: 'schools'
    },
    getStudents: async () => [{ id: 's1', name: 'أحمد علي', descriptors: '[[0.1, 0.2]]' }],
    getClasses: async () => [{ id: 'c1', name: 'العاشر أ' }],
    getRecentRecords: async () => [],
    getTeachers: async () => [{ id: 't1', name: 'الأستاذ خالد' }],
    getSettings: async () => mockSettings,
    saveSettings: async (data) => { Object.assign(mockSettings, data); },
    getSchools: async () => mockSchools,
    getSchool: async (id) => mockSchools.find(s => s.id === id) || null
};

global.Auth = {
    getCurrentUser: () => mockCurrentUser
};

const AgentInstructions = require('../scripts/module-ai-prompt.js');
const Agent = require('../scripts/module-ai-agent.js');

async function runTests() {
    console.log('===============================================================');
    console.log('🧪 RUNNING AGENT FACE ANALYSIS TOGGLE VERIFICATION SUITE');
    console.log('===============================================================\n');

    let passed = 0;
    let failed = 0;

    function check(testName, condition, details = '') {
        if (condition) {
            console.log(`  ✓ PASS: ${testName}`);
            passed++;
        } else {
            console.error(`  ✗ FAIL: ${testName} ${details ? '(' + details + ')' : ''}`);
            failed++;
        }
    }

    // ─── TEST GROUP 1: Prompt Template Eradication ───
    console.log('▶ [GROUP 1] Prompt Template Eradication when Disabled');
    {
        const promptEnabled = AgentInstructions.getTemplate({ faceAnalysisEnabled: true });
        check('Enabled template contains Face ID', promptEnabled.includes('Face ID'));
        check('Enabled template contains identify_student', promptEnabled.includes('identify_student'));

        const promptDisabled = AgentInstructions.getTemplate({ faceAnalysisEnabled: false });
        check('Disabled template has ZERO Face ID mentions', !promptDisabled.includes('Face ID'));
        check('Disabled template has ZERO identify_student mentions', !promptDisabled.includes('identify_student'));
        check('Disabled template has ZERO descriptor examples', !promptDisabled.includes('descriptors'));
        check('Disabled template contains strict decommissioning rule', promptDisabled.includes('سياسة عدم وجود تحليل الوجه'));
        check('Disabled template header is Vision Document & Roster OCR', promptDisabled.includes('معالجة صور المستندات واستخراج الكشوفات'));
    }

    // ─── TEST GROUP 2: State Resolution (LocalStorage / School / Global) ───
    console.log('\n▶ [GROUP 2] State Resolution (LocalStorage, DB Settings, School)');
    {
        mockLocalStorageData = {};
        mockSettings = {};
        mockSchools = [{ id: 'school_1', name: 'مدرسة الأمل', agentFaceAnalysis: true }];
        
        let state = await Agent.isFaceAnalysisEnabled();
        check('Default state is enabled (true)', state === true);

        // Turn off via localStorage
        global.localStorage.setItem('hodoori_agent_face_analysis_enabled', 'false');
        state = await Agent.isFaceAnalysisEnabled();
        check('LocalStorage "false" turns off face analysis', state === false);

        // Turn back on via localStorage
        global.localStorage.setItem('hodoori_agent_face_analysis_enabled', 'true');
        state = await Agent.isFaceAnalysisEnabled();
        check('LocalStorage "true" restores face analysis', state === true);

        // Turn off via Global DB Settings
        global.localStorage.clear();
        mockSettings = { enableAgentFaceAnalysis: false };
        state = await Agent.isFaceAnalysisEnabled();
        check('Global DB Settings { enableAgentFaceAnalysis: false } disables face analysis', state === false);

        // Turn off via School-specific setting
        mockSettings = { enableAgentFaceAnalysis: true };
        mockSchools = [{ id: 'school_1', name: 'مدرسة الأمل', agentFaceAnalysis: false }];
        state = await Agent.isFaceAnalysisEnabled();
        check('School-specific { agentFaceAnalysis: false } disables face analysis for that school', state === false);
    }

    // ─── TEST GROUP 3: System Context Eradication in Agent ───
    console.log('\n▶ [GROUP 3] Agent System Context Building');
    {
        // When Disabled
        global.localStorage.setItem('hodoori_agent_face_analysis_enabled', 'false');
        mockSettings = { enableAgentFaceAnalysis: false };
        
        const mockFaceFile = { name: 'photo.jpg', type: 'image/jpeg' };
        const mockFingerprint = [0.12, 0.34, 0.56];
        const mockMatched = { name: 'أحمد علي', id: 's1', academicId: '202401', classId: 'c1', distance: 0.2 };

        const ctxDisabled = await Agent.getSystemContext(mockFaceFile, mockFingerprint, mockMatched);
        check('Context disabled has ZERO identify_student', !ctxDisabled.includes('identify_student'));
        check('Context disabled has ZERO Face ID', !ctxDisabled.includes('Face ID'));
        check('Context disabled has ZERO Face Matching Match', !ctxDisabled.includes('Face Matching Match'));
        check('Context disabled has ZERO face fingerprint injection', !ctxDisabled.includes('بصمة رقمية (وجه)'));
        check('Context disabled contains strict decommissioning rule', ctxDisabled.includes('سياسة عدم وجود تحليل الوجه'));

        // When Enabled
        global.localStorage.setItem('hodoori_agent_face_analysis_enabled', 'true');
        mockSettings = { enableAgentFaceAnalysis: true };
        mockSchools = [{ id: 'school_1', name: 'مدرسة الأمل', agentFaceAnalysis: true }];

        const ctxEnabled = await Agent.getSystemContext(mockFaceFile, mockFingerprint, mockMatched);
        check('Context enabled has identify_student', ctxEnabled.includes('identify_student'));
        check('Context enabled has Face ID', ctxEnabled.includes('Face ID'));
        check('Context enabled injects Face Matching Match', ctxEnabled.includes('Face Matching Match'));
    }

    // ─── TEST GROUP 4: Command Execution Guard ───
    console.log('\n▶ [GROUP 4] Command Execution Guarding');
    {
        // When Disabled
        global.localStorage.setItem('hodoori_agent_face_analysis_enabled', 'false');
        mockSettings = { enableAgentFaceAnalysis: false };

        const fakeMessages = [];
        Agent.lastIdentifyResult = null;
        await Agent.executeCommand({ type: 'identify_student', mode: 'multiple' }, fakeMessages);

        check('Disabled agent blocks identify_student execution', Agent.lastIdentifyResult && Agent.lastIdentifyResult.success === false);
        check('Disabled agent reports unrecognized/unsupported tool', Agent.lastIdentifyResult && Agent.lastIdentifyResult.error.includes('غير معرّفة أو غير مدعومة'));

        // searchStudentByFingerprint guard
        const fpSearch = await Agent.searchStudentByFingerprint([0.1, 0.2]);
        check('searchStudentByFingerprint is rejected when disabled', fpSearch.success === false);
    }

    console.log('\n===============================================================');
    console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('===============================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
