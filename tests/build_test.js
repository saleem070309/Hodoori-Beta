const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTests() {
    console.log("=== Hodoori AI Agent & Ministry Telemetry Error Sync Test Suite ===");

    // 1. Static Verification of agent.html
    console.log("\n--- 1. agent.html Telemetry Loading Verification ---");
    const agentHtml = fs.readFileSync(path.join(__dirname, '..', 'agent.html'), 'utf8');
    
    const headIndex = agentHtml.indexOf('</head>');
    const telemetryScriptIndex = agentHtml.indexOf('scripts/module-telemetry.js');

    assert.ok(telemetryScriptIndex > -1, "agent.html must include scripts/module-telemetry.js");
    assert.ok(telemetryScriptIndex < headIndex, "scripts/module-telemetry.js must be loaded early in <head>");
    
    const secondIndex = agentHtml.indexOf('scripts/module-telemetry.js', telemetryScriptIndex + 1);
    assert.strictEqual(secondIndex, -1, "scripts/module-telemetry.js must not be duplicated in body");
    console.log("  ✓ PASS: agent.html loads module-telemetry.js early in <head> without duplicates");

    // 2. Static Verification of page-agent.js
    console.log("\n--- 2. page-agent.js Early DB & Telemetry Sync Verification ---");
    const pageAgentJs = fs.readFileSync(path.join(__dirname, '..', 'scripts/page-agent.js'), 'utf8');
    assert.ok(pageAgentJs.includes('DB.init()'), "page-agent.js must invoke DB.init()");
    assert.ok(pageAgentJs.includes('Telemetry.flushPendingLogs()'), "page-agent.js must trigger Telemetry.flushPendingLogs()");
    console.log("  ✓ PASS: page-agent.js initializes DB and triggers Telemetry flush on startup");

    // 3. Static Verification of module-ai-agent.js
    console.log("\n--- 3. module-ai-agent.js Error Telemetry Dispatch Verification ---");
    const agentJs = fs.readFileSync(path.join(__dirname, '..', 'scripts/module-ai-agent.js'), 'utf8');
    assert.ok(agentJs.includes("Telemetry.logError('AI_AGENT'"), "module-ai-agent.js must log AI_AGENT errors to Telemetry");
    assert.ok(agentJs.includes("source: 'Agent.sendMessage'"), "sendMessage catch block must log to Telemetry");
    assert.ok(agentJs.includes("source: 'AgentEngine._silentLogToGoogleSheets'"), "_silentLogToGoogleSheets must log to Telemetry");
    console.log("  ✓ PASS: module-ai-agent.js explicitly routes errors and diagnostic logs to Telemetry");

    // 4. Static Verification of module-telemetry.js
    console.log("\n--- 4. module-telemetry.js Robust Sync & v2_agentic_logs Support ---");
    const telemetryJs = fs.readFileSync(path.join(__dirname, '..', 'scripts/module-telemetry.js'), 'utf8');
    assert.ok(telemetryJs.includes('flushPendingLogs'), "module-telemetry.js must define flushPendingLogs");
    assert.ok(telemetryJs.includes('_markSyncedLocal'), "module-telemetry.js must define _markSyncedLocal");
    assert.ok(telemetryJs.includes('v2_agentic_logs'), "module-telemetry.js must integrate v2_agentic_logs into getLogs");
    assert.ok(telemetryJs.includes('synced = false'), "module-telemetry.js must track sync state in local records");
    console.log("  ✓ PASS: module-telemetry.js implements offline queue and v2_agentic_logs backward-compatibility");

    // 5. Functional Simulation of Telemetry and Sync
    console.log("\n--- 5. Functional Simulation of Telemetry Engine & Sync ---");

    const mockStorage = {};
    const fakeLocalStorage = {
        getItem: (k) => mockStorage[k] || null,
        setItem: (k, v) => { mockStorage[k] = String(v); },
        removeItem: (k) => { delete mockStorage[k]; }
    };
    const fakeWindow = {
        location: { pathname: '/agent.html', href: 'http://localhost/agent.html' },
        innerWidth: 1920,
        innerHeight: 1080,
        addEventListener: () => {}
    };
    const fakeNav = { userAgent: 'Chrome on Windows', onLine: true };
    const fakePerf = { memory: { usedJSHeapSize: 1024 * 1024 * 50 } };

    const firestoreDocs = {};
    const agenticDocs = {
        'agentic_doc_old_1': {
            id: 'agentic_doc_old_1',
            category: 'AI_AGENT',
            timestamp: '2026-09-04T08:00:00.000Z',
            message: 'OpenRouter Rate Limit Exceeded 429',
            userPrompt: 'أريد تقرير حضور الصف العاشر',
            provider: 'openrouter'
        }
    };

    const fakeDB = {
        dbInstance: null,
        async init() {
            this.dbInstance = {
                collection: (colName) => ({
                    doc: (docId) => ({
                        set: async (data, opts) => {
                            firestoreDocs[docId] = { ...data };
                        }
                    }),
                    orderBy: (field, direction) => ({
                        limit: (n) => ({
                            get: async () => {
                                if (colName === 'v2_system_logs') {
                                    return {
                                        forEach: (cb) => {
                                            Object.keys(firestoreDocs).forEach(id => {
                                                cb({ id, data: () => firestoreDocs[id] });
                                            });
                                        }
                                    };
                                } else if (colName === 'v2_agentic_logs') {
                                    return {
                                        forEach: (cb) => {
                                            Object.keys(agenticDocs).forEach(id => {
                                                cb({ id, data: () => agenticDocs[id] });
                                            });
                                        }
                                    };
                                }
                                return { forEach: () => {} };
                            }
                        })
                    })
                }),
                batch: () => {
                    const operations = [];
                    return {
                        set: (ref, data) => operations.push(data),
                        commit: async () => {
                            operations.forEach(op => {
                                firestoreDocs[op.id] = op;
                            });
                        }
                    };
                }
            };
        }
    };

    const sandbox = {
        window: fakeWindow,
        document: { addEventListener: () => {} },
        navigator: fakeNav,
        performance: fakePerf,
        localStorage: fakeLocalStorage,
        console: console,
        setTimeout: setTimeout,
        setInterval: setInterval,
        clearTimeout: clearTimeout,
        clearInterval: clearInterval,
        DB: fakeDB,
        Auth: { getCurrentUser: () => ({ role: 'admin', schoolId: 's1' }) }
    };
    vm.createContext(sandbox);
    vm.runInContext(telemetryJs, sandbox);

    const Telemetry = sandbox.Telemetry || sandbox.window.Telemetry;
    assert.ok(Telemetry, "Telemetry must be defined in sandbox");

    console.log("  Testing logError when DB.dbInstance is initially null...");
    assert.strictEqual(fakeDB.dbInstance, null, "DB.dbInstance should initially be null");

    const record = await Telemetry.logError('AI_AGENT', 'خطأ في توليد التقرير بسبب انتهاء المهلة', new Error('Timeout 90s'), {
        userPrompt: 'ما هي نسبة الحضور اليوم؟'
    });

    assert.ok(record, "logError must return record");
    assert.strictEqual(record.category, 'AI_AGENT');

    assert.ok(fakeDB.dbInstance !== null, "DB.init() must have been called by _syncWithFirestore");
    
    await new Promise(r => setTimeout(r, 50));
    assert.ok(firestoreDocs[record.id], "Error document must be synced to Firestore");
    assert.strictEqual(firestoreDocs[record.id].message, 'خطأ في توليد التقرير بسبب انتهاء المهلة');
    console.log("  ✓ PASS: Telemetry.logError auto-initialized DB and synchronized to Firestore immediately");

    console.log("  Testing getLogs aggregation including previous v2_agentic_logs...");
    const logs = await Telemetry.getLogs();
    assert.ok(logs.length >= 2, "getLogs must return system log AND previous agentic log");
    
    const foundAgentic = logs.find(l => l.id === 'agentic_doc_old_1');
    assert.ok(foundAgentic, "Previous v2_agentic_logs record must be included");
    assert.strictEqual(foundAgentic.category, 'AI_AGENT');
    assert.strictEqual(foundAgentic.message, 'OpenRouter Rate Limit Exceeded 429');
    console.log("  ✓ PASS: getLogs seamlessly returned both real-time system logs and previous agentic logs");

    console.log("\nALL TESTS PASSED SUCCESSFULLY! ✨");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
