import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";
import type {
    FileSnapshot,
    FileChange,
    Checkpoint,
    TaskChangeGroup,
    CheckpointManagerStats,
} from "../../types";

// ============================================================
// SHEN AI — Checkpoint Manager
// Complete redesign of undo/checkpoint system with:
//   • Task-grouped change tracking
//   • Auto-snapshots before file writes
//   • Git integration for checkpoints
//   • Multi-level undo (action, task, checkpoint)
//   • Persistent storage
// ============================================================

export class CheckpointManager extends EventEmitter {
    private static instance: CheckpointManager;
    private taskGroups: Map<string, TaskChangeGroup> = new Map();
    private activeTaskId: string | null = null;
    private pendingSnapshots: Map<string, FileSnapshot> = new Map();
    private storagePath: string;
    private readonly MAX_TASK_GROUPS = 20;
    private readonly MAX_CHANGES_PER_TASK = 100;

    private constructor(storagePath: string) {
        super();
        this.storagePath = storagePath;
        this.loadFromDisk();
    }

    public static getInstance(storagePath?: string): CheckpointManager {
        if (!CheckpointManager.instance && storagePath) {
            CheckpointManager.instance = new CheckpointManager(storagePath);
        }
        return CheckpointManager.instance;
    }

    // --- Task Management ---

    /**
     * Start a new task group for tracking changes.
     * Call this when a new conversation/task begins.
     */
    public startTask(taskId: string, label: string, conversationId: string): void {
        // Deactivate current task
        if (this.activeTaskId) {
            const current = this.taskGroups.get(this.activeTaskId);
            if (current) {
                current.isActive = false;
            }
        }

        // Create new task group
        const group: TaskChangeGroup = {
            id: taskId,
            label,
            conversationId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            checkpoints: [],
            fileChanges: [],
            isActive: true,
        };

        this.taskGroups.set(taskId, group);
        this.activeTaskId = taskId;

        // Enforce task limit
        this.enforceTaskLimit();

        // Auto-create initial checkpoint
        this.createCheckpoint(taskId, "Task started", true);

        this.emit("taskStarted", { taskId, label });
        logger.info(`Checkpoint task started: ${label} (${taskId})`);
    }

    /**
     * End the current task group.
     */
    public endTask(): void {
        if (this.activeTaskId) {
            const group = this.taskGroups.get(this.activeTaskId);
            if (group) {
                group.isActive = false;
                // Create final checkpoint
                this.createCheckpoint(this.activeTaskId, "Task completed", true);
                this.saveToDisk();
            }
            this.activeTaskId = null;
            this.emit("taskEnded");
        }
    }

    /**
     * Get the active task ID.
     */
    public getActiveTaskId(): string | null {
        return this.activeTaskId;
    }

    // --- Snapshot & Change Tracking ---

    /**
     * Take a snapshot of a file BEFORE modifying it.
     * Call this before any write_to_file, replace_in_file, etc.
     */
    public async snapshotFile(filePath: string): Promise<void> {
        try {
            let content: string | null = null;
            if (fs.existsSync(filePath)) {
                content = await fs.promises.readFile(filePath, "utf-8");
            }
            this.pendingSnapshots.set(filePath, {
                filePath,
                content,
                timestamp: Date.now(),
            });
            logger.debug(`Snapshot taken: ${path.basename(filePath)}`);
        } catch (e) {
            logger.error(`Failed to snapshot ${filePath}`, e);
        }
    }

    /**
     * Record a file change AFTER a write operation completes.
     * Call this after write_to_file, replace_in_file, etc. succeed.
     */
    public recordFileChange(filePath: string, toolName: string): void {
        const snapshot = this.pendingSnapshots.get(filePath);
        if (!snapshot) {
            logger.warn(`No snapshot found for ${filePath}, skipping change record`);
            return;
        }

        // Read the new content
        let afterContent: string | null = null;
        try {
            if (fs.existsSync(filePath)) {
                afterContent = fs.readFileSync(filePath, "utf-8");
            }
        } catch (e) {
            logger.error(`Failed to read after content for ${filePath}`, e);
        }

        const change: FileChange = {
            id: `change_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            filePath,
            beforeContent: snapshot.content,
            afterContent,
            toolName,
            timestamp: Date.now(),
        };

        // Add to active task group
        if (this.activeTaskId) {
            const group = this.taskGroups.get(this.activeTaskId);
            if (group) {
                // Check for duplicate change on same file within 1 second
                const recentChange = group.fileChanges.find(
                    c => c.filePath === filePath && Math.abs(c.timestamp - change.timestamp) < 1000
                );
                if (!recentChange) {
                    group.fileChanges.push(change);
                    group.updatedAt = Date.now();

                    // Enforce change limit per task
                    if (group.fileChanges.length > this.MAX_CHANGES_PER_TASK) {
                        group.fileChanges = group.fileChanges.slice(-this.MAX_CHANGES_PER_TASK);
                    }

                    this.emit("fileChangeRecorded", { change, taskId: this.activeTaskId });
                    logger.debug(`Change recorded: ${path.basename(filePath)} via ${toolName}`);
                }
            }
        }

        // Clear the pending snapshot
        this.pendingSnapshots.delete(filePath);
    }

    // --- Checkpoint Creation ---

    /**
     * Create a checkpoint (with optional git commit).
     */
    public async createCheckpoint(
        taskId: string,
        label: string,
        isAuto: boolean = false,
        createGitCommit: boolean = true
    ): Promise<Checkpoint | null> {
        const group = this.taskGroups.get(taskId);
        if (!group) {
            logger.warn(`Cannot create checkpoint: task ${taskId} not found`);
            return null;
        }

        let gitCommit: string | undefined;

        if (createGitCommit) {
            try {
                gitCommit = await this.createGitCommit(label);
            } catch (e) {
                logger.warn(`Git commit failed for checkpoint: ${(e as Error).message}`);
            }
        }

        const checkpoint: Checkpoint = {
            id: `cp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            taskId,
            label,
            timestamp: Date.now(),
            gitCommit,
            fileChanges: [...group.fileChanges], // Snapshot of all changes so far
            isAutoCheckpoint: isAuto,
        };

        group.checkpoints.push(checkpoint);
        group.updatedAt = Date.now();

        this.emit("checkpointCreated", { checkpoint, taskId });
        this.saveToDisk();

        logger.info(`Checkpoint created: "${label}" ${gitCommit ? `(git: ${gitCommit.substring(0, 7)})` : ""}`);
        return checkpoint;
    }

    // --- Undo Operations ---

    /**
     * Undo the last single file change.
     */
    public async undoLastAction(): Promise<boolean> {
        if (!this.activeTaskId) {
            vscode.window.showInformationMessage("No active task to undo.");
            return false;
        }

        const group = this.taskGroups.get(this.activeTaskId);
        if (!group || group.fileChanges.length === 0) {
            vscode.window.showInformationMessage("No actions to undo in current task.");
            return false;
        }

        const lastChange = group.fileChanges[group.fileChanges.length - 1];
        return this.undoFileChange(lastChange, group);
    }

    /**
     * Undo a specific file change.
     */
    private async undoFileChange(change: FileChange, group: TaskChangeGroup): Promise<boolean> {
        try {
            if (change.beforeContent === null) {
                // File didn't exist before, delete it
                if (fs.existsSync(change.filePath)) {
                    await fs.promises.unlink(change.filePath);
                }
            } else {
                // Restore previous content
                const dir = path.dirname(change.filePath);
                await fs.promises.mkdir(dir, { recursive: true });
                await fs.promises.writeFile(change.filePath, change.beforeContent, "utf-8");
            }

            // Remove the change from the group
            const idx = group.fileChanges.findIndex(c => c.id === change.id);
            if (idx !== -1) {
                group.fileChanges.splice(idx, 1);
            }

            const basename = path.basename(change.filePath);
            vscode.window.showInformationMessage(`↩️ Undo: Restored ${basename}`);
            this.emit("undoCompleted", { change, taskId: group.id });
            this.saveToDisk();
            return true;
        } catch (e) {
            logger.error(`Failed to undo change for ${change.filePath}`, e);
            vscode.window.showErrorMessage(`Failed to undo: ${(e as Error).message}`);
            return false;
        }
    }

    /**
     * Undo ALL changes from a specific task.
     */
    public async undoTask(taskId: string): Promise<boolean> {
        const group = this.taskGroups.get(taskId);
        if (!group || group.fileChanges.length === 0) {
            vscode.window.showInformationMessage("No changes to undo in this task.");
            return false;
        }

        // Undo changes in reverse order
        const changes = [...group.fileChanges].reverse();
        let successCount = 0;

        for (const change of changes) {
            const ok = await this.undoFileChange(change, group);
            if (ok) successCount++;
        }

        vscode.window.showInformationMessage(
            `↩️ Task undo: Restored ${successCount}/${changes.length} files`
        );
        this.emit("taskUndoCompleted", { taskId, successCount, total: changes.length });
        return successCount > 0;
    }

    /**
     * Restore to a specific checkpoint (undo everything after it).
     */
    public async restoreCheckpoint(checkpointId: string): Promise<boolean> {
        // Find the checkpoint
        let targetCheckpoint: Checkpoint | null = null;
        let targetGroup: TaskChangeGroup | null = null;

        for (const [, group] of this.taskGroups) {
            const cp = group.checkpoints.find(c => c.id === checkpointId);
            if (cp) {
                targetCheckpoint = cp;
                targetGroup = group;
                break;
            }
        }

        if (!targetCheckpoint || !targetGroup) {
            vscode.window.showErrorMessage("Checkpoint not found.");
            return false;
        }

        // If checkpoint has a git commit, use git reset
        if (targetCheckpoint.gitCommit) {
            try {
                await this.gitResetToCommit(targetCheckpoint.gitCommit);
                vscode.window.showInformationMessage(
                    `↩️ Restored to checkpoint: "${targetCheckpoint.label}"`
                );
                this.emit("checkpointRestored", { checkpoint: targetCheckpoint });
                return true;
            } catch (e) {
                logger.warn(`Git reset failed, falling back to file restore: ${(e as Error).message}`);
            }
        }

        // Fallback: undo all changes after the checkpoint
        const changesAfterCheckpoint = targetGroup.fileChanges.filter(
            c => c.timestamp > targetCheckpoint!.timestamp
        );

        if (changesAfterCheckpoint.length === 0) {
            vscode.window.showInformationMessage("Already at this checkpoint.");
            return true;
        }

        let successCount = 0;
        for (const change of changesAfterCheckpoint.reverse()) {
            const ok = await this.undoFileChange(change, targetGroup);
            if (ok) successCount++;
        }

        vscode.window.showInformationMessage(
            `↩️ Restored to checkpoint "${targetCheckpoint.label}": ${successCount} files reverted`
        );
        return successCount > 0;
    }

    /**
     * Undo all changes after a specific checkpoint (without restoring files).
     * Just removes the changes from tracking.
     */
    public undoToCheckpoint(checkpointId: string): boolean {
        for (const [, group] of this.taskGroups) {
            const cp = group.checkpoints.find(c => c.id === checkpointId);
            if (cp) {
                group.fileChanges = group.fileChanges.filter(c => c.timestamp <= cp.timestamp);
                group.updatedAt = Date.now();
                this.saveToDisk();
                this.emit("undoToCheckpoint", { checkpointId, taskId: group.id });
                return true;
            }
        }
        return false;
    }

    // --- Query Methods ---

    /**
     * Get all task groups.
     */
    public getAllTasks(): TaskChangeGroup[] {
        return Array.from(this.taskGroups.values())
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    /**
     * Get a specific task group.
     */
    public getTask(taskId: string): TaskChangeGroup | undefined {
        return this.taskGroups.get(taskId);
    }

    /**
     * Get all checkpoints across all tasks.
     */
    public getAllCheckpoints(): Checkpoint[] {
        const checkpoints: Checkpoint[] = [];
        for (const [, group] of this.taskGroups) {
            checkpoints.push(...group.checkpoints);
        }
        return checkpoints.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get checkpoints for a specific task.
     */
    public getTaskCheckpoints(taskId: string): Checkpoint[] {
        const group = this.taskGroups.get(taskId);
        return group ? [...group.checkpoints] : [];
    }

    /**
     * Get file changes for a specific task.
     */
    public getTaskFileChanges(taskId: string): FileChange[] {
        const group = this.taskGroups.get(taskId);
        return group ? [...group.fileChanges] : [];
    }

    /**
     * Get stats.
     */
    public getStats(): CheckpointManagerStats {
        let totalCheckpoints = 0;
        let totalFileChanges = 0;
        for (const [, group] of this.taskGroups) {
            totalCheckpoints += group.checkpoints.length;
            totalFileChanges += group.fileChanges.length;
        }
        return {
            totalTasks: this.taskGroups.size,
            totalCheckpoints,
            totalFileChanges,
            activeTaskId: this.activeTaskId,
        };
    }

    /**
     * Get a summary for display.
     */
    public getSummary(): string {
        const stats = this.getStats();
        let summary = `💾 Checkpoint Manager\n\n`;
        summary += `Active task: ${stats.activeTaskId ? "Yes" : "No"}\n`;
        summary += `Total tasks: ${stats.totalTasks}\n`;
        summary += `Total checkpoints: ${stats.totalCheckpoints}\n`;
        summary += `Total file changes: ${stats.totalFileChanges}\n`;

        if (this.activeTaskId) {
            const group = this.taskGroups.get(this.activeTaskId);
            if (group) {
                summary += `\nCurrent task: ${group.label}\n`;
                summary += `  Changes: ${group.fileChanges.length}\n`;
                summary += `  Checkpoints: ${group.checkpoints.length}\n`;
            }
        }

        return summary;
    }

    // --- Utility ---

    /**
     * Clear all data.
     */
    public clear(): void {
        this.taskGroups.clear();
        this.activeTaskId = null;
        this.pendingSnapshots.clear();
        this.saveToDisk();
        this.emit("cleared");
    }

    /**
     * Dispose of the manager.
     */
    public dispose(): void {
        this.saveToDisk();
        this.removeAllListeners();
    }

    // --- Private Methods ---

    private async createGitCommit(message: string): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) return undefined;

        const cwd = workspaceFolders[0].uri.fsPath;
        const util = await import("util");
        const execPromise = util.promisify(cp.exec);

        try {
            // Check git status first
            const statusResult = await execPromise("git status --porcelain", { cwd });
            if (!statusResult.stdout.trim()) {
                return undefined; // Nothing to commit
            }

            // Stage and commit
            await execPromise("git add .", { cwd });
            const commitResult = await execPromise(
                `git commit -m "🤖 SHEN: ${message.replace(/"/g, '\\"')}"`,
                { cwd }
            );

            // Get the commit hash
            const hashResult = await execPromise("git rev-parse HEAD", { cwd });
            return hashResult.stdout.trim();
        } catch (e) {
            // Git might not be initialized or there might be nothing to commit
            return undefined;
        }
    }

    private async gitResetToCommit(commitHash: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error("No workspace folder open");
        }

        const cwd = workspaceFolders[0].uri.fsPath;
        const util = await import("util");
        const execPromise = util.promisify(cp.exec);

        await execPromise(`git reset --hard ${commitHash}`, { cwd });
    }

    private enforceTaskLimit(): void {
        if (this.taskGroups.size > this.MAX_TASK_GROUPS) {
            // Remove oldest inactive tasks
            const sorted = Array.from(this.taskGroups.entries())
                .filter(([, g]) => !g.isActive)
                .sort(([, a], [, b]) => a.createdAt - b.createdAt);

            const toRemove = sorted.slice(0, sorted.length - this.MAX_TASK_GROUPS + 5);
            for (const [id] of toRemove) {
                this.taskGroups.delete(id);
            }
        }
    }

    // --- Persistence ---

    private saveToDisk(): void {
        try {
            const dataPath = path.join(this.storagePath, "checkpoints.json");
            const data = {
                taskGroups: Array.from(this.taskGroups.entries()),
                activeTaskId: this.activeTaskId,
            };
            fs.mkdirSync(this.storagePath, { recursive: true });
            fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf-8");
        } catch (e) {
            logger.error("Failed to save checkpoint data", e);
        }
    }

    private loadFromDisk(): void {
        try {
            const dataPath = path.join(this.storagePath, "checkpoints.json");
            if (!fs.existsSync(dataPath)) return;

            const raw = fs.readFileSync(dataPath, "utf-8");
            const data = JSON.parse(raw);

            if (data.taskGroups) {
                for (const [id, group] of data.taskGroups as [string, TaskChangeGroup][]) {
                    // Don't restore active state on load
                    group.isActive = false;
                    this.taskGroups.set(id, group);
                }
            }

            logger.info(`Loaded ${this.taskGroups.size} checkpoint task groups from disk`);
        } catch (e) {
            logger.error("Failed to load checkpoint data", e);
        }
    }
}