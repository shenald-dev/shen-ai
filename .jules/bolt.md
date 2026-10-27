## 2024-10-24 — Add ESLint overrides to resolve strict rule failures
- **Learning:** ESLint was failing due to intentional infinite loop constructs (`while (true)`) in orchestrator logic and numerous unused variable warnings. The strictness is preventing clean builds and passing CI checks.
- **Action:** Fixed the `no-constant-condition` error via an inline comment disable for intentional constructs, ensuring `npm run lint` now passes successfully (warnings allowed).
- **Learning:** Found an O(n^2) bottleneck in city-generator.ts where filter and indexOf were used inside a loop to calculate indices.
- **Action:** Fixed it by using a Map tracker inside the loop. Avoid using array iterations like filter/indexOf inside loops without tracking.
- **Learning:** Synchronous I/O operations (`fs.statSync`, `fs.readFileSync`) inside loops can significantly block the Node.js event loop, leading to severe UI freezes in VS Code extensions.
- **Action:** Replaced synchronous I/O with their async equivalents (`await fs.promises.stat`, `await fs.promises.readFile`) in `RAGEngine`'s indexing processes, drastically reducing maximum event loop lag (from ~290ms down to ~4ms for 1000 files).
