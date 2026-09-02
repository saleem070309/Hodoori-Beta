# E2E Test Infra: Hodoori AI Agent

## Test Philosophy
- Opaque-box, requirement-driven. Derived from `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory Mapping
| # | Feature | Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|--------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | Multi-Step Autonomous Loop | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Vision Document OCR Roster | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Atomic Batch DB Operations | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | Single Clean Unified Arabic Response | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 5 | Token & History Minimization | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 6 | Delta Context & Cache Re-use | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 7 | Zero Redundant DB Reads | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 8 | Scope Safety & Catch Hardening | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 9 | Duplicate File Extension Normalization | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 10 | Robust DB State Self-Verification | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 11 | Chat Input Auto-Resize Upward | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 12 | Bottom Action Bar Stabilization | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 13 | Viewport & Mobile Responsive Layout | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 14 | 100% E2E Verification & Adversarial Coverage | Acceptance | 5 | 5 | ✓ | ✓ |

## Test Architecture
- Test Runner: `tests/e2e/test_e2e_suite.js`
- Invocation: `node tests/e2e/test_e2e_suite.js`
- Test Output: Formatted console output with pass/fail counts, execution time, and summary exit codes (0 = all passed, 1 = failure).
- Tiers Structure:
  - **Tier 1 (Feature Coverage)**: ≥5 unit/functional tests per feature (70+ tests).
  - **Tier 2 (Boundary & Corner Cases)**: ≥5 boundary tests per feature (70+ tests).
  - **Tier 3 (Cross-Feature Combinations)**: Pairwise integration tests (6+ tests).
  - **Tier 4 (Real-World Application Scenarios)**: Full compound multi-step vision workflows (5+ tests).
  - **Tier 5 (Adversarial Coverage Hardening)**: White-box challenger test cases.

## Acceptance Thresholds
- All 151+ tests across Tiers 1-4 must pass with 100% success rate (exit code 0).
- Zero false positives on Arabic diacritics and synonym keys.
- Zero intermediate leaked commands.
