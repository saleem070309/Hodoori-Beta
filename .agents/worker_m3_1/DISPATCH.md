## 2026-08-29T18:06:26Z

You are a Worker/Test Writer agent (Role: E2E Test Suite Architect).
Your working directory is: d:\Hodoori-Beta\.agents\worker_m3_1
Original user request path: d:\Hodoori-Beta\.agents\ORIGINAL_REQUEST.md
Scope document: d:\Hodoori-Beta\PROJECT.md
Test Infrastructure Plan: d:\Hodoori-Beta\TEST_INFRA.md

Mission for Milestone 3 (M3) — E2E Testing Suite (Tiers 1-4):
Design and build the comprehensive, requirement-driven, opaque-box E2E test suite in `tests/e2e/test_e2e_suite.js`:
1. Implement a complete, standalone E2E test runner covering:
   - **Tier 1 (Feature Coverage)**: >= 5 test cases per feature covering all 14 features in `PROJECT.md § Feature Inventory` in isolation (persistence, coalescing, L1 cache TTLs, write invalidation, broadcast sync, delta sync, Arabic matching, background polling suppression, scoped notifications, in-place notification mutation, AI context caching, page lifecycle, targeted logins, renderAll dedup).
   - **Tier 2 (Boundary & Corner Cases)**: >= 5 test cases per feature covering boundary limits (empty strings, large payloads, invalid dates, inverted ranges, leap years, corrupted JSON, quota errors, extreme Arabic Tashkeel/Tatweel, rapid tab switching, clock skew margins).
   - **Tier 3 (Cross-Feature Combinations)**: Multi-feature interaction tests (e.g. Save attendance -> Invalidate L1 cache -> Broadcast sync across 3 tabs -> AI agent queries today's records; Class deletion -> Cascade student deletion -> Invalidate cache; Tab visibility change -> Interval pause -> Realtime notification push -> In-place update).
   - **Tier 4 (Real-World Application Scenarios)**: >= 5 comprehensive full-flow scenarios:
     1. Full School Day Lifecycle Simulation
     2. Multi-Tab Concurrent Administration & Conflict-Free Sync
     3. Offline Attendance Taking & Delta Sync Reconnection
     4. Arabic Linguistic & Patronymic Lineage Search & AI Actions
     5. High-Frequency AI Conversational Turns with 0 Cloud Read Leaks
2. Execute the full test suite: `node tests/e2e/test_e2e_suite.js`.
3. Create `TEST_READY.md` at project root (`d:\Hodoori-Beta\TEST_READY.md`) summarizing the test suite runner command, tier-by-tier test counts, and coverage checklist.
4. Document changes in `d:\Hodoori-Beta\.agents\worker_m3_1\changes.md` and complete handoff in `d:\Hodoori-Beta\.agents\worker_m3_1\handoff.md`.
5. Send a message to your parent with a concise summary and path to your handoff report.
