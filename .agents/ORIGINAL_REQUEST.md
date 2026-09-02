# Original User Request

## 2026-08-31T09:52:56Z

Refactor, harden, and optimize the Hodoori educational platform AI Agent (scripts/module-ai-agent.js, agent.html, UI components) to seamlessly execute complex multi-step tasks (such as vision-based document extraction, batch creation of teachers/classes/students), minimize token and database overhead, ensure robust end-to-end verification with a single clean final output, and fix the chat input box UI resizing/shifting bug.

Working directory: d:/Hodoori-Beta
Integrity mode: development

## Requirements

### R1. Complete Multi-Step Autonomous Execution & Batch Handling
- Support end-to-end execution of compound requests (e.g., adding a teacher, creating a class, and extracting/batch-inserting students from an uploaded document image).
- Ensure the agent does not terminate prematurely before all sub-tasks in a user request are fulfilled.
- Enable efficient batch operations (e.g., batch student insertion in a single atomic database action { table:students,data:[...]}) rather than repeated single inserts.
- Deliver exactly one clean, comprehensive, professional Arabic response at the end of the chain, with zero exposed intermediate command strings or broken state.

### R2. Token & Database Resource Minimization
- Optimize the dynamic system prompt and context builder to avoid inflating tokens on intermediate steps.
- Leverage the existing L1 in-memory cache (core-db.js) to eliminate redundant Firestore/IndexedDB reads.
- Ensure lean prompt representations for tools and query results.

### R3. Comprehensive Codebase Sweep & Robust Error Handling
- Audit all agent methods in scripts/module-ai-agent.js and associated scripts for undefined variables, out-of-scope references (e.g., in fallback loops or catch blocks), and unhandled edge cases.
- Strengthen self-correction logic and database state verification (_verifyDatabaseState) so all operations (insert, update, delete, select, batch) are validated accurately without false positives.

### R4. Input Box UI & Auto-Resize Fix
- Fix the chat input textarea resizing behavior where text doesn't push upwards smoothly and action buttons shift out of place.
- Ensure a fixed bottom action bar layout with smooth auto-growing textarea up to maximum height across desktop and mobile viewports.

## Acceptance Criteria

### Autonomous Multi-Step & Vision Tasks
- [ ] Submitting a multi-part request (e.g., add teacher + create class + extract table of students from image) executes all database operations successfully in sequence.
- [ ] Database verification passes for all created entities (teachers, classes, students).
- [ ] The user receives a single unified, clean confirmation message without intermediate raw command text.

### Efficiency & Token Guardrails
- [ ] No duplicate database read queries for static/cached entities during a single conversation turn.
- [ ] Context payload does not duplicate history or inject unnecessary debug telemetry into the LLM context.

### Codebase Integrity & Reliability
- [ ] Static check (node -c) and runtime execution of module-ai-agent.js produce 0 uncaught exceptions or ReferenceErrors.
- [ ] All catch blocks re-throw or log safely without referencing undefined UI elements.

### UI / UX Behavior
- [ ] Typing multi-line text into #agent-input expands the container upwards smoothly without jumping, clipping, or displacing action buttons.
