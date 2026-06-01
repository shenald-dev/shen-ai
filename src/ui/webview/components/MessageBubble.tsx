import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import type { ChatMessage } from "../../../types";
import { postMessage } from "../vscode-api";
import { getToolIcon, UndoIcon, RestoreIcon, CheckIcon, ErrorIcon } from "./icons/AnimatedIcons";

// ============================================================
// SHEN AI — Message Bubble Component (Redesigned)
// Animated icons + per-message undo/restore + streaming code typing
// ============================================================

interface MessageBubbleProps {
    message: ChatMessage;
    showUndo?: boolean;
    onUndoToHere?: (messageId: string) => void;
}

// --- Streaming Code Block: Reveals code character-by-character ---
function StreamingCodeBlock({ code, language }: { code: string; language: string }): JSX.Element {
    const [visibleLength, setVisibleLength] = useState(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const preRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (visibleLength >= code.length) return;

        // Calculate chunk size based on total length — longer code = bigger chunks
        const chunkSize = Math.max(1, Math.min(8, Math.floor(code.length / 200)));
        const delay = code.length > 500 ? 8 : 12;

        intervalRef.current = setInterval(() => {
            setVisibleLength(prev => {
                const next = prev + chunkSize;
                if (next >= code.length) {
                    if (intervalRef.current) clearInterval(intervalRef.current);
                    return code.length;
                }
                return next;
            });
        }, delay);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [code.length]);

    // Auto-scroll the code block as it types
    useEffect(() => {
        if (preRef.current) {
            preRef.current.scrollTop = preRef.current.scrollHeight;
        }
    }, [visibleLength]);

    const visibleCode = code.substring(0, visibleLength);
    const isComplete = visibleLength >= code.length;

    return (
        <div style={{ position: "relative" }}>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 8px",
                background: "var(--vscode-tab-activeBackground, #1e1e1e)",
                borderRadius: "6px 6px 0 0",
                fontSize: "11px",
                color: "var(--vscode-descriptionForeground)",
            }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {language || "code"}
                    {!isComplete && (
                        <span style={{
                            display: "inline-block",
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: "var(--vscode-focusBorder)",
                            animation: "pulse 1s ease-in-out infinite",
                        }} />
                    )}
                </span>
                {isComplete && (
                    <button
                        onClick={() => {
                            navigator.clipboard?.writeText(code);
                        }}
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--vscode-descriptionForeground)",
                            cursor: "pointer",
                            fontSize: "11px",
                            fontFamily: "inherit",
                        }}
                    >
                        📋 Copy
                    </button>
                )}
            </div>
            <pre
                ref={preRef}
                style={{
                    background: "var(--vscode-textCodeBlock-background, #2d2d2d)",
                    border: "1px solid var(--vscode-panel-border, #404040)",
                    borderTop: "none",
                    borderRadius: "0 0 6px 6px",
                    padding: "12px",
                    overflowX: "auto",
                    overflowY: "auto",
                    maxHeight: "300px",
                    margin: 0,
                    position: "relative",
                }}
            >
                <code style={{
                    fontFamily: "var(--vscode-editor-font-family, monospace)",
                    fontSize: "0.9em",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    color: "var(--vscode-editor-foreground)",
                }}>
                    {visibleCode}
                    {!isComplete && <span className="streaming-cursor" />}
                </code>
            </pre>
            {/* Typing progress bar */}
            {!isComplete && (
                <div style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "2px",
                    background: "var(--vscode-input-background)",
                    borderRadius: "0 0 6px 6px",
                    overflow: "hidden",
                }}>
                    <div style={{
                        height: "100%",
                        width: `${(visibleLength / code.length) * 100}%`,
                        background: "linear-gradient(90deg, var(--vscode-focusBorder), var(--vscode-button-background))",
                        transition: "width 0.1s linear",
                    }} />
                </div>
            )}
        </div>
    );
}

const WRITE_TOOLS = ["write_to_file", "replace_in_file", "replace_file_content", "multi_replace_file_content", "apply_diff"];

const TOOL_LABELS: Record<string, string> = {
    view_file: "Read file", read_file: "Read file",
    write_to_file: "Created file", replace_in_file: "Edited file",
    replace_file_content: "Edited file", multi_replace_file_content: "Modified file",
    apply_diff: "Applied diff", list_files: "Listed folder",
    list_dir: "Listed folder", search_files: "Searched files",
    grep_search: "Searched", execute_command: "Ran command",
    run_command: "Ran command", ask_followup_question: "Asked question",
    attempt_completion: "Completed task", search_web: "Searched web",
    read_multiple_files: "Read multiple files",
};

export default function MessageBubble({ message, showUndo, onUndoToHere }: MessageBubbleProps): JSX.Element {
    const [undoHovered, setUndoHovered] = useState(false);
    const [undoConfirming, setUndoConfirming] = useState(false);
    const isUser = message.type === "user";
    const isAssistant = message.type === "assistant";
    const isTool = message.type === "tool";
    const isError = message.type === "error";
    const isInfo = message.type === "info";

    // --- Info messages ---
    if (isInfo) {
        return (
            <div style={{
                padding: "8px 12px",
                margin: "4px 0",
                fontSize: "12px",
                color: "var(--vscode-descriptionForeground)",
                textAlign: "center",
                fontStyle: "italic",
            }}>
                {message.content}
            </div>
        );
    }

    // --- Error messages ---
    if (isError) {
        return (
            <div style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "8px 12px",
                margin: "4px 0",
                background: "var(--vscode-inputValidation-errorBackground, #5a1d1d)",
                border: "1px solid var(--vscode-inputValidation-errorBorder, #be1100)",
                borderRadius: "6px",
                color: "var(--vscode-errorForeground)",
                fontSize: "12px",
            }}>
                <ErrorIcon size={14} />
                <span>{message.content}</span>
            </div>
        );
    }

    // --- Tool results as animated icon badges ---
    if (isTool) {
        if (message.toolResults && message.toolResults.length > 0) {
            return (
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", margin: "4px 0" }}>
                    {message.toolResults.map((result, idx) => {
                        const matchingCall = message.toolCalls?.find(tc => tc.id === result.toolCallId);
                        const toolName = matchingCall?.name || result.name;
                        const label = TOOL_LABELS[toolName] || toolName.replace(/_/g, " ");
                        const isWriteTool = WRITE_TOOLS.includes(toolName);

                        return (
                            <React.Fragment key={`tool-res-${idx}`}>
                                <div style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "4px 10px",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontFamily: "var(--vscode-font-family, sans-serif)",
                                    background: result.isError
                                        ? "var(--vscode-inputValidation-errorBackground, #5a1d1d)"
                                        : "var(--vscode-badge-background, rgba(0,122,204,0.15))",
                                    color: result.isError
                                        ? "var(--vscode-errorForeground)"
                                        : "var(--vscode-badge-foreground, var(--vscode-descriptionForeground))",
                                    border: `1px solid ${result.isError
                                        ? "var(--vscode-inputValidation-errorBorder, #be1100)"
                                        : "var(--vscode-badge-background, rgba(0,122,204,0.3))"
                                        }`,
                                    width: "fit-content",
                                    maxWidth: "100%",
                                    animation: "slideInRight 0.25s ease-out",
                                }}>
                                    <span style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                                        {result.isError
                                            ? <ErrorIcon size={12} />
                                            : getToolIcon(toolName, true)
                                        }
                                    </span>
                                    <span style={{
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}>
                                        {result.isError ? "✕" : "✓"} {label}
                                    </span>
                                </div>
                                {isWriteTool && !result.isError && (
                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        marginTop: "2px",
                                        marginBottom: "8px",
                                        fontSize: "10px",
                                        color: "var(--vscode-descriptionForeground)",
                                    }}>
                                        <span style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "3px" }}>
                                            <CheckIcon size={10} animated={false} /> Checkpoint
                                        </span>
                                        <hr style={{
                                            flex: 1,
                                            border: "none",
                                            borderTop: "1px dashed var(--vscode-panel-border, #404040)",
                                            margin: "0 4px",
                                        }} />
                                        <button
                                            onClick={() => postMessage({ action: "task/undo" as any, payload: {} })}
                                            style={{
                                                background: "var(--vscode-button-secondaryBackground, #3a3d41)",
                                                color: "var(--vscode-button-secondaryForeground, #ffffff)",
                                                border: "none",
                                                borderRadius: "3px",
                                                padding: "2px 8px",
                                                cursor: "pointer",
                                                fontSize: "10px",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "3px",
                                            }}
                                            title="Undo this file change"
                                        >
                                            <UndoIcon size={10} /> Restore
                                        </button>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            );
        }
        return <></>;
    }

    // --- User and Assistant bubbles ---
    const isStreamingMsg = !!message.isStreaming;

    const bubbleStyle: React.CSSProperties = {
        padding: "10px 14px",
        margin: "6px 0",
        borderRadius: "8px",
        maxWidth: "100%",
        fontSize: "13px",
        lineHeight: 1.6,
        wordBreak: "break-word",
        transition: "box-shadow 0.3s ease",
    };

    if (isUser) {
        bubbleStyle.background = "var(--vscode-button-background, #0e639c)";
        bubbleStyle.color = "var(--vscode-button-foreground, #ffffff)";
        bubbleStyle.marginLeft = "20%";
        bubbleStyle.borderBottomRightRadius = "2px";
    } else {
        bubbleStyle.background = "var(--vscode-editor-inlayHint-background, #2a2d2e)";
        bubbleStyle.color = "var(--vscode-editor-foreground)";
        bubbleStyle.marginRight = "10%";
        bubbleStyle.borderBottomLeftRadius = "2px";
        // Streaming glow effect
        if (isStreamingMsg) {
            bubbleStyle.boxShadow = "0 0 8px rgba(99, 102, 241, 0.25), inset 0 0 4px rgba(99, 102, 241, 0.08)";
            bubbleStyle.border = "1px solid rgba(99, 102, 241, 0.3)";
        }
    }

    const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });

    const handleUndoClick = () => {
        if (undoConfirming) {
            onUndoToHere?.(message.id);
            setUndoConfirming(false);
        } else {
            setUndoConfirming(true);
            setTimeout(() => setUndoConfirming(false), 4000);
        }
    };

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isUser ? "flex-end" : "flex-start",
                position: "relative",
            }}
            onMouseEnter={() => setUndoHovered(true)}
            onMouseLeave={() => { setUndoHovered(false); if (!undoConfirming) setUndoConfirming(false); }}
        >
            <div style={bubbleStyle}>
                {isAssistant ? (
                    <div className="markdown-content">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeHighlight]}
                            components={{
                                code({ className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || "");
                                    const language = match ? match[1] : "";
                                    const isInline = !className;

                                    if (isInline) {
                                        return (
                                            <code style={{
                                                background: "var(--vscode-textCodeBlock-background, #2d2d2d)",
                                                padding: "2px 6px",
                                                borderRadius: "3px",
                                                fontFamily: "var(--vscode-editor-font-family, monospace)",
                                                fontSize: "0.9em",
                                            }} {...props}>
                                                {children}
                                            </code>
                                        );
                                    }

                                    const codeText = String(children).replace(/\n$/, "");

                                    // Use streaming animation for code blocks in streaming messages
                                    if (isStreamingMsg) {
                                        return <StreamingCodeBlock code={codeText} language={language} />;
                                    }

                                    return (
                                        <div style={{ position: "relative" }}>
                                            <div style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                padding: "4px 8px",
                                                background: "var(--vscode-tab-activeBackground, #1e1e1e)",
                                                borderRadius: "6px 6px 0 0",
                                                fontSize: "11px",
                                                color: "var(--vscode-descriptionForeground)",
                                            }}>
                                                <span>{language || "code"}</span>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard?.writeText(codeText);
                                                    }}
                                                    style={{
                                                        background: "none",
                                                        border: "none",
                                                        color: "var(--vscode-descriptionForeground)",
                                                        cursor: "pointer",
                                                        fontSize: "11px",
                                                        fontFamily: "inherit",
                                                    }}
                                                >
                                                    📋 Copy
                                                </button>
                                            </div>
                                            <pre style={{
                                                background: "var(--vscode-textCodeBlock-background, #2d2d2d)",
                                                border: "1px solid var(--vscode-panel-border, #404040)",
                                                borderTop: "none",
                                                borderRadius: "0 0 6px 6px",
                                                padding: "12px",
                                                overflowX: "auto",
                                                margin: 0,
                                            }}>
                                                <code className={className} {...props}>
                                                    {children}
                                                </code>
                                            </pre>
                                        </div>
                                    );
                                },
                            }}
                        >
                            {message.content}
                        </ReactMarkdown>
                        {message.isStreaming && (
                            <span className="streaming-cursor" />
                        )}
                    </div>
                ) : (
                    <span style={{ whiteSpace: "pre-wrap" }}>{message.content}</span>
                )}
            </div>

            {/* Timestamp + Undo bar for user messages */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "10px",
                color: "var(--vscode-descriptionForeground)",
                marginTop: "2px",
                padding: "0 4px",
            }}>
                <span>
                    {timeStr}
                    {message.tokensUsed ? ` • ${message.tokensUsed.toLocaleString()} tokens` : ""}
                </span>

                {/* Undo to here button — shown for user messages */}
                {isUser && showUndo && onUndoToHere && (
                    <button
                        onClick={handleUndoClick}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            background: undoConfirming
                                ? "var(--vscode-errorForeground, #f44747)"
                                : "var(--vscode-button-secondaryBackground, #3a3d41)",
                            color: undoConfirming
                                ? "#fff"
                                : "var(--vscode-button-secondaryForeground, #cccccc)",
                            border: "none",
                            borderRadius: "4px",
                            padding: "2px 8px",
                            fontSize: "10px",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            opacity: undoHovered || undoConfirming ? 1 : 0.6,
                            transition: "all 0.2s ease",
                        }}
                        title={undoConfirming ? "Click again to confirm undo" : "Undo all changes back to this point"}
                    >
                        <UndoIcon size={10} color={undoConfirming ? "#fff" : undefined} />
                        {undoConfirming ? "Click to confirm undo" : "Undo to here"}
                    </button>
                )}
            </div>
        </div>
    );
}