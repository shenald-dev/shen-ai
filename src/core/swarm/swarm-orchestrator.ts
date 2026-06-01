import { EventEmitter } from "events";
import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import type { ChatManager } from "../chat/chat-manager";
import { AgentMessageBus, type MessageType } from "./agent-message-bus";
import { ConflictResolver } from "./conflict-resolver";
import { logger } from "../../utils/logger";
import { generateId } from "../../utils/helpers";

// ============================================================
// SHEN AI — Swarm Orchestrator (Parallel Multi-Agent Execution)
// Decomposes complex tasks into subtasks, assigns them to
// specialized agents that work in parallel, coordinates through
// the message bus, and resolves conflicts.
// ============================================================

export type SwarmAgentRole = "coder" | "architect" | "tester" | "reviewer" | "researcher";

export interface SwarmAgent {
    id: string;
    role: SwarmAgentRole;
    status: "idle" | "working" | "waiting" | "done" | "error";
    currentTask?: SubTask;
    completedTasks: number;
    errorCount: number;
}

export interface SubTask {
    id: string;
    description: string;
    assignedAgentId?: string;
    status: "pending" | "in_progress" | "completed" | "failed" | "blocked";
    files: string[]; // files this task will touch
    dependencies: string[]; // task IDs that must complete first
    result?: string;
    error?: string;
    createdAt: number;
    completedAt?: number;
}

export interface SwarmTask {
    id: string;
    userRequest: string;
    subTasks: SubTask[];
    status: "planning" | "executing" | "completed" | "failed" | "cancelled";
    createdAt: number;
    completedAt?: number;
    duration?: number;
    totalAgents: number;
    conflicts: number;
}

export interface SwarmProgress {
    taskId: string;
    totalSubTasks: number;
    completedSubTasks: number;
    failedSubTasks: number;
    activeAgents: number;
    conflicts: number;
    estimatedCompletion?: number;
}

export class SwarmOrchestrator extends EventEmitter {
    private providerRegistry: ProviderRegistry;
    private toolRegistry: ToolRegistry;
    private chatManager: ChatManager;
    private messageBus: AgentMessageBus;
    private conflictResolver: ConflictResolver;
    private agents: Map<string, SwarmAgent>;
    private tasks: Map<string, SwarmTask>;
    private isRunning: boolean;
    private maxParallelAgents: number;

    constructor(
        providerRegistry: ProviderRegistry,
        toolRegistry: ToolRegistry,
        chatManager: ChatManager,
        maxParallelAgents: number = 5
    ) {
        super();
        this.providerRegistry = providerRegistry;
        this.toolRegistry = toolRegistry;
        this.chatManager = chatManager;
        this.messageBus = new AgentMessageBus();
        this.conflictResolver = new ConflictResolver();
        this.agents = new Map();
        this.tasks = new Map();
        this.isRunning = false;
        this.maxParallelAgents = maxParallelAgents;

        // Note: Message bus events are handled via per-agent subscriptions in executeSwarmTask.
        // No global handler needed here to avoid duplicate processing.
    }

    /**
     * Execute a complex task using swarm mode.
     */
    async executeSwarmTask(userRequest: string): Promise<SwarmTask> {
        // Atomic check-and-set using a lock promise to prevent TOCTOU race
        if (this.isRunning) {
            throw new Error("A swarm task is already running. Please wait or cancel.");
        }
        this.isRunning = true;

        // If somehow a previous task's cleanup hasn't completed, wait briefly
        if (this.agents.size > 0) {
            this.cleanupAgents();
        }
        const taskId = generateId();

        const task: SwarmTask = {
            id: taskId,
            userRequest,
            subTasks: [],
            status: "planning",
            createdAt: Date.now(),
            totalAgents: 0,
            conflicts: 0,
        };

        this.tasks.set(taskId, task);
        this.emit("taskStarted", task);
        logger.info(`Swarm task started: ${taskId}`);

        try {
            // Step 1: Decompose the task into subtasks using AI
            task.subTasks = await this.decomposeTask(userRequest);
            task.totalAgents = Math.min(task.subTasks.length, this.maxParallelAgents);

            this.emit("taskPlanned", {
                ...task,
                subTaskCount: task.subTasks.length,
            });
            logger.info(`Task decomposed into ${task.subTasks.length} subtasks`);

            // Step 2: Create agents
            this.createAgents(task.totalAgents);

            // Step 3: Register agents with conflict resolver
            // Subscribe each agent to message bus events (single handler per agent, no duplicates)
            for (const agent of this.agents.values()) {
                this.conflictResolver.registerAgent(agent.id);
                this.messageBus.subscribe(agent.id, [
                    "task_delegate",
                    "task_result",
                    "context_share",
                    "conflict_detected",
                    "coordination",
                ], (msg) => this.handleAgentMessage(msg));
            }

            // Step 4: Execute subtasks in parallel
            task.status = "executing";
            await this.executeSubTasks(task);

            // Step 5: Check results
            const failedTasks = task.subTasks.filter((st) => st.status === "failed");
            if (failedTasks.length > 0) {
                task.status = "failed";
                logger.warn(`Swarm task ${taskId} completed with ${failedTasks.length} failures`);
            } else {
                task.status = "completed";
                logger.info(`Swarm task ${taskId} completed successfully`);
            }

            task.completedAt = Date.now();
            this.emit("taskCompleted", task);

            return task;
        } catch (error) {
            task.status = "failed";
            task.completedAt = Date.now();
            logger.error(`Swarm task ${taskId} failed:`, error);
            this.emit("taskFailed", { task, error: (error as Error).message });
            throw error;
        } finally {
            this.isRunning = false;
            this.cleanupAgents();
        }
    }

    /**
     * Cancel the current swarm task.
     */
    cancelTask(): void {
        const activeTask = Array.from(this.tasks.values()).find(
            (t) => t.status === "executing" || t.status === "planning"
        );
        if (activeTask) {
            activeTask.status = "cancelled";
            activeTask.completedAt = Date.now();
            this.isRunning = false;
            this.cleanupAgents();
            this.emit("taskCancelled", activeTask);
            logger.info(`Swarm task ${activeTask.id} cancelled`);
        }
    }

    /**
     * Get current swarm status.
     */
    getStatus(): {
        isRunning: boolean;
        activeTask?: SwarmTask;
        agents: SwarmAgent[];
        progress?: SwarmProgress;
        conflictStats: ReturnType<ConflictResolver["getStats"]>;
    } {
        const activeTask = Array.from(this.tasks.values()).find(
            (t) => t.status === "executing" || t.status === "planning"
        );

        let progress: SwarmProgress | undefined;
        if (activeTask) {
            const completed = activeTask.subTasks.filter((st) => st.status === "completed").length;
            const failed = activeTask.subTasks.filter((st) => st.status === "failed").length;
            const activeAgents = Array.from(this.agents.values()).filter(
                (a) => a.status === "working"
            ).length;

            progress = {
                taskId: activeTask.id,
                totalSubTasks: activeTask.subTasks.length,
                completedSubTasks: completed,
                failedSubTasks: failed,
                activeAgents,
                conflicts: activeTask.conflicts,
            };
        }

        return {
            isRunning: this.isRunning,
            activeTask,
            agents: Array.from(this.agents.values()),
            progress,
            conflictStats: this.conflictResolver.getStats(),
        };
    }

    /**
     * Get task history.
     */
    getTaskHistory(): SwarmTask[] {
        return Array.from(this.tasks.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    // --- Private Methods ---

    /**
     * Use AI to decompose a task into subtasks.
     */
    private async decomposeTask(userRequest: string): Promise<SubTask[]> {
        const provider = this.providerRegistry.getActiveProvider();
        if (!provider) {
            throw new Error("No active provider for task decomposition.");
        }

        const prompt = `You are a task decomposition expert. Break down this development task into independent subtasks that can be executed in parallel by different AI agents.

Task: "${userRequest}"

Rules:
1. Each subtask should be as independent as possible
2. Specify which files each subtask will create or modify
3. Identify dependencies between subtasks
4. Keep subtasks focused and achievable
5. Aim for 3-7 subtasks for most tasks

Respond with ONLY valid JSON:
{
  "subtasks": [
    {
      "description": "Clear description of what to do",
      "files": ["path/to/file1.ts", "path/to/file2.ts"],
      "dependencies": []
    }
  ]
}`;

        try {
            const response = await this.providerRegistry.sendMessage([
                { role: "system", content: "You are a task planning assistant. Respond with structured task breakdowns." },
                { role: "user", content: prompt },
            ]);

            // Parse the response
            let jsonStr = response.content;
            const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            const parsed = JSON.parse(jsonStr.trim());
            const subtasks = parsed.subtasks || [];

            return subtasks.map((st: Record<string, unknown>, index: number) => ({
                id: `subtask_${index}_${generateId().substring(0, 8)}`,
                description: String(st.description || ""),
                files: (st.files as string[]) || [],
                dependencies: (st.dependencies as string[]) || [],
                status: "pending" as const,
                createdAt: Date.now(),
            }));
        } catch (error) {
            logger.error("Failed to decompose task:", error);
            // Fallback: create a single subtask
            return [{
                id: `subtask_0_${generateId().substring(0, 8)}`,
                description: userRequest,
                files: [],
                dependencies: [],
                status: "pending",
                createdAt: Date.now(),
            }];
        }
    }

    /**
     * Create swarm agents.
     */
    private createAgents(count: number): void {
        const roles: SwarmAgentRole[] = ["coder", "coder", "coder", "tester", "reviewer"];

        for (let i = 0; i < count; i++) {
            const agent: SwarmAgent = {
                id: `agent_${i}_${generateId().substring(0, 6)}`,
                role: roles[i % roles.length],
                status: "idle",
                completedTasks: 0,
                errorCount: 0,
            };
            this.agents.set(agent.id, agent);
            logger.debug(`Agent created: ${agent.id} (${agent.role})`);
        }
    }

    /**
     * Execute subtasks in parallel with dependency resolution.
     * Uses a tracked promise set to properly handle all completing tasks.
     */
    private async executeSubTasks(task: SwarmTask): Promise<void> {
        // Track running promises with their associated subtask IDs for proper cleanup
        const runningTasks = new Map<string, Promise<void>>();

        while (true) {
            // Re-compute pending tasks from the source of truth (task.subTasks) each iteration
            const pendingTasks = task.subTasks.filter((st) => st.status === "pending");
            const inProgressTasks = task.subTasks.filter((st) => st.status === "in_progress");

            // Check if all work is done
            if (pendingTasks.length === 0 && inProgressTasks.length === 0 && runningTasks.size === 0) {
                break;
            }

            // Find tasks whose dependencies are all completed
            const readyTasks = pendingTasks.filter((st) =>
                st.dependencies.every((depId) => {
                    const dep = task.subTasks.find((s) => s.id === depId);
                    return dep && dep.status === "completed";
                })
            );

            if (readyTasks.length === 0 && runningTasks.size === 0) {
                // Check if we're blocked by failed tasks
                const blockedByFailed = pendingTasks.some((st) =>
                    st.dependencies.some((depId) => {
                        const dep = task.subTasks.find((s) => s.id === depId);
                        return dep && dep.status === "failed";
                    })
                );

                if (blockedByFailed) {
                    // Mark blocked tasks as failed
                    for (const st of pendingTasks) {
                        st.status = "failed";
                        st.error = "Blocked by failed dependency";
                    }
                    break;
                }

                // No ready tasks and nothing running — wait briefly
                await new Promise((resolve) => setTimeout(resolve, 500));
                continue;
            }

            // Assign ready tasks to idle agents
            const idleAgents = Array.from(this.agents.values()).filter((a) => a.status === "idle");
            const assignments = Math.min(readyTasks.length, idleAgents.length);

            for (let i = 0; i < assignments; i++) {
                const subTask = readyTasks[i];
                const agent = idleAgents[i];

                subTask.status = "in_progress";
                subTask.assignedAgentId = agent.id;
                agent.status = "working";
                agent.currentTask = subTask;

                const promise = this.executeSubTask(agent, subTask, task).then(() => {
                    // Remove from running tasks when complete
                    runningTasks.delete(subTask.id);
                });
                runningTasks.set(subTask.id, promise);
            }

            // Wait for at least one running task to complete before assigning more
            if (runningTasks.size > 0) {
                await Promise.race(Array.from(runningTasks.values()));
            }
        }
    }

    /**
     * Execute a single subtask with an agent.
     */
    private async executeSubTask(agent: SwarmAgent, subTask: SubTask, parentTask: SwarmTask): Promise<void> {
        // Track which locks we've actually acquired for proper cleanup on error
        const acquiredLocks: string[] = [];

        try {
            // Acquire file locks with proper tracking
            for (const file of subTask.files) {
                const lock = this.conflictResolver.acquireLock(file, agent.id);
                if (!lock.acquired) {
                    // Wait for lock — if this throws, we release only locks we actually acquired
                    await this.waitForLock(file, agent.id);
                }
                acquiredLocks.push(file);
            }

            // Build the agent prompt
            const prompt = `You are a ${agent.role} agent working on a swarm task.

Your subtask: ${subTask.description}

Files you're working with: ${subTask.files.join(", ") || "Determine as needed"}

Complete this subtask thoroughly. Use tools to read/write files as needed.
When done, provide a summary of what you accomplished.`;

            // Execute using the chat manager's provider
            let result = "";
            await this.chatManager.sendMessage(
                prompt,
                {
                    onStreaming: () => { }, // Silent streaming for swarm agents
                    onDone: (content) => {
                        result = content;
                    },
                    onError: (error) => {
                        throw new Error(error);
                    },
                },
                "senior-dev"
            );

            subTask.status = "completed";
            subTask.result = result;
            subTask.completedAt = Date.now();
            agent.status = "idle";
            agent.completedTasks++;
            agent.currentTask = undefined;

            // Release only the locks we actually acquired
            for (const file of acquiredLocks) {
                this.conflictResolver.releaseLock(file, agent.id);
            }

            // Broadcast completion
            this.messageBus.broadcast(agent.id, "task_result", {
                subTaskId: subTask.id,
                result,
                files: subTask.files,
            });

            this.emit("subTaskCompleted", { agent, subTask });
            logger.info(`Subtask completed: ${subTask.id} by ${agent.id}`);
        } catch (error) {
            subTask.status = "failed";
            subTask.error = (error as Error).message;
            subTask.completedAt = Date.now();
            agent.status = "idle";
            agent.errorCount++;
            agent.currentTask = undefined;

            // Release only the locks we actually acquired (prevents unlocking files we never locked)
            for (const file of acquiredLocks) {
                this.conflictResolver.releaseLock(file, agent.id);
            }

            this.emit("subTaskFailed", { agent, subTask, error: (error as Error).message });
            logger.warn(`Subtask failed: ${subTask.id} by ${agent.id}: ${(error as Error).message}`);
        }
    }

    /**
     * Wait for a file lock to be released.
     */
    private async waitForLock(filePath: string, agentId: string, maxWaitMs: number = 30000): Promise<void> {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            const lock = this.conflictResolver.acquireLock(filePath, agentId);
            if (lock.acquired) return;
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error(`Timeout waiting for lock on ${filePath}`);
    }

    /**
     * Handle messages from agents on the bus.
     */
    private handleAgentMessage(msg: { type: string; from: string; payload: unknown }): void {
        switch (msg.type) {
            case "conflict_detected":
                const task = Array.from(this.tasks.values()).find(
                    (t) => t.status === "executing"
                );
                if (task) {
                    task.conflicts++;
                }
                this.emit("conflict", msg.payload);
                break;
            case "context_share":
                // Share context between agents
                this.emit("contextShared", msg);
                break;
            case "status_update":
                this.emit("agentStatus", msg);
                break;
        }
    }

    /**
     * Clean up agents after task completion.
     */
    private cleanupAgents(): void {
        for (const agent of this.agents.values()) {
            agent.status = "idle";
            agent.currentTask = undefined;
            this.messageBus.unsubscribe(agent.id);
        }
        this.agents.clear();
        this.conflictResolver.reset();
    }

    dispose(): void {
        this.cancelTask();
        this.messageBus.dispose();
        this.removeAllListeners();
    }
}