import React, { useEffect, useRef, useState } from "react";
import type { ToolCall } from "../../../types";

// ============================================================
// SHEN AI — Live File Preview Component
// Shows real-time code being written to files as the AI streams
// tool call arguments. Like Cline's live diff view.
// ============================================================

interface LiveFilePreviewProps {
    streamingToolCalls: any[];
    currentToolCall: ToolCall | null;
    isProcessing: boolean;
}

const WRITE_TOOLS = ["write_to_file", "replace_in_file", "replace_file_content", "multi_replace_file_content", "apply_diff"];

function extractFilePreview(toolCall: any): { filePath: string; content: string; toolName: string } | null {
    if (!toolCall || !toolCall.name || !WRITE_TOOLS.includes(toolCall.name)) return null;

    let filePath = "";
    let content = "";
    const toolName = toolCall.name;

    const args = typeof toolCall.arguments === "object" && toolCall.arguments !== null
        ? toolCall.arguments
        : (() => { try { return JSON.parse(toolCall.arguments); } catch { return {}; } })();

    // Extract file path
    filePath = args.path || args.file || args.TargetFile || args.AbsolutePath || "";
    if (!filePath) return null;

    // Extract content being written
    content = args.content || args.CodeContent || args.ReplacementContent || args.diff || "";

    // For streaming tool calls, the content may be partial — that's exactly what we want to show
    return { filePath, content, toolName };
}

function getLanguageFromPath(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const langMap: Record<string, string> = {
        ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
        py: "python", rb: "ruby", rs: "rust", go: "go", java: "java",
        c: "c", cpp: "cpp", cs: "csharp", swift: "swift", kt: "kotlin",
        html: "html", css: "css", scss: "scss", less: "less",
        json: "json", yaml: "yaml", yml: "yaml", xml: "xml",
        md: "markdown", sql: "sql", sh: "bash", bash: "bash",
        dockerfile: "dockerfile", makefile: "makefile",
    };
    return langMap[ext] || ext;
}

export default function LiveFilePreview({
    streamingToolCalls,
    currentToolCall,
    isProcessing,
}: LiveFilePreviewProps): JSX.Element | null {
    const codeRef = useRef<HTMLPreElement>(null);
    const [prevContent, setPrevContent] = useState("");

    // Find the active write tool from streaming or current tool call
    let preview: { filePath: string; content: string; toolName: string } | null = null;

    // Check streaming tool calls first (these have partial content as AI streams)
    if (streamingToolCalls && streamingToolCalls.length > 0) {
        for (const tc of streamingToolCalls) {
            const p = extractFilePreview(tc);
            if (p) {
                preview = p;
                break;
            }
        }
    }

    // Fall back to current tool call
    if (!preview && currentToolCall) {
        preview = extractFilePreview(currentToolCall);
    }

    // Auto-scroll to bottom as content grows
    useEffect(() => {
        if (codeRef.current) {
            codeRef.current.scrollTop = codeRef.current.scrollHeight;
        }
    }, [preview?.content]);

    if (!preview || !preview.content) return null;

    const fileName = preview.filePath.split(/[\/\\]/).pop() || preview.filePath;
    const language = getLanguageFromPath(preview.filePath);
    const lineCount = preview.content.split("\n").length;
    const isNewContent = preview.content !== prevContent;

    // Track content changes for animation
    useEffect(() => {
        if (preview?.content) {
            setPrevContent(preview.content);
        }
    }, [preview?.content]);

    const actionLabel = preview.toolName === "write_to_file" ? "Creating" :
        preview.toolName === "replace_in_file" ? "Editing" :
        preview.toolName === "apply_diff" ? "Patching" : "Writing";

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <span style={styles.pulseIndicator} />
                    <span style={styles.actionLabel}>{actionLabel}</span>
                    <span style={styles.fileName}>{fileName}</span>
                </div>
                <div style={styles.headerRight}>
                    <span style={styles.lineCount}>{lineCount} lines</span>
                    <span style={styles.langBadge}>{language}</span>
                </div>
            </div>

            {/* Code content */}
            <pre ref={codeRef} style={styles.codeBlock}>
                <code style={styles.code}>
                    {preview.content}
                    <span className="streaming-cursor" />
                </code>
            </pre>

            {/* Bottom progress bar */}
            <div style={styles.progressContainer}>
                <div style={styles.progressBar}>
                    <div style={styles.progressFill} />
                </div>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        margin: "6px 0",
        borderRadius: "8px",
        background: "var(--vscode-textCodeBlock-background, #1e1e1e)",
        border: "1px solid var(--vscode-focusBorder, rgba(99, 102, 241, 0.4))",
        overflow: "hidden",
        animation: "fadeIn 0.3s ease-out",
        boxShadow: "0 0 12px rgba(99, 102, 241, 0.15)",
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 10px",
        background: "var(--vscode-tab-activeBackground, #1e1e1e)",
        borderBottom: "1px solid var(--vscode-panel-border, #404040)",
    },
    headerLeft: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flex: 1,
        minWidth: 0,
    },
    pulseIndicator: {
        display: "inline-block",
        width: "7px",
        height: "7px",
        borderRadius: "50%",
        background: "var(--vscode-focusBorder, #6366f1)",
        animation: "pulse 1s ease-in-out infinite",
        flexShrink: 0,
    },
    actionLabel: {
        fontSize: "11px",
        fontWeight: 600,
        color: "var(--vscode-focusBorder, #6366f1)",
        flexShrink: 0,
    },
    fileName: {
        fontSize: "11px",
        fontFamily: "var(--vscode-editor-font-family, monospace)",
        color: "var(--vscode-editor-foreground)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    headerRight: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexShrink: 0,
    },
    lineCount: {
        fontSize: "10px",
        color: "var(--vscode-descriptionForeground)",
    },
    langBadge: {
        fontSize: "9px",
        padding: "1px 5px",
        borderRadius: "6px",
        background: "var(--vscode-badge-background, rgba(99, 102, 241, 0.2))",
        color: "var(--vscode-badge-foreground, #a5b4fc)",
    },
    codeBlock: {
        padding: "10px 12px",
        margin: 0,
        overflowX: "auto",
        overflowY: "auto",
        maxHeight: "200px",
        minHeight: "40px",
        fontFamily: "var(--vscode-editor-font-family, monospace)",
        fontSize: "12px",
        lineHeight: 1.5,
        color: "var(--vscode-editor-foreground)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
    },
    code: {
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: "inherit",
    },
    progressContainer: {
        padding: "0",
    },
    progressBar: {
        height: "2px",
        background: "var(--vscode-input-background, #333)",
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        width: "100%",
        background: "linear-gradient(90deg, transparent, var(--vscode-focusBorder, #6366f1), transparent)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite linear",
    },
};