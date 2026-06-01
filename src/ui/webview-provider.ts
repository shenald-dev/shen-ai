import * as vscode from "vscode";
import * as cp from "child_process";
import type { ChatManager, FeatureSettings } from "../core/chat/chat-manager";
import type { ConfigManager } from "../utils/config";
import type { CheckpointManager } from "../core/tools/checkpoint-manager";
import type { CorrectionTracker } from "../core/evolution/correction-tracker";
import type {
    WebviewMessage,
    ExtensionMessage,
    ChatMessage,
    ToolCall,
    ToolResult,
    PersonalityType,
    ProviderName,
    ProviderToolCall,
} from "../types";
import { logger } from "../utils/logger";

// ============================================================
// SHEN AI — Webview Provider (Extension ↔ Webview Bridge)
// ============================================================

export class WebviewProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | null = null;
    private extensionUri: vscode.Uri;
    private context: vscode.ExtensionContext;
    private chatManager: ChatManager;
    private config: ConfigManager;
    private checkpointManager: CheckpointManager | null = null;
    private correctionTracker: CorrectionTracker | null = null;

    constructor(
        extensionUri: vscode.Uri,
        context: vscode.ExtensionContext,
        chatManager: ChatManager,
        config: ConfigManager,
        checkpointManager?: CheckpointManager,
        correctionTracker?: CorrectionTracker
    ) {
        this.extensionUri = extensionUri;
        this.context = context;
        this.chatManager = chatManager;
        this.config = config;
        this.checkpointManager = checkpointManager || null;
        this.correctionTracker = correctionTracker || null;
    }

    public setCheckpointManager(manager: CheckpointManager): void {
        this.checkpointManager = manager;
    }

    public setCorrectionTracker(tracker: CorrectionTracker): void {
        this.correctionTracker = tracker;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(
            (message: WebviewMessage) => {
                this.handleMessage(message);
            }
        );

        // Send initial settings
        this.syncSettings();

        // Send existing messages if any
        this.sendExistingMessages();

        logger.info("Webview resolved and connected.");
    }

    private handleMessage(message: WebviewMessage): void {
        try {
            switch (message.action) {
                case "chat/send":
                    this.handleChatSend(message.payload as { content: string; personality?: PersonalityType });
                    break;
                case "chat/cancel":
                    this.chatManager.cancelCurrentTask();
                    this.postMessage({ action: "chat/done", payload: { cancelled: true } });
                    break;
                case "chat/clear":
                    this.chatManager.getHistory().clearMessages();
                    this.postMessage({ action: "chat/done", payload: { cleared: true } });
                    break;
                case "chat/getHistory":
                    this.handleGetHistory();
                    break;
                case "chat/loadHistory":
                    this.handleLoadHistory(message.payload);
                    break;
                case "chat/deleteHistory":
                    this.handleDeleteHistory(message.payload);
                    break;
                case "task/checkpoint":
                    this.handleCheckpoint();
                    break;
                case "task/undo":
                    this.handleUndo();
                    break;
                case "task/undoTask":
                    this.handleUndoTask(message.payload as { taskId: string });
                    break;
                case "task/restoreCheckpoint":
                    this.handleRestoreCheckpoint(message.payload as { checkpointId: string });
                    break;
                case "task/getCheckpoints":
                    this.sendCheckpointData();
                    break;
                case "task/restoreToMessage":
                    this.handleRestoreToMessage(message.payload as { messageId: string; timestamp: number });
                    break;
                case "settings/update":
                    this.handleSettingsUpdate(message.payload as Record<string, unknown>);
                    break;
                case "settings/get":
                    this.syncSettings();
                    break;
                case "task/new":
                    this.chatManager.newConversation();
                    this.notifyNewTask();
                    break;
                case "feedback/correction":
                    this.handleCorrection(message.payload as { original: string; corrected: string; file: string });
                    break;
                case "settings/testConnection":
                    this.handleTestConnection(message.payload as { provider: ProviderName; baseUrl: string; apiKey?: string });
                    break;
                default:
                    logger.warn(`Unknown webview message action: ${message.action}`);
            }
        } catch (error) {
            logger.error(`Error handling message ${message.action}:`, error);
            this.postMessage({
                action: "chat/error",
                payload: { message: `Failed to process ${message.action}: ${(error as Error).message}` },
            });
        }
    }

    private handleGetHistory(): void {
        try {
            const history = this.chatManager.getHistory().getAllConversations().map(c => ({
                id: c.id,
                title: c.title,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                totalTokens: c.totalTokens
            }));
            this.postMessage({ action: "chat/historyList" as any, payload: history });
        } catch (error) {
            logger.error("Failed to get history:", error);
            this.postMessage({ action: "chat/historyList" as any, payload: [] });
        }
    }

    private handleLoadHistory(payload: unknown): void {
        if (payload && typeof payload === 'object' && 'id' in payload) {
            try {
                this.chatManager.getHistory().setActiveConversation((payload as any).id);
                this.sendExistingMessages();
                this.postMessage({ action: "chat/done", payload: { loaded: true } });
            } catch (error) {
                logger.error("Failed to load history:", error);
                this.postMessage({
                    action: "chat/error",
                    payload: { message: "Failed to load conversation history" },
                });
            }
        }
    }

    private handleDeleteHistory(payload: unknown): void {
        if (payload && typeof payload === 'object' && 'id' in payload) {
            try {
                const id = (payload as any).id;
                this.chatManager.getHistory().deleteConversation(id);
                // Send updated list back
                const newHistory = this.chatManager.getHistory().getAllConversations().map(c => ({
                    id: c.id,
                    title: c.title,
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt,
                    totalTokens: c.totalTokens
                }));
                this.postMessage({ action: "chat/historyList" as any, payload: newHistory });
            } catch (error) {
                logger.error("Failed to delete history:", error);
                this.postMessage({
                    action: "chat/error",
                    payload: { message: "Failed to delete conversation" },
                });
            }
        }
    }

    private async handleChatSend(payload: { content: string; personality?: PersonalityType; agentMode?: "act" | "plan" }): Promise<void> {
        const { content, personality, agentMode } = payload;
        if (!content || content.trim().length === 0) return;

        const config = this.config.getFullConfig();

        // Build feature settings from config to inject into AI system prompt
        const featureSettings: FeatureSettings = {
            enableCodeDNAProfiling: config.enableCodeDNAProfiling,
            enableSmartCheckpointRollback: config.enableSmartCheckpointRollback,
            enableBlastRadiusAnalyzer: config.enableBlastRadiusAnalyzer,
            enableCodeValidator: config.enableCodeValidator,
            enableConversationSummarizer: config.enableConversationSummarizer,
            enableSelfEvolvingPrompts: config.enableSelfEvolvingPrompts,
        };

        try {
            await this.chatManager.sendMessage(
                content,
                {
                    onStreaming: (chunk: string, isComplete: boolean, toolCalls?: ProviderToolCall[]) => {
                        this.postMessage({
                            action: "chat/streaming",
                            payload: { content: chunk, isComplete, toolCalls },
                        });
                    },
                    onToolCall: (toolCall: ToolCall) => {
                        this.postMessage({
                            action: "chat/toolCall",
                            payload: toolCall,
                        });
                    },
                    onToolResult: (result: ToolResult) => {
                        this.postMessage({
                            action: "chat/toolResult",
                            payload: result,
                        });
                    },
                    onDone: (finalContent: string, totalTokens: number) => {
                        this.postMessage({
                            action: "chat/done",
                            payload: { content: finalContent, totalTokens },
                        });
                    },
                    onError: (error: string) => {
                        this.postMessage({
                            action: "chat/error",
                            payload: { message: error },
                        });
                    },
                },
                personality || config.personality,
                agentMode || "act",
                featureSettings
            );
        } catch (error) {
            this.postMessage({
                action: "chat/error",
                payload: { message: (error as Error).message },
            });
        }
    }

    private async handleSettingsUpdate(payload: Record<string, unknown>): Promise<void> {
        if (!payload || typeof payload !== 'object') {
            logger.warn("Invalid settings payload received");
            return;
        }

        try {
            for (const [key, value] of Object.entries(payload)) {
                try {
                    await this.config.update(key, value);
                } catch (keyError) {
                    logger.warn(`Failed to update setting '${key}':`, keyError);
                }
            }
            this.syncSettings();
            logger.info("Settings updated from webview.");
        } catch (error) {
            logger.error("Failed to update settings:", error);
            vscode.window.showErrorMessage(`Failed to update settings: ${(error as Error).message}`);
        }
    }

    private handleCorrection(payload: { original: string; corrected: string; file: string }): void {
        if (!payload || !payload.original || !payload.corrected || !payload.file) {
            logger.warn("Invalid correction payload received");
            return;
        }

        logger.info("Correction received:", payload);

        // Feed into the correction tracker for prompt evolution
        if (this.correctionTracker) {
            try {
                const correction = this.correctionTracker.recordCorrection(
                    payload.original,
                    payload.corrected,
                    payload.file
                );
                logger.info(`Correction recorded with ID: ${correction.id}`);

                // Get updated lessons count for telemetry
                const stats = this.correctionTracker.getStats();
                logger.info(`Total lessons: ${stats.totalLessons}, Patterns: ${stats.patterns}`);
            } catch (error) {
                logger.error("Failed to record correction:", error);
            }
        } else {
            logger.warn("CorrectionTracker not available - correction not persisted");
        }
    }

    private async handleTestConnection(payload: { provider: ProviderName; baseUrl: string; apiKey?: string }): Promise<void> {
        if (!payload || !payload.baseUrl || !payload.provider) {
            this.postMessage({
                action: "settings/testConnectionResult" as any,
                payload: { success: false, error: "Invalid connection parameters" },
            });
            return;
        }

        try {
            let url = payload.baseUrl.replace(/\/$/, "");
            if (payload.provider === "ollama") {
                url += "/api/tags";
            } else {
                url += "/v1/models";
            }

            const headers: Record<string, string> = {};

            // Get actual api key if they didn't provide one from the UI but we have one saved
            const savedKey = this.config.getApiKeyForProvider(payload.provider);
            const keyToUse = payload.apiKey || savedKey;

            if (keyToUse) {
                headers["Authorization"] = `Bearer ${keyToUse}`;
            }

            // Add timeout to prevent hanging connections
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            try {
                // Node.js native fetch (v18+) bypasses all CORS
                const res = await fetch(url, { 
                    headers,
                    signal: controller.signal 
                });

                clearTimeout(timeoutId);

                if (res.status === 404) {
                    // The server exists and responded, but doesn't implement the model discovery endpoint.
                    // This is extremely common for lightweight custom APIs. We treat the connection as successful.
                    return this.postMessage({
                        action: "settings/testConnectionResult" as any,
                        payload: { success: true, models: [] },
                    });
                }

                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();

                let models: string[] = [];
                if (payload.provider === "ollama") {
                    models = data.models?.map((m: any) => m.name) || [];
                } else {
                    models = data.data?.map((m: any) => m.id) || [];
                }

                this.postMessage({
                    action: "settings/testConnectionResult" as any,
                    payload: { success: true, models },
                });
            } catch (fetchError: any) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    throw new Error('Connection timeout - server did not respond within 15 seconds');
                }
                throw fetchError;
            }
        } catch (err: any) {
            this.postMessage({
                action: "settings/testConnectionResult" as any,
                payload: { success: false, error: err.message || "Connection failed" },
            });
        }
    }

    syncSettings(): void {
        const config = this.config.getFullConfig();
        this.postMessage({
            action: "settings/sync",
            payload: {
                provider: config.provider,
                model: config.model,
                temperature: config.temperature,
                maxTokens: config.maxTokens,
                personality: config.personality,
                autoApplyChanges: config.autoApplyChanges,
                enablePredictiveIntent: config.enablePredictiveIntent,
                enableGhostMode: config.enableGhostMode,
                enableSelfEvolvingPrompts: config.enableSelfEvolvingPrompts,
                hasApiKey: this.config.hasApiKey(config.provider),
                customBaseUrl: config.customBaseUrl,
                // Real Features (Working Implementations)
                enableCodeDNAProfiling: config.enableCodeDNAProfiling,
                enableSmartCheckpointRollback: config.enableSmartCheckpointRollback,
                enableBlastRadiusAnalyzer: config.enableBlastRadiusAnalyzer,
                enableCodeValidator: config.enableCodeValidator,
                enableConversationSummarizer: config.enableConversationSummarizer,
            },
        });
    }

    notifyNewTask(): void {
        this.postMessage({
            action: "chat/done",
            payload: { newTask: true },
        });
    }

    notifyCancelled(): void {
        this.postMessage({
            action: "chat/done",
            payload: { cancelled: true },
        });
    }

    sendActiveFile(filePath: string): void {
        this.postMessage({
            action: "agent/status" as any,
            payload: { activeFile: filePath },
        });
    }

    sendDocumentChange(fileName: string, changes: Array<{ text: string; rangeLength: number }>): void {
        // Ghost mode: send to webview for style learning
        this.postMessage({
            action: "agent/status" as any,
            payload: { documentChange: { fileName, changes } },
        });
    }

    sendInlineContext(context: { filePath: string; selection: string }): void {
        this.postMessage({
            action: "agent/status" as any,
            payload: { inlineContext: context },
        });
    }

    sendQuickQuestion(question: string): void {
        this.postMessage({
            action: "agent/status" as any,
            payload: { quickQuestion: question },
        });
    }

    sendIntentPrediction(intent: { type: string; confidence: number; description: string; suggestedAction: string }): void {
        this.postMessage({
            action: "agent/status" as any,
            payload: { intentPrediction: intent },
        });
    }

    sendStyleUpdate(style: Record<string, unknown>): void {
        this.postMessage({
            action: "agent/status" as any,
            payload: { styleUpdate: style },
        });
    }

    sendAgentStatus(status: Record<string, unknown>): void {
        this.postMessage({
            action: "agent/status" as any,
            payload: status,
        });
    }

    private sendExistingMessages(): void {
        const messages = this.chatManager.getHistory().getMessages();
        for (const msg of messages) {
            this.postMessage({
                action: "chat/response",
                payload: msg,
            });
        }
    }

    private postMessage(message: ExtensionMessage): void {
        if (this.view) {
            this.view.webview.postMessage(message);
        }
    }

    private getHtml(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js")
        );

        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "codicons", "codicon.css")
        );

        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview.css")
        );

        const nonce = this.generateNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${webview.cspSource} https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.groq.com https://api.mistral.ai http://localhost:11434; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>SHEN AI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--vscode-font-family, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            overflow: hidden;
        }
        #root { height: 100%; }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
        }
        .loading-spinner {
            width: 24px;
            height: 24px;
            border: 2px solid var(--vscode-progressBar-background);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-right: 8px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="loading">
            <div class="loading-spinner"></div>
            <span>SHEN AI loading...</span>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private generateNonce(): string {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let nonce = "";
        for (let i = 0; i < 32; i++) {
            nonce += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return nonce;
    }

    private async handleCheckpoint(): Promise<void> {
        try {
            if (!this.checkpointManager) {
                // Fallback to git-only checkpoint
                await this.createGitCheckpoint();
                return;
            }

            const activeTaskId = this.checkpointManager.getActiveTaskId();
            if (activeTaskId) {
                const timestamp = new Date().toLocaleTimeString();
                await this.checkpointManager.createCheckpoint(activeTaskId, `Manual checkpoint ${timestamp}`, false);
                vscode.window.showInformationMessage("📌 Checkpoint saved!");
                this.sendCheckpointData();
            } else {
                // No active task, just do git checkpoint
                await this.createGitCheckpoint();
            }
        } catch (error) {
            logger.error("Failed to create checkpoint:", error);
            vscode.window.showErrorMessage(`Failed to create checkpoint: ${(error as Error).message}`);
        }
    }

    private async handleUndo(): Promise<void> {
        try {
            if (this.checkpointManager) {
                await this.checkpointManager.undoLastAction();
                this.sendCheckpointData();
            }
        } catch (error) {
            logger.error("Failed to undo last action:", error);
            vscode.window.showErrorMessage(`Failed to undo: ${(error as Error).message}`);
        }
    }

    private async handleUndoTask(payload: { taskId: string }): Promise<void> {
        try {
            if (this.checkpointManager && payload?.taskId) {
                await this.checkpointManager.undoTask(payload.taskId);
                this.sendCheckpointData();
            }
        } catch (error) {
            logger.error("Failed to undo task:", error);
            vscode.window.showErrorMessage(`Failed to undo task: ${(error as Error).message}`);
        }
    }

    private async handleRestoreCheckpoint(payload: { checkpointId: string }): Promise<void> {
        try {
            if (this.checkpointManager && payload?.checkpointId) {
                await this.checkpointManager.restoreCheckpoint(payload.checkpointId);
                this.sendCheckpointData();
            }
        } catch (error) {
            logger.error("Failed to restore checkpoint:", error);
            vscode.window.showErrorMessage(`Failed to restore checkpoint: ${(error as Error).message}`);
        }
    }

    private sendCheckpointData() {
        if (!this.checkpointManager) return;

        const tasks = this.checkpointManager.getAllTasks().map(task => ({
            id: task.id,
            label: task.label,
            isActive: task.isActive,
            checkpoints: task.checkpoints.map(cp => ({
                id: cp.id,
                taskId: cp.taskId,
                label: cp.label,
                timestamp: cp.timestamp,
                gitCommit: cp.gitCommit,
                fileChanges: cp.fileChanges.map(fc => ({
                    id: fc.id,
                    filePath: fc.filePath,
                    toolName: fc.toolName,
                    timestamp: fc.timestamp,
                })),
                isAutoCheckpoint: cp.isAutoCheckpoint,
            })),
            fileChanges: task.fileChanges.map(fc => ({
                id: fc.id,
                filePath: fc.filePath,
                toolName: fc.toolName,
                timestamp: fc.timestamp,
            })),
            createdAt: task.createdAt,
        }));

        this.postMessage({
            action: "agent/status" as any,
            payload: { checkpointData: { tasks } },
        });
    }

    private async createGitCheckpoint(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage("No workspace folder open to checkpoint.");
            return;
        }

        const cwd = workspaceFolders[0].uri.fsPath;
        try {
            // Check if git is initialized, if not initialize it
            await this.execGitCommand(["status"], cwd).catch(async () => {
                await this.execGitCommand(["init"], cwd);
            });

            // Stage all changes and commit with sanitized message
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const commitMessage = `SHEN Checkpoint: ${timestamp}`;
            
            await this.execGitCommand(["add", "."], cwd);
            
            try {
                await this.execGitCommand(["commit", "-m", commitMessage], cwd);
                vscode.window.showInformationMessage("✅ Workspace Checkpoint Saved!");
            } catch (commitError) {
                // Check if it's a "nothing to commit" error (expected)
                const errorMsg = (commitError as Error).message || "";
                if (errorMsg.includes("nothing to commit") || errorMsg.includes("no changes")) {
                    vscode.window.showInformationMessage("ℹ️ No changes to checkpoint");
                } else {
                    throw commitError;
                }
            }
        } catch (e: any) {
            logger.error("Git checkpoint failed:", e);
            vscode.window.showErrorMessage("Failed to create checkpoint: " + e.message);
        }
    }

    /**
     * Execute a git command safely using execFile to prevent command injection.
     */
    private execGitCommand(args: string[], cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            cp.execFile("git", args, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(stderr || error.message));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * Start a new checkpoint task (called when a new chat task begins).
     */
    public startCheckpointTask(taskId: string, label: string, conversationId: string): void {
        if (this.checkpointManager) {
            this.checkpointManager.startTask(taskId, label, conversationId);
            this.sendCheckpointData();
        }
    }

    /**
     * Snapshot a file before modification (called by tool registry).
     */
    public async snapshotFile(filePath: string): Promise<void> {
        if (this.checkpointManager) {
            await this.checkpointManager.snapshotFile(filePath);
        }
    }

    /**
     * Record a file change after modification (called by tool registry).
     */
    public recordFileChange(filePath: string, toolName: string): void {
        if (this.checkpointManager) {
            this.checkpointManager.recordFileChange(filePath, toolName);
            this.sendCheckpointData();
        }
    }

    /**
     * Restore all files and truncate chat history to a specific message point.
     * This is the "Undo to here" functionality — reverts everything after the given message.
     */
    private async handleRestoreToMessage(payload: { messageId: string; timestamp: number }): Promise<void> {
        if (!payload || !payload.timestamp || !payload.messageId) {
            vscode.window.showErrorMessage("Invalid restore point.");
            return;
        }

        const { messageId, timestamp } = payload;

        try {
            // Step 1: Restore files using UndoManager (undo all file changes after this timestamp)
            const { UndoManager } = await import("../core/tools/undo-manager");
            const undoManager = UndoManager.getInstance();
            const result = await undoManager.undoToTimestamp(timestamp);

            // Step 2: Also try CheckpointManager if available
            if (this.checkpointManager) {
                const activeTaskId = this.checkpointManager.getActiveTaskId();
                if (activeTaskId) {
                    const taskChanges = this.checkpointManager.getTaskFileChanges(activeTaskId);
                    const changesAfterPoint = taskChanges.filter(c => c.timestamp > timestamp);
                    // Undo those changes in reverse order
                    for (const change of changesAfterPoint.reverse()) {
                        try {
                            const fs = await import("fs");
                            const pathModule = await import("path");
                            
                            if (change.beforeContent === null) {
                                // File was created, delete it
                                if (fs.existsSync(change.filePath)) {
                                    await fs.promises.unlink(change.filePath);
                                }
                            } else {
                                // File was modified, restore previous content
                                const dir = pathModule.dirname(change.filePath);
                                await fs.promises.mkdir(dir, { recursive: true });
                                await fs.promises.writeFile(change.filePath, change.beforeContent, "utf-8");
                            }
                        } catch (e) {
                            logger.error(`Failed to restore file: ${change.filePath}`, e);
                        }
                    }
                }
            }

            // Step 3: Truncate chat history in the conversation
            this.chatManager.getHistory().truncateAfterMessage(messageId);

            // Step 4: Notify webview to update UI
            this.postMessage({
                action: "chat/done",
                payload: { restoredToMessage: messageId, restoredFiles: result.restoredFiles },
            });

            // Re-send the truncated message list
            this.sendExistingMessages();

            const fileCount = result.restoredFiles;
            if (fileCount > 0) {
                vscode.window.showInformationMessage(`↩️ Restored ${fileCount} file(s) to selected point.`);
            } else {
                vscode.window.showInformationMessage("↩️ Chat history truncated. No file changes to revert.");
            }

            logger.info(`Restore to message ${messageId}: ${fileCount} files restored`);
        } catch (error) {
            logger.error("Failed to restore to message:", error);
            vscode.window.showErrorMessage(`Failed to restore: ${(error as Error).message}`);
            this.postMessage({
                action: "chat/error",
                payload: { message: "Failed to restore to selected point" },
            });
        }
    }
}
