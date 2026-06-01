import React, { useState } from "react";

// ============================================================
// SHEN AI — Diff View Component (Accept/Reject Changes)
// ============================================================

export interface DiffChange {
    type: "add" | "remove" | "unchanged";
    lineNumber: number;
    content: string;
}

export interface DiffFileChange {
    path: string;
    originalContent: string;
    newContent: string;
    changes: DiffChange[];
}

interface DiffViewProps {
    fileChange: DiffFileChange;
    onAccept: () => void;
    onReject: () => void;
    autoApply?: boolean;
}

export default function DiffView({
    fileChange,
    onAccept,
    onReject,
    autoApply = false,
}: DiffViewProps): JSX.Element {
    const [accepted, setAccepted] = useState<boolean | null>(null);
    const [showFull, setShowFull] = useState(false);

    const addedLines = fileChange.changes.filter((c) => c.type === "add").length;
    const removedLines = fileChange.changes.filter((c) => c.type === "remove").length;

    const handleAccept = () => {
        setAccepted(true);
        onAccept();
    };

    const handleReject = () => {
        setAccepted(false);
        onReject();
    };

    const displayChanges = showFull
        ? fileChange.changes
        : fileChange.changes.slice(0, 50);

    const headerStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        background: "var(--vscode-editorGroupHeader-tabsBackground, #252526)",
        borderBottom: "1px solid var(--vscode-panel-border, #404040)",
        borderRadius: "6px 6px 0 0",
    };

    const lineStyle = (type: string): React.CSSProperties => ({
        display: "flex",
        gap: "8px",
        padding: "1px 8px",
        fontFamily: "var(--vscode-editor-font-family, monospace)",
        fontSize: "12px",
        lineHeight: 1.5,
        background:
            type === "add"
                ? "var(--vscode-diffEditor-insertedLineBackground, rgba(155, 185, 85, 0.2))"
                : type === "remove"
                    ? "var(--vscode-diffEditor-removedLineBackground, rgba(255, 0, 0, 0.2))"
                    : "transparent",
        color:
            type === "add"
                ? "var(--vscode-terminal-ansiGreen, #4ec9b0)"
                : type === "remove"
                    ? "var(--vscode-errorForeground, #f44747)"
                    : "var(--vscode-editor-foreground)",
    });

    return (
        <div style={{
            margin: "8px 0",
            border: `1px solid ${accepted === true
                    ? "var(--vscode-terminal-ansiGreen, #4ec9b0)"
                    : accepted === false
                        ? "var(--vscode-errorForeground, #f44747)"
                        : "var(--vscode-panel-border, #404040)"
                }`,
            borderRadius: "6px",
            overflow: "hidden",
        }}>
            {/* Header */}
            <div style={headerStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px" }}>📝</span>
                    <span style={{
                        fontFamily: "var(--vscode-editor-font-family, monospace)",
                        fontSize: "12px",
                        fontWeight: 600,
                    }}>
                        {fileChange.path}
                    </span>
                    <span style={{
                        fontSize: "11px",
                        color: "var(--vscode-descriptionForeground)",
                    }}>
                        <span style={{ color: "var(--vscode-terminal-ansiGreen)" }}>+{addedLines}</span>
                        {" "}
                        <span style={{ color: "var(--vscode-errorForeground)" }}>-{removedLines}</span>
                    </span>
                </div>
                <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    {accepted === null && !autoApply && (
                        <>
                            <button
                                onClick={handleAccept}
                                className="btn-primary"
                                style={{ padding: "3px 10px", fontSize: "11px" }}
                            >
                                ✓ Accept
                            </button>
                            <button
                                onClick={handleReject}
                                className="btn-secondary"
                                style={{ padding: "3px 10px", fontSize: "11px" }}
                            >
                                ✕ Reject
                            </button>
                        </>
                    )}
                    {accepted === true && (
                        <span style={{
                            fontSize: "11px",
                            color: "var(--vscode-terminal-ansiGreen)",
                            fontWeight: 600,
                        }}>
                            ✓ Accepted
                        </span>
                    )}
                    {accepted === false && (
                        <span style={{
                            fontSize: "11px",
                            color: "var(--vscode-errorForeground)",
                            fontWeight: 600,
                        }}>
                            ✕ Rejected
                        </span>
                    )}
                </div>
            </div>

            {/* Diff Content */}
            <div style={{
                maxHeight: showFull ? "600px" : "300px",
                overflowY: "auto",
                background: "var(--vscode-editor-background)",
            }}>
                {displayChanges.map((change, idx) => (
                    <div key={idx} style={lineStyle(change.type)}>
                        <span style={{
                            width: "40px",
                            textAlign: "right",
                            color: "var(--vscode-descriptionForeground)",
                            userSelect: "none",
                            flexShrink: 0,
                        }}>
                            {change.lineNumber}
                        </span>
                        <span style={{
                            width: "16px",
                            textAlign: "center",
                            flexShrink: 0,
                            fontWeight: 600,
                        }}>
                            {change.type === "add" ? "+" : change.type === "remove" ? "-" : " "}
                        </span>
                        <span style={{
                            whiteSpace: "pre",
                            overflowX: "auto",
                            flex: 1,
                        }}>
                            {change.content}
                        </span>
                    </div>
                ))}
                {fileChange.changes.length > 50 && !showFull && (
                    <div style={{
                        textAlign: "center",
                        padding: "8px",
                        color: "var(--vscode-descriptionForeground)",
                        fontSize: "12px",
                        cursor: "pointer",
                        borderTop: "1px solid var(--vscode-panel-border, #404040)",
                    }}
                        onClick={() => setShowFull(true)}
                    >
                        ... {fileChange.changes.length - 50} more lines (click to expand)
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// Utility: Compute diff between two file contents
// ============================================================

export function computeDiff(
    original: string,
    updated: string,
    path: string
): DiffFileChange {
    const originalLines = original.split("\n");
    const updatedLines = updated.split("\n");
    const changes: DiffChange[] = [];

    // Simple LCS-based diff
    const m = originalLines.length;
    const n = updatedLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (originalLines[i - 1] === updatedLines[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to find diff
    let i = m;
    let j = n;
    const result: Array<{ type: "add" | "remove" | "unchanged"; origIdx: number; newIdx: number; line: string }> = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && originalLines[i - 1] === updatedLines[j - 1]) {
            result.push({ type: "unchanged", origIdx: i, newIdx: j, line: originalLines[i - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.push({ type: "add", origIdx: 0, newIdx: j, line: updatedLines[j - 1] });
            j--;
        } else if (i > 0) {
            result.push({ type: "remove", origIdx: i, newIdx: 0, line: originalLines[i - 1] });
            i--;
        }
    }

    result.reverse();

    let lineNum = 0;
    for (const r of result) {
        lineNum++;
        changes.push({
            type: r.type,
            lineNumber: lineNum,
            content: r.line,
        });
    }

    return {
        path,
        originalContent: original,
        newContent: updated,
        changes,
    };
}