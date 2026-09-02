## 2026-08-29T18:12:29Z

<USER_REQUEST>
You are a Challenger agent (Role: Data Integrity & Zero-Regression Challenger).
Your working directory is: d:\Hodoori-Beta\.agents\challenger_m3_2
Original user request path: d:\Hodoori-Beta\.agents\ORIGINAL_REQUEST.md
Scope document: d:\Hodoori-Beta\PROJECT.md
Test Infrastructure: d:\Hodoori-Beta\TEST_INFRA.md

Mission for Milestone 3 (M3) Chaos Verification:
Empirically verify 100% data integrity and zero regressions across all core entities (students, teachers, classes, attendance records, settings, schedules, notifications) under chaos conditions:
1. Write and execute an independent chaos test script in `d:\Hodoori-Beta\.agents\challenger_m3_2\chaos_test.js`:
   - Interleaved concurrent CRUD operations with simulated out-of-order execution.
   - Date-bounded range queries across leap years, year boundaries, and Arabic academic calendars.
   - Verification that attendance records, student rosters, and teacher assignments retain 100% ground-truth accuracy.
2. Document results in `d:\Hodoori-Beta\.agents\challenger_m3_2\challenge.md` and handoff in `d:\Hodoori-Beta\.agents\challenger_m3_2\handoff.md`.
3. Your handoff MUST state a clear verdict: `APPROVE` or `REJECT`.
4. Send a message to your parent with your verdict and test summary.
</USER_REQUEST>
