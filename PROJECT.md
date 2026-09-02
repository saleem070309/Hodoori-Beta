# Project: Hodoori AI Agent Refactoring & Optimization

## Architecture
- **AI Agent Core**: `scripts/module-ai-agent.js` — Autonomous loop, prompt synthesis, vision document processing, command execution & verification, response cleaning.
- **Database Layer**: `scripts/core-db.js` — Firestore / IndexedDB adapters, L1 in-memory TTL caching, atomic batch operations (`insertBatch`, `batchInsert`, `batchUpdate`, `batchDelete`), multi-tab sync.
- **UI & Presentation**: `agent.html`, `scripts/page-agent.js`, `styles/module-ai-agent.css`, `styles/style.css` — Chat interface, `#agent-input` capsule, auto-resizing upward growth, bottom action bar, voice & attachment previews.
- **Utilities**: `scripts/utils-files.js`, `scripts/utils.js` — File export (Excel, Word, PDF), string and Arabic name normalization.
- **Test Infrastructure**: `tests/e2e/test_e2e_suite.js`, `tests/adversarial_stress_agent.js`, `tests/adversarial_stress_ui_tokens.js`, `tests/test_milestone2.js`, `tests/test_core_db.js`.

## Code Layout
- `scripts/core-db.js`: Database operations, L1 cache, batch methods.
- `scripts/module-ai-agent.js`: AI agent loop, vision OCR instructions, verification hooks, token minimization.
- `scripts/page-agent.js`: Chat page interaction logic, textarea auto-resize, action button morphing.
- `scripts/utils-files.js`: File download and export helpers.
- `styles/module-ai-agent.css` & `styles/style.css`: Input capsule styling, layout, animation rules.
- `agent.html`: Agent interface markup and React/BorderBeam mounts.
- `tests/e2e/test_e2e_suite.js`: Comprehensive 4-tier E2E testing suite.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|:------:|
| 1 | Multi-Step Autonomous Loop | Chaining compound operations without premature termination | M1 | ORIGINAL_REQUEST §R1 | **DONE** |
| 2 | Vision Document Roster Extraction | Distinguishing document OCR tables from facial recognition | M1 | ORIGINAL_REQUEST §R1 | **DONE** |
| 3 | Atomic Batch Database Operations | `DB.insertBatch` / `DB.batchInsert` with single commit & cache invalidation | M1 | ORIGINAL_REQUEST §R1 | **DONE** |
| 4 | Single Clean Unified Arabic Response | Complete suppression of intermediate streaming, diagnostic cards, and raw commands | M1 | ORIGINAL_REQUEST §R1 | **DONE** |
| 5 | Token & History Minimization | Stripping heavy Base64 images from conversation history after initial turn | M2 | ORIGINAL_REQUEST §R2 | **DONE** |
| 6 | Delta Context for Intermediate Steps | Lightweight delta context during multi-step turns instead of full 30-day stats re-computation | M2 | ORIGINAL_REQUEST §R2 | **DONE** |
| 7 | L1 In-Memory Cache Optimization | Utilizing `core-db.js` L1 cache to eliminate redundant cloud/IndexedDB reads | M2 | ORIGINAL_REQUEST §R2 | **DONE** |
| 8 | Codebase Sweep & Scope Safety | Fixing undefined variables, catch block scopes, and safe logging | M3 | ORIGINAL_REQUEST §R3 | **DONE** |
| 9 | Duplicate File Extension Fix | Normalizing `.xlsx` and `.docx` download filenames in `utils-files.js` | M3 | ORIGINAL_REQUEST §R3 | **DONE** |
| 10 | Robust `_verifyDatabaseState` | Deep object comparison, synonymous schema key normalization, no false positives | M3 | ORIGINAL_REQUEST §R3 | **DONE** |
| 11 | Chat Input Box Auto-Resize Fix | Smooth upward growth of `#agent-input` up to 160px without cursor jitter | M4 | ORIGINAL_REQUEST §R4 | **DONE** |
| 12 | Action Bar Button Stabilization | Pinning left and right action buttons at bottom-end during textarea expansion | M4 | ORIGINAL_REQUEST §R4 | **DONE** |
| 13 | Viewport & Mobile Responsive Layout | Stable `100dvh` layout with proper safe-area insets across desktop and mobile | M4 | ORIGINAL_REQUEST §R4 | **DONE** |
| 14 | 100% E2E Verification & Adversarial Hardening | Passing all Tiers 1-4 E2E tests + Tier 5 white-box stress testing | Final | ORIGINAL_REQUEST Acceptance | **DONE** |

## Milestones
| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| E2E | E2E Testing Track | Requirement-driven test suite (Tiers 1-4) & `TEST_READY.md` | none | **DONE** | `tests/e2e/test_e2e_suite.js`, `TEST_READY.md` (151/151 passed) |
| 1 | Multi-Step Execution & Batch DB | Multi-step loop, vision document OCR, atomic batch writes, clean Arabic output | none | **DONE** | `scripts/core-db.js`, `scripts/module-ai-agent.js` |
| 2 | Token Optimization & L1 Caching | Image history stripping, delta context, zero redundant DB queries | M1 | **DONE** | `scripts/module-ai-agent.js` (`_stripBase64FromHistory`, `getDeltaContext`) |
| 3 | Codebase Sweep & Robust Verification | Catch blocks, variable scopes, file utils extensions, `_verifyDatabaseState` hardening | M1 | **DONE** | `scripts/utils-files.js`, `scripts/module-ai-agent.js` |
| 4 | Input Box UI & Auto-Resize Fix | CSS capsule flex alignment, textarea auto-resize, button pinning | none | **DONE** | `styles/module-ai-agent.css`, `styles/style.css`, `scripts/page-agent.js` |
| Final | E2E Pass & Adversarial Hardening | 100% E2E test pass (Tiers 1-4) + Tier 5 adversarial stress testing | M1, M2, M3, M4, E2E | **DONE** | 151 E2E tests + 44 Tier 5 Stress Tests (100% passed) |

## Interface Contracts
### `DB.insertBatch(table, itemsArray, options)`
- Input: `table` (string, e.g. `'students'`), `itemsArray` (Array of objects), `options` (optional object).
- Behavior: Normalizes items (academicId, schoolId, timestamp), chunks into batches <= 500 ops, commits atomically, calls `invalidateCache(table)` once.
- Output: `Promise<{ success: true, count: number, ids: string[] }>`

### `Agent._verifyDatabaseState(cmd)`
- Input: `cmd` (Command object containing `action`, `table`, `data` or `ids`).
- Normalization: Handles synonymous keys (`studentName` -> `name`, `teacherName` -> `name`, `ministryNumber` -> `ministryId`, stringified IDs).
- Deep equality check: `this._deepEqual(actual, expected)`.
- Output: `Promise<{ success: boolean, reason?: string, verifiedCount?: number }>`

### `Agent.sendMessage(text, options)`
- Input: `text` (string prompt), `options` (optional `{ image, file, ... }`).
- Execution: Multi-step loop executes all sub-commands silently without exposing intermediate JSON or diagnostic cards.
- Output: Exactly one unified Arabic response rendered to the user.

### UI Input Capsule: `handleInputTyping(textarea)`
- Behavior: Calculates scrollHeight instantaneously without CSS height transitions, toggles `.expanded` state, aligns action buttons to bottom.
- Max height: 160px with internal vertical scrolling.
