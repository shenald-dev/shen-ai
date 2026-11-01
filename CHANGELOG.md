# Changelog

All notable changes to the "SHEN AI" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-01

### Added
- **Multi-Agent Specialist Routing:** Integrated direct dispatching from `ChatManager` to specialized role agents (`ReviewerAgent`, `DebuggerAgent`, `ArchitectAgent`, `ResearchAgent`) alongside `SwarmOrchestrator` and `VitalMonitor`.
- **Slash Command Engine:** Built-in slash command dispatcher supporting `/review`, `/debug`, `/architect`, `/research`, `/swarm`, `/health`, `/clear`, and `/help`.
- **Interactive Command UX & Quick Actions:** Added autocomplete popover on `/` typing with full keyboard navigation (`ArrowUp`, `ArrowDown`, `Tab`, `Enter`, `Escape`), active file indicators, and quick action chips in the webview interface.
- **Pre-Flight Code Validation Shield:** Integrated `CodeValidator` into `ToolRegistry` to parse and validate syntax for TypeScript, JavaScript, and JSON before writing changes to disk (`write_to_file`, `replace_in_file`, `apply_diff`), preventing file corruption from unclosed brackets or invalid syntax.
- **Blast Radius Warning System:** Integrated `BlastRadiusAnalyzer` into tool execution to compute real-time dependency impact and append warning notices on modifications to high-risk modules.
- **Dynamic Context Auto-Compression:** Added `replaceWithSummary` to `ConversationHistory` to compress older turns with executive summaries while retaining recent turns to prevent context window overflow.
- **Sandbox Code Verification Command:** Added `shen.testInSandbox` command to run highlighted code selections in an isolated sandbox environment.
- **Comprehensive Test Coverage:** Added unit test suites for conversation history summarization and tool registry pre-flight validation.

### Fixed
- **Deadlock Resolution:** Fixed task dependency deadlock bug in `SwarmOrchestrator` when encountering circular or missing task dependencies.
- **Process Spawning Security:** Migrated `GitTools` and `CheckpointManager` command execution to array-based `cross-spawn` execution, eliminating shell injection vulnerabilities.
- **Diff Parsing Accuracy:** Fixed diff line addition and deletion counts in `GitTools` to avoid matching `+++` and `---` file header lines.
- **Plugin Loader Settlement:** Added promise settlement guards to prevent duplicate rejections when child processes emit error and close events or exceed buffer limits.

## [0.1.0] - 2026-05-02

### Added
- **Initial Release:** Welcome to SHEN AI!
- **Act & Plan Modes:** Ability to toggle between full autonomous modification and strictly read-only planning modes.
- **Multi-Agent Swarm Mode:** Implemented collaborative agents including Coder, Architect, and Debugger roles.
- **Multi-Provider Support:** Integrated support for Anthropic (Claude), OpenAI (GPT), Google (Gemini), Ollama, Groq, Mistral, Azure, and Custom endpoints.
- **Personality Engine:** Switch between 6 unique AI personas (Mentor, Senior Dev, Hacker, Reviewer, Socratic, Silent) to suit your coding style.
- **Predictive Intent Engine:** Background tracking that learns and anticipates the developer's next move.
- **Project Genome:** Local graph database implementation for deep semantic understanding of the entire codebase context.
- **Code Simulation Sandbox:** Safe environment to test and validate AI-generated code before writing it to files.
- **Self-Evolving Prompts:** Automatic learning mechanism that records user corrections and prevents recurring AI mistakes.
- **Interactive UI:** A polished, fully native-feeling React Webview integrated directly into the VS Code Activity Bar.
