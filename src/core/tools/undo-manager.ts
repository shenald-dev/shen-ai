import * as fs from "fs";
import * as path from "path";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Undo Manager
// Lightweight file snapshot/restore system used by tool-registry
// for per-file undo operations. Works alongside CheckpointManager.
// ============================================================

interface FileSnapshot {
    filePath: string;
    content: string | null; // null = file didn't exist
    timestamp: number;
}

interface UndoEntry {
    id: string;
    snapshots: Map<string, FileSnapshot>; // files changed in this action
    timestamp: number;
    toolName: string;
    messageId?: string; // link to chat message
}

export class UndoManager {
    private static instance: UndoManager;
    private undoStack: UndoEntry[] = [];
    private pendingSnapshots: Map<string, FileSnapshot> = new Map();
    private currentToolName: string = "";
    private currentMessageId: string | null = null;
    private readonly MAX_UNDO_ENTRIES = 50;

    private constructor() {}

    public static getInstance(): UndoManager {
        if (!UndoManager.instance) {
            UndoManager.instance = new UndoManager();
        }
        return UndoManager.instance;
    }

    /**
     * Set the current message ID context (called before tool execution).
     * This links file changes to a specific chat message for "undo to here".
     */
    public setMessageContext(messageId: string | null): void {
        this.currentMessageId = messageId;
    }

    /**
     * Take a snapshot of a file BEFORE modifying it.
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
        } catch (e) {
            logger.error(`UndoManager: Failed to snapshot ${filePath}`, e);
        }
    }

    /**
     * Begin tracking a new tool action. Call before tool execution.
     */
    public beginAction(toolName: string): void {
        this.currentToolName = toolName;
        this.pendingSnapshots.clear();
    }

    /**
     * Commit the pending snapshots as an undo entry.
     * Call after tool execution succeeds.
     */
    public commitAction(): string | null {
        if (this.pendingSnapshots.size === 0) return null;

        const entry: UndoEntry = {
            id: `undo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            snapshots: new Map(this.pendingSnapshots),
            timestamp: Date.now(),
            toolName: this.currentToolName,
            messageId: this.currentMessageId || undefined,
        };

        this.undoStack.push(entry);
        this.pendingSnapshots.clear();

        // Enforce stack limit
        if (this.undoStack.length > this.MAX_UNDO_ENTRIES) {
            this.undoStack.shift();
        }

        logger.debug(`UndoManager: Committed action "${entry.toolName}" with ${entry.snapshots.size} file(s)`);
        return entry.id;
    }

    /**
     * Undo the last single action.
     */
    public async undoLast(): Promise<boolean> {
        if (this.undoStack.length === 0) {
            return false;
        }

        const entry = this.undoStack.pop()!;
        return this.restoreEntry(entry);
    }

    /**
     * Undo all actions after a specific message ID.
     * This is the "Undo to here" functionality.
     */
    public async undoToMessage(messageId: string): Promise<{ restoredFiles: number; removedActions: number }> {
        const entriesToUndo: UndoEntry[] = [];
        
        // Find all entries after the target message (entries are in chronological order)
        for (let i = this.undoStack.length - 1; i >= 0; i--) {
            const entry = this.undoStack[i];
            if (entry.messageId === messageId) {
                break; // Stop at the target message
            }
            entriesToUndo.push(entry);
        }

        if (entriesToUndo.length === 0) {
            return { restoredFiles: 0, removedActions: 0 };
        }

        let restoredFiles = 0;

        // Restore in reverse order (most recent first)
        for (const entry of entriesToUndo) {
            const ok = await this.restoreEntry(entry);
            if (ok) {
                restoredFiles += entry.snapshots.size;
            }
        }

        // Remove entries from stack
        this.undoStack = this.undoStack.slice(0, this.undoStack.length - entriesToUndo.length);

        logger.info(`UndoManager: Undid ${entriesToUndo.length} actions, restored ${restoredFiles} files to message ${messageId}`);
        return { restoredFiles, removedActions: entriesToUndo.length };
    }

    /**
     * Undo all actions after a specific timestamp.
     */
    public async undoToTimestamp(timestamp: number): Promise<{ restoredFiles: number; removedActions: number }> {
        const entriesToUndo: UndoEntry[] = [];

        for (let i = this.undoStack.length - 1; i >= 0; i--) {
            if (this.undoStack[i].timestamp <= timestamp) break;
            entriesToUndo.push(this.undoStack[i]);
        }

        if (entriesToUndo.length === 0) {
            return { restoredFiles: 0, removedActions: 0 };
        }

        let restoredFiles = 0;

        for (const entry of entriesToUndo) {
            const ok = await this.restoreEntry(entry);
            if (ok) restoredFiles += entry.snapshots.size;
        }

        this.undoStack = this.undoStack.slice(0, this.undoStack.length - entriesToUndo.length);

        return { restoredFiles, removedActions: entriesToUndo.length };
    }

    /**
     * Restore a single undo entry (restore all files in it).
     */
    private async restoreEntry(entry: UndoEntry): Promise<boolean> {
        let success = true;

        for (const [, snapshot] of entry.snapshots) {
            try {
                if (snapshot.content === null) {
                    // File didn't exist before, delete it
                    if (fs.existsSync(snapshot.filePath)) {
                        await fs.promises.unlink(snapshot.filePath);
                    }
                } else {
                    // Restore previous content
                    const dir = path.dirname(snapshot.filePath);
                    await fs.promises.mkdir(dir, { recursive: true });
                    await fs.promises.writeFile(snapshot.filePath, snapshot.content, "utf-8");
                }
            } catch (e) {
                logger.error(`UndoManager: Failed to restore ${snapshot.filePath}`, e);
                success = false;
            }
        }

        return success;
    }

    /**
     * Get the number of entries in the undo stack.
     */
    public getStackSize(): number {
        return this.undoStack.length;
    }

    /**
     * Get all message IDs that have undo entries.
     */
    public getMessageIds(): string[] {
        const ids = new Set<string>();
        for (const entry of this.undoStack) {
            if (entry.messageId) ids.add(entry.messageId);
        }
        return Array.from(ids);
    }

    /**
     * Get the last entry's message ID (for linking to chat).
     */
    public getLastMessageId(): string | null {
        if (this.undoStack.length === 0) return null;
        return this.undoStack[this.undoStack.length - 1].messageId || null;
    }

    /**
     * Clear the undo stack.
     */
    public clear(): void {
        this.undoStack = [];
        this.pendingSnapshots.clear();
    }
}