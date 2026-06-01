import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Conflict Resolver (CRDT-based Merge Resolution)
// Handles file conflicts when multiple agents edit the same
// files simultaneously in swarm mode.
// ============================================================

export interface FileOperation {
    agentId: string;
    filePath: string;
    operation: "write" | "append" | "replace";
    content: string;
    lineStart?: number;
    lineEnd?: number;
    timestamp: number;
    vectorClock: VectorClock;
}

export interface Conflict {
    filePath: string;
    operations: FileOperation[];
    type: "overwrite" | "overlap" | "append_conflict";
    resolved: boolean;
    resolution?: string;
}

export type VectorClock = Record<string, number>;

export class ConflictResolver {
    private fileLocks: Map<string, string>; // filePath -> agentId
    private operationLog: Map<string, FileOperation[]>; // filePath -> operations
    private vectorClocks: Map<string, VectorClock>; // agentId -> clock
    private conflicts: Conflict[];

    constructor() {
        this.fileLocks = new Map();
        this.operationLog = new Map();
        this.vectorClocks = new Map();
        this.conflicts = [];
    }

    /**
     * Initialize vector clock for an agent.
     */
    registerAgent(agentId: string): void {
        if (!this.vectorClocks.has(agentId)) {
            this.vectorClocks.set(agentId, {});
        }
    }

    /**
     * Try to acquire a lock on a file.
     */
    acquireLock(filePath: string, agentId: string): { acquired: boolean; currentHolder?: string } {
        const currentHolder = this.fileLocks.get(filePath);

        if (!currentHolder) {
            this.fileLocks.set(filePath, agentId);
            this.incrementClock(agentId);
            logger.debug(`Lock acquired: ${filePath} by ${agentId}`);
            return { acquired: true };
        }

        if (currentHolder === agentId) {
            return { acquired: true };
        }

        logger.debug(`Lock conflict: ${filePath} held by ${currentHolder}, requested by ${agentId}`);
        return { acquired: false, currentHolder };
    }

    /**
     * Release a file lock.
     */
    releaseLock(filePath: string, agentId: string): void {
        const currentHolder = this.fileLocks.get(filePath);
        if (currentHolder === agentId) {
            this.fileLocks.delete(filePath);
            logger.debug(`Lock released: ${filePath} by ${agentId}`);
        }
    }

    /**
     * Record a file operation and check for conflicts.
     */
    recordOperation(op: FileOperation): Conflict | null {
        this.incrementClock(op.agentId);
        op.vectorClock = { ...this.vectorClocks.get(op.agentId)! };

        if (!this.operationLog.has(op.filePath)) {
            this.operationLog.set(op.filePath, []);
        }

        const ops = this.operationLog.get(op.filePath)!;

        // Check for conflicts with recent operations from other agents
        const conflictingOps = ops.filter(
            (existing) =>
                existing.agentId !== op.agentId &&
                this.isConcurrent(existing.vectorClock, op.vectorClock) &&
                this.operationsOverlap(existing, op)
        );

        ops.push(op);

        if (conflictingOps.length > 0) {
            const conflict: Conflict = {
                filePath: op.filePath,
                operations: [...conflictingOps, op],
                type: this.classifyConflict(conflictingOps, op),
                resolved: false,
            };
            this.conflicts.push(conflict);
            logger.warn(`Conflict detected on ${op.filePath}: ${conflict.type}`);
            return conflict;
        }

        return null;
    }

    /**
     * Resolve a conflict using merge strategies.
     */
    resolveConflict(conflict: Conflict, strategy: "last-writer-wins" | "merge" | "manual" = "merge"): string {
        if (conflict.resolved) {
            return conflict.resolution || "";
        }

        switch (strategy) {
            case "last-writer-wins":
                return this.resolveLastWriterWins(conflict);
            case "merge":
                return this.resolveByMerge(conflict);
            case "manual":
                return this.resolveManual(conflict);
            default:
                return this.resolveByMerge(conflict);
        }
    }

    /**
     * Get all unresolved conflicts.
     */
    getUnresolvedConflicts(): Conflict[] {
        return this.conflicts.filter((c) => !c.resolved);
    }

    /**
     * Get conflicts for a specific file.
     */
    getFileConflicts(filePath: string): Conflict[] {
        return this.conflicts.filter((c) => c.filePath === filePath);
    }

    /**
     * Get conflict statistics.
     */
    getStats(): {
        totalConflicts: number;
        resolved: number;
        unresolved: number;
        byType: Record<string, number>;
        lockedFiles: number;
    } {
        const byType: Record<string, number> = {};
        for (const c of this.conflicts) {
            byType[c.type] = (byType[c.type] || 0) + 1;
        }

        return {
            totalConflicts: this.conflicts.length,
            resolved: this.conflicts.filter((c) => c.resolved).length,
            unresolved: this.conflicts.filter((c) => !c.resolved).length,
            byType,
            lockedFiles: this.fileLocks.size,
        };
    }

    /**
     * Reset all state.
     */
    reset(): void {
        this.fileLocks.clear();
        this.operationLog.clear();
        this.vectorClocks.clear();
        this.conflicts = [];
    }

    // --- Private Methods ---

    private incrementClock(agentId: string): void {
        const clock = this.vectorClocks.get(agentId) || {};
        clock[agentId] = (clock[agentId] || 0) + 1;
        this.vectorClocks.set(agentId, clock);
    }

    /**
     * Check if two vector clocks are concurrent (neither happens-before the other).
     */
    private isConcurrent(clock1: VectorClock, clock2: VectorClock): boolean {
        const allAgents = new Set([...Object.keys(clock1), ...Object.keys(clock2)]);
        let hasLess = false;
        let hasGreater = false;

        for (const agent of allAgents) {
            const v1 = clock1[agent] || 0;
            const v2 = clock2[agent] || 0;
            if (v1 < v2) hasLess = true;
            if (v1 > v2) hasGreater = true;
        }

        return hasLess && hasGreater;
    }

    /**
     * Check if two operations overlap in the file.
     */
    private operationsOverlap(op1: FileOperation, op2: FileOperation): boolean {
        // Full file writes always overlap
        if (op1.operation === "write" || op2.operation === "write") return true;

        // Check line range overlap
        if (op1.lineStart !== undefined && op1.lineEnd !== undefined &&
            op2.lineStart !== undefined && op2.lineEnd !== undefined) {
            return op1.lineStart <= op2.lineEnd && op2.lineStart <= op1.lineEnd;
        }

        // Appends to the same file conflict
        if (op1.operation === "append" && op2.operation === "append") return true;

        return false;
    }

    private classifyConflict(existingOps: FileOperation[], newOp: FileOperation): Conflict["type"] {
        if (newOp.operation === "write" || existingOps.some((o) => o.operation === "write")) {
            return "overwrite";
        }
        if (newOp.operation === "append" || existingOps.some((o) => o.operation === "append")) {
            return "append_conflict";
        }
        return "overlap";
    }

    private resolveLastWriterWins(conflict: Conflict): string {
        // Last operation by timestamp wins
        const sorted = [...conflict.operations].sort((a, b) => b.timestamp - a.timestamp);
        const winner = sorted[0];
        conflict.resolved = true;
        conflict.resolution = winner.content;
        logger.info(`Conflict resolved (LWW) on ${conflict.filePath}: agent ${winner.agentId} wins`);
        return winner.content;
    }

    private resolveByMerge(conflict: Conflict): string {
        // For line-based operations, merge non-overlapping changes
        const sorted = [...conflict.operations].sort((a, b) => (a.lineStart || 0) - (b.lineStart || 0));

        if (sorted.every((op) => op.lineStart !== undefined && op.lineEnd !== undefined)) {
            // Build merged content from non-overlapping regions
            const regions: Array<{ start: number; end: number; content: string; agentId: string }> = [];

            for (const op of sorted) {
                const overlaps = regions.some(
                    (r) => (op.lineStart as number) <= r.end && (op.lineEnd as number) >= r.start
                );

                if (!overlaps) {
                    regions.push({
                        start: op.lineStart as number,
                        end: op.lineEnd as number,
                        content: op.content,
                        agentId: op.agentId,
                    });
                } else {
                    // For overlapping regions, use last-writer-wins
                    const existingIdx = regions.findIndex(
                        (r) => (op.lineStart as number) <= r.end && (op.lineEnd as number) >= r.start
                    );
                    if (existingIdx >= 0 && op.timestamp > sorted.find(
                        (s) => s.agentId === regions[existingIdx].agentId
                    )!.timestamp) {
                        regions[existingIdx] = {
                            start: op.lineStart as number,
                            end: op.lineEnd as number,
                            content: op.content,
                            agentId: op.agentId,
                        };
                    }
                }
            }

            const merged = regions.sort((a, b) => a.start - b.start).map((r) => r.content).join("\n");
            conflict.resolved = true;
            conflict.resolution = merged;
            logger.info(`Conflict resolved (merge) on ${conflict.filePath}: ${regions.length} regions merged`);
            return merged;
        }

        // Fallback to last-writer-wins
        return this.resolveLastWriterWins(conflict);
    }

    private resolveManual(conflict: Conflict): string {
        // Generate a merge conflict marker for manual resolution
        const parts = conflict.operations.map((op, i) => {
            return `<<<<<<< Agent ${op.agentId} (op ${i + 1})\n${op.content}\n=======`;
        });
        parts.push(`>>>>>>> End of conflicts`);

        const merged = parts.join("\n");
        conflict.resolved = true;
        conflict.resolution = merged;
        logger.info(`Conflict marked for manual resolution on ${conflict.filePath}`);
        return merged;
    }
}