import { EventEmitter } from "events";
import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import type { ProviderMessage, ToolDefinition, AgentRole } from "../../types";
import { logger } from "../../utils/logger";
import { generateId } from "../../utils/helpers";

// ============================================================
// SHEN AI — Base Agent (Specialist Agent Foundation)
// All specialist agents extend this class.
// ============================================================

export interface AgentTask {
    id: string;
    description: string;
    context?: string;
    files?: string[];
    priority: "low" | "medium" | "high" | "critical";
    assignedBy?: string;
}

export interface AgentResult {
    taskId: string;
    content: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown>; result: string }>;
    tokensUsed: number;
    duration: number;
    success: boolean;
    error?: string;
}

export interface AgentConfig {
    role: AgentRole;
    systemPrompt: string;
    maxIterations: number;
    temperature: number;
    maxTokens: number;
    availableTools: string[]; // tool names this agent can use
}

export abstract class BaseAgent extends EventEmitter {
    readonly id: string;
    readonly role: AgentRole;

    protected providerRegistry: ProviderRegistry;
    protected toolRegistry: ToolRegistry;
    protected config: AgentConfig;
    protected isRunning: boolean;
    protected currentTask: AgentTask | null;
    protected completedTasks: number;
    protected failedTasks: number;

    constructor(
        providerRegistry: ProviderRegistry,
        toolRegistry: ToolRegistry,
        config: AgentConfig
    ) {
        super();
        this.id = `${config.role}_${generateId().substring(0, 8)}`;
        this.role = config.role;
        this.providerRegistry = providerRegistry;
        this.toolRegistry = toolRegistry;
        this.config = config;
        this.isRunning = false;
        this.currentTask = null;
        this.completedTasks = 0;
        this.failedTasks = 0;
    }

    /**
     * Execute a task. Override in subclasses for specialized behavior.
     */
    async executeTask(task: AgentTask): Promise<AgentResult> {
        if (this.isRunning) {
            throw new Error(`Agent ${this.id} is already running a task.`);
        }

        this.isRunning = true;
        this.currentTask = task;
        const startTime = Date.now();

        this.emit("taskStarted", { agentId: this.id, task });
        logger.info(`[${this.role}] Agent ${this.id} started task: ${task.description.substring(0, 80)}...`);

        try {
            const result = await this.runTaskLoop(task);
            this.completedTasks++;
            this.emit("taskCompleted", { agentId: this.id, result });
            logger.info(`[${this.role}] Agent ${this.id} completed task in ${Date.now() - startTime}ms`);
            return result;
        } catch (error) {
            this.failedTasks++;
            const errorMsg = (error as Error).message;
            this.emit("taskFailed", { agentId: this.id, error: errorMsg });
            logger.warn(`[${this.role}] Agent ${this.id} failed task: ${errorMsg}`);
            return {
                taskId: task.id,
                content: "",
                tokensUsed: 0,
                duration: Date.now() - startTime,
                success: false,
                error: errorMsg,
            };
        } finally {
            this.isRunning = false;
            this.currentTask = null;
        }
    }

    /**
     * Main task execution loop with tool calling.
     * Override `buildSystemPrompt` and `preProcessTask` in subclasses.
     */
    protected async runTaskLoop(task: AgentTask): Promise<AgentResult> {
        const systemPrompt = this.buildSystemPrompt(task);
        const messages: ProviderMessage[] = [
            { role: "system", content: systemPrompt },
            { role: "user", content: this.buildUserMessage(task) },
        ];

        const allTools = this.toolRegistry.getToolDefinitions();
        const availableTools = allTools.filter((t) =>
            this.config.availableTools.includes(t.name)
        );

        let totalTokens = 0;
        let iteration = 0;
        const toolResults: AgentResult["toolCalls"] = [];
        let finalContent = "";

        while (iteration < this.config.maxIterations) {
            iteration++;

            const response = await this.providerRegistry.sendMessage(
                messages,
                availableTools.length > 0 ? availableTools : undefined
            );

            totalTokens += response.usage.totalTokens;
            finalContent = response.content;

            // If no tool calls, we're done
            if (response.toolCalls.length === 0) {
                break;
            }

            // Add assistant message ONCE (before all tool results)
            messages.push({
                role: "assistant",
                content: response.content,
            });

            // Execute tool calls and collect results
            for (const tc of response.toolCalls) {
                let parsedArgs: Record<string, unknown> = {};
                try {
                    parsedArgs = JSON.parse(tc.arguments);
                } catch {
                    parsedArgs = {};
                }

                const result = await this.toolRegistry.executeTool({
                    id: tc.id,
                    name: tc.name,
                    arguments: parsedArgs,
                });

                toolResults.push({
                    name: tc.name,
                    arguments: parsedArgs,
                    result: result.content,
                });

                // Add tool result to messages
                messages.push(this.providerRegistry.getActiveProvider()?.formatToolResult(tc.id, result.content) || {
                    role: "tool",
                    content: result.content,
                    tool_call_id: tc.id,
                });
            }
        }

        return {
            taskId: task.id,
            content: finalContent,
            toolCalls: toolResults,
            tokensUsed: totalTokens,
            duration: 0, // Set by caller
            success: true,
        };
    }

    /**
     * Build the system prompt for this agent. Override in subclasses.
     */
    protected buildSystemPrompt(task: AgentTask): string {
        return `${this.config.systemPrompt}

You are working on: ${task.description}
${task.context ? `Additional context: ${task.context}` : ""}
${task.files ? `Relevant files: ${task.files.join(", ")}` : ""}

Use tools when needed. Provide complete, working solutions.`;
    }

    /**
     * Build the user message from the task. Override in subclasses.
     */
    protected buildUserMessage(task: AgentTask): string {
        return task.description;
    }

    /**
     * Cancel the current task.
     */
    cancel(): void {
        this.providerRegistry.cancel();
        this.isRunning = false;
        this.currentTask = null;
        this.emit("taskCancelled", { agentId: this.id });
    }

    /**
     * Get agent status.
     */
    getStatus(): {
        id: string;
        role: AgentRole;
        isRunning: boolean;
        currentTask: AgentTask | null;
        completedTasks: number;
        failedTasks: number;
    } {
        return {
            id: this.id,
            role: this.role,
            isRunning: this.isRunning,
            currentTask: this.currentTask,
            completedTasks: this.completedTasks,
            failedTasks: this.failedTasks,
        };
    }

    dispose(): void {
        this.cancel();
        this.removeAllListeners();
    }
}