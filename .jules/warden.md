## 2024-10-28 — Lifecycle & Assurance Ledger
- **QA & Veto Actions:** Fixed a deadlock regression in `src/core/swarm/swarm-orchestrator.ts` (`executeSubTasks`) that caused infinite loops when subtask dependencies were unresolvable or circular.
- **Entropy Pruned:** Removed debugging test scripts from repository root (`patch.js`, `test_deadlock*`).
