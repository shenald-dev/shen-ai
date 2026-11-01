import React, { useRef, useEffect, useState, KeyboardEvent } from "react";
import { useChatStore } from "../store/chat-store";
import type { PersonalityType } from "../../../types";
import { postMessage } from "../vscode-api";

// ============================================================
// SHEN AI — Chat Input Component with Slash Command Autocomplete
// ============================================================

interface SlashCommandItem {
    command: string;
    label: string;
    description: string;
    icon: string;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
    { command: "/review", label: "Review", description: "Audit code for security, performance & quality", icon: "🔍" },
    { command: "/debug", label: "Debug", description: "Diagnose error root causes and propose fixes", icon: "🐛" },
    { command: "/architect", label: "Architect", description: "Design system topology & implementation plans", icon: "📐" },
    { command: "/research", label: "Research", description: "Explore codebase patterns, APIs & architecture", icon: "🔬" },
    { command: "/swarm", label: "Swarm", description: "Decompose & run parallel multi-agent swarm task", icon: "🐝" },
    { command: "/health", label: "Health", description: "Scan workspace code health & prescriptions", icon: "💓" },
    { command: "/checkpoint", label: "Checkpoint", description: "Create an instant git snapshot checkpoint", icon: "💾" },
    { command: "/undo", label: "Undo", description: "Revert the last code modification", icon: "↩️" },
    { command: "/clear", label: "Clear", description: "Clear current conversation messages", icon: "🗑️" },
    { command: "/help", label: "Help", description: "Show guide and available slash commands", icon: "💡" },
];

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
    const { settings, updateSettings, activeFile } = useChatStore();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
    const [dismissSlashMenu, setDismissSlashMenu] = useState(false);

    // Filter slash commands
    const isSlashActive = value.startsWith("/") && !value.includes("\n") && !dismissSlashMenu;
    const slashQuery = isSlashActive ? value.split(" ")[0].toLowerCase() : "";
    const matchingCommands = isSlashActive
        ? SLASH_COMMANDS.filter((c) => c.command.startsWith(slashQuery))
        : [];

    // Reset slash selection when query changes
    useEffect(() => {
        setSelectedSlashIndex(0);
        if (!value.startsWith("/")) {
            setDismissSlashMenu(false);
        }
    }, [slashQuery, value]);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = "auto";
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
        }
    }, [value]);

    const handleSelectCommand = (cmd: SlashCommandItem) => {
        const remainingArgs = value.includes(" ") ? value.substring(value.indexOf(" ")) : " ";
        onChange(`${cmd.command}${remainingArgs}`);
        setDismissSlashMenu(true);
        textareaRef.current?.focus();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (matchingCommands.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedSlashIndex((i) => (i + 1) % matchingCommands.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedSlashIndex((i) => (i - 1 + matchingCommands.length) % matchingCommands.length);
                return;
            }
            if (e.key === "Tab" || (e.key === "Enter" && !value.includes(" "))) {
                e.preventDefault();
                handleSelectCommand(matchingCommands[selectedSlashIndex]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setDismissSlashMenu(true);
                return;
            }
        }

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

    const handleChipClick = (cmd: string) => {
        onChange(cmd);
        textareaRef.current?.focus();
    };

    const activeFileName = activeFile ? activeFile.split(/[\\/]/).pop() : null;

    return (
        <div style={{
            position: "relative",
            padding: "8px 12px",
            borderTop: "1px solid var(--vscode-panel-border, #404040)",
            background: "var(--vscode-sideBar-background)",
            flexShrink: 0,
        }}>
            {/* Slash Command Autocomplete Popover */}
            {matchingCommands.length > 0 && (
                <div style={{
                    position: "absolute",
                    bottom: "100%",
                    left: "12px",
                    right: "12px",
                    marginBottom: "8px",
                    background: "var(--vscode-editorSuggestWidget-background, #252526)",
                    border: "1px solid var(--vscode-editorSuggestWidget-border, #454545)",
                    borderRadius: "6px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                    maxHeight: "220px",
                    overflowY: "auto",
                    zIndex: 100,
                }}>
                    <div style={{
                        padding: "4px 8px",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "var(--vscode-descriptionForeground)",
                        borderBottom: "1px solid var(--vscode-editorSuggestWidget-border, #333)",
                    }}>
                        SPECIALIST COMMANDS (Tab or Enter to select)
                    </div>
                    {matchingCommands.map((item, idx) => {
                        const isSelected = idx === selectedSlashIndex;
                        return (
                            <div
                                key={item.command}
                                onClick={() => handleSelectCommand(item)}
                                onMouseEnter={() => setSelectedSlashIndex(idx)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    padding: "6px 10px",
                                    cursor: "pointer",
                                    background: isSelected
                                        ? "var(--vscode-editorSuggestWidget-selectedBackground, #04395e)"
                                        : "transparent",
                                    color: isSelected
                                        ? "var(--vscode-editorSuggestWidget-selectedForeground, #ffffff)"
                                        : "var(--vscode-editorSuggestWidget-foreground, inherit)",
                                    fontSize: "12px",
                                }}
                            >
                                <span style={{ fontSize: "14px" }}>{item.icon}</span>
                                <span style={{ fontWeight: 600 }}>{item.command}</span>
                                <span style={{
                                    fontSize: "11px",
                                    opacity: 0.75,
                                    marginLeft: "auto",
                                }}>
                                    {item.description}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Quick Action Chips & Active Context Badge */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "6px",
                overflowX: "auto",
                whiteSpace: "nowrap",
            }}>
                <button
                    onClick={() => handleChipClick("/review ")}
                    style={{
                        background: "var(--vscode-badge-background, #333)",
                        color: "var(--vscode-badge-foreground, #ccc)",
                        border: "1px solid var(--vscode-input-border, #404040)",
                        borderRadius: "12px",
                        padding: "2px 8px",
                        fontSize: "10px",
                        cursor: "pointer",
                    }}
                    title="Run deep code review"
                >
                    🔍 /review
                </button>
                <button
                    onClick={() => handleChipClick("/debug ")}
                    style={{
                        background: "var(--vscode-badge-background, #333)",
                        color: "var(--vscode-badge-foreground, #ccc)",
                        border: "1px solid var(--vscode-input-border, #404040)",
                        borderRadius: "12px",
                        padding: "2px 8px",
                        fontSize: "10px",
                        cursor: "pointer",
                    }}
                    title="Diagnose error or bug"
                >
                    🐛 /debug
                </button>
                <button
                    onClick={() => handleChipClick("/architect ")}
                    style={{
                        background: "var(--vscode-badge-background, #333)",
                        color: "var(--vscode-badge-foreground, #ccc)",
                        border: "1px solid var(--vscode-input-border, #404040)",
                        borderRadius: "12px",
                        padding: "2px 8px",
                        fontSize: "10px",
                        cursor: "pointer",
                    }}
                    title="Design system architecture"
                >
                    📐 /architect
                </button>
                <button
                    onClick={() => handleChipClick("/health")}
                    style={{
                        background: "var(--vscode-badge-background, #333)",
                        color: "var(--vscode-badge-foreground, #ccc)",
                        border: "1px solid var(--vscode-input-border, #404040)",
                        borderRadius: "12px",
                        padding: "2px 8px",
                        fontSize: "10px",
                        cursor: "pointer",
                    }}
                    title="Scan workspace code health"
                >
                    💓 /health
                </button>
                {activeFileName && (
                    <span style={{
                        marginLeft: "auto",
                        fontSize: "10px",
                        color: "var(--vscode-textLink-foreground, #3794ff)",
                        background: "var(--vscode-input-background, #2d2d2d)",
                        border: "1px solid var(--vscode-input-border, #404040)",
                        borderRadius: "12px",
                        padding: "2px 8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                    }} title={`Active Editor File: ${activeFile}`}>
                        📄 {activeFileName}
                    </span>
                )}
            </div>

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
                    placeholder={isProcessing ? "SHEN is working..." : "Ask SHEN AI or type / for commands... (Enter to send)"}
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
                                justifyCenter: "center",
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
                    Type <code style={{ color: "var(--vscode-textLink-foreground)" }}>/</code> for specialist commands
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
