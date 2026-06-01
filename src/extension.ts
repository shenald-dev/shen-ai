import * as vscode from "vscode";
import { WebviewProvider } from "./ui/webview-provider";
import { ChatManager } from "./core/chat/chat-manager";
import { ToolRegistry } from "./core/tools/tool-registry";
import { ProviderRegistry } from "./core/providers/provider-registry";
import { ConfigManager } from "./utils/config";
import { logger, LogLevel } from "./utils/logger";
import { getActiveEditorContent } from "./utils/helpers";

// Phase 3: Unique Features I
import { CorrectionTracker } from "./core/evolution/correction-tracker";
import { PromptOptimizer } from "./core/evolution/prompt-optimizer";
import { BehaviorAnalyzer } from "./core/predictive/behavior-analyzer";
import { IntentEngine } from "./core/predictive/intent-engine";
import { PersonalityEngine } from "./core/personality/personality-engine";

// Phase 4: Unique Features II
import { GraphStore } from "./core/genome/graph-store";
import { GenomeBuilder } from "./core/genome/genome-builder";
import { SemanticIndexer } from "./core/genome/semantic-indexer";
import { SandboxManager } from "./core/sandbox/sandbox-manager";
import { GhostObserver } from "./core/ghost/ghost-observer";
import { StyleExtractor } from "./core/ghost/style-extractor";

// Phase 5: Unique Features III
import { SwarmOrchestrator } from "./core/swarm/swarm-orchestrator";
import { FeatureBuilder } from "./core/builder/feature-builder";
import { VitalMonitor } from "./core/health/vital-monitor";
import { CityGenerator } from "./core/visualization/city-generator";

// Checkpoint System (Redesigned Undo)
import { CheckpointManager } from "./core/tools/checkpoint-manager";

// Real Features (Working Implementations)
import { BlastRadiusAnalyzer } from "./core/genome/blast-radius-analyzer";
import { CodeValidator } from "./core/tools/code-validator";
import { ConversationSummarizer } from "./core/chat/conversation-summarizer";

import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// ============================================================
// SHEN AI — Extension Entry Point
// ============================================================

let webviewProvider: WebviewProvider;
let chatManager: ChatManager;
let toolRegistry: ToolRegistry;
let providerRegistry: ProviderRegistry;

// Phase 3: Unique Features I
let correctionTracker: CorrectionTracker;
let promptOptimizer: PromptOptimizer;
let behaviorAnalyzer: BehaviorAnalyzer;
let intentEngine: IntentEngine;
let personalityEngine: PersonalityEngine;

// Phase 4: Unique Features II
let graphStore: GraphStore;
let genomeBuilder: GenomeBuilder;
let semanticIndexer: SemanticIndexer;
let sandboxManager: SandboxManager;
let ghostObserver: GhostObserver;
let styleExtractor: StyleExtractor;

// Phase 5: Unique Features III
let swarmOrchestrator: SwarmOrchestrator;
let featureBuilder: FeatureBuilder;
let vitalMonitor: VitalMonitor;
let cityGenerator: CityGenerator;

// Checkpoint System
let checkpointManager: CheckpointManager;

// Real Features (Working Implementations)
let blastRadiusAnalyzer: BlastRadiusAnalyzer;
let codeValidator: CodeValidator;
let conversationSummarizer: ConversationSummarizer;

export function activate(context: vscode.ExtensionContext): void {
    logger.info("SHEN AI extension activating...");

    // Initialize storage path for persistent data
    const storagePath = path.join(os.homedir(), ".shen-ai");

    // Initialize core systems
    const config = ConfigManager.getInstance();
    providerRegistry = new ProviderRegistry(config);
    toolRegistry = new ToolRegistry(context);
    chatManager = new ChatManager(providerRegistry, toolRegistry, config.getFullConfig().maxContextTokens);

    // Initialize Phase 3: Unique Features I
    correctionTracker = new CorrectionTracker(storagePath);
    promptOptimizer = new PromptOptimizer(correctionTracker);
    behaviorAnalyzer = new BehaviorAnalyzer();
    intentEngine = new IntentEngine(behaviorAnalyzer);
    personalityEngine = new PersonalityEngine(config.getFullConfig().personality);

    // Set base prompts from personality engine
    const profiles = personalityEngine.getAvailablePersonalities();
    for (const profile of profiles) {
        promptOptimizer.setBasePrompt(profile.name, profile.systemPrompt);
    }

    // Initialize Phase 4: Unique Features II
    graphStore = new GraphStore(storagePath);
    genomeBuilder = new GenomeBuilder(graphStore);
    semanticIndexer = new SemanticIndexer(graphStore, providerRegistry);
    sandboxManager = new SandboxManager();
    styleExtractor = new StyleExtractor(storagePath);
    ghostObserver = new GhostObserver(styleExtractor);

    // Initialize Phase 5: Unique Features III
    swarmOrchestrator = new SwarmOrchestrator(providerRegistry, toolRegistry, chatManager);
    featureBuilder = new FeatureBuilder(providerRegistry, toolRegistry, graphStore);
    vitalMonitor = new VitalMonitor(graphStore, storagePath);
    cityGenerator = new CityGenerator(graphStore);

    // Initialize Checkpoint Manager (Redesigned Undo System)
    checkpointManager = CheckpointManager.getInstance(storagePath);

    // Initialize Real Features (Working Implementations)
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    blastRadiusAnalyzer = new BlastRadiusAnalyzer(workspaceRoot);
    codeValidator = new CodeValidator();
    conversationSummarizer = new ConversationSummarizer();

    // Analyze workspace for blast radius if enabled
    if (config.getFullConfig().enableBlastRadiusAnalyzer && workspaceRoot) {
        blastRadiusAnalyzer.analyzeWorkspace().then(() => {
            const stats = blastRadiusAnalyzer.getStats();
            logger.info(`Blast radius analyzer: ${stats.filesAnalyzed} files analyzed, ${stats.totalDependencies} dependencies found`);
        }).catch((error) => {
            logger.warn("Failed to analyze workspace for blast radius:", error);
        });
    }

    // Start behavior observation if predictive intent is enabled
    if (config.getFullConfig().enablePredictiveIntent) {
        intentEngine.enable();
        logger.info("Predictive intent engine started.");
    }

    // Start ghost mode observation if enabled
    if (config.getFullConfig().enableGhostMode) {
        ghostObserver.startObserving();
        logger.info("Ghost mode observation started.");
    }

    // Listen for intent predictions
    intentEngine.on("intent", (intent) => {
        webviewProvider.sendIntentPrediction(intent);
    });

    // Listen for ghost mode style updates
    ghostObserver.on("styleUpdate", (style) => {
        logger.debug("Ghost mode style update received.");
        webviewProvider.sendStyleUpdate(style);
    });

    // Listen for swarm events
    swarmOrchestrator.on("taskStarted", (task) => {
        webviewProvider.sendAgentStatus({ type: "swarm_started", taskId: task.id });
    });
    swarmOrchestrator.on("subTaskCompleted", ({ agent, subTask }) => {
        webviewProvider.sendAgentStatus({
            type: "swarm_progress",
            agentId: agent.id,
            agentRole: agent.role,
            subTask: subTask.title,
        });
    });
    swarmOrchestrator.on("taskCompleted", (task) => {
        webviewProvider.sendAgentStatus({ type: "swarm_completed", taskId: task.id });
    });

    // Listen for feature builder events
    featureBuilder.on("buildStarted", (build) => {
        webviewProvider.sendAgentStatus({ type: "feature_build_started", buildId: build.id });
    });
    featureBuilder.on("stepCompleted", ({ build, step, progress }) => {
        webviewProvider.sendAgentStatus({
            type: "feature_build_progress",
            step: step.title,
            percentage: progress.percentage,
        });
    });
    featureBuilder.on("buildCompleted", (build) => {
        webviewProvider.sendAgentStatus({ type: "feature_build_completed", buildId: build.id });
    });

    // Listen for health updates
    vitalMonitor.on("healthUpdate", (report) => {
        webviewProvider.sendAgentStatus({
            type: "health_update",
            score: report.overallScore,
            status: report.overallStatus,
        });
    });

    // Listen for checkpoint events
    checkpointManager.on("checkpointCreated", ({ checkpoint }) => {
        webviewProvider.sendAgentStatus({
            type: "checkpoint_created",
            checkpointId: checkpoint.id,
            label: checkpoint.label,
        });
        logger.debug(`Checkpoint created: ${checkpoint.label}`);
    });

    checkpointManager.on("fileChangeRecorded", ({ change, taskId }) => {
        webviewProvider.sendAgentStatus({
            type: "file_change_recorded",
            filePath: change.filePath,
            toolName: change.toolName,
            taskId,
        });
    });

    checkpointManager.on("undoCompleted", ({ change, taskId }) => {
        webviewProvider.sendAgentStatus({
            type: "undo_completed",
            filePath: change.filePath,
            taskId,
        });
    });

    // Register webview provider with checkpoint manager and correction tracker
    webviewProvider = new WebviewProvider(context.extensionUri, context, chatManager, config, checkpointManager, correctionTracker);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider("shen.chatView", webviewProvider, {
            webviewOptions: { retainContextWhenHidden: true },
        })
    );

    // Register commands
    registerCommands(context);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration("shen.ai")) {
                config.reload();
                providerRegistry.updateConfig(config);
                webviewProvider.syncSettings();

                // Update personality
                const newPersonality = config.getFullConfig().personality;
                personalityEngine.setPersonality(newPersonality);

                // Toggle predictive intent
                if (e.affectsConfiguration("shen.ai.enablePredictiveIntent")) {
                    if (config.getFullConfig().enablePredictiveIntent) {
                        intentEngine.enable();
                    } else {
                        intentEngine.disable();
                    }
                }

                // Toggle ghost mode
                if (e.affectsConfiguration("shen.ai.enableGhostMode")) {
                    if (config.getFullConfig().enableGhostMode) {
                        ghostObserver.startObserving();
                    } else {
                        ghostObserver.stopObserving();
                    }
                }

                logger.info("Configuration updated and synced.");
            }
        })
    );

    // Listen for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            const content = getActiveEditorContent();
            if (content) {
                webviewProvider.sendActiveFile(content.filePath || "");
            }
        })
    );

    // Listen for text document saves (genome incremental indexing + blast radius updates)
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (doc) => {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (workspaceRoot && doc.uri.fsPath.startsWith(workspaceRoot)) {
                const relPath = path.relative(workspaceRoot, doc.uri.fsPath);
                try {
                    await genomeBuilder.indexFile(relPath);
                    logger.debug(`Genome updated for: ${relPath}`);
                } catch (error) {
                    logger.warn(`Failed to update genome for ${relPath}:`, error);
                }

                // Update blast radius analyzer
                if (config.getFullConfig().enableBlastRadiusAnalyzer) {
                    try {
                        blastRadiusAnalyzer.analyzeFile(relPath);
                        logger.debug(`Blast radius analyzer updated for: ${relPath}`);
                    } catch (error) {
                        logger.warn(`Failed to update blast radius for ${relPath}:`, error);
                    }
                }
            }
        })
    );

    // Auto-start checkpoint task when a new conversation begins
    // Listen for new task events from chat manager
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.checkpointSummary", () => {
            const summary = checkpointManager.getSummary();
            vscode.window.showInformationMessage(summary, { modal: true });
        })
    );

    logger.info("SHEN AI extension activated successfully.");
    logger.info(`Correction tracker: ${correctionTracker.getStats().totalLessons} lessons loaded`);
    logger.info(`Personality: ${personalityEngine.getProfile(personalityEngine.getPersonality()).displayName}`);
    logger.info(`Graph store: ${graphStore.getStats().totalNodes} nodes, ${graphStore.getStats().totalEdges} edges`);
    logger.info(`Style profile confidence: ${Math.round(styleExtractor.getStyleProfile().confidence * 100)}%`);
    logger.info(`Checkpoint manager: ${checkpointManager.getStats().totalTasks} tasks, ${checkpointManager.getStats().totalCheckpoints} checkpoints loaded`);
    logger.info(`Real features enabled: Blast Radius Analyzer, Code Validator, Conversation Summarizer`);
}

function registerCommands(context: vscode.ExtensionContext): void {
    // Open chat panel
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.openChat", () => {
            vscode.commands.executeCommand("shen.chatView.focus");
        })
    );

    // Open settings
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.openSettings", () => {
            vscode.commands.executeCommand("workbench.action.openSettings", "shen.ai");
        })
    );

    // New task
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.newTask", () => {
            chatManager.newConversation();
            webviewProvider.notifyNewTask();
            logger.info("New task created.");
        })
    );

    // Cancel current task
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.cancelTask", () => {
            chatManager.cancelCurrentTask();
            swarmOrchestrator.cancelTask();
            featureBuilder.cancelBuild();
            webviewProvider.notifyCancelled();
            logger.info("Current task cancelled.");
        })
    );

    // Inline chat with selection
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.inlineChat", () => {
            const content = getActiveEditorContent();
            const selection = content?.selection;
            if (content && selection) {
                vscode.commands.executeCommand("shen.chatView.focus");
                setTimeout(() => {
                    webviewProvider.sendInlineContext({
                        filePath: content.filePath,
                        selection,
                    });
                }, 500);
            }
        })
    );

    // Quick ask from command palette
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.quickAsk", async () => {
            const question = await vscode.window.showInputBox({
                prompt: "Ask SHEN AI",
                placeHolder: "e.g., Explain this function, Fix this bug...",
            });
            if (question) {
                vscode.commands.executeCommand("shen.chatView.focus");
                setTimeout(() => {
                    webviewProvider.sendQuickQuestion(question);
                }, 500);
            }
        })
    );

    // ==========================================
    // Phase 5 Commands: Swarm Mode
    // ==========================================

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.swarmTask", async () => {
            const request = await vscode.window.showInputBox({
                prompt: "Describe a complex task for Swarm Mode (parallel agents)",
                placeHolder: "e.g., Build a REST API with auth, tests, and documentation",
            });
            if (!request) return;

            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "SHEN AI: Swarm Mode Active",
                    cancellable: true,
                },
                async (progress, token) => {
                    token.onCancellationRequested(() => {
                        swarmOrchestrator.cancelTask();
                    });

                    progress.report({ message: "Decomposing task..." });

                    try {
                        const task = await swarmOrchestrator.executeSwarmTask(request);

                        if (task.status === "completed") {
                            const completed = task.subTasks.filter((s) => s.status === "completed").length;
                            vscode.window.showInformationMessage(
                                `🐝 Swarm completed: ${completed}/${task.subTasks.length} subtasks succeeded in ${task.duration ? Math.round(task.duration / 1000) : 0}s`
                            );
                        } else {
                            vscode.window.showWarningMessage(
                                `🐝 Swarm ${task.status}: ${task.subTasks.filter((s) => s.status === "failed").length} subtasks failed`
                            );
                        }
                    } catch (error) {
                        vscode.window.showErrorMessage(`Swarm task failed: ${(error as Error).message}`);
                    }
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.swarmStatus", () => {
            const status = swarmOrchestrator.getStatus();
            const conflictStats = status.conflictStats;

            let message = `🐝 Swarm Mode Status\n\n`;
            message += `Running: ${status.isRunning ? "Yes" : "No"}\n`;

            if (status.progress) {
                message += `\nActive Task:\n`;
                message += `  Subtasks: ${status.progress.completedSubTasks}/${status.progress.totalSubTasks} completed\n`;
                message += `  Failed: ${status.progress.failedSubTasks}\n`;
                message += `  Active agents: ${status.progress.activeAgents}\n`;
                message += `  Conflicts: ${status.progress.conflicts}\n`;
            }

            if (status.agents.length > 0) {
                message += `\nAgents:\n`;
                for (const agent of status.agents) {
                    message += `  ${agent.id} (${agent.role}): ${agent.status} — ${agent.completedTasks} tasks\n`;
                }
            }

            message += `\nConflict Stats:\n`;
            message += `  Total: ${conflictStats.totalConflicts}\n`;
            message += `  Resolved: ${conflictStats.resolved}\n`;
            message += `  Locked files: ${conflictStats.lockedFiles}\n`;

            vscode.window.showInformationMessage(message, { modal: true });
        })
    );

    // ==========================================
    // Phase 5 Commands: Autonomous Feature Builder
    // ==========================================

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.buildFeature", async () => {
            const request = await vscode.window.showInputBox({
                prompt: "Describe a feature to build autonomously",
                placeHolder: "e.g., Add password reset with email verification",
            });
            if (!request) return;

            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "SHEN AI: Building Feature",
                    cancellable: true,
                },
                async (progress, token) => {
                    token.onCancellationRequested(() => {
                        featureBuilder.cancelBuild();
                    });

                    progress.report({ message: "Planning feature..." });

                    try {
                        const build = await featureBuilder.buildFeature(request);

                        progress.report({ message: `Feature ${build.status}!` });

                        if (build.status === "completed") {
                            vscode.window.showInformationMessage(
                                `🏗️ Feature built successfully!\n\nFiles created: ${build.filesCreated.length}\nFiles modified: ${build.filesModified.length}\nDuration: ${build.duration ? Math.round(build.duration / 1000) : 0}s\nSteps: ${build.stepsCompleted}/${build.stepsTotal}`
                            );
                        } else {
                            vscode.window.showWarningMessage(
                                `🏗️ Feature build ${build.status}\n\nErrors: ${build.errors.length}\nCompleted: ${build.stepsCompleted}/${build.stepsTotal}`
                            );
                        }
                    } catch (error) {
                        vscode.window.showErrorMessage(`Feature build failed: ${(error as Error).message}`);
                    }
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.featureHistory", () => {
            const history = featureBuilder.getBuildHistory();
            if (history.length === 0) {
                vscode.window.showInformationMessage("No feature builds in history.");
                return;
            }

            const items = history.slice(0, 10).map((build) => ({
                label: `${build.status === "completed" ? "✅" : build.status === "failed" ? "❌" : "⏸️"} ${build.plan.title}`,
                description: `${build.status} • ${build.duration ? Math.round(build.duration / 1000) : 0}s`,
                detail: build.userRequest,
                build,
            }));

            vscode.window.showQuickPick(items, {
                placeHolder: "Feature Build History",
            });
        })
    );

    // ==========================================
    // Phase 5 Commands: Code Health Dashboard
    // ==========================================

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.healthScan", async () => {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "SHEN AI: Scanning Code Health...",
                    cancellable: false,
                },
                async (progress) => {
                    progress.report({ message: "Analyzing source files..." });

                    try {
                        const report = await vitalMonitor.scanHealth();
                        progress.report({ message: "Health scan complete!" });

                        const score = report.overallScore;
                        const status = report.overallStatus;
                        const emoji = status === "excellent" ? "🟢" : status === "good" ? "🟡" : status === "fair" ? "🟠" : "🔴";

                        let message = `💓 Code Health Report\n\n`;
                        message += `Overall: ${emoji} ${score}/100 (${status.toUpperCase()})\n\n`;

                        for (const metric of report.metrics) {
                            const mEmoji = metric.status === "healthy" ? "🟢" : metric.status === "warning" ? "🟡" : "🔴";
                            const trendEmoji = metric.trend === "improving" ? "📈" : metric.trend === "degrading" ? "📉" : "➡️";
                            message += `${mEmoji} ${metric.name}: ${Math.round(metric.value)} ${metric.unit} ${trendEmoji}\n`;
                            message += `   ${metric.description}\n\n`;
                        }

                        const criticalRx = report.prescriptions.filter((p) => p.severity === "critical" || p.severity === "high");
                        if (criticalRx.length > 0) {
                            message += `⚠️ Critical Prescriptions:\n`;
                            for (const rx of criticalRx.slice(0, 5)) {
                                message += `  • ${rx.title}\n`;
                                message += `    → ${rx.suggestedAction}\n\n`;
                            }
                        }

                        vscode.window.showInformationMessage(message, { modal: true });
                    } catch (error) {
                        vscode.window.showErrorMessage(`Health scan failed: ${(error as Error).message}`);
                    }
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.healthDashboard", () => {
            const stats = vitalMonitor.getStats();
            const report = vitalMonitor.getLatestReport();

            let message = `💓 Code Health Dashboard\n\n`;
            message += `Monitoring: ${stats.isMonitoring ? "Active" : "Inactive"}\n`;
            message += `Total scans: ${stats.totalScans}\n`;
            message += `Files monitored: ${stats.filesMonitored}\n\n`;

            if (report) {
                message += `Latest Score: ${report.overallScore}/100 (${report.overallStatus.toUpperCase()})\n`;
                message += `Generated: ${new Date(report.generatedAt).toLocaleString()}\n\n`;
            }

            message += `Prescriptions: ${stats.totalPrescriptions} total, ${stats.criticalPrescriptions} critical\n`;

            const trends = vitalMonitor.getTrends(7);
            if (trends.length > 1) {
                const first = trends[0].overallScore;
                const last = trends[trends.length - 1].overallScore;
                const diff = last - first;
                message += `\n7-day trend: ${diff > 0 ? "📈" : diff < 0 ? "📉" : "➡️"} ${diff > 0 ? "+" : ""}${Math.round(diff)} points\n`;
            }

            vscode.window.showInformationMessage(message, { modal: true });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.toggleHealthMonitor", () => {
            const stats = vitalMonitor.getStats();
            if (stats.isMonitoring) {
                vitalMonitor.stopMonitoring();
                vscode.window.showInformationMessage("Health monitoring stopped.");
            } else {
                vitalMonitor.startMonitoring();
                vscode.window.showInformationMessage("Health monitoring started. Scans every 60 seconds.");
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.fileHealth", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("Open a file first to check its health.");
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return;

            const relPath = path.relative(workspaceRoot, editor.document.uri.fsPath);
            const health = vitalMonitor.getFileHealth(relPath);

            if (!health) {
                vscode.window.showInformationMessage("File not analyzed. Run a health scan first.");
                return;
            }

            const emoji = health.score > 70 ? "🟢" : health.score > 40 ? "🟡" : "🔴";
            let message = `💓 File Health: ${path.basename(health.filePath)}\n\n`;
            message += `Score: ${emoji} ${health.score}/100\n`;
            message += `Complexity: ${health.complexity}\n`;
            message += `Maintainability: ${health.maintainability}/100\n\n`;

            if (health.issues.length > 0) {
                message += `Issues:\n`;
                for (const issue of health.issues) {
                    message += `  ⚠️ ${issue}\n`;
                }
            } else {
                message += `No issues detected! ✅`;
            }

            vscode.window.showInformationMessage(message, { modal: true });
        })
    );

    // ==========================================
    // Phase 5 Commands: Architecture City
    // ==========================================

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.generateCity", async () => {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "SHEN AI: Generating Architecture City...",
                    cancellable: false,
                },
                async (progress) => {
                    progress.report({ message: "Building city from genome..." });

                    try {
                        // Update city generator with health scores
                        const healthStats = vitalMonitor.getStats();
                        if (healthStats.filesMonitored > 0) {
                            const healthMap = new Map<string, number>();
                            // We'd need to expose file health from vital monitor
                            cityGenerator.updateHealthScores(healthMap);
                        }

                        const city = cityGenerator.generateCity();
                        const summary = cityGenerator.getCitySummary(city);

                        // Also generate 2D map data
                        const map2d = cityGenerator.generate2DMap();

                        // Save city data for potential visualization
                        const cityDataPath = path.join(os.homedir(), ".shen-ai", "city-data.json");
                        fs.writeFileSync(cityDataPath, JSON.stringify(city, null, 2), "utf-8");

                        vscode.window.showInformationMessage(summary + `\n\n📁 City data saved to: ${cityDataPath}`, { modal: true });
                    } catch (error) {
                        vscode.window.showErrorMessage(`City generation failed: ${(error as Error).message}`);
                    }
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("shen.showCity", async () => {
            try {
                const city = cityGenerator.generateCity();
                const summary = cityGenerator.getCitySummary(city);
                vscode.window.showInformationMessage(summary, { modal: true });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to show city: ${(error as Error).message}`);
            }
        })
    );

    // ==========================================
    // Existing Commands (Phases 1-4)
    // ==========================================

    // Show SHEN AI stats (updated with Phase 5 data)
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.showStats", () => {
            const correctionStats = correctionTracker.getStats();
            const behaviorStats = behaviorAnalyzer.getStats();
            const intentStats = intentEngine.getStats();
            const contextStats = chatManager.getContextStats();
            const graphStats = graphStore.getStats();
            const ghostStats = ghostObserver.getStats();
            const styleProfile = styleExtractor.getStyleProfile();
            const swarmStatus = swarmOrchestrator.getStatus();
            const healthStats = vitalMonitor.getStats();
            const featureHistory = featureBuilder.getBuildHistory();

            const message = `📊 SHEN AI Statistics

🧠 Self-Evolving Prompts:
  • Corrections tracked: ${correctionStats.totalCorrections}
  • Lessons learned: ${correctionStats.totalLessons}
  • Patterns detected: ${correctionStats.patterns}

👁 Ghost Mode:
  • Observing: ${ghostStats.isObserving ? "Yes" : "No"}
  • Total edits: ${ghostStats.totalEdits}
  • Files edited: ${ghostStats.filesEdited}
  • Style confidence: ${Math.round(ghostStats.styleConfidence * 100)}%
  • Naming: ${styleProfile.namingConvention}
  • Quotes: ${styleProfile.quoteStyle}
  • Semicolons: ${styleProfile.semicolonUsage}

🧬 Project Genome:
  • Nodes: ${graphStats.totalNodes}
  • Edges: ${graphStats.totalEdges}
  • Types: ${Object.entries(graphStats.nodesByType).map(([k, v]) => `${k}(${v})`).join(", ")}

🐝 Swarm Mode:
  • Running: ${swarmStatus.isRunning ? "Yes" : "No"}
  • Total tasks: ${swarmOrchestrator.getTaskHistory().length}
  • Conflicts resolved: ${swarmStatus.conflictStats.resolved}

🏗️ Feature Builder:
  • Total builds: ${featureHistory.length}
  • Completed: ${featureHistory.filter((b) => b.status === "completed").length}
  • Failed: ${featureHistory.filter((b) => b.status === "failed").length}

💓 Code Health:
  • Monitoring: ${healthStats.isMonitoring ? "Active" : "Inactive"}
  • Current score: ${healthStats.currentScore}/100 (${healthStats.currentStatus})
  • Prescriptions: ${healthStats.totalPrescriptions} (${healthStats.criticalPrescriptions} critical)

🔮 Predictive Intent:
  • Enabled: ${intentStats.isEnabled ? "Yes" : "No"}
  • Total predictions: ${intentStats.totalPredictions}
  • Last prediction: ${intentStats.lastPrediction || "None"}

📚 Context Manager:
  • Tracked files: ${contextStats.fileContexts}
  • File context tokens: ${contextStats.totalFileTokens}

🎭 Personality: ${personalityEngine.getProfile(personalityEngine.getPersonality()).displayName}`;

            vscode.window.showInformationMessage(message, { modal: true });
        })
    );

    // Index workspace genome
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.indexGenome", async () => {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "SHEN AI: Indexing Project Genome...",
                    cancellable: false,
                },
                async (progress) => {
                    progress.report({ message: "Parsing source files..." });
                    const result = await genomeBuilder.indexWorkspace();
                    progress.report({ message: "Genome indexing complete!" });
                    vscode.window.showInformationMessage(
                        `🧬 Genome indexed: ${result.nodes} nodes, ${result.edges} edges from ${result.files} files`
                    );
                }
            );
        })
    );

    // Semantic enrichment
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.enrichGenome", async () => {
            vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: "SHEN AI: Enriching Genome with AI...",
                    cancellable: false,
                },
                async (progress) => {
                    progress.report({ message: "Running semantic analysis..." });
                    const result = await semanticIndexer.enrichGraph();
                    progress.report({ message: "Semantic enrichment complete!" });
                    vscode.window.showInformationMessage(
                        `🧠 Enriched: ${result.enriched} nodes, ${result.failed} failed`
                    );
                }
            );
        })
    );

    // Search genome
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.searchGenome", async () => {
            const query = await vscode.window.showInputBox({
                prompt: "Search Project Genome",
                placeHolder: "e.g., authentication, user, payment...",
            });
            if (query) {
                const results = semanticIndexer.semanticSearch(query);
                if (results.length === 0) {
                    vscode.window.showInformationMessage("No results found in the genome.");
                    return;
                }

                const items = results.slice(0, 20).map((node) => ({
                    label: `${node.name}`,
                    description: `${node.type} • ${node.filePath}`,
                    detail: node.summary,
                    node,
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `Found ${results.length} results for "${query}"`,
                });

                if (selected) {
                    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (workspaceRoot) {
                        const fullPath = path.join(workspaceRoot, selected.node.filePath);
                        const uri = vscode.Uri.file(fullPath);
                        const doc = await vscode.workspace.openTextDocument(uri);
                        const editor = await vscode.window.showTextDocument(doc);
                        const range = new vscode.Range(
                            selected.node.lineStart - 1,
                            0,
                            selected.node.lineEnd - 1,
                            0
                        );
                        editor.selection = new vscode.Selection(range.start, range.end);
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    }
                }
            }
        })
    );

    // Show blast radius
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.showBlastRadius", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage("Open a file first to check blast radius.");
                return;
            }

            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) return;

            const relPath = path.relative(workspaceRoot, editor.document.uri.fsPath);
            const fileNodes = graphStore.getNodesByFile(relPath);
            const fileNode = fileNodes.find((n: any) => n.type === "file");
            if (!fileNode) {
                vscode.window.showInformationMessage("File not indexed. Run 'Index Genome' first.");
                return;
            }

            const blast = semanticIndexer.getBlastRadius(fileNode.id);
            const message = `💥 Blast Radius for ${path.basename(editor.document.fileName)}

Direct dependencies: ${blast.direct.length}
Indirect dependencies: ${blast.indirect.length}
Risk level: ${blast.risk.toUpperCase()}

${blast.direct.length > 0 ? "Direct:\n" + blast.direct.map((n) => `  • ${n.name} (${n.type})`).join("\n") : ""}
${blast.indirect.length > 0 ? "\nIndirect:\n" + blast.indirect.slice(0, 10).map((n) => `  • ${n.name} (${n.type})`).join("\n") : ""}`;

            vscode.window.showInformationMessage(message, { modal: true });
        })
    );

    // Reset ghost mode data
    context.subscriptions.push(
        vscode.commands.registerCommand("shen.resetGhostMode", async () => {
            const confirm = await vscode.window.showWarningMessage(
                "Reset all learned coding style data?",
                { modal: true },
                "Reset"
            );
            if (confirm === "Reset") {
                ghostObserver.resetStyle();
                vscode.window.showInformationMessage("Ghost mode style data has been reset.");
            }
        })
    );
}

export function deactivate(): void {
    intentEngine.dispose();
    behaviorAnalyzer.dispose();
    ghostObserver.dispose();
    swarmOrchestrator.dispose();
    vitalMonitor.dispose();
    checkpointManager.dispose();
    graphStore.saveToDisk();
    logger.info("SHEN AI extension deactivated.");
    logger.dispose();
}
