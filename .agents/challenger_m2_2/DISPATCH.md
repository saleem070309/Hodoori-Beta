## 2026-08-29T18:02:38Z
You are a Challenger agent (Role: Realtime Listener & AI Context Challenger).
Your working directory is: d:\Hodoori-Beta\.agents\challenger_m2_2
Original user request path: d:\Hodoori-Beta\.agents\ORIGINAL_REQUEST.md
Scope document: d:\Hodoori-Beta\PROJECT.md
Worker changes: d:\Hodoori-Beta\.agents\worker_m2_1\changes.md

Mission for Milestone 2 (M2) Adversarial Verification:
Adversarially challenge and stress-test realtime listeners and AI agent context caching:
1. Write and execute an independent empirical test script in your working directory (`d:\Hodoori-Beta\.agents\challenger_m2_2\stress_ai_notif.js`):
   - Test AI agent context generation across 50 consecutive prompt turns, measuring and asserting exact 0 Firestore cache misses on warm cache.
   - Test realtime notification multi-tenant isolation (asserting School A listener receives 0 events for School B notifications).
   - Test notification burst storm (500 rapid notifications), verifying in-place state mutation without query cascade.
   - Test targeted lookups with malicious/corrupted inputs (nulls, SQL/NoSQL injection tokens, unicode diacritics).
2. Document results in `d:\Hodoori-Beta\.agents\challenger_m2_2\challenge.md` and handoff in `d:\Hodoori-Beta\.agents\challenger_m2_2\handoff.md`.
3. Your handoff MUST state a clear verdict: `APPROVE` or `REJECT`.
4. Send a message to your parent with your verdict and test summary.
