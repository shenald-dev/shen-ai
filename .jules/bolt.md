## 2024-10-24 — Add ESLint overrides to resolve strict rule failures
- **Learning:** ESLint was failing due to intentional infinite loop constructs (`while (true)`) in orchestrator logic and numerous unused variable warnings. The strictness is preventing clean builds and passing CI checks.
- **Action:** Fixed the `no-constant-condition` error via an inline comment disable for intentional constructs, ensuring `npm run lint` now passes successfully (warnings allowed).
- **Learning:** Found an O(n^2) bottleneck in city-generator.ts where filter and indexOf were used inside a loop to calculate indices.
- **Action:** Fixed it by using a Map tracker inside the loop. Avoid using array iterations like filter/indexOf inside loops without tracking.
- **Learning:** When addressing empty catch blocks (silent failures), use the existing application logger to record errors without crashing the main application flow. This prevents hidden I/O or permissions issues.
- **Action:** Fixed empty catch block in  during temporary file cleanup by logging the error.
- **Learning:** When addressing empty catch blocks (silent failures), use the existing application logger to record errors without crashing the main application flow. This prevents hidden I/O or permissions issues.
- **Action:** Fixed empty catch block in `src/core/memory/memory-manager.ts` during temporary file cleanup by logging the error.
