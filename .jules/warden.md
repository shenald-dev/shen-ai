## 2024-10-28 — Lifecycle & Assurance Ledger
- **QA & Veto Actions:** Fixed a deadlock regression in `src/core/swarm/swarm-orchestrator.ts` (`executeSubTasks`) that caused infinite loops when subtask dependencies were unresolvable or circular.
- **Entropy Pruned:** Removed debugging test scripts from repository root (`patch.js`, `test_deadlock*`).

## 2026-10-31 — Lifecycle & Assurance Ledger
- **QA & Veto Actions:** Fixed a parsing error introduced by using `=======` merge conflict markers as comment dividers in `plugin-loader.ts`. Found open handles in jest due to `timeoutPromise` timeouts in `swarm-orchestrator.test.ts` not being cleared, fixed by clearing the timeout at the end of test.
- **Entropy Pruned:** None
## 2026-11-04 — Lifecycle & Assurance Ledger
- **QA & Veto Actions:** Fixed an O(N^2) bottleneck in `src/core/swarm/conflict-resolver.ts` where `sorted.find` was used repeatedly inside a loop. Refactored it to use a precomputed `Map` (`agentLatestTimestamps`), changing the lookup complexity to O(1).
- **Entropy Pruned:** Removed throwaway execution script (`patch.js`).
## 2026-11-06 — Lifecycle & Assurance Ledger
- **QA & Veto Actions:** None
- **Entropy Pruned:** Removed unused variables and imports in various files and prefixed unused function arguments with _ to fix strict lint warnings.
## 2026-11-08 — Lifecycle & Assurance Ledger
- **QA & Veto Actions:** Resolved Typescript compilation errors introduced by over-aggressive unused variable cleanup by restoring \`workspaceRoot\` in \`feature-builder.ts\`, \`summary.summary\` in \`chat-manager.ts\`, \`isProcessing\` in \`LiveFilePreview.tsx\`, and several other destructured attributes across the codebase.
- **Entropy Pruned:** None
- **Deferred / Blocked:** None
