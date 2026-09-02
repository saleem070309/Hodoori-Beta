# Context Index

## Project Scope
- Educational Platform AI Agent (`Hodoori-Beta`)
- Core Files: `scripts/module-ai-agent.js`, `agent.html`, `scripts/core-db.js`, associated styles/scripts.

## Authoritative Requirements (from ORIGINAL_REQUEST.md)
1. **R1. Complete Multi-Step Autonomous Execution & Batch Handling**:
   - Compound request execution (e.g., add teacher + create class + extract/insert students from document image).
   - No premature termination before all subtasks complete.
   - Batch DB operations (`{ table: 'students', data: [...] }`).
   - Single clean, professional Arabic final response without exposed command strings.
2. **R2. Token & Database Resource Minimization**:
   - Dynamic prompt & context builder optimization.
   - Core DB L1 cache integration to eliminate redundant queries.
   - Lean prompt representations for tools and query outputs.
3. **R3. Comprehensive Codebase Sweep & Robust Error Handling**:
   - Sweep `scripts/module-ai-agent.js` and associates for undefined variables / scope issues / edge cases.
   - Strengthen `_verifyDatabaseState` and self-correction.
   - Ensure static check (`node -c`) and runtime pass with 0 uncaught errors.
4. **R4. Input Box UI & Auto-Resize Fix**:
   - Fix `#agent-input` auto-resize and button displacement.
   - Smooth upwards expansion up to max-height on desktop and mobile.
