import React, { useRef, useEffect, KeyboardEvent } from "react";
import { useChatStore } from "../store/chat-store";
import type { PersonalityType } from "../../../types";
import { postMessage } from "../vscode-api";

// ============================================================
// SHEN AI — Chat Input Component
// ============================================================

interface ChatInputProps {
    value: string;
    onChange: (value: string) => void;
    onSend: (content: string) => void;
    onCancel: () => void;
    onClear: () => void;
    isProcessing: boolean;
    isStreaming: boolean;
}

export default function ChatInput({
    value,
    onChange,
    onSend,
    onCancel,
    onClear,
    isProcessing,
    isStreaming,
}: ChatInputProps): JSX.Element {
    const { settings, updateSettings } = useChatStore();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
        }
    }, [value]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim() && !isProcessing) {
                onSend(value);
            }
        }
    };

    const handleSendClick = () => {
        if (value.trim() && !isProcessing) {
            onSend(value);
        }
    };

    return (
        <div style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--vscode-panel-border, #404040)",
            background: "var(--vscode-sideBar-background)",
            flexShrink: 0,
        }}>
            <div style={{
                display: "flex",
                gap: "8px",
                marginBottom: "8px",
            }}>
                <select
                    value={settings.personality}
                    onChange={(e) => {
                        const val = e.target.value as PersonalityType;
                        updateSettings({ personality: val });
                        postMessage({ action: "settings/update", payload: { personality: val } });
                    }}
                    style={{
                        background: "var(--vscode-input-background, #3c3c3c)",
                        color: "var(--vscode-input-foreground)",
                        border: "1px solid var(--vscode-input-border, #404040)",
                        borderRadius: "4px",
                        fontSize: "10px",
                        padding: "2px 4px",
                        outline: "none",
                        cursor: "pointer",
                        flex: 1,
                    }}
                >
                    <option value="senior-dev">💻 Senior Dev</option>
                    <option value="mentor">🎓 Mentor</option>
                    <option value="hacker">🔓 Hacker</option>
                    <option value="reviewer">🔍 Reviewer</option>
                    <option value="socratic">❓ Socratic</option>
                    <option value="silent-partner">🤫 Silent</option>
                </select>

                <div style={{ display: "flex", background: "var(--vscode-input-background, #3c3c3c)", border: "1px solid var(--vscode-input-border, #404040)", borderRadius: "4px", overflow: "hidden" }}>
                    <button
                        onClick={() => {
                            updateSettings({ agentMode: "plan" });
                            postMessage({ action: "settings/update", payload: { agentMode: "plan" } });
                        }}
                        style={{
                            background: settings.agentMode === "plan" ? "var(--vscode-button-background, #0e639c)" : "transparent",
                            color: settings.agentMode === "plan" ? "var(--vscode-button-foreground, #fff)" : "var(--vscode-descriptionForeground)",
                            border: "none",
                            padding: "2px 8px",
                            fontSize: "10px",
                            cursor: "pointer",
                            transition: "background 0.2s",
                        }}
                        title="Plan Mode: Analyze and write plans (Read-only)"
                    >
                        Plan
                    </button>
                    <button
                        onClick={() => {
                            updateSettings({ agentMode: "act" });
                            postMessage({ action: "settings/update", payload: { agentMode: "act" } });
                        }}
                        style={{
                            background: settings.agentMode === "act" ? "var(--vscode-button-background, #0e639c)" : "transparent",
                            color: settings.agentMode === "act" ? "var(--vscode-button-foreground, #fff)" : "var(--vscode-descriptionForeground)",
                            border: "none",
                            padding: "2px 8px",
                            fontSize: "10px",
                            cursor: "pointer",
                            transition: "background 0.2s",
                        }}
                        title="Act Mode: Can modify files and run commands"
                    >
                        Act
                    </button>
                </div>
            </div>

            {/* Plan -> Act transition button */}
            {settings.agentMode === "plan" && (
                <div style={{ marginBottom: "8px", display: "flex" }}>
                    <button
                        className="btn-primary"
                        style={{ width: "100%", padding: "6px", fontSize: "11px", fontWeight: "bold" }}
                        onClick={() => {
                            updateSettings({ agentMode: "act" });
                            postMessage({ action: "settings/update", payload: { agentMode: "act" } });
                            // Wait for settings to propagate to extension before sending the proceed message
                            setTimeout(() => {
                                onSend("I have reviewed the plan. Switch to Act Mode and proceed with the proposed plan exactly as written.");
                            }, 500);
                        }}
                        disabled={isProcessing}
                    >
                        🚀 Approve Plan & Proceed (Switch to Act Mode)
                    </button>
                </div>
            )}

            <div style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "8px",
                background: "var(--vscode-input-background, #3c3c3c)",
                border: "1px solid var(--vscode-input-border, #404040)",
                borderRadius: "8px",
                padding: "6px 8px",
            }}>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isProcessing ? "SHEN is working..." : "Ask SHEN AI anything... (Enter to send, Shift+Enter for newline)"}
                    disabled={isProcessing && !isStreaming}
                    rows={1}
                    style={{
                        flex: 1,
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        color: "var(--vscode-input-foreground)",
                        fontFamily: "var(--vscode-font-family, sans-serif)",
                        fontSize: "var(--vscode-font-size, 13px)",
                        resize: "none",
                        maxHeight: "200px",
                        lineHeight: 1.5,
                        padding: "2px 0",
                    }}
                />
                <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    {isProcessing ? (
                        <button
                            onClick={onCancel}
                            title="Cancel"
                            style={{
                                background: "var(--vscode-errorForeground, #f44747)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "4px",
                                width: "28px",
                                height: "28px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "14px",
                            }}
                        >
                            ■
                        </button>
                    ) : (
                        <button
                            onClick={handleSendClick}
                            disabled={!value.trim()}
                            title="Send"
                            style={{
                                background: "var(--vscode-button-background, #0e639c)",
                                opacity: value.trim() ? 1 : 0.4,
                                color: "var(--vscode-button-foreground, #fff)",
                                border: "none",
                                borderRadius: "4px",
                                width: "28px",
                                height: "28px",
                                cursor: value.trim() ? "pointer" : "not-allowed",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "14px",
                            }}
                        >
                            ▶
                        </button>
                    )}
                </div>
            </div>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "4px",
                padding: "0 4px",
            }}>
                <span style={{
                    fontSize: "10px",
                    color: "var(--vscode-descriptionForeground)",
                }}>
                    Enter to send • Shift+Enter for newline
                </span>
                <button
                    onClick={onClear}
                    style={{
                        background: "none",
                        border: "none",
                        color: "var(--vscode-descriptionForeground)",
                        cursor: "pointer",
                        fontSize: "10px",
                        fontFamily: "inherit",
                        padding: "2px 4px",
                    }}
                >
                    Clear chat
                </button>
            </div>
        </div>
    );
}