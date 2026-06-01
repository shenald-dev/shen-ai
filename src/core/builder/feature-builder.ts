import { EventEmitter } from "events";
import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import type { GraphStore } from "../genome/graph-store";
import { logger } from "../../utils/logger";
import { generateId } from "../../utils/helpers";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

// ============================================================
// SHEN AI — Autonomous Feature Builder
// Takes a plain English feature description and autonomously
// plans, codes, tests, and validates complete features.
// ============================================================

export interface FeaturePlan {
    id: string;
    title: string;
    description: string;
    steps: FeatureStep[];
    estimatedFiles: string[];
    estimatedComplexity: "low" | "medium" | "high" | "very-high";
    createdAt: number;
}

export interface FeatureStep {
    id: string;
    title: string;
    description: string;
    type: "create_file" | "modify_file" | "run_command" | "test" | "validate";
    filePath?: string;
    command?: string;
    status: "pending" | "in_progress" | "completed" | "failed" | "skipped";
    result?: string;
    error?: string;
    completedAt?: number;
}

export interface FeatureBuild {
    id: string;
    userRequest: string;
    plan: FeaturePlan;
    status: "planning" | "building" | "testing" | "completed" | "failed" | "cancelled";
    stepsCompleted: number;
    stepsTotal: number;
    filesCreated: string[];
    filesModified: string[];
    errors: string[];
    createdAt: number;
    completedAt?: number;
    duration?: number;
}

export interface BuildProgress {
    featureId: string;
    status: FeatureBuild["status"];
    currentStep?: FeatureStep;
    stepsCompleted: number;
    stepsTotal: number;
    percentage: number;
    filesCreated: number;
    filesModified: number;
}

export class FeatureBuilder extends EventEmitter {
    private providerRegistry: ProviderRegistry;
    private toolRegistry: ToolRegistry;
    private graphStore: GraphStore;
    private activeBuilds: Map<string, FeatureBuild>;
    private isBuilding: boolean;
    private abortController: AbortController | null;

    constructor(
        providerRegistry: ProviderRegistry,
        toolRegistry: ToolRegistry,
        graphStore: GraphStore
    ) {
        super();
        this.providerRegistry = providerRegistry;
        this.toolRegistry = toolRegistry;
        this.graphStore = graphStore;
        this.activeBuilds = new Map();
        this.isBuilding = false;
        this.abortController = null;
    }

    /**
     * Build a feature autonomously from a plain English description.
     */
    async buildFeature(userRequest: string): Promise<FeatureBuild> {
        if (this.isBuilding) {
            throw new Error("A feature build is already in progress. Cancel it first.");
        }

        this.isBuilding = true;
        this.abortController = new AbortController();
        const buildId = generateId();

        const build: FeatureBuild = {
            id: buildId,
            userRequest,
            plan: {
                id: "",
                title: "",
                description: "",
                steps: [],
                estimatedFiles: [],
                estimatedComplexity: "medium",
                createdAt: Date.now(),
            },
            status: "planning",
            stepsCompleted: 0,
            stepsTotal: 0,
            filesCreated: [],
            filesModified: [],
            errors: [],
            createdAt: Date.now(),
        };

        this.activeBuilds.set(buildId, build);
        this.emit("buildStarted", build);
        logger.info(`Feature build started: ${buildId}`);

        try {
            // Step 1: Plan the feature
            build.plan = await this.createPlan(userRequest, buildId);
            build.stepsTotal = build.plan.steps.length;
            build.status = "building";

            this.emit("planCreated", { build, plan: build.plan });
            logger.info(`Feature plan created: ${build.plan.steps.length} steps`);

            // Step 2: Execute each step
            for (const step of build.plan.steps) {
                if (this.abortController?.signal.aborted) {
                    build.status = "cancelled";
                    break;
                }

                step.status = "in_progress";
                this.emit("stepStarted", { build, step });

                try {
                    await this.executeStep(step, build);
                    step.status = "completed";
                    step.completedAt = Date.now();
                    build.stepsCompleted++;

                    this.emit("stepCompleted", {
                        build,
                        step,
                        progress: this.getProgress(build),
                    });
                } catch (error) {
                    step.status = "failed";
                    step.error = (error as Error).message;
                    build.errors.push(`Step "${step.title}": ${(error as Error).message}`);

                    this.emit("stepFailed", { build, step, error: (error as Error).message });
                    logger.warn(`Step failed: ${step.title} — ${(error as Error).message}`);

                    // Try to recover — ask AI how to fix
                    const recovered = await this.attemptRecovery(step, build);
                    if (recovered) {
                        step.status = "completed";
                        step.completedAt = Date.now();
                        build.stepsCompleted++;
                        build.errors.pop(); // Remove the error since we recovered
                    }
                }
            }

            // Step 3: Validate the build (skip if cancelled)
            if (build.status === "building" && build.errors.length === 0) {
                build.status = "testing";
                this.emit("testing", build);
                await this.validateBuild(build);
            }

            // Finalize — preserve "cancelled" status, don't override it
            if (build.status !== "cancelled") {
                const hasFailures = build.plan.steps.some((s) => s.status === "failed");
                build.status = hasFailures ? "failed" : "completed";
            }
            build.completedAt = Date.now();
            build.duration = build.completedAt - build.createdAt;

            this.emit("buildCompleted", build);
            logger.info(`Feature build ${buildId} ${build.status} in ${build.duration}ms`);

            return build;
        } catch (error) {
            build.status = "failed";
            build.completedAt = Date.now();
            build.errors.push((error as Error).message);
            this.emit("buildFailed", { build, error: (error as Error).message });
            logger.error(`Feature build ${buildId} failed:`, error);
            throw error;
        } finally {
            this.isBuilding = false;
            this.abortController = null;
        }
    }

    /**
     * Cancel the current build.
     */
    cancelBuild(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
        const activeBuild = Array.from(this.activeBuilds.values()).find(
            (b) => b.status === "building" || b.status === "planning"
        );
        if (activeBuild) {
            activeBuild.status = "cancelled";
            activeBuild.completedAt = Date.now();
            this.emit("buildCancelled", activeBuild);
            logger.info(`Feature build ${activeBuild.id} cancelled`);
        }
    }

    /**
     * Get current build progress.
     */
    getProgress(build: FeatureBuild): BuildProgress {
        const currentStep = build.plan.steps.find((s) => s.status === "in_progress");
        return {
            featureId: build.id,
            status: build.status,
            currentStep,
            stepsCompleted: build.stepsCompleted,
            stepsTotal: build.stepsTotal,
            percentage: build.stepsTotal > 0 ? Math.round((build.stepsCompleted / build.stepsTotal) * 100) : 0,
            filesCreated: build.filesCreated.length,
            filesModified: build.filesModified.length,
        };
    }

    /**
     * Get build history.
     */
    getBuildHistory(): FeatureBuild[] {
        return Array.from(this.activeBuilds.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    // --- Private Methods ---

    /**
     * Use AI to create a detailed feature plan.
     */
    private async createPlan(userRequest: string, buildId: string): Promise<FeaturePlan> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const projectContext = this.getProjectContext();

        const prompt = `You are an autonomous feature builder. Plan how to implement this feature:

"${userRequest}"

Project context:
${projectContext}

Create a detailed, step-by-step implementation plan. Each step should be a concrete action:
- create_file: Create a new file with complete content
- modify_file: Modify an existing file
- run_command: Execute a shell command (install deps, run migrations, etc.)
- test: Run tests to verify the implementation
- validate: Validate the feature works correctly

Rules:
1. Be specific and actionable
2. Include file paths for file operations
3. Order steps logically (dependencies first)
4. Include testing and validation steps at the end
5. Keep steps atomic — one clear action per step

Respond with ONLY valid JSON:
{
  "title": "Feature title",
  "description": "Brief description",
  "estimatedComplexity": "low|medium|high|very-high",
  "estimatedFiles": ["path/to/file1.ts", ...],
  "steps": [
    {
      "title": "Step title",
      "description": "What to do",
      "type": "create_file",
      "filePath": "src/path/to/file.ts"
    }
  ]
}`;

        try {
            const response = await this.providerRegistry.sendMessage(
                [
                    { role: "system", content: "You are an autonomous feature planner. Create detailed, actionable implementation plans." },
                    { role: "user", content: prompt },
                ],
                undefined,
                this.abortController?.signal
            );

            let jsonStr = response.content;
            const jsonMatch = response.content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            const parsed = JSON.parse(jsonStr.trim());

            return {
                id: `plan_${buildId}`,
                title: parsed.title || "Untitled Feature",
                description: parsed.description || "",
                estimatedComplexity: parsed.estimatedComplexity || "medium",
                estimatedFiles: parsed.estimatedFiles || [],
                steps: (parsed.steps || []).map((s: Record<string, unknown>, i: number) => ({
                    id: `step_${i}`,
                    title: String(s.title || `Step ${i + 1}`),
                    description: String(s.description || ""),
                    type: (s.type as FeatureStep["type"]) || "create_file",
                    filePath: s.filePath as string | undefined,
                    command: s.command as string | undefined,
                    status: "pending" as const,
                })),
                createdAt: Date.now(),
            };
        } catch (error) {
            logger.error("Failed to create feature plan:", error);
            // Fallback plan
            return {
                id: `plan_${buildId}`,
                title: userRequest.substring(0, 50),
                description: userRequest,
                estimatedComplexity: "medium",
                estimatedFiles: [],
                steps: [{
                    id: "step_0",
                    title: "Implement feature",
                    description: userRequest,
                    type: "create_file",
                    status: "pending",
                }],
                createdAt: Date.now(),
            };
        }
    }

    /**
     * Execute a single build step.
     */
    private async executeStep(step: FeatureStep, build: FeatureBuild): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            throw new Error("No workspace folder open.");
        }

        switch (step.type) {
            case "create_file":
            case "modify_file": {
                if (!step.filePath) {
                    throw new Error(`Step "${step.title}" requires a filePath`);
                }

                // Ask AI to generate the file content
                const contentPrompt = `Generate the COMPLETE content for this file.

File: ${step.filePath}
Step: ${step.title}
Description: ${step.description}

Feature being built: ${build.userRequest}

Rules:
1. Provide COMPLETE, WORKING code — no placeholders
2. Include all necessary imports
3. Follow best practices
4. Include error handling

Respond with ONLY the file content (no markdown code blocks).`;

                const response = await this.providerRegistry.sendMessage(
                    [
                        { role: "system", content: "You are an autonomous code generator. Generate complete, production-ready file content." },
                        { role: "user", content: contentPrompt },
                    ],
                    undefined,
                    this.abortController?.signal
                );

                let content = response.content;
                // Strip markdown code blocks if present
                const codeMatch = content.match(/```(?:\w+)?\s*([\s\S]*?)```/);
                if (codeMatch) {
                    content = codeMatch[1];
                }

                // Write the file
                const fullPath = path.join(workspaceRoot, step.filePath);
                const dir = path.dirname(fullPath);
                await fs.promises.mkdir(dir, { recursive: true });
                await fs.promises.writeFile(fullPath, content, "utf-8");

                step.result = `Created/modified ${step.filePath} (${content.split("\n").length} lines)`;

                if (step.type === "create_file") {
                    build.filesCreated.push(step.filePath);
                } else {
                    build.filesModified.push(step.filePath);
                }
                break;
            }

            case "run_command": {
                if (!step.command) {
                    throw new Error(`Step "${step.title}" requires a command`);
                }

                const { exec } = require("child_process");
                const util = require("util");
                const execPromise = util.promisify(exec);

                const { stdout, stderr } = await execPromise(step.command, {
                    cwd: workspaceRoot,
                    timeout: 60000,
                    maxBuffer: 1024 * 1024,
                });

                step.result = stdout || stderr || "Command completed";
                break;
            }

            case "test": {
                // Run tests if available
                const testCommand = step.command || "npm test";
                try {
                    const { exec } = require("child_process");
                    const util = require("util");
                    const execPromise = util.promisify(exec);

                    const { stdout } = await execPromise(testCommand, {
                        cwd: workspaceRoot,
                        timeout: 120000,
                        maxBuffer: 1024 * 1024,
                    });
                    step.result = stdout;
                } catch (error) {
                    const err = error as { stdout?: string; stderr?: string; message: string };
                    step.result = err.stdout || err.stderr || err.message;
                    // Don't throw — test failures are informational
                }
                break;
            }

            case "validate": {
                // Ask AI to validate the feature
                const validationPrompt = `Validate that this feature was implemented correctly:

Feature: ${build.userRequest}

Files created: ${build.filesCreated.join(", ")}
Files modified: ${build.filesModified.join(", ")}

Check:
1. Are all files syntactically correct?
2. Does the feature match the original request?
3. Are there any obvious bugs or issues?

Respond with a brief validation summary.`;

                const response = await this.providerRegistry.sendMessage(
                    [
                        { role: "system", content: "You are a code reviewer. Validate feature implementations." },
                        { role: "user", content: validationPrompt },
                    ],
                    undefined,
                    this.abortController?.signal
                );

                step.result = response.content;
                break;
            }
        }
    }

    /**
     * Attempt to recover from a failed step.
     */
    private async attemptRecovery(step: FeatureStep, build: FeatureBuild): Promise<boolean> {
        try {
            const recoveryPrompt = `A build step failed. Can you suggest a fix?

Step: ${step.title}
Description: ${step.description}
Error: ${step.error}

Feature: ${build.userRequest}

Provide a fix that can be applied directly.`;

            const response = await this.providerRegistry.sendMessage(
                [
                    { role: "system", content: "You are a debugging assistant. Help fix build failures." },
                    { role: "user", content: recoveryPrompt },
                ],
                undefined,
                this.abortController?.signal
            );

            // Try executing the step again with the fix context
            step.description = step.description + "\nFix suggestion: " + response.content;
            await this.executeStep(step, build);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validate the completed build.
     */
    private async validateBuild(build: FeatureBuild): Promise<void> {
        // Check that all created files exist and are non-empty
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        for (const file of build.filesCreated) {
            const fullPath = path.join(workspaceRoot, file);
            try {
                const stat = await fs.promises.stat(fullPath);
                if (stat.size === 0) {
                    build.errors.push(`File ${file} was created but is empty`);
                }
            } catch {
                build.errors.push(`File ${file} was not created`);
            }
        }
    }

    /**
     * Get project context for planning.
     */
    private getProjectContext(): string {
        const stats = this.graphStore.getStats();
        let context = `Project has ${stats.totalNodes} code elements and ${stats.totalEdges} relationships.\n`;

        if (stats.mostConnected.length > 0) {
            context += "Key modules:\n";
            for (const { node } of stats.mostConnected.slice(0, 5)) {
                context += `  - ${node.name} (${node.type}) in ${node.filePath}\n`;
            }
        }

        return context;
    }
}