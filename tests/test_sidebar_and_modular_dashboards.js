/**
 * @fileoverview Automated Test for Standalone Sidebar Component and Modular Dashboards
 * @project Hodoori (حضوري) - Intelligent Educational Platform
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log("=== Hodoori Standalone Sidebar & Modular Dashboard Test Suite ===");

    // Test 1: Check component files existence
    console.log("--- 1. File Structure Verification ---");
    const requiredFiles = [
        'styles/component-sidebar.css',
        'scripts/component-sidebar.js',
        'styles/page-agent.css',
        'scripts/page-agent.js',
        'agent.html',
        'styles/dashboard-analytics.css',
        'scripts/dashboard-analytics.js',
        'dashboard-analytics.html'
    ];

    for (const relPath of requiredFiles) {
        const fullPath = path.join(__dirname, '..', relPath);
        assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
        const stat = fs.statSync(fullPath);
        assert.ok(stat.size > 0, `File must not be empty: ${relPath}`);
        console.log(`  ✓ PASS: ${relPath} exists and has content (${stat.size} bytes)`);
    }

    // Test 2: Verify component-sidebar.js syntax and structure
    console.log("--- 2. Sidebar Component API Verification ---");
    const sidebarJs = fs.readFileSync(path.join(__dirname, '..', 'scripts/component-sidebar.js'), 'utf8');
    assert.ok(sidebarJs.includes('HodooriSidebar'), "Must define HodooriSidebar");
    assert.ok(sidebarJs.includes('mount'), "Must expose mount method");
    assert.ok(sidebarJs.includes('toggle'), "Must expose toggle method");
    assert.ok(sidebarJs.includes('navigateToAdminTab'), "Must expose navigateToAdminTab method");
    console.log("  ✓ PASS: component-sidebar.js contains all required API methods");

    // Test 3: Verify agent.html modular references
    console.log("--- 3. agent.html Modularization Verification ---");
    const agentHtml = fs.readFileSync(path.join(__dirname, '..', 'agent.html'), 'utf8');
    assert.ok(agentHtml.includes('component-sidebar.css'), "agent.html must link component-sidebar.css");
    assert.ok(agentHtml.includes('page-agent.css'), "agent.html must link page-agent.css");
    assert.ok(agentHtml.includes('component-sidebar.js'), "agent.html must script component-sidebar.js");
    assert.ok(agentHtml.includes('page-agent.js'), "agent.html must script page-agent.js");
    assert.ok(!agentHtml.includes('window.toggleAgentSidebar = function'), "agent.html inline toggle logic must be extracted to component");
    console.log("  ✓ PASS: agent.html cleanly delegates to modular stylesheets and scripts");

    // Test 4: Verify dashboard-analytics.html structure matching exact user mockup
    console.log("--- 4. dashboard-analytics.html Structure Verification ---");
    const dashHtml = fs.readFileSync(path.join(__dirname, '..', 'dashboard-analytics.html'), 'utf8');
    assert.ok(dashHtml.includes('component-sidebar.css'), "dashboard-analytics.html must link component-sidebar.css");
    assert.ok(dashHtml.includes('dashboard-analytics.css'), "dashboard-analytics.html must link dashboard-analytics.css");
    assert.ok(dashHtml.includes('component-sidebar.js'), "dashboard-analytics.html must script component-sidebar.js");
    assert.ok(dashHtml.includes('dashboard-analytics.js'), "dashboard-analytics.html must script dashboard-analytics.js");
    assert.ok(dashHtml.includes('hodoori-sidebar-mount'), "dashboard-analytics.html must contain sidebar mount point");
    assert.ok(dashHtml.includes('kpi-segmented-card'), "dashboard-analytics.html must contain top 4-segment card");
    assert.ok(dashHtml.includes('chart-classes-breakdown'), "dashboard-analytics.html must contain classes breakdown chart canvas");
    assert.ok(dashHtml.includes('chart-attendance-trend'), "dashboard-analytics.html must contain trend chart canvas");
    assert.ok(dashHtml.includes('pending-classes-list'), "dashboard-analytics.html must contain pending classes list");
    assert.ok(dashHtml.includes('submitted-classes-list'), "dashboard-analytics.html must contain submitted classes list");
    console.log("  ✓ PASS: dashboard-analytics.html matches the exact flat mockup structure and canvases");

    console.log("\n========================================");
    console.log("Modular Architecture Test Results: 4/4 Sections Passed (100%)");
    console.log("========================================\n");
}

runTests().catch(err => {
    console.error("Test Error:", err);
    process.exit(1);
});
