# Orchestration Plan

## 1. Survey & Spec Mining Phase
- Spawn 3 parallel survey subagents:
  1. `explorer_survey_agent_core` (teamwork_preview_explorer): Investigate `scripts/module-ai-agent.js`, agent command parsing, system prompt, context construction, multi-step execution loop, vision handler, state verification, fallback logic.
  2. `explorer_survey_db_batch` (teamwork_preview_explorer): Investigate `scripts/core-db.js`, schema, tables (teachers, classes, students, etc.), L1 in-memory cache, batch operations support, verifyDatabaseState interactions.
  3. `spec_miner_ui_specs` (teamwork_preview_spec_miner): Investigate `agent.html`, CSS, chat input container `#agent-input`, auto-resize textarea logic, action buttons layout, mobile vs desktop viewports, and extract precise UI & functional requirements.

## 2. Synthesis & Project Decomposition
- Synthesize findings into `PROJECT.md` and `TEST_INFRA.md`.
- Formulate milestone boundaries:
  - Track A (E2E Testing Track): Comprehensive test suite (Tiers 1-4) covering multi-step vision workflows, batch operations, cache efficiency, error edge cases, and UI behavior.
  - Milestone 1: Autonomous Multi-Step Execution, Vision Flow & Atomic Batch DB Handling.
  - Milestone 2: Token & Context Optimization & L1 DB Cache Integration.
  - Milestone 3: Comprehensive Codebase Sweep, Catch-Block Hardening & Accurate DB State Verification.
  - Milestone 4: Chat Input Container CSS/JS Auto-Resize & Layout Fix.
  - Final Milestone: Pass 100% E2E tests (Tiers 1-4) + Adversarial Coverage Hardening (Tier 5).

## 3. Iterative Execution & Gate Gating
- Each milestone executes through the full iteration loop: Explorer -> Worker -> Reviewer (x2) -> Challenger (x2) -> Forensic Auditor (`teamwork_preview_auditor`).
- Strict AND gate on all reviews, empirical challenges, and binary veto on integrity audit.
