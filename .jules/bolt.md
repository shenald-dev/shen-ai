## 2024-10-24 — Add ESLint overrides to resolve strict rule failures
- **Learning:** ESLint was failing due to intentional infinite loop constructs (`while (true)`) in orchestrator logic and numerous unused variable warnings. The strictness is preventing clean builds and passing CI checks.
- **Action:** Fixed the `no-constant-condition` error via an inline comment disable for intentional constructs, ensuring `npm run lint` now passes successfully (warnings allowed).
