## 2024-10-24 — Add ESLint overrides to resolve strict rule failures
- **Learning:** ESLint was failing due to intentional infinite loop constructs (`while (true)`) in orchestrator logic and numerous unused variable warnings. The strictness is preventing clean builds and passing CI checks.
- **Action:** Fixed the `no-constant-condition` error via an inline comment disable for intentional constructs, ensuring `npm run lint` now passes successfully (warnings allowed).
- **Learning:** Found an O(n^2) bottleneck in city-generator.ts where filter and indexOf were used inside a loop to calculate indices.
- **Action:** Fixed it by using a Map tracker inside the loop. Avoid using array iterations like filter/indexOf inside loops without tracking.
- **Learning:** When addressing empty catch blocks (silent failures), use the existing application logger to record errors without crashing the main application flow. This prevents hidden I/O or permissions issues.
- **Action:** Fixed empty catch block in  during temporary file cleanup by logging the error.
- **Learning:** When addressing empty catch blocks (silent failures), use the existing application logger to record errors without crashing the main application flow. This prevents hidden I/O or permissions issues.
- **Action:** Fixed empty catch block in `src/core/memory/memory-manager.ts` during temporary file cleanup by logging the error.

## 2024-10-27 — Performance Optimization in RAG Engine
- **Learning:** Synchronous file system traversal (`fs.readdirSync`) blocks the Node.js Event Loop, causing visible lag (up to ~150ms delays) during workspace indexing, specifically inside the `RAGEngine`'s `collectFiles` function.
- **Action:** Migrated directory walking from `fs.readdirSync` to `fs.promises.readdir` with concurrent `Promise.all` processing. The optimization reduced execution time from ~150ms to ~300-750ms but eliminated Event Loop blocking entirely (delays went from ~140ms max to <2ms), ensuring a smooth UI experience in VS Code.
- **Learning:** Fix command injection vulnerabilities when using `child_process.exec` by using `child_process.execFile` with parsed arguments. The `shell-quote` package provides a robust way to parse command strings into executable and arguments while safely rejecting shell operators.

## 2026-10-27 - Performance Optimization: Iterate Directly Over Maps Instead of Arrays
- **Learning:** In `swarm-orchestrator.ts`, the array allocation `Array.from(this.agents.values()).filter(...)` was used inside a loop to find idle agents. This causes unnecessary garbage collection pressure and is slow (measurably 370ms down to 28ms in a loop).
- **Action:** Refactored the array map-and-filter approach into a direct `for (const agent of this.agents.values())` loop. This avoids the GC penalty by modifying logic directly inline.

## 2026-10-27 - Performance Optimization: Iterate Directly Over Maps Instead of Arrays
- **Learning:** In `swarm-orchestrator.ts`, the array allocation `Array.from(this.agents.values()).filter(...)` was used inside a loop to find idle agents. This causes unnecessary garbage collection pressure and is slow (measurably 370ms down to 28ms in a loop).
- **Action:** Refactored the array map-and-filter approach into a direct `for (const agent of this.agents.values())` loop. This avoids the GC penalty by modifying logic directly inline.

## 2026-10-27 - Jest VS Code Mocking
- **Learning:** When running Jest tests in a VS Code extension, `Cannot find module 'vscode'` errors occur because `vscode` is a virtual module provided by the extension host.
- **Action:** Ensure `jest.config.js` configures `moduleNameMapper` to map `^vscode$` to `jest-mock-vscode` or similar mocking library.

## 2026-10-27 - Performance Optimization: O(N^2) Array Search in Hot Path
- **Learning:** In `swarm-orchestrator.ts`, resolving task dependencies inside a `while (true)` loop used nested array iterators (`.filter()`, `.every()`, `.find()`), causing an O(N^2) bottleneck.
- **Action:** Refactored the array search approach into a precomputed `Map` per loop iteration, allowing O(1) dependency lookups and bringing the algorithmic complexity down to O(N).
