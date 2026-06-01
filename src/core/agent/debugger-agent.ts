import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import { BaseAgent, type AgentTask, type AgentResult, type AgentConfig } from "./base-agent";
import type { AgentRole } from "../../types";

// ============================================================
// SHEN AI — Debugger Agent
// Specializes in error analysis, root cause identification,
// and generating fixes. Analyzes stack traces, error messages,
// and code to find and resolve bugs.
// ============================================================

const DEBUGGER_SYSTEM_PROMPT = `You are SHEN AI's Debugger Agent — an expert in diagnosing and fixing software bugs.

## Your Role
- Analyze error messages, stack traces, and logs to identify root causes
- Read and examine code to find bugs and logic errors
- Generate precise fixes with explanations of what was wrong
- Suggest preventive measures to avoid similar bugs
- Handle runtime errors, type errors, logic bugs, and performance issues

## Your Approach
1. **Reproduce**: Understand the conditions that trigger the bug
2. **Isolate**: Narrow down to the specific code causing the issue
3. **Diagnose**: Identify the root cause, not just the symptom
4. **Fix**: Generate a complete, correct fix
5. **Verify**: Suggest how to test the fix
6. **Prevent**: Recommend ways to prevent similar issues

## Debugging Principles
- The bug is always in the code, never in the compiler (usually)
- Correlation does not imply causation — verify your hypotheses
- Check the simplest explanations first
- Read the actual error message carefully — it usually tells you what's wrong
- Consider edge cases: null, undefined, empty arrays, boundary conditions
- Look for off-by-one errors, race conditions, and state mutations

## Output Format
When debugging, structure your response as:
1. **Error Summary**: What's happening and where
2. **Root Cause**: Why it's happening (the actual bug)
3. **Fix**: The corrected code with changes highlighted
4. **Explanation**: Why the fix works
5. **Test**: How to verify the fix
6. **Prevention**: How to avoid this in the future`;

export class DebuggerAgent extends BaseAgent {
    constructor(providerRegistry: ProviderRegistry, toolRegistry: ToolRegistry) {
        const config: AgentConfig = {
            role: "debugger" as AgentRole,
            systemPrompt: DEBUGGER_SYSTEM_PROMPT,
            maxIterations: 15,
            temperature: 0.1,
            maxTokens: 8192,
            availableTools: ["read_file", "search_files", "list_files", "execute_command"],
        };
        super(providerRegistry, toolRegistry, config);
    }

    protected buildSystemPrompt(task: AgentTask): string {
        return `${DEBUGGER_SYSTEM_PROMPT}

## Current Debugging Task
${task.description}

${task.context ? `## Error Context\n${task.context}` : ""}
${task.files ? `## Files to Examine\n${task.files.join("\n")}` : ""}

Be thorough in your diagnosis. Read the relevant files before proposing fixes.`;
    }

    protected buildUserMessage(task: AgentTask): string {
        return `Debug this issue:

**Issue**: ${task.description}
${task.context ? `\n**Error/Context**: ${task.context}` : ""}
${task.files ? `\n**Relevant Files**: ${task.files.join(", ")}` : ""}

Please:
1. Read the relevant files
2. Identify the root cause
3. Provide a complete fix
4. Explain what was wrong and why the fix works`;
    }

    /**
     * Debug an error with stack trace.
     */
    async debugError(errorMessage: string, files: string[], context?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `debug_error_${Date.now()}`,
            description: `Debug and fix this error: ${errorMessage}`,
            context: `Error message/stack trace:\n${context || errorMessage}`,
            files,
            priority: "critical",
        });
    }

    /**
     * Analyze code for potential bugs.
     */
    async analyzeForBugs(files: string[], context?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `debug_analyze_${Date.now()}`,
            description: "Analyze these files for potential bugs, logic errors, edge cases, and code smells. Report all findings with severity levels and suggested fixes.",
            context,
            files,
            priority: "high",
        });
    }

    /**
     * Fix a specific bug in a file.
     */
    async fixBug(filePath: string, bugDescription: string, context?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `debug_fix_${Date.now()}`,
            description: `Fix this bug in ${filePath}: ${bugDescription}`,
            context,
            files: [filePath],
            priority: "high",
        });
    }
}