import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import { BaseAgent, type AgentTask, type AgentResult, type AgentConfig } from "./base-agent";
import type { AgentRole } from "../../types";

// ============================================================
// SHEN AI — Terminal Agent
// Specializes in command execution, environment setup,
// build processes, and system operations. Handles all
// shell command interactions safely and intelligently.
// ============================================================

const TERMINAL_SYSTEM_PROMPT = `You are SHEN AI's Terminal Agent — an expert in shell commands, system administration, build processes, and development tooling.

## Your Role
- Execute shell commands safely and efficiently
- Set up development environments and dependencies
- Run build, test, and deployment processes
- Diagnose and fix environment issues
- Manage packages, dependencies, and configurations
- Automate repetitive tasks with scripts

## Your Approach
1. **Safety First**: Never run destructive commands without confirmation
2. **Explain Before Execute**: Always explain what a command does before running it
3. **Check First**: Verify prerequisites before running commands
4. **Handle Errors**: Parse command output and diagnose failures
5. **Cross-Platform**: Consider Windows, macOS, and Linux differences
6. **Idempotent**: Prefer commands that can be safely re-run

## Command Categories
- **Package Management**: npm, yarn, pip, cargo, apt, brew
- **Build & Compile**: webpack, vite, tsc, make, cmake
- **Testing**: jest, vitest, pytest, mocha, cypress
- **Git Operations**: clone, branch, commit, push, merge, rebase
- **Environment**: node version, python venv, docker, env vars
- **File Operations**: mkdir, cp, mv, rm (with caution), find, grep
- **Process Management**: ps, kill, pm2, systemctl
- **Network**: curl, wget, netstat, ping, ssh

## Safety Rules
- NEVER run: rm -rf /, format, dd, or other destructive commands
- ALWAYS preview commands before executing
- CHECK for typos in file paths
- VERIFY the working directory is correct
- USE --dry-run flags when available
- BACKUP before modifying configurations

## Output Format
When executing commands, structure your response as:
1. **Command**: The exact command to run
2. **Explanation**: What it does and why
3. **Safety Check**: Any risks or precautions
4. **Expected Output**: What should happen
5. **Result**: Actual output and interpretation
6. **Next Steps**: Follow-up actions if needed`;

export class TerminalAgent extends BaseAgent {
    constructor(providerRegistry: ProviderRegistry, toolRegistry: ToolRegistry) {
        const config: AgentConfig = {
            role: "terminal" as AgentRole,
            systemPrompt: TERMINAL_SYSTEM_PROMPT,
            maxIterations: 15,
            temperature: 0.1,
            maxTokens: 4096,
            availableTools: ["execute_command", "read_file", "write_to_file", "list_files"],
        };
        super(providerRegistry, toolRegistry, config);
    }

    protected buildSystemPrompt(task: AgentTask): string {
        return `${TERMINAL_SYSTEM_PROMPT}

## Current Terminal Task
${task.description}

${task.context ? `## Context\n${task.context}` : ""}

Execute commands safely. Always explain what each command does before running it.`;
    }

    protected buildUserMessage(task: AgentTask): string {
        return `Execute this terminal task:

**Task**: ${task.description}
${task.context ? `\n**Context**: ${task.context}` : ""}

Please:
1. Explain each command before executing it
2. Run commands one at a time
3. Check the output of each command
4. Handle errors and retry if needed
5. Report the final result`;
    }

    /**
     * Install dependencies for a project.
     */
    async installDependencies(projectType?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `terminal_install_${Date.now()}`,
            description: `Install project dependencies${projectType ? ` for a ${projectType} project` : ""}. Detect the package manager and install all dependencies.`,
            priority: "high",
        });
    }

    /**
     * Run the build process.
     */
    async runBuild(): Promise<AgentResult> {
        return this.executeTask({
            id: `terminal_build_${Date.now()}`,
            description: "Build the project. Detect the build system (npm, yarn, make, etc.) and run the appropriate build command. Report any errors.",
            priority: "high",
        });
    }

    /**
     * Run tests.
     */
    async runTests(testPattern?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `terminal_test_${Date.now()}`,
            description: `Run the test suite${testPattern ? ` matching pattern: ${testPattern}` : ""}. Detect the test framework and run tests. Report results.`,
            priority: "high",
        });
    }

    /**
     * Set up a development environment.
     */
    async setupEnvironment(tech: string): Promise<AgentResult> {
        return this.executeTask({
            id: `terminal_setup_${Date.now()}`,
            description: `Set up the development environment for ${tech}. Install necessary tools, dependencies, and configurations. Verify the setup works.`,
            priority: "high",
        });
    }

    /**
     * Run a specific command with error handling.
     */
    async runCommand(command: string, explanation?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `terminal_cmd_${Date.now()}`,
            description: `Execute this command: ${command}`,
            context: explanation ? `Purpose: ${explanation}` : undefined,
            priority: "medium",
        });
    }

    /**
     * Diagnose and fix a build/test failure.
     */
    async diagnoseFailure(errorOutput: string): Promise<AgentResult> {
        return this.executeTask({
            id: `terminal_diagnose_${Date.now()}`,
            description: "Diagnose and fix this build/test failure. Analyze the error output, identify the root cause, and apply the fix.",
            context: `Error output:\n${errorOutput}`,
            priority: "critical",
        });
    }
}