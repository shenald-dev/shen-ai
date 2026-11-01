import type {
    ChatMessage,
    ToolCall,
    ToolResult,
    ProviderMessage,
    PersonalityType,
    ProviderToolCall,
} from "../../types";
import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import { ConversationHistory } from "./conversation-history";
import { ContextManager } from "../memory/context-manager";
import { generateId } from "../../utils/helpers";
import { logger } from "../../utils/logger";
import type { OrchestratorAgent } from "../agent/orchestrator-agent";
import type { ReviewerAgent } from "../agent/reviewer-agent";
import type { DebuggerAgent } from "../agent/debugger-agent";
import type { ArchitectAgent } from "../agent/architect-agent";
import type { ResearchAgent } from "../agent/research-agent";
import type { SwarmOrchestrator } from "../swarm/swarm-orchestrator";
import type { VitalMonitor } from "../health/vital-monitor";
import type { ConversationSummarizer } from "./conversation-summarizer";

export interface ChatManagerDependencies {
    orchestrator?: OrchestratorAgent;
    swarmOrchestrator?: SwarmOrchestrator;
    vitalMonitor?: VitalMonitor;
    summarizer?: ConversationSummarizer;
    activeFileProvider?: () => string | undefined;
}

// ============================================================
// SHEN AI — Chat Manager (Core Agent Loop)
// ============================================================

export type StreamingCallback = (chunk: string, isComplete: boolean, toolCalls?: ProviderToolCall[]) => void;
export type ToolCallCallback = (toolCall: ToolCall) => void;
export type ToolResultCallback = (result: ToolResult) => void;
export type DoneCallback = (finalContent: string, totalTokens: number) => void;
export type ErrorCallback = (error: string) => void;

export interface ChatCallbacks {
    onStreaming?: StreamingCallback;
    onToolCall?: ToolCallCallback;
    onToolResult?: ToolResultCallback;
    onDone?: DoneCallback;
    onError?: ErrorCallback;
}

// Feature settings interface for system prompt injection
export interface FeatureSettings {
    enableCodeDNAProfiling?: boolean;
    enableSmartCheckpointRollback?: boolean;
    enableBlastRadiusAnalyzer?: boolean;
    enableCodeValidator?: boolean;
    enableConversationSummarizer?: boolean;
    enableSelfEvolvingPrompts?: boolean;
    styleProfile?: Record<string, unknown>;
}

const MAX_TOOL_ITERATIONS = 20;

const PERSONALITY_PROMPTS: Record<PersonalityType, string> = {
    mentor: `You are a patient, knowledgeable mentor. Explain concepts thoroughly, provide context, and teach best practices. Use examples and analogies to help the user understand. Always explain WHY something works, not just HOW.`,
    "senior-dev": `You are a senior software engineer. Be direct, concise, and pragmatic. Focus on production-quality code, best practices, and clean architecture. Provide code solutions with minimal explanation unless asked. Prioritize correctness, performance, and maintainability.`,
    hacker: `You are a creative hacker. Think outside the box, find clever solutions, and push boundaries. You love unconventional approaches and elegant hacks. Be fast, creative, and resourceful.`,
    reviewer: `You are a strict code reviewer. Catch every issue, enforce best practices, and prioritize security. Be thorough and detail-oriented. Point out potential bugs, security vulnerabilities, and code smells. Suggest improvements for every piece of code you see.`,
    socratic: `You are a Socratic teacher. Instead of giving direct answers, ask guiding questions that lead the user to discover the solution themselves. Help them think critically and develop problem-solving skills. Only provide direct answers when the user is truly stuck.`,
    "silent-partner": `You are a silent partner. Only speak when necessary. Provide minimal, focused responses. No unnecessary explanations or pleasantries. Just the code or answer the user needs. Be efficient and unobtrusive.`,
};

export class ChatManager {
    private providerRegistry: ProviderRegistry;
    private toolRegistry: ToolRegistry;
    private history: ConversationHistory;
    private contextManager: ContextManager;
    private isRunning: boolean;
    private currentAbortController: AbortController | null;
    private maxContextTokens: number;
    private deps?: ChatManagerDependencies;

    constructor(
        providerRegistry: ProviderRegistry,
        toolRegistry: ToolRegistry,
        maxContextTokens: number = 200000,
        deps?: ChatManagerDependencies
    ) {
        this.providerRegistry = providerRegistry;
        this.toolRegistry = toolRegistry;
        this.history = new ConversationHistory();
        this.contextManager = new ContextManager(maxContextTokens);
        this.isRunning = false;
        this.currentAbortController = null;
        this.maxContextTokens = maxContextTokens;
        this.deps = deps;
    }

    public setDependencies(deps: ChatManagerDependencies): void {
        this.deps = { ...this.deps, ...deps };
    }

    getHistory(): ConversationHistory {
        return this.history;
    }

    newConversation(): void {
        const provider = this.providerRegistry.getActiveProvider();
        this.history.createNewConversation({
            provider: provider?.name as any || "anthropic",
            model: "",
            apiKey: "",
            temperature: 0,
            maxTokens: 8192,
        });
    }

    cancelCurrentTask(): void {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
        this.providerRegistry.cancel();
        this.isRunning = false;
        logger.info("Chat task cancelled.");
    }

    async sendMessage(
        userContent: string,
        callbacks: ChatCallbacks,
        personality: PersonalityType = "senior-dev",
        agentMode: "act" | "plan" = "act",
        featureSettings?: FeatureSettings
    ): Promise<void> {
        if (this.isRunning) {
            callbacks.onError?.("A task is already running. Please wait or cancel.");
            return;
        }

        this.isRunning = true;
        this.currentAbortController = new AbortController();

        try {
            // Add user message to history
            const userMessage: ChatMessage = {
                id: generateId(),
                type: "user",
                content: userContent,
                timestamp: Date.now(),
            };
            this.history.addMessage(userMessage);

            // Check for slash commands
            if (userContent.trim().startsWith("/")) {
                const trimmed = userContent.trim();
                const spaceIdx = trimmed.indexOf(" ");
                const command = spaceIdx === -1 ? trimmed.toLowerCase() : trimmed.substring(0, spaceIdx).toLowerCase();
                const args = spaceIdx === -1 ? "" : trimmed.substring(spaceIdx + 1).trim();

                const handled = await this.handleSlashCommand(command, args, callbacks);
                if (handled) {
                    return;
                }
            }

            // Build system prompt with feature injections
            const systemPrompt = this.buildSystemPrompt(personality, agentMode, featureSettings);

            // Run the agent loop
            await this.agentLoop(systemPrompt, callbacks, agentMode);
        } catch (error) {
            const errorMsg = (error as Error).message;
            logger.error("Chat error:", error);
            callbacks.onError?.(errorMsg);

            const errorMessage: ChatMessage = {
                id: generateId(),
                type: "error",
                content: errorMsg,
                timestamp: Date.now(),
            };
            this.history.addMessage(errorMessage);
        } finally {
            this.isRunning = false;
            this.currentAbortController = null;
        }
    }

    private buildSystemPrompt(
        personality: PersonalityType,
        agentMode: "act" | "plan",
        featureSettings?: FeatureSettings
    ): string {
        const personalityPrompt = PERSONALITY_PROMPTS[personality] || PERSONALITY_PROMPTS["senior-dev"];
        const modePrompt = agentMode === "plan"
            ? "\n\n[PLAN MODE ACTIVE]\nYou are currently in PLAN MODE. Your job is to analyze the codebase, read files, and write out a step-by-step implementation plan. YOU MUST NOT attempt to modify files or execute commands. You only have access to read-only tools.\nWhen you are finished planning, you must end your message with: 'Ready to execute. Awaiting approval to switch to ACT MODE and apply changes.'"
            : "\n\n[ACT MODE ACTIVE]\nYou are in ACT MODE. You have full permission to modify files and execute commands to solve the user's request.";

        // Build feature-specific prompt injections
        let featurePrompts = "";

        if (featureSettings) {
            // Code DNA Profiling (Real Feature - Working Implementation)
            if (featureSettings.enableCodeDNAProfiling) {
                const style = featureSettings.styleProfile || {};
                const namingConvention = style["namingConvention"] || "camelCase";
                const quoteStyle = style["quoteStyle"] || "double";
                const semicolons = style["semicolonUsage"] || "always";
                featurePrompts += `
## 🧬 Code DNA Profiling [ACTIVE]
Match the user's coding style precisely:
- Naming convention: ${namingConvention}
- Quote style: ${quoteStyle === "single" ? "single quotes" : "double quotes"}
- Semicolons: ${semicolons === "never" ? "omit semicolons" : "use semicolons"}
Adapt your generated code to match these style preferences exactly.`;
            }

            // Blast Radius Analyzer (Real Feature - Working Implementation)
            if (featureSettings.enableBlastRadiusAnalyzer) {
                featurePrompts += `
## 💥 Blast Radius Analyzer [ACTIVE]
Before modifying any file, consider what other files depend on it. When you read a file, check for imports/exports and warn the user if changes might break dependent files. Always think about the impact of your changes.`;
            }

            // Code Validator (Real Feature - Working Implementation)
            if (featureSettings.enableCodeValidator) {
                featurePrompts += `
## ✅ Code Validator [ACTIVE]
Before applying any code changes, validate for:
- Syntax errors and balanced brackets
- Proper import statements
- Common bugs (unclosed strings, missing semicolons)
- Type consistency
Your code will be automatically validated before application.`;
            }

            // Conversation Summarizer (Real Feature - Working Implementation)
            if (featureSettings.enableConversationSummarizer) {
                featurePrompts += `
## 📉 Smart Conversation Summarizer [ACTIVE]
Long conversations are automatically compressed to save context tokens while preserving key decisions and code changes. This allows for longer, more productive sessions.`;
            }
        }

        // Self-Evolving Prompts (existing feature)
        if (featureSettings?.enableSelfEvolvingPrompts) {
            featurePrompts += `
## 🧠 Self-Evolving Prompts [ACTIVE]
You learn from user corrections. When the user corrects your code, analyze what went wrong and adapt your approach for future responses.`;
        }

        return `You are SHEN AI, an advanced autonomous coding assistant operating inside VS Code.

${personalityPrompt}
${modePrompt}
${featurePrompts}

## Capabilities
You have access to tools that let you:
- Read, write, and search files in the workspace
- Make targeted edits to specific parts of files (replace_in_file)
- Apply unified diff patches (apply_diff)
- Execute shell commands
- Navigate and understand codebases

## Rules
1. ALWAYS use tools when you need to interact with the workspace
2. When writing code, provide COMPLETE, WORKING code — never use placeholders or pseudocode
3. For SMALL changes to existing files, use replace_in_file with SEARCH/REPLACE blocks — it's more precise than write_to_file
4. For LARGE changes or new files, use write_to_file with the COMPLETE file content
5. When using replace_in_file, your SEARCH block must match the file content EXACTLY (including whitespace, indentation, and line endings)
6. CRITICAL: When using read_file or analyzing folders, DO NOT output the raw code or file contents into your chat message. The user's UI already shows them what file you read. Instead, output a VERY SHORT status message like "Analyzing index.html..." or "Coding server.js...".
7. CRITICAL: Keep your chat responses extremely brief. Simply state what you are doing (e.g. "Analyzing project structure..."), what you are going to do, and what you just completed.
8. Format code blocks with proper syntax highlighting only when explicitly asking the user to review a specific snippet.
9. Use relative paths from workspace root for all file operations
10. If a command might be destructive, explain what it does first
11. ALWAYS read a file before modifying it with replace_in_file
12. NEVER output raw XML or markdown tags for tools (e.g. <write_to_file>). You MUST use the native JSON tool calling API provided by the platform.

## File Operations
- Use read_file to examine files before modifying them
- Use write_to_file to create new files or completely overwrite existing files
- Use replace_in_file for targeted edits to specific parts of a file (preferred for small changes)
- Use apply_diff to apply unified diff patches
- Use list_files to explore directory structure
- Use search_files to find code patterns
- Use execute_command to run shell commands

## replace_in_file Format
\`\`\`
------- SEARCH
[exact content to find in the file]
=======
[new content to replace it with]
+++++++ REPLACE
\`\`\`

Remember: You are operating inside a real development environment. Your actions have real effects.`;
    }

    private async agentLoop(
        systemPrompt: string,
        callbacks: ChatCallbacks,
        agentMode: "act" | "plan"
    ): Promise<void> {
        // Automatic context compression via ConversationSummarizer
        if (this.deps?.summarizer && this.deps.summarizer.needsSummarization(this.history.getMessages(), this.maxContextTokens)) {
            try {
                const activeConv = this.history.getActiveConversation();
                const convId = activeConv ? activeConv.id : "current";
                const { summary, messagesToKeep } = await this.deps.summarizer.summarizeConversation(
                    this.history.getMessages(),
                    convId
                );
                this.history.replaceWithSummary(summary.summaryText, messagesToKeep);
                logger.info(`Context auto-summarized: preserved ${messagesToKeep.length} recent messages, saved ${summary.tokensSaved} tokens.`);
            } catch (summarizeErr) {
                logger.warn("Conversation summarization failed, continuing with full context:", summarizeErr);
            }
        }

        let toolDefinitions = this.toolRegistry.getToolDefinitions();
        if (agentMode === "plan") {
            const allowedTools = new Set(["read_file", "list_files", "search_files", "git_status", "git_branch", "git_log"]);
            toolDefinitions = toolDefinitions.filter(t => allowedTools.has(t.name));
        }
        let iteration = 0;

        while (iteration < MAX_TOOL_ITERATIONS) {
            iteration++;
            logger.info(`Agent loop iteration ${iteration}/${MAX_TOOL_ITERATIONS}`);

            // Build messages for provider
            const providerMessages = this.buildProviderMessages(systemPrompt);

            // Call the provider with streaming
            let assistantContent = "";
            const toolCalls: ToolCall[] = [];

            try {
                const response = await this.providerRegistry.sendMessageStreaming(
                    providerMessages,
                    (chunk) => {
                        if (chunk.content) {
                            assistantContent += chunk.content;
                        }
                        if (chunk.content || chunk.toolCalls) {
                            callbacks.onStreaming?.(chunk.content || "", chunk.isComplete, chunk.toolCalls);
                        }
                        if (chunk.toolCalls && chunk.isComplete) {
                            for (const tc of chunk.toolCalls) {
                                let parsedArgs: Record<string, unknown> = {};
                                try {
                                    parsedArgs = JSON.parse(tc.arguments);
                                } catch {
                                    parsedArgs = {};
                                }
                                toolCalls.push({
                                    id: tc.id,
                                    name: tc.name,
                                    arguments: parsedArgs,
                                });
                            }
                        }
                    },
                    toolDefinitions,
                    this.currentAbortController?.signal
                );

                // Collect any remaining tool calls from response that weren't captured during streaming
                // Deduplicate by tool call ID to prevent duplicate execution
                if (response.toolCalls.length > 0) {
                    const existingIds = new Set(toolCalls.map((tc) => tc.id));
                    for (const tc of response.toolCalls) {
                        if (existingIds.has(tc.id)) continue; // Skip duplicates
                        let parsedArgs: Record<string, unknown> = {};
                        try {
                            parsedArgs = JSON.parse(tc.arguments);
                        } catch {
                            parsedArgs = {};
                        }
                        toolCalls.push({
                            id: tc.id,
                            name: tc.name,
                            arguments: parsedArgs,
                        });
                    }
                }

                // Save assistant message to history
                const assistantMessage: ChatMessage = {
                    id: generateId(),
                    type: "assistant",
                    content: assistantContent,
                    timestamp: Date.now(),
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    tokensUsed: response.usage.totalTokens,
                };
                this.history.addMessage(assistantMessage);

                // If no tool calls, we're done
                if (toolCalls.length === 0) {
                    callbacks.onDone?.(assistantContent, response.usage.totalTokens);
                    return;
                }

                // Execute tool calls
                const toolResults: ToolResult[] = [];
                for (const toolCall of toolCalls) {
                    callbacks.onToolCall?.(toolCall);
                    logger.info(`Executing tool: ${toolCall.name}`, toolCall.arguments);

                    const result = await this.toolRegistry.executeTool(toolCall);
                    toolResults.push(result);
                    callbacks.onToolResult?.(result);

                    logger.info(`Tool ${toolCall.name} result:`, result.isError ? "ERROR" : "OK");

                    // Track file context for read/write operations
                    if (toolCall.name === "read_file" && !result.isError) {
                        const filePath = toolCall.arguments.path as string;
                        this.contextManager.addFileContext({
                            path: filePath,
                            content: result.content,
                            priority: 10 - iteration, // Higher priority for recently read files
                            reason: `Read during task execution (iteration ${iteration})`,
                        });
                    }
                }

                // Add tool results to history
                const toolMessage: ChatMessage = {
                    id: generateId(),
                    type: "tool",
                    content: toolResults.map((r) => `[${r.name}]: ${r.content}`).join("\n\n"),
                    timestamp: Date.now(),
                    toolResults,
                };
                this.history.addMessage(toolMessage);

            } catch (error) {
                if ((error as Error).name === "AbortError") {
                    logger.info("Agent loop aborted.");
                    return;
                }
                throw error;
            }
        }

        // Max iterations reached
        const maxMsg: ChatMessage = {
            id: generateId(),
            type: "info",
            content: `Reached maximum tool iterations (${MAX_TOOL_ITERATIONS}). Please refine your request.`,
            timestamp: Date.now(),
        };
        this.history.addMessage(maxMsg);
        callbacks.onError?.(`Reached maximum tool iterations (${MAX_TOOL_ITERATIONS}).`);
    }

    private buildProviderMessages(systemPrompt: string): ProviderMessage[] {
        // Set system prompt in context manager
        this.contextManager.setSystemPrompt(systemPrompt);
        this.contextManager.setMaxTokens(this.maxContextTokens);

        // Get raw provider messages from history
        const historyMessages = this.history.getMessagesForProvider();

        // Build optimized context window
        const contextWindow = this.contextManager.buildContextWindow(historyMessages);

        const messages: ProviderMessage[] = [
            { role: "system", content: contextWindow.systemPrompt },
            ...contextWindow.messages,
        ];

        if (contextWindow.truncated) {
            logger.info(`Context window: ${contextWindow.totalTokens}/${contextWindow.maxTokens} tokens (messages were truncated)`);
        } else {
            logger.debug(`Context window: ${contextWindow.totalTokens}/${contextWindow.maxTokens} tokens`);
        }

        return messages;
    }

    /**
     * Track file context for smart context management.
     */
    trackFileContext(filePath: string, content: string, reason: string, priority: number = 5): void {
        this.contextManager.addFileContext({
            path: filePath,
            content,
            priority,
            reason,
        });
    }

    /**
     * Remove a file from tracked context.
     */
    untrackFileContext(filePath: string): void {
        this.contextManager.removeFileContext(filePath);
    }

    /**
     * Get context statistics.
     */
    getContextStats(): { fileContexts: number; totalFileTokens: number } {
        return this.contextManager.getStats();
    }

    private async handleSlashCommand(
        command: string,
        args: string,
        callbacks: ChatCallbacks
    ): Promise<boolean> {
        const activeFile = this.deps?.activeFileProvider?.();

        switch (command) {
            case "/help": {
                const helpText = `### 🧬 SHEN AI — Command & Specialist Guide

| Command | Specialist / Purpose | Description |
| :--- | :--- | :--- |
| \`/review [file]\` | **Reviewer Agent** | Performs a deep security, quality, and maintainability audit |
| \`/debug <issue>\` | **Debugger Agent** | Diagnoses root cause, inspects stack traces, and suggests fixes |
| \`/architect <feature>\` | **Architect Agent** | Designs module topology, file blueprints, and interface contracts |
| \`/research <topic>\` | **Research Agent** | Researches codebase structure, API usage, and design patterns |
| \`/swarm <task>\` | **Swarm Orchestrator** | Decomposes and executes parallel multi-agent tasks |
| \`/health\` | **Vital Monitor** | Runs real-time health diagnostic scan with prescriptions |
| \`/clear\` | **Session** | Clears the active chat conversation history |
| \`/help\` | **Guide** | Displays this command guide |

**Modes:** Toggle between **Plan Mode** (read-only architectural planning) and **Act Mode** (autonomous file editing and command execution).`;
                callbacks.onStreaming?.(helpText, true);
                const assistantMessage: ChatMessage = {
                    id: generateId(),
                    type: "assistant",
                    content: helpText,
                    timestamp: Date.now(),
                };
                this.history.addMessage(assistantMessage);
                callbacks.onDone?.(helpText, 0);
                return true;
            }

            case "/health": {
                callbacks.onStreaming?.("💓 Initiating workspace health diagnostic scan...\n", false);
                if (this.deps?.vitalMonitor) {
                    try {
                        const report = await this.deps.vitalMonitor.scanHealth();
                        const statusEmoji = report.overallStatus === "excellent" ? "🟢" : report.overallStatus === "good" ? "🟡" : "🔴";
                        let responseText = `## 💓 Workspace Health Report\n\n`;
                        responseText += `**Overall Score**: ${statusEmoji} **${report.overallScore}/100** (${report.overallStatus.toUpperCase()})\n\n`;
                        responseText += `### Key Metrics\n`;
                        for (const metric of report.metrics) {
                            const trend = metric.trend === "improving" ? "📈" : metric.trend === "degrading" ? "📉" : "➡️";
                            responseText += `- **${metric.name}**: ${Math.round(metric.value)} ${metric.unit} (${metric.status}) ${trend} — ${metric.description}\n`;
                        }
                        if (report.prescriptions.length > 0) {
                            responseText += `\n### Recommended Prescriptions\n`;
                            for (const rx of report.prescriptions.slice(0, 5)) {
                                responseText += `- **[${rx.severity.toUpperCase()}] ${rx.title}**: ${rx.suggestedAction}\n`;
                            }
                        }
                        callbacks.onStreaming?.(responseText, true);
                        const assistantMessage: ChatMessage = {
                            id: generateId(),
                            type: "assistant",
                            content: responseText,
                            timestamp: Date.now(),
                        };
                        this.history.addMessage(assistantMessage);
                        callbacks.onDone?.(responseText, 0);
                        return true;
                    } catch (err) {
                        callbacks.onError?.(`Health scan failed: ${(err as Error).message}`);
                        return true;
                    }
                } else {
                    const fallback = "Health monitor is not configured in this environment.";
                    callbacks.onStreaming?.(fallback, true);
                    callbacks.onDone?.(fallback, 0);
                    return true;
                }
            }

            case "/swarm": {
                if (!args) {
                    callbacks.onError?.("Please specify a task for Swarm Mode, e.g.: `/swarm Refactor auth pipeline with tests`");
                    return true;
                }
                callbacks.onStreaming?.(`🐝 Swarm Mode engaged. Decomposing task: "${args}"...\n`, false);
                if (this.deps?.swarmOrchestrator) {
                    try {
                        const task = await this.deps.swarmOrchestrator.executeSwarmTask(args);
                        const completed = task.subTasks.filter(s => s.status === "completed").length;
                        const durationSec = task.duration ? Math.round(task.duration / 1000) : 0;
                        let summary = `## 🐝 Swarm Execution Completed\n\n`;
                        summary += `**Status**: ${task.status.toUpperCase()} (${completed}/${task.subTasks.length} subtasks succeeded in ${durationSec}s)\n\n`;
                        summary += `### Subtasks\n`;
                        for (const st of task.subTasks) {
                            const icon = st.status === "completed" ? "✅" : "❌";
                            summary += `- ${icon} **${st.description}** (${st.status})\n`;
                            if (st.result) summary += `  ${st.result.substring(0, 150)}...\n`;
                        }
                        callbacks.onStreaming?.(summary, true);
                        const assistantMessage: ChatMessage = {
                            id: generateId(),
                            type: "assistant",
                            content: summary,
                            timestamp: Date.now(),
                        };
                        this.history.addMessage(assistantMessage);
                        callbacks.onDone?.(summary, 0);
                        return true;
                    } catch (err) {
                        callbacks.onError?.(`Swarm execution failed: ${(err as Error).message}`);
                        return true;
                    }
                }
                return false;
            }

            case "/review": {
                callbacks.onStreaming?.("🔍 Reviewer Agent activated. Inspecting code quality and security...\n", false);
                const reviewer = (this.deps?.orchestrator?.getAgent("reviewer") as ReviewerAgent) || null;
                const targetFiles = args ? [args] : (activeFile ? [activeFile] : []);
                if (reviewer) {
                    try {
                        const result = await reviewer.executeTask({
                            id: `review_${Date.now()}`,
                            description: args || "Review active file for security, performance, correctness, and architecture.",
                            files: targetFiles,
                            context: activeFile ? `Active editor file: ${activeFile}` : undefined,
                            priority: "high",
                        });
                        const responseContent = result.content || "Review completed with no critical issues detected.";
                        callbacks.onStreaming?.(responseContent, true);
                        const assistantMessage: ChatMessage = {
                            id: generateId(),
                            type: "assistant",
                            content: responseContent,
                            timestamp: Date.now(),
                            tokensUsed: result.tokensUsed,
                        };
                        this.history.addMessage(assistantMessage);
                        callbacks.onDone?.(responseContent, result.tokensUsed || 0);
                        return true;
                    } catch (err) {
                        callbacks.onError?.(`Reviewer failed: ${(err as Error).message}`);
                        return true;
                    }
                }
                break;
            }

            case "/debug": {
                if (!args && !activeFile) {
                    callbacks.onError?.("Please specify an error message, stack trace, or file to debug, e.g.: `/debug TypeError: cannot read properties of undefined`");
                    return true;
                }
                callbacks.onStreaming?.("🐛 Debugger Agent activated. Analyzing root cause...\n", false);
                const debuggerAgent = (this.deps?.orchestrator?.getAgent("debugger") as DebuggerAgent) || null;
                const targetFiles = activeFile ? [activeFile] : [];
                if (debuggerAgent) {
                    try {
                        const result = await debuggerAgent.debugError(args || "Diagnose potential runtime errors and edge cases", targetFiles);
                        const responseContent = result.content || "Diagnosis complete.";
                        callbacks.onStreaming?.(responseContent, true);
                        const assistantMessage: ChatMessage = {
                            id: generateId(),
                            type: "assistant",
                            content: responseContent,
                            timestamp: Date.now(),
                            tokensUsed: result.tokensUsed,
                        };
                        this.history.addMessage(assistantMessage);
                        callbacks.onDone?.(responseContent, result.tokensUsed || 0);
                        return true;
                    } catch (err) {
                        callbacks.onError?.(`Debugger failed: ${(err as Error).message}`);
                        return true;
                    }
                }
                break;
            }

            case "/architect": {
                if (!args) {
                    callbacks.onError?.("Please provide a feature description to architect, e.g.: `/architect Real-time notification pipeline with WebSockets`");
                    return true;
                }
                callbacks.onStreaming?.("📐 Architect Agent activated. Formulating system design & component topology...\n", false);
                const architectAgent = (this.deps?.orchestrator?.getAgent("architect") as ArchitectAgent) || null;
                if (architectAgent) {
                    try {
                        const result = await architectAgent.designSystem(args, "High maintainability, modularity, and clean error boundaries", activeFile ? [activeFile] : undefined);
                        const responseContent = result.content || "Architecture plan generated.";
                        callbacks.onStreaming?.(responseContent, true);
                        const assistantMessage: ChatMessage = {
                            id: generateId(),
                            type: "assistant",
                            content: responseContent,
                            timestamp: Date.now(),
                            tokensUsed: result.tokensUsed,
                        };
                        this.history.addMessage(assistantMessage);
                        callbacks.onDone?.(responseContent, result.tokensUsed || 0);
                        return true;
                    } catch (err) {
                        callbacks.onError?.(`Architect failed: ${(err as Error).message}`);
                        return true;
                    }
                }
                break;
            }

            case "/research": {
                if (!args) {
                    callbacks.onError?.("Please specify a topic or question to research, e.g.: `/research How state synchronization is handled across webview and extension`");
                    return true;
                }
                callbacks.onStreaming?.("🔬 Research Agent activated. Querying codebase and patterns...\n", false);
                const researchAgent = (this.deps?.orchestrator?.getAgent("researcher") as ResearchAgent) || null;
                if (researchAgent) {
                    try {
                        const result = await researchAgent.research(args, activeFile ? [activeFile] : undefined);
                        const responseContent = result.content || "Research completed.";
                        callbacks.onStreaming?.(responseContent, true);
                        const assistantMessage: ChatMessage = {
                            id: generateId(),
                            type: "assistant",
                            content: responseContent,
                            timestamp: Date.now(),
                            tokensUsed: result.tokensUsed,
                        };
                        this.history.addMessage(assistantMessage);
                        callbacks.onDone?.(responseContent, result.tokensUsed || 0);
                        return true;
                    } catch (err) {
                        callbacks.onError?.(`Researcher failed: ${(err as Error).message}`);
                        return true;
                    }
                }
                break;
            }

            case "/clear": {
                this.history.clearMessages();
                const clearMsg = "Conversation history has been cleared.";
                callbacks.onStreaming?.(clearMsg, true);
                callbacks.onDone?.(clearMsg, 0);
                return true;
            }
        }

        return false;
    }
}
