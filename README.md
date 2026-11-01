<div align="center">
  <img src="assets/shen_ai_logo.png" width="200" alt="SHEN AI Logo" />
  <h1>SHEN AI — Autonomous Coding Agent (v1.0.0)</h1>
  <p><strong>A superior multi-agent, multi-provider AI coding assistant that thinks ahead, learns from you, and builds autonomously.</strong></p>
  <p>
    <img src="https://img.shields.io/github/license/shenald-dev/shen-ai?style=flat-square&color=00e5ff" alt="License">
    <img src="https://img.shields.io/badge/version-1.0.0-00e5ff?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square&color=00e5ff" alt="PRs Welcome">
  </p>
</div>

---

## 🌟 Introduction

SHEN AI isn't just another chat-in-your-editor tool. It's a **complete autonomous development system** designed to revolutionize your workflow. 
Whether you're scaffolding a new project from scratch, refactoring legacy systems, or tracking down obscure bugs, SHEN AI acts as a deeply integrated co-creator inside your VS Code workspace.

With SHEN AI, you get an AI that actually **modifies, tests, and reads your codebase securely**, executing terminal commands and keeping track of your personal coding DNA over time.

---

## ✨ Key Features (v1.0.0)

| Feature | Description |
|---------|-------------|
| 🧠 **Act & Plan Modes** | Choose whether the AI should autonomously modify files and run commands (`Act`) or carefully analyze and write step-by-step implementation plans (`Plan`). |
| ⚡ **Slash Command Engine** | Trigger dedicated specialist workflows in one keystroke: `/review`, `/debug`, `/architect`, `/research`, `/swarm`, and `/health` with popover autocomplete and quick-action chips. |
| 🛡️ **Pre-Flight Validation Shield** | Automatically parses and validates TypeScript, JavaScript, and JSON syntax before writing changes to disk, preventing file corruption. |
| 💥 **Blast Radius Dependency Analyzer** | Evaluates code genome impact in real time and attaches warnings to edits when modifying high-risk or widely-imported modules. |
| 🗜️ **Dynamic Context Auto-Compressor** | Automatically condenses lengthy conversation history into structured executive summaries, preserving recent active context without token overflow. |
| 🤖 **Specialist Agent Swarm** | Deploys specialized sub-agents (`ArchitectAgent`, `ReviewerAgent`, `DebuggerAgent`, `ResearchAgent`) that collaborate to solve complex problems faster than a single AI. |
| 🧬 **Self-Evolving Prompts & Ghost Mode** | Tracks your corrections and edits. SHEN AI *learns* your style and preferences, meaning you never have to correct the same mistake twice. |
| 🧪 **Isolated Sandbox Verification** | Execute code snippets in a safe, isolated runtime sandbox (`shen.testInSandbox`) before committing changes to files. |
| 🌍 **Multi-Provider Support** | Plug and play with your favorite LLMs. Full support for **Anthropic (Claude)**, **OpenAI (GPT)**, **Google (Gemini)**, **Mistral**, **Groq**, **Azure**, and local models via **Ollama** or custom endpoints! |
| 🎭 **Personality Engine** | Change your AI pair-programmer's personality on the fly. Choose from a strict Code Reviewer, a patient Mentor, a quick-and-dirty Hacker, or a concise Senior Dev. |
| 🕸️ **Project Genome** | Maintains a living knowledge graph of your entire codebase, giving SHEN AI unmatched context over cross-file dependencies. |

---

## ⚡ Slash Commands & Quick Actions

SHEN AI features an integrated command dispatcher. Simply type `/` into the chat input or click any quick-action chip:

| Command | Specialist / System | Action |
|:---|:---|:---|
| `/review [file]` | **Reviewer Agent** | Performs a deep security, quality, performance, and maintainability audit on active or specified files. |
| `/debug <issue>` | **Debugger Agent** | Analyzes error messages, inspects stack traces, and proposes root-cause fixes. |
| `/architect <feature>` | **Architect Agent** | Designs module topology, file blueprints, and interface contracts for new capabilities. |
| `/research <topic>` | **Research Agent** | Explores codebase structure, library usage, and relevant design patterns. |
| `/swarm <task>` | **Swarm Orchestrator** | Decomposes complex tasks across parallel specialist sub-agents. |
| `/health` | **Vital Monitor** | Runs real-time diagnostic checks on code health, complexity, and maintainability. |
| `/clear` | **Session Manager** | Clears the current chat session history to start a fresh task. |
| `/help` | **Documentation** | Displays the command guide and available specialist tools. |

---

## 🚀 Getting Started

### Installation

1. Install SHEN AI from the **VS Code Marketplace** *(or build from source)*.
2. Open the **SHEN AI** sidebar panel (click the sparkle icon in your Activity Bar).
3. Follow the quick onboarding instructions to configure your preferred AI provider.

### Configuration

If you don't have an API key configured, SHEN AI will automatically prompt you to enter one when you open the panel.
1. Select your preferred provider (e.g., Anthropic, OpenAI, Google Gemini, or a local provider like Ollama).
2. Enter your API Key or Custom Base URL.
3. Choose your desired AI Model and hit **Save**.

---

## 💡 How to Use SHEN AI

- **Open the Chat:** Click the `SHEN AI` icon in the sidebar or run `SHEN AI: Open Chat Panel` from the Command Palette (`Ctrl+Shift+P`).
- **Plan vs Act:** Use the toggle at the top of the chat input to switch between `Act` mode (AI can modify your files) and `Plan` mode (AI will only read files and generate text plans).
- **Change Personality:** Use the dropdown in the chat input to switch your AI's tone (e.g., Senior Dev, Mentor, Hacker) to fit your current task perfectly.
- **Cancel a Task:** If SHEN AI is taking an action you want to stop, press the `Stop` (■) button near the input bar to instantly halt the agent loop.
- **Run Sandbox Test:** Highlight code in any editor and run `SHEN AI: Test in Sandbox` to verify execution results safely.

---

## 🛠️ For Developers & Contributors

Want to build or modify SHEN AI yourself? Here is how the magic happens:

### How it Works

SHEN AI uses a **Swarm Architecture** with isolated React UI and Node.js Extension components.
- The `webview` (React UI) communicates with the `extension` (Node.js backend) via VS Code's `postMessage` protocol.
- The core loop is managed by `ChatManager`, which routes commands to the `ToolRegistry`, validates changes with `CodeValidator`, and tracks tokens and history.
- Context is strictly managed with `ConversationSummarizer` and `ContextManager` to ensure massive codebases don't exceed LLM token limits.

### Local Development

1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/shenald-dev/shen-ai.git
   ```
2. Run `npm install` to download dependencies.
3. Run `npm run watch` (or `node esbuild.js --watch`) to compile the extension.
4. Press `F5` in VS Code to launch the Extension Development Host.

### Running Tests & Linting

```bash
npm run lint    # Run ESLint across TypeScript and React sources
npm test        # Run Jest test suites
npm run build   # Production build of extension and webview
```

### Releasing to GitHub and the Marketplace

If you modify SHEN AI locally and want to publish your version:

1. **Pushing to GitHub:**
   Commit your changes using git. You can do this yourself via the terminal, or simply tell SHEN AI: *"Commit and push my latest changes to GitHub."*
   
2. **Publishing to the VS Code Marketplace (Automated):**
   This repository is configured with a **GitHub Actions CI/CD pipeline**. 
   - When you are ready to release a new version, bump the version number in `package.json`.
   - Create a git tag starting with `v` (e.g., `git tag v1.0.0`).
   - Push the tag to GitHub (`git push origin v1.0.0`).
   - GitHub Actions will automatically compile, package, and upload the new version directly to the VS Code Marketplace! *(Note: You must first configure the `VSCE_PAT` secret in your GitHub repository settings).*

---

<div align="center">
  <b>Licensed under GPL-3.0-or-later.</b>
</div>
