import React, { useState } from "react";
import { postMessage } from "../vscode-api";

// ============================================================
// SHEN AI — Checkpoint Timeline Component
// Visual timeline of all checkpoints with restore buttons,
// task grouping, and undo controls.
// ============================================================

interface FileChange {
    id: string;
    filePath: string;
    toolName: string;
    timestamp: number;
}

interface Checkpoint {
    id: string;
    taskId: string;
    label: string;
    timestamp: number;
    gitCommit?: string;
    fileChanges: FileChange[];
    isAutoCheckpoint: boolean;
}

interface TaskGroup {
    id: string;
    label: string;
    isActive: boolean;
    checkpoints: Checkpoint[];
    fileChanges: FileChange[];
    createdAt: number;
}

interface CheckpointTimelineProps {
    tasks: TaskGroup[];
    visible?: boolean;
}

export default function CheckpointTimeline({
    tasks,
    visible = true,
}: CheckpointTimelineProps): JSX.Element | null {
    const [expandedTask, setExpandedTask] = useState<string | null>(null);
    const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

    if (!visible || tasks.length === 0) return null;

    const handleRestore = (checkpointId: string) => {
        if (confirmRestore === checkpointId) {
            postMessage({
                action: "task/restoreCheckpoint" as any,
                payload: { checkpointId },
            });
            setConfirmRestore(null);
        } else {
            setConfirmRestore(checkpointId);
            setTimeout(() => setConfirmRestore(null), 3000);
        }
    };

    const handleUndoLast = () => {
        postMessage({ action: "task/undo" });
    };

    const handleUndoTask = (taskId: string) => {
        postMessage({
            action: "task/undoTask" as any,
            payload: { taskId },
        });
    };

    const handleCreateCheckpoint = () => {
        postMessage({ action: "task/checkpoint" });
    };

    const formatTime = (ts: number): string => {
        return new Date(ts).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const formatDate = (ts: number): string => {
        return new Date(ts).toLocaleDateString([], {
            month: "short",
            day: "numeric",
        });
    };

    const getFileName = (filePath: string): string => {
        return filePath.split(/[\/\\]/).pop() || filePath;
    };

    const totalChanges = tasks.reduce((sum, t) => sum + t.fileChanges.length, 0);
    const totalCheckpoints = tasks.reduce((sum, t) => sum + t.checkpoints.length, 0);

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <span style={{ fontSize: "14px" }}>💾</span>
                    <span style={styles.headerTitle}>Checkpoints</span>
                    <span style={styles.badge}>
                        {totalCheckpoints} checkpoints • {totalChanges} changes
                    </span>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                    <button
                        onClick={handleUndoLast}
                        style={styles.smallBtn}
                        title="Undo last action"
                    >
                        ↩️ Undo
                    </button>
                    <button
                        onClick={handleCreateCheckpoint}
                        style={{ ...styles.smallBtn, background: "var(--vscode-button-background)", color: "var(--vscode-button-foreground)" }}
                        title="Create checkpoint"
                    >
                        📌 Save
                    </button>
                </div>
            </div>

            {/* Task Groups */}
            <div style={styles.taskList}>
                {tasks.map((task) => {
                    const isExpanded = expandedTask === task.id;
                    const taskCheckpoints = task.checkpoints.sort((a, b) => b.timestamp - a.timestamp);

                    return (
                        <div key={task.id} style={styles.taskGroup}>
                            {/* Task Header */}
                            <div
                                onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                                style={{
                                    ...styles.taskHeader,
                                    borderLeft: task.isActive
                                        ? "3px solid var(--vscode-focusBorder)"
                                        : "3px solid transparent",
                                }}
                            >
                                <div style={styles.taskHeaderLeft}>
                                    <span style={{
                                        fontSize: "10px",
                                        transition: "transform 0.2s",
                                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                    }}>▶</span>
                                    <span style={{
                                        fontSize: "12px",
                                        fontWeight: task.isActive ? 600 : 400,
                                        color: task.isActive
                                            ? "var(--vscode-editor-foreground)"
                                            : "var(--vscode-descriptionForeground)",
                                    }}>
                                        {task.isActive ? "🟢" : "⚪"} {task.label}
                                    </span>
                                    <span style={styles.taskDate}>
                                        {formatDate(task.createdAt)}
                                    </span>
                                </div>
                                <div style={styles.taskHeaderRight}>
                                    <span style={styles.taskBadge}>
                                        {task.fileChanges.length} changes
                                    </span>
                                    {task.isActive && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleUndoTask(task.id);
                                            }}
                                            style={styles.undoTaskBtn}
                                            title="Undo all changes in this task"
                                        >
                                            ↩️ Undo All
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Expanded Checkpoints */}
                            {isExpanded && (
                                <div style={styles.checkpointList}>
                                    {taskCheckpoints.length === 0 ? (
                                        <div style={styles.emptyState}>
                                            No checkpoints yet. Click "Save" to create one.
                                        </div>
                                    ) : (
                                        taskCheckpoints.map((cp, idx) => {
                                            const isConfirming = confirmRestore === cp.id;
                                            const changesSinceLast = idx < taskCheckpoints.length - 1
                                                ? cp.fileChanges.length - taskCheckpoints[idx + 1].fileChanges.length
                                                : cp.fileChanges.length;

                                            return (
                                                <div key={cp.id} style={styles.checkpointItem}>
                                                    {/* Timeline dot */}
                                                    <div style={styles.timelineDot}>
                                                        <div style={{
                                                            ...styles.dot,
                                                            background: cp.isAutoCheckpoint
                                                                ? "var(--vscode-descriptionForeground)"
                                                                : "var(--vscode-focusBorder)",
                                                        }} />
                                                        {idx < taskCheckpoints.length - 1 && (
                                                            <div style={styles.connector} />
                                                        )}
                                                    </div>

                                                    {/* Checkpoint content */}
                                                    <div style={styles.checkpointContent}>
                                                        <div style={styles.checkpointHeader}>
                                                            <span style={{
                                                                fontSize: "11px",
                                                                fontWeight: cp.isAutoCheckpoint ? 400 : 600,
                                                                color: cp.isAutoCheckpoint
                                                                    ? "var(--vscode-descriptionForeground)"
                                                                    : "var(--vscode-editor-foreground)",
                                                            }}>
                                                                {cp.isAutoCheckpoint ? "⚡" : "📌"} {cp.label}
                                                            </span>
                                                            <span style={styles.checkpointTime}>
                                                                {formatTime(cp.timestamp)}
                                                            </span>
                                                        </div>

                                                        {changesSinceLast > 0 && (
                                                            <div style={styles.changeSummary}>
                                                                {changesSinceLast} file{changesSinceLast > 1 ? "s" : ""} changed
                                                            </div>
                                                        )}

                                                        {cp.gitCommit && (
                                                            <div style={styles.gitCommit}>
                                                                git: {cp.gitCommit.substring(0, 7)}
                                                            </div>
                                                        )}

                                                        {/* Restore button */}
                                                        <button
                                                            onClick={() => handleRestore(cp.id)}
                                                            style={{
                                                                ...styles.restoreBtn,
                                                                background: isConfirming
                                                                    ? "var(--vscode-errorForeground)"
                                                                    : "var(--vscode-button-secondaryBackground)",
                                                                color: isConfirming
                                                                    ? "#fff"
                                                                    : "var(--vscode-button-secondaryForeground)",
                                                            }}
                                                        >
                                                            {isConfirming ? "⚠️ Click again to confirm restore" : "↩️ Restore to here"}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
    container: {
        margin: "8px 0",
        borderRadius: "8px",
        background: "var(--vscode-input-background)",
        border: "1px solid var(--vscode-input-border, #404040)",
        overflow: "hidden",
        animation: "fadeIn 0.3s ease-out",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid var(--vscode-input-border, #404040)",
    },
    headerLeft: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
    },
    headerTitle: {
        fontSize: "12px",
        fontWeight: 600,
        color: "var(--vscode-editor-foreground)",
    },
    badge: {
        fontSize: "9px",
        padding: "1px 6px",
        borderRadius: "8px",
        background: "var(--vscode-badge-background, rgba(0,122,204,0.2))",
        color: "var(--vscode-badge-foreground, var(--vscode-descriptionForeground))",
    },
    smallBtn: {
        background: "var(--vscode-button-secondaryBackground)",
        color: "var(--vscode-button-secondaryForeground)",
        border: "none",
        borderRadius: "4px",
        padding: "3px 8px",
        fontSize: "10px",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    taskList: {
        maxHeight: "300px",
        overflowY: "auto",
    },
    taskGroup: {
        borderBottom: "1px solid var(--vscode-input-border, #404040)",
    },
    taskHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 10px",
        cursor: "pointer",
        transition: "background 0.15s",
    },
    taskHeaderLeft: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flex: 1,
        minWidth: 0,
    },
    taskHeaderRight: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexShrink: 0,
    },
    taskDate: {
        fontSize: "9px",
        color: "var(--vscode-descriptionForeground)",
        opacity: 0.6,
    },
    taskBadge: {
        fontSize: "9px",
        padding: "1px 5px",
        borderRadius: "6px",
        background: "var(--vscode-badge-background, rgba(0,122,204,0.15))",
        color: "var(--vscode-descriptionForeground)",
    },
    undoTaskBtn: {
        background: "var(--vscode-errorForeground)",
        color: "#fff",
        border: "none",
        borderRadius: "3px",
        padding: "2px 6px",
        fontSize: "9px",
        cursor: "pointer",
        fontFamily: "inherit",
    },
    checkpointList: {
        padding: "4px 8px 8px 8px",
        background: "var(--vscode-sideBar-background)",
    },
    checkpointItem: {
        display: "flex",
        gap: "8px",
        position: "relative",
        padding: "4px 0",
    },
    timelineDot: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        width: "16px",
    },
    dot: {
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        border: "2px solid var(--vscode-sideBar-background)",
        zIndex: 1,
    },
    connector: {
        width: "2px",
        flex: 1,
        background: "var(--vscode-input-border, #404040)",
        minHeight: "20px",
    },
    checkpointContent: {
        flex: 1,
        minWidth: 0,
        paddingBottom: "6px",
    },
    checkpointHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "8px",
    },
    checkpointTime: {
        fontSize: "9px",
        color: "var(--vscode-descriptionForeground)",
        opacity: 0.5,
        flexShrink: 0,
    },
    changeSummary: {
        fontSize: "10px",
        color: "var(--vscode-descriptionForeground)",
        marginTop: "2px",
    },
    gitCommit: {
        fontSize: "9px",
        fontFamily: "monospace",
        color: "var(--vscode-charts-green)",
        marginTop: "2px",
    },
    restoreBtn: {
        marginTop: "4px",
        border: "none",
        borderRadius: "4px",
        padding: "3px 8px",
        fontSize: "10px",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.2s",
    },
    emptyState: {
        padding: "12px",
        fontSize: "11px",
        color: "var(--vscode-descriptionForeground)",
        textAlign: "center",
        fontStyle: "italic",
    },
};