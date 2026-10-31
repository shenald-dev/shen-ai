## 2024-10-28 — Lifecycle & Assurance Ledger
- **QA & Veto Actions:** Fixed a deadlock regression in `src/core/swarm/swarm-orchestrator.ts` (`executeSubTasks`) that caused infinite loops when subtask dependencies were unresolvable or circular.
- **Entropy Pruned:** Removed debugging test scripts from repository root (`patch.js`, `test_deadlock*`).

## 2026-10-31 — Lifecycle & Assurance Ledger
- **QA & Veto Actions:** Fixed a parsing error introduced by using `=======` merge conflict markers as comment dividers in `plugin-loader.ts`. Found open handles in jest due to `timeoutPromise` timeouts in `swarm-orchestrator.test.ts` not being cleared, fixed by clearing the timeout at the end of test.
- **Entropy Pruned:** None
