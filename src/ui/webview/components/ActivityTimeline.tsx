import React, { useEffect, useRef, useState, useMemo } from "react";
import type { ToolCall, ToolResult } from "../../../types";
import { getToolIcon, ThinkingIcon, SpinnerIcon, CheckIcon, ErrorIcon } from "./icons/AnimatedIcons";

// ============================================================
// SHEN AI — Activity Timeline Component (Redesigned)
// Animated SVG icons + multi-file operation support
// ============================================================

// --- Types ---

export type TimelineItemType =
    | "thinking"
    | "tool-running"
    | "tool-done"
    | "tool-error"
    | "focus-step"
    | "info";

export interface TimelineItem {
    id: string;
    type: TimelineItemType;
    label: string;
    detail?: string;
    progress?: number;
    timestamp: number;
    isCurrent?: boolean;
    rawContent?: string;
    toolName?: string;
    fileCount?: number;
}

interface ActivityTimelineProps {
    isProcessing: boolean;
    thinkingPhase?: string;
    currentToolCall?: ToolCall | null;
    currentToolResult?: ToolResult | null;
    streamingToolCalls?: any[];
    agentSteps?: Array<{
        id: string;
        label: string;
        status: "pending" | "active" | "completed" | "failed";
    }>;
}

// --- Helpers ---

const TOOL_VERBS: Record<string, string> = {
    view_file: "Reading", read_file: "Reading",
    write_to_file: "Creating", replace_in_file: "Editing",
    replace_file_content: "Editing", multi_replace_file_content: "Modifying",
    apply_diff: "Patching", list_files: "Listing",
    list_dir: "Listing", search_files: "Searching",
    grep_search: "Searching", execute_command: "Running",
    run_command: "Running", ask_followup_question: "Asking",
    attempt_completion: "Completing", search_web: "Searching web",
    read_multiple_files: "Reading",
};

function extractToolInfo(toolCall: ToolCall): { label: string; detail: string; rawContent: string; fileCount: number } {
    const verb = TOOL_VERBS[toolCall.name] || toolCall.name.replace(/_/g, " ");
    let label = verb;
    let detail = "";
    let rawContent = "";
    let fileCount = 1;

    if (toolCall.arguments) {
        const argsStr = typeof toolCall.arguments === "string" ? toolCall.arguments : JSON.stringify(toolCall.arguments);
        let args: Record<string, unknown> = {};

        if (typeof toolCall.arguments === "string") {
            try { args = JSON.parse(argsStr); } catch {
                const pathMatch = argsStr.match(/"(?:TargetFile|AbsolutePath|path|file)"\s*:\s*"([^"]+)"/);
                if (pathMatch) {
                    const fileName = pathMatch[1].split(/[\/\\]/).pop() || pathMatch[1];
                    label = `${verb} ${fileName}`;
                    detail = pathMatch[1];
                }
                const contentMatch = argsStr.match(/"(?:CodeContent|ReplacementContent|content)"\s*:\s*"([\s\S]*)/);
                if (contentMatch) {
                    rawContent = contentMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
                    if (rawContent.endsWith('"')) rawContent = rawContent.slice(0, -1);
                }
            }
        } else {
            args = toolCall.arguments as Record<string, unknown>;
        }

        if (Object.keys(args).length > 0) {
            // Multi-file support
            const pathsArg = args.paths || args.files || args.filePaths;
            if (Array.isArray(pathsArg)) {
                fileCount = pathsArg.length;
                const names = pathsArg.map((p: string) => String(p).split(/[\/\\]/).pop() || String(p));
                label = `${verb} ${fileCount} files`;
                detail = names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
            } else {
                const pathArg = args.TargetFile || args.AbsolutePath || args.DirectoryPath || args.SearchPath || args.path || args.file;
                if (pathArg) {
                    const p = String(pathArg);
                    const fileName = p.split(/[\/\\]/).pop() || p;
                    // Put the file name directly in the label
                    label = `${verb} ${fileName}`;
                    detail = p;
                    if (args.Query) {
                        detail += ` — "${String(args.Query)}"`;
                        label += ` for "${String(args.Query).substring(0, 20)}"`;
                    }
                } else if (args.CommandLine || args.command) {
                    const cmd = String(args.CommandLine || args.command);
                    label = `${verb} command`;
                    detail = cmd.length > 50 ? cmd.substring(0, 47) + "..." : cmd;
                } else if (args.query) {
                    label = `${verb} "${String(args.query).substring(0, 25)}"`;
                    detail = `"${String(args.query)}"`;
                } else if (args.regex) {
                    label = `${verb} pattern`;
                    detail = `${String(args.regex)}`;
                }
            }
        }
    }

    return { label, detail, rawContent, fileCount };
}

// --- Sub-components ---

function TimelineDot({ type, isCurrent, toolName }: { type: TimelineItemType; isCurrent: boolean; toolName?: string }) {
    if (type === "tool-error") {
        return (
            <div style={styles.dot}>
                <ErrorIcon size={12} />
            </div>
        );
    }
    if (type === "tool-done" || type === "focus-step") {
        return (
            <div style={styles.dot}>
                <CheckIcon size={12} animated={true} />
            </div>
        );
    }
    if (isCurrent || type === "tool-running") {
        if (toolName) {
            return (
                <div style={{ ...styles.dot, position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {getToolIcon(toolName, true)}
                    </div>
                </div>
            );
        }
        return (
            <div style={{ ...styles.dot, position: "relative" }}>
                <SpinnerIcon size={12} />
            </div>
        );
    }
    // thinking / info
    return (
        <div style={styles.dot}>
            <div style={{
                width: "8px", height: "8px", borderRadius: "50%",
                background: "var(--vscode-focusBorder)",
                animation: "pulse 1.5s ease-in-out infinite",
            }} />
        </div>
    );
}

function TimelineEntry({ item, isLast }: { item: TimelineItem; isLast: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const isRunning = item.type === "tool-running";
    const isThinking = item.type === "thinking";
    const hasDetail = item.detail || item.rawContent;
    const isWriting = item.rawContent && item.rawContent.length > 0;
    const isMultiFile = item.fileCount && item.fileCount > 1;

    // Estimate progress from content length for writing operations
    const estimatedProgress = isWriting
        ? Math.min(95, Math.max(15, (item.rawContent!.length / 500) * 100))
        : item.progress ?? 0;

    return (
        <div style={styles.entry}>
            {/* Connector line */}
            {!isLast && <div style={styles.connector} />}

            {/* Dot with animated icon */}
            <TimelineDot type={item.type} isCurrent={!!item.isCurrent} toolName={item.toolName} />

            {/* Content */}
            <div style={styles.entryContent}>
                <div
                    onClick={() => hasDetail && setExpanded(!expanded)}
                    style={{
                        ...styles.entryRow,
                        cursor: hasDetail ? "pointer" : "default",
                        background: isRunning ? "var(--vscode-list-hoverBackground)" : "transparent",
                        borderRadius: expanded ? "6px 6px 0 0" : "6px",
                    }}
                >
                    <span style={{
                        ...styles.entryLabel,
                        fontWeight: isRunning || isThinking ? 600 : 400,
                        color: isRunning
                            ? "var(--vscode-editor-foreground)"
                            : "var(--vscode-descriptionForeground)",
                    }}>
                        {item.label}
                        {isMultiFile && (
                            <span style={{
                                marginLeft: "6px",
                                fontSize: "9px",
                                padding: "1px 5px",
                                borderRadius: "8px",
                                background: "var(--vscode-badge-background, rgba(0,122,204,0.2))",
                                color: "var(--vscode-badge-foreground)",
                            }}>
                                {item.fileCount} files
                            </span>
                        )}
                        {isRunning && !isWriting && <span style={{ opacity: 0.5, marginLeft: "2px" }}>...</span>}
                        {isRunning && isWriting && <span className="animate-type" style={{ color: "var(--vscode-focusBorder)", width: "2px", height: "12px", marginLeft: "3px" }} />}
                        {isThinking && (
                            <span className="thinking-state-dots" style={{ display: "inline-flex", gap: "2px", marginLeft: "4px" }}>
                                <span /><span /><span />
                            </span>
                        )}
                    </span>
                    {hasDetail && (
                        <span style={{
                            fontSize: "9px", opacity: 0.4, flexShrink: 0,
                            transition: "transform 0.2s",
                            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                        }}>▼</span>
                    )}
                </div>

                {/* Progress bar */}
                {isRunning && estimatedProgress > 0 && (
                    <div style={styles.progressBar}>
                        <div style={{
                            ...styles.progressFill,
                            width: `${estimatedProgress}%`,
                        }} />
                    </div>
                )}

                {/* Multi-file progress indicator */}
                {isRunning && isMultiFile && (
                    <div style={{
                        display: "flex",
                        gap: "3px",
                        padding: "4px 8px 0 8px",
                        flexWrap: "wrap",
                    }}>
                        {Array.from({ length: Math.min(item.fileCount!, 8) }).map((_, i) => (
                            <div key={i} style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                background: estimatedProgress > (i / (item.fileCount!)) * 100
                                    ? "var(--vscode-terminal-ansiGreen, #4ec9b0)"
                                    : "var(--vscode-input-border, #404040)",
                                transition: "background 0.3s ease",
                                animation: estimatedProgress > (i / (item.fileCount!)) * 100 ? "none" : "pulse 1.5s ease-in-out infinite",
                                animationDelay: `${i * 0.15}s`,
                            }} />
                        ))}
                        {item.fileCount! > 8 && (
                            <span style={{ fontSize: "9px", color: "var(--vscode-descriptionForeground)", marginLeft: "2px" }}>
                                +{item.fileCount! - 8}
                            </span>
                        )}
                    </div>
                )}

                {/* Expandable detail */}
                {expanded && hasDetail && (
                    <div style={styles.detailPanel}>
                        {item.detail && (
                            <div style={styles.detailPath}>
                                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                        <path d="M3 6C3 5.45 3.45 5 4 5H9L11 7H20C20.55 7 21 7.45 21 8V18C21 18.55 20.55 19 20 19H4C3.45 19 3 18.55 3 18V6Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
                                    </svg>
                                    <span style={{ fontFamily: "monospace", fontSize: "10px" }}>{item.detail}</span>
                                </span>
                            </div>
                        )}
                        {item.rawContent && isRunning && (
                            <div style={styles.codePreview}>
                                {item.rawContent.length > 400
                                    ? item.rawContent.substring(0, 400) + "..."
                                    : item.rawContent}
                                <span className="streaming-cursor" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Main Component ---

export default function ActivityTimeline({
    isProcessing,
    thinkingPhase,
    currentToolCall,
    currentToolResult,
    streamingToolCalls,
    agentSteps,
}: ActivityTimelineProps): JSX.Element | null {
    const [items, setItems] = useState<TimelineItem[]>([]);
    const [collapsed, setCollapsed] = useState(false);
    const [completedCount, setCompletedCount] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const prevToolCallRef = useRef<string | null>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [items]);

    // Track completed tool items for persistent display
    const [completedItems, setCompletedItems] = useState<TimelineItem[]>([]);

    // Build timeline items from all sources
    useEffect(() => {
        if (!isProcessing) {
            // When done, keep items visible for 5 seconds then clear
            if (items.length > 0 || completedItems.length > 0) {
                const timer = setTimeout(() => {
                    setItems([]);
                    setCompletedItems([]);
                    setCompletedCount(0);
                }, 5000);
                return () => clearTimeout(timer);
            }
            return;
        }

        const newItems: TimelineItem[] = [];

        // Add thinking entry when no tool is active
        if (!currentToolCall && thinkingPhase) {
            newItems.push({
                id: "thinking",
                type: "thinking",
                label: thinkingPhase,
                timestamp: Date.now(),
                isCurrent: true,
            });
        }

        // Add focus chain / agent steps as completed or pending entries
        if (agentSteps && agentSteps.length > 0) {
            agentSteps.forEach((step) => {
                if (step.status === "completed") {
                    newItems.push({
                        id: `focus-${step.id}`,
                        type: "focus-step",
                        label: step.label,
                        timestamp: Date.now() - 1000,
                    });
                } else if (step.status === "active") {
                    newItems.push({
                        id: `focus-${step.id}`,
                        type: "focus-step",
                        label: step.label,
                        timestamp: Date.now(),
                        isCurrent: !currentToolCall,
                    });
                }
            });
        }

        // Add current tool call
        if (currentToolCall) {
            const info = extractToolInfo(currentToolCall);
            newItems.push({
                id: `tool-${currentToolCall.id}`,
                type: "tool-running",
                label: `${info.label}${info.detail ? ` — ${info.detail}` : ""}`,
                detail: info.detail,
                rawContent: info.rawContent,
                timestamp: Date.now(),
                isCurrent: true,
                toolName: currentToolCall.name,
                fileCount: info.fileCount,
            });
        }

        // Add streaming tool calls
        if (streamingToolCalls && streamingToolCalls.length > 0) {
            streamingToolCalls.forEach((tc, idx) => {
                const info = extractToolInfo(tc);
                newItems.push({
                    id: `stream-tool-${idx}`,
                    type: "tool-running",
                    label: info.label,
                    detail: info.detail,
                    rawContent: info.rawContent,
                    timestamp: Date.now(),
                    toolName: tc.name,
                    fileCount: info.fileCount,
                });
            });
        }

        setItems(newItems);
    }, [isProcessing, thinkingPhase, currentToolCall, currentToolResult, streamingToolCalls, agentSteps]);

    // Track completed tool calls and add to completed items list
    useEffect(() => {
        if (currentToolResult && prevToolCallRef.current !== currentToolResult.toolCallId) {
            prevToolCallRef.current = currentToolResult.toolCallId;
            setCompletedCount(prev => prev + 1);

            // Find the matching tool call and add to completed items
            const matchingCall = items.find(item => item.id === `tool-${currentToolResult.toolCallId}`);
            if (matchingCall) {
                const completedItem: TimelineItem = {
                    ...matchingCall,
                    id: `completed-${matchingCall.id}-${Date.now()}`,
                    type: currentToolResult.isError ? "tool-error" : "tool-done",
                    isCurrent: false,
                };
                setCompletedItems(prev => [...prev.slice(-10), completedItem]); // Keep last 10
            }
        }
    }, [currentToolResult, items]);

    // Combine active and completed items for display
    const allItems = [...completedItems, ...items];

    if (!isProcessing && allItems.length === 0) return null;

    // Show only last 4 items when collapsed, all when expanded
    const MAX_VISIBLE = 4;
    const visibleItems = collapsed ? allItems.slice(-MAX_VISIBLE) : allItems;

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerLeft}>
                    <div style={styles.headerPulse} />
                    <span style={styles.headerTitle}>
                        {isProcessing ? (
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <SpinnerIcon size={12} />
                                SHEN is working
                            </span>
                        ) : (
                            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <CheckIcon size={12} animated={false} />
                                Done
                            </span>
                        )}
                    </span>
                    {completedCount > 0 && (
                        <span style={styles.badge}>{completedCount} actions</span>
                    )}
                </div>
                {allItems.length > MAX_VISIBLE && (
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        style={styles.collapseBtn}
                    >
                        {collapsed ? `Show all (${allItems.length})` : "Collapse"}
                    </button>
                )}
            </div>

            {/* Timeline */}
            <div ref={scrollRef} style={styles.timeline}>
                {visibleItems.map((item, idx) => (
                    <TimelineEntry
                        key={item.id}
                        item={item}
                        isLast={idx === visibleItems.length - 1}
                    />
                ))}
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
        gap: "8px",
    },
    headerPulse: {
        width: "8px",
        height: "8px",
        borderRadius: "50%",
        background: "var(--vscode-focusBorder)",
        animation: "pulse 1.5s ease-in-out infinite",
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
        background: "var(--vscode-badge-background)",
        color: "var(--vscode-badge-foreground)",
    },
    collapseBtn: {
        background: "none",
        border: "none",
        color: "var(--vscode-textLink-foreground)",
        cursor: "pointer",
        fontSize: "10px",
        padding: "2px 6px",
        borderRadius: "3px",
        fontFamily: "inherit",
    },
    timeline: {
        padding: "8px 12px",
        maxHeight: "200px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "0",
    },
    entry: {
        display: "flex",
        gap: "10px",
        position: "relative",
        animation: "slideInRight 0.25s ease-out",
    },
    connector: {
        position: "absolute",
        left: "11px",
        top: "22px",
        bottom: "-2px",
        width: "2px",
        background: "var(--vscode-input-border, #404040)",
    },
    dot: {
        width: "24px",
        height: "24px",
        borderRadius: "50%",
        background: "var(--vscode-sideBar-background)",
        border: "2px solid var(--vscode-input-border, #404040)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        zIndex: 1,
    },
    entryContent: {
        flex: 1,
        minWidth: 0,
        paddingBottom: "6px",
    },
    entryRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 8px",
        transition: "all 0.2s ease",
    },
    entryLabel: {
        fontSize: "12px",
        flex: 1,
        minWidth: 0,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontFamily: "var(--vscode-font-family, sans-serif)",
    },
    progressBar: {
        height: "3px",
        borderRadius: "2px",
        background: "var(--vscode-inputValidation-infoBackground, rgba(0,122,204,0.1))",
        margin: "4px 8px 0 8px",
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        borderRadius: "2px",
        background: "linear-gradient(90deg, var(--vscode-focusBorder), var(--vscode-button-background))",
        transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        position: "relative",
    },
    detailPanel: {
        padding: "6px 8px",
        background: "var(--vscode-editor-inlayHint-background, #2a2d2e)",
        borderRadius: "0 0 6px 6px",
        animation: "fadeIn 0.2s ease-out",
    },
    detailPath: {
        fontSize: "10px",
        color: "var(--vscode-descriptionForeground)",
        marginBottom: "4px",
    },
    codePreview: {
        background: "var(--vscode-textCodeBlock-background, #2d2d2d)",
        border: "1px solid var(--vscode-panel-border, #404040)",
        borderRadius: "4px",
        padding: "6px",
        maxHeight: "100px",
        overflowY: "auto",
        fontFamily: "monospace",
        fontSize: "10px",
        whiteSpace: "pre-wrap",
        color: "var(--vscode-editor-foreground)",
        lineHeight: 1.4,
    },
};