import { EventEmitter } from "events";
import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import { ArchitectAgent } from "./architect-agent";
import { DebuggerAgent } from "./debugger-agent";
import { ReviewerAgent } from "./reviewer-agent";
import { ResearchAgent } from "./research-agent";
import { TerminalAgent } from "./terminal-agent";
import type { BaseAgent } from "./base-agent";
import type { AgentTask, AgentResult } from "./base-agent";
import type { AgentRole } from "../../types";
import { logger } from "../../utils/logger";
import { generateId } from "../../utils/helpers";

// ============================================================
// SHEN AI — Orchestrator Agent
// The central coordinator that delegates tasks to specialist
// agents. Analyzes incoming requests, determines which agent(s)
// should handle them, delegates execution, and synthesizes
// results.
// ============================================================

export interface DelegationPlan {
    taskId: string;
    userRequest: string;
    steps: DelegationStep[];
    strategy: "sequential" | "parallel" | "pipeline";
}

export interface DelegationStep {
    id: string;
    agentRole: AgentRole;
    task: AgentTask;
    dependsOn?: string[]; // step IDs that must complete first
    status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
    result?: AgentResult;
    error?: string;
}

export interface OrchestratorResult {
    taskId: string;
    success: boolean;
    summary: string;
    steps: DelegationStep[];
    totalTokens: number;
    totalDuration: number;
    agentResults: AgentResult[];
    errors: string[];
}

export class OrchestratorAgent extends EventEmitter {
    readonly id: string;

    private providerRegistry: ProviderRegistry;
    private toolRegistry: ToolRegistry;
    private agents: Map<AgentRole, BaseAgent>;
    private isRunning: boolean;
    private currentPlan: DelegationPlan | null;
    private taskHistory: OrchestratorResult[];

    constructor(providerRegistry: ProviderRegistry, toolRegistry: ToolRegistry) {
        super();
        this.id = `orchestrator_${generateId().substring(0, 8)}`;
        this.providerRegistry = providerRegistry;
        this.toolRegistry = toolRegistry;
        this.agents = new Map();
        this.isRunning = false;
        this.currentPlan = null;
        this.taskHistory = [];

        // Initialize all specialist agents
        this.registerAgent(new ArchitectAgent(providerRegistry, toolRegistry));
        this.registerAgent(new DebuggerAgent(providerRegistry, toolRegistry));
        this.registerAgent(new ReviewerAgent(providerRegistry, toolRegistry));
        this.registerAgent(new ResearchAgent(providerRegistry, toolRegistry));
        this.registerAgent(new TerminalAgent(providerRegistry, toolRegistry));

        logger.info(`Orchestrator initialized with ${this.agents.size} specialist agents`);
    }

    private registerAgent(agent: BaseAgent): void {
        this.agents.set(agent.role, agent);

        // Forward agent events
        agent.on("taskStarted", (data) => this.emit("agentTaskStarted", data));
        agent.on("taskCompleted", (data) => this.emit("agentTaskCompleted", data));
        agent.on("taskFailed", (data) => this.emit("agentTaskFailed", data));
    }

    /**
     * Main entry point: orchestrate a complex task by delegating to specialists.
     */
    async orchestrate(userRequest: string, context?: string, files?: string[]): Promise<OrchestratorResult> {
        if (this.isRunning) {
            throw new Error("Orchestrator is already running a task. Please wait or cancel.");
        }

        this.isRunning = true;
        const taskId = generateId();
        const startTime = Date.now();

        this.emit("orchestrationStarted", { taskId, userRequest });
        logger.info(`Orchestrator started task ${taskId}: ${userRequest.substring(0, 80)}...`);

        try {
            // Step 1: Analyze the request and create a delegation plan
            const plan = await this.createDelegationPlan(taskId, userRequest, context, files);
            this.currentPlan = plan;

            this.emit("planCreated", { plan });
            logger.info(`Delegation plan created: ${plan.steps.length} steps, strategy: ${plan.strategy}`);

            // Step 2: Execute the plan
            const result = await this.executePlan(plan);

            result.totalDuration = Date.now() - startTime;
            this.taskHistory.push(result);

            this.emit("orchestrationCompleted", { result });
            logger.info(`Orchestrator completed task ${taskId} in ${result.totalDuration}ms`);

            return result;
        } catch (error) {
            const errorMsg = (error as Error).message;
            logger.error(`Orchestrator failed task ${taskId}:`, error);

            const failureResult: OrchestratorResult = {
                taskId,
                success: false,
                summary: `Orchestration failed: ${errorMsg}`,
                steps: this.currentPlan?.steps || [],
                totalTokens: 0,
                totalDuration: Date.now() - startTime,
                agentResults: [],
                errors: [errorMsg],
            };

            this.emit("orchestrationFailed", { result: failureResult, error: errorMsg });
            return failureResult;
        } finally {
            this.isRunning = false;
            this.currentPlan = null;
        }
    }

    /**
     * Use AI to analyze the request and create a delegation plan.
     */
    private async createDelegationPlan(
        taskId: string,
        userRequest: string,
        context?: string,
        files?: string[]
    ): Promise<DelegationPlan> {
        const provider = this.providerRegistry.getActiveProvider();
        if (!provider) {
            throw new Error("No active provider for orchestration planning.");
        }

        const availableRoles = Array.from(this.agents.keys());

        const planningPrompt = `You are an orchestration planner for an AI coding assistant system. Analyze this user request and create a delegation plan that assigns subtasks to specialist agents.

Available specialist agents:
- **architect**: System design, planning, architecture, implementation plans
- **debugger**: Error analysis, bug fixing, root cause diagnosis
- **reviewer**: Code review, security audit, quality assessment
- **researcher**: Documentation lookup, API research, technology evaluation
- **terminal**: Command execution, builds, tests, environment setup

User request: "${userRequest}"
${context ? `Context: ${context}` : ""}
${files ? `Relevant files: ${files.join(", ")}` : ""}

Create a plan with specific, actionable steps. Each step should be assigned to the most appropriate agent. Use "sequential" strategy if steps depend on each other, "parallel" if they're independent, or "pipeline" for a mix.

Respond with ONLY valid JSON:
{
  "strategy": "sequential" | "parallel" | "pipeline",
  "steps": [
    {
      "agentRole": "architect" | "debugger" | "reviewer" | "researcher" | "terminal",
      "taskDescription": "Clear, specific task description for this agent",
      "dependsOn": [] // indices of steps that must complete first (0-based)
    }
  ]
}`;

        try {
            const response = await this.providerRegistry.sendMessage([
                { role: "system", content: "You are an orchestration planner. Respond with structured delegation plans." },
                { role: "user", content: planningPrompt },
            ]);

            let jsonStr = response.content;
            const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            const parsed = JSON.parse(jsonStr.trim());
            const strategy = parsed.strategy || "sequential";
            const rawSteps = parsed.steps || [];

            // Pass 1: Create steps with IDs (without resolving dependencies yet)
            const steps: DelegationStep[] = rawSteps.map((s: Record<string, unknown>, index: number) => ({
                id: `step_${index}_${generateId().substring(0, 6)}`,
                agentRole: (s.agentRole as AgentRole) || "architect",
                task: {
                    id: `task_${index}_${generateId().substring(0, 6)}`,
                    description: String(s.taskDescription || userRequest),
                    context,
                    files,
                    priority: "high" as const,
                    assignedBy: this.id,
                },
                dependsOn: [], // Will be resolved in pass 2
                status: "pending" as const,
            }));

            // Pass 2: Resolve dependency indices to actual step IDs
            for (let i = 0; i < rawSteps.length; i++) {
                const rawDeps = (rawSteps[i].dependsOn as number[]) || [];
                steps[i].dependsOn = rawDeps
                    .filter((depIndex: number) => depIndex >= 0 && depIndex < steps.length)
                    .map((depIndex: number) => steps[depIndex].id);
            }

            return { taskId, userRequest, steps, strategy };
        } catch (error) {
            logger.warn("Failed to create AI delegation plan, using fallback:", error);
            // Fallback: single step with architect
            return {
                taskId,
                userRequest,
                strategy: "sequential",
                steps: [{
                    id: `step_0_${generateId().substring(0, 6)}`,
                    agentRole: "architect",
                    task: {
                        id: `task_0_${generateId().substring(0, 6)}`,
                        description: userRequest,
                        context,
                        files,
                        priority: "high",
                        assignedBy: this.id,
                    },
                    status: "pending",
                }],
            };
        }
    }

    /**
     * Execute the delegation plan.
     */
    private async executePlan(plan: DelegationPlan): Promise<OrchestratorResult> {
        const results: AgentResult[] = [];
        const errors: string[] = [];
        let totalTokens = 0;

        if (plan.strategy === "parallel") {
            // Execute all steps in parallel
            const promises = plan.steps.map((step) => this.executeStep(step));
            const stepResults = await Promise.allSettled(promises);

            for (let i = 0; i < stepResults.length; i++) {
                const result = stepResults[i];
                if (result.status === "fulfilled") {
                    results.push(result.value);
                    totalTokens += result.value.tokensUsed;
                    plan.steps[i].result = result.value;
                    plan.steps[i].status = "completed";
                } else {
                    const errorMsg = (result.reason as Error).message;
                    errors.push(`Step ${i} failed: ${errorMsg}`);
                    plan.steps[i].status = "failed";
                    plan.steps[i].error = errorMsg;
                }
            }
        } else {
            // Sequential or pipeline: respect dependencies
            for (const step of plan.steps) {
                // Check if dependencies are met
                const depsMet = step.dependsOn?.every((depId) => {
                    const depStep = plan.steps.find((s) => s.id === depId);
                    return depStep && depStep.status === "completed";
                }) ?? true;

                if (!depsMet) {
                    step.status = "skipped";
                    errors.push(`Step ${step.id} skipped: dependencies not met`);
                    continue;
                }

                try {
                    const result = await this.executeStep(step);
                    results.push(result);
                    totalTokens += result.tokensUsed;
                    step.result = result;
                    step.status = "completed";
                } catch (error) {
                    const errorMsg = (error as Error).message;
                    errors.push(`Step ${step.id} failed: ${errorMsg}`);
                    step.status = "failed";
                    step.error = errorMsg;
                }
            }
        }

        // Synthesize results
        const summary = await this.synthesizeResults(plan.userRequest, results);

        return {
            taskId: plan.taskId,
            success: errors.length === 0,
            summary,
            steps: plan.steps,
            totalTokens,
            totalDuration: 0, // Set by caller
            agentResults: results,
            errors,
        };
    }

    /**
     * Execute a single delegation step.
     */
    private async executeStep(step: DelegationStep): Promise<AgentResult> {
        const agent = this.agents.get(step.agentRole);
        if (!agent) {
            throw new Error(`Unknown agent role: ${step.agentRole}`);
        }

        step.status = "in_progress";
        this.emit("stepStarted", { stepId: step.id, agentRole: step.agentRole });

        const result = await agent.executeTask(step.task);

        this.emit("stepCompleted", { stepId: step.id, result });
        return result;
    }

    /**
     * Synthesize results from multiple agents into a coherent summary.
     */
    private async synthesizeResults(userRequest: string, results: AgentResult[]): Promise<string> {
        if (results.length === 0) {
            return "No results to synthesize.";
        }

        if (results.length === 1) {
            return results[0].content;
        }

        // Use AI to synthesize
        try {
            const synthesisPrompt = `Synthesize these agent results into a coherent summary for the user.

Original request: "${userRequest}"

Agent results:
${results.map((r, i) => `--- Agent ${i + 1} ---\n${r.content.substring(0, 2000)}`).join("\n\n")}

Provide a clear, organized summary that combines all findings.`;

            const response = await this.providerRegistry.sendMessage([
                { role: "system", content: "You are a synthesis assistant. Combine multiple agent results into a coherent summary." },
                { role: "user", content: synthesisPrompt },
            ]);

            return response.content;
        } catch (error) {
            // Fallback: concatenate results
            return results.map((r, i) => `## Agent ${i + 1}\n${r.content}`).join("\n\n");
        }
    }

    /**
     * Cancel the current orchestration.
     */
    cancel(): void {
        for (const agent of this.agents.values()) {
            agent.cancel();
        }
        this.isRunning = false;
        this.currentPlan = null;
        this.emit("orchestrationCancelled");
        logger.info("Orchestrator cancelled.");
    }

    /**
     * Get orchestrator status.
     */
    getStatus(): {
        isRunning: boolean;
        currentPlan: DelegationPlan | null;
        agents: Array<{ role: AgentRole; status: ReturnType<BaseAgent["getStatus"]> }>;
        totalTasksCompleted: number;
    } {
        return {
            isRunning: this.isRunning,
            currentPlan: this.currentPlan,
            agents: Array.from(this.agents.values()).map((a) => ({
                role: a.role,
                status: a.getStatus(),
            })),
            totalTasksCompleted: this.taskHistory.length,
        };
    }

    /**
     * Get task history.
     */
    getTaskHistory(): OrchestratorResult[] {
        return [...this.taskHistory];
    }

    /**
     * Get a specific specialist agent.
     */
    getAgent(role: AgentRole): BaseAgent | undefined {
        return this.agents.get(role);
    }

    dispose(): void {
        this.cancel();
        for (const agent of this.agents.values()) {
            agent.dispose();
        }
        this.agents.clear();
        this.removeAllListeners();
    }
}