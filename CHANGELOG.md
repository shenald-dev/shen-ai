# Changelog

All notable changes to the "SHEN AI" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **[Fixed]:** Fixed an infinite loop / deadlock bug in `SwarmOrchestrator` when encountering circular or missing task dependencies.
- **Git Operations:** Migrated `GitTools` and `CheckpointManager` command execution to array-based `cross-spawn` processes, eliminating shell argument concatenation and shell injection risks.
- **Diff Parsing:** Fixed diff line addition and deletion counts in `GitTools` to avoid matching `+++` and `---` file header lines.
- **Plugin Loader:** Added promise settlement guards to prevent duplicate rejections when child processes emit error and close events or exceed buffer limits.
- **Cross-Platform Tests:** Updated plugin loader test commands to cross-platform Node invocations for reliable execution on Windows, Linux, and macOS.

### Added
- **Test Suite:** Added comprehensive unit test coverage for `GitTools` covering status summaries, branch actions, commit formatting, diff parsing, and process failure handling.

## [1.0.0] - 2026-05-02

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
