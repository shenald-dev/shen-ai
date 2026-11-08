import React, { useEffect, useRef, useCallback } from "react";
import { useChatStore, type AgentStatus } from "./store/chat-store";
import type {
    ChatMessage,
    ToolCall,
    ToolResult,
    ExtensionMessage,
    PersonalityType,
    ProviderName,
} from "../../types";
import MessageBubble from "./components/MessageBubble";
import ChatInput from "./components/ChatInput";
import SettingsPanel from "./components/SettingsPanel";
import HistoryPanel from "./components/HistoryPanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WelcomePanel } from "./components/WelcomePanel";
import { AgentStatusPanel } from "./components/AgentStatusPanel";
import ActivityTimeline from "./components/ActivityTimeline";
import CheckpointTimeline from "./components/CheckpointTimeline";
import LiveFilePreview from "./components/LiveFilePreview";
import { postMessage } from "./vscode-api";

// ============================================================
// SHEN AI — Main App Component
// ============================================================

const PROVIDER_LABELS: Record<ProviderName, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    ollama: "Ollama",
    azure: "Azure",
    groq: "Groq",
    mistral: "Mistral",
    custom: "Custom",
};

const PERSONALITY_LABELS: Record<PersonalityType, string> = {
    mentor: "🎓 Mentor",
    "senior-dev": "💻 Senior Dev",
    hacker: "🔓 Hacker",
    reviewer: "🔍 Reviewer",
    socratic: "❓ Socratic",
    "silent-partner": "🤫 Silent Partner",
};


export default function App(): JSX.Element {
    const {
        messages,
        streamingContent,
        isStreaming,
        isProcessing,
        currentToolCall,
        currentToolResult,
        totalTokens,
        showSettings,
        showHistory,
        showCheckpoints,
        showWelcome,
        inputText,
        error,
        settings,
        agentStatuses,
        isOrchestrating,
        streamingToolCalls,
        thinkingPhase,
        checkpointTasks,
        addMessage,
        appendStreamingContent,
        finishStreaming,
        setProcessing,
        setCurrentToolCall,
        setCurrentToolResult,
        setTotalTokens,
        setShowSettings,
        setShowHistory,
        setShowCheckpoints,
        setShowWelcome,
        setInputText,
        setError,
        clearMessages,
        updateSettings,
        setAgentStatuses,
        setIsOrchestrating,
        setStreamingToolCalls,
        setThinkingPhase,
        setCheckpointTasks,
        resetStreamingState,
        truncateMessagesAfter,
    } = useChatStore();

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streamingContent]);

    // Hide welcome when first message is sent
    useEffect(() => {
        if (messages.length > 0) {
            setShowWelcome(false);
        }
    }, [messages]);

    // Thinking phase rotation
    useEffect(() => {
        if (!isProcessing) {
            setThinkingPhase("");
            return;
        }
        const phases = [
            "Analyzing your request",
            "Building context",
            "Formulating approach",
            "Processing information",
            "Generating solution",
            "Refining output",
        ];
        let idx = 0;
        setThinkingPhase(phases[0]);
        const interval = setInterval(() => {
            idx = (idx + 1) % phases.length;
            setThinkingPhase(phases[idx]);
        }, 3000);
        return () => clearInterval(interval);
    }, [isProcessing]);

    // Listen for messages from extension
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const message = event.data as ExtensionMessage;

            switch (message.action) {
                case "chat/streaming": {
                    const payload = message.payload as { content: string; isComplete: boolean; toolCalls?: any[] };
                    if (payload.content) {
                        appendStreamingContent(payload.content);
                    }
                    if (payload.toolCalls) {
                        setStreamingToolCalls(payload.toolCalls);
                    }
                    if (payload.isComplete) {
                        finishStreaming();
                        setStreamingToolCalls([]);
                        setProcessing(false);
                    }
                    break;
                }

                case "chat/toolCall": {
                    const toolCall = message.payload as ToolCall;
                    setCurrentToolCall(toolCall);
                    break;
                }

                case "chat/toolResult": {
                    const result = message.payload as ToolResult;
                    setCurrentToolResult(result);

                    const state = useChatStore.getState();
                    const relatedToolCall = state.currentToolCall?.id === result.toolCallId ? state.currentToolCall : undefined;

                    const toolMsg: ChatMessage = {
                        id: crypto.randomUUID(),
                        type: "tool",
                        content: `[${result.name}]: ${result.content}`,
                        timestamp: Date.now(),
                        toolCalls: relatedToolCall ? [relatedToolCall] : [],
                        toolResults: [result],
                    };
                    addMessage(toolMsg);
                    break;
                }

                case "chat/done": {
                    const payload = message.payload as {
                        content?: string;
                        totalTokens?: number;
                        cancelled?: boolean;
                        cleared?: boolean;
                        newTask?: boolean;
                        restoredToMessage?: string;
                        restoredFiles?: number;
                    };
                    if (payload.totalTokens) {
                        setTotalTokens(payload.totalTokens);
                    }

                    setProcessing(false);
                    finishStreaming();
                    if (payload.newTask) {
                        clearMessages();
                        setShowWelcome(true);
                    }
                    // Handle restore-to-message: clear UI, extension will re-send truncated messages
                    if (payload.restoredToMessage) {
                        useChatStore.setState({ messages: [], streamingContent: "", isStreaming: false });
                    }
                    break;
                }

                case "chat/error": {
                    const payload = message.payload as { message: string };
                    setError(payload.message);
                    setProcessing(false);
                    finishStreaming();
                    break;
                }

                case "settings/sync": {
                    const payload = message.payload as Partial<typeof settings>;
                    updateSettings(payload);
                    break;
                }

                case "chat/response": {
                    const msg = message.payload as ChatMessage;
                    addMessage(msg);
                    break;
                }

                case "agent/status": {
                    const payload = message.payload as {
                        agents?: AgentStatus[];
                        isOrchestrating?: boolean;
                        checkpointData?: { tasks: any[] };
                    };
                    if (payload.agents) {
                        setAgentStatuses(payload.agents);
                    }
                    if (payload.isOrchestrating !== undefined) {
                        setIsOrchestrating(payload.isOrchestrating);
                    }
                    if (payload.checkpointData) {
                        setCheckpointTasks(payload.checkpointData.tasks || []);
                    }
                    break;
                }

                case "onboarding/state": {
                    const payload = message.payload as { showWelcome: boolean };
                    setShowWelcome(payload.showWelcome);
                    break;
                }
            }
        };

        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [appendStreamingContent, finishStreaming, setProcessing, setCurrentToolCall, setCurrentToolResult, addMessage, setTotalTokens, clearMessages, setError, updateSettings, setShowWelcome]);

    const handleSend = useCallback(
        (content: string) => {
            if (!content.trim() || isProcessing) return;

            const userMsg: ChatMessage = {
                id: crypto.randomUUID(),
                type: "user",
                content,
                timestamp: Date.now(),
            };
            addMessage(userMsg);
            setInputText("");
            setProcessing(true);
            setError(null);

            const currentSettings = useChatStore.getState().settings;

            postMessage({
                action: "chat/send",
                payload: { content, personality: currentSettings.personality, agentMode: currentSettings.agentMode },
            });
        },
        [isProcessing, addMessage, setInputText, setProcessing, setError]
    );

    const handleCancel = useCallback(() => {
        postMessage({ action: "chat/cancel" });
        setProcessing(false);
        finishStreaming();
    }, [setProcessing, finishStreaming]);

    const handleNewTask = useCallback(() => {
        postMessage({ action: "task/new" });
        clearMessages();
        setShowHistory(false);
        setShowSettings(false);
        if (!settings.hasApiKey && settings.provider !== "ollama" && settings.provider !== "custom") {
            setShowWelcome(true);
        } else {
            setShowWelcome(false);
        }
    }, [clearMessages, settings.hasApiKey, settings.provider, setShowHistory, setShowSettings]);

    const handleClear = useCallback(() => {
        postMessage({ action: "chat/clear" });
        clearMessages();
        if (!settings.hasApiKey && settings.provider !== "ollama" && settings.provider !== "custom") {
            setShowWelcome(true);
        } else {
            setShowWelcome(false);
        }
    }, [clearMessages, settings.hasApiKey, settings.provider]);

    const handleDismissWelcome = useCallback(() => {
        setShowWelcome(false);
        postMessage({ action: "onboarding/dismiss" });
    }, []);

    const handleOpenSettings = useCallback(() => {
        setShowSettings(true);
    }, [setShowSettings]);

    const handleUndoToHere = useCallback((messageId: string) => {
        // Find the message to get its timestamp
        const msg = messages.find(m => m.id === messageId);
        if (!msg) return;

        // Send restore request to extension
        postMessage({
            action: "task/restoreToMessage",
            payload: { messageId, timestamp: msg.timestamp },
        });

        // Optimistically truncate messages in the UI
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx !== -1) {
            const truncated = messages.slice(0, idx + 1);
            useChatStore.setState({ messages: truncated });
        }
    }, [messages]);

    const formatTokens = (tokens: number): string => {
        if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + "M";
        if (tokens >= 1000) return (tokens / 1000).toFixed(1) + "K";
        return tokens.toString();
    };

    return (
        <ErrorBoundary>
            <div style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                background: "var(--vscode-editor-background)",
                color: "var(--vscode-editor-foreground)",
            }}>
                {/* Header */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--vscode-panel-border, #404040)",
                    background: "var(--vscode-sideBar-background)",
                    flexShrink: 0,
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "16px" }}>🧬</span>
                        <span style={{ fontWeight: 600, fontSize: "13px" }}>SHEN AI</span>
                        <span className={`status-dot ${isProcessing ? "thinking" : (settings.hasApiKey || settings.provider === "ollama" || settings.provider === "custom" ? "done" : "idle")}`} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {totalTokens > 0 && (
                            <span style={{
                                fontSize: "11px",
                                color: "var(--vscode-descriptionForeground)",
                                marginRight: "4px",
                            }}>
                                {formatTokens(totalTokens)} tokens
                            </span>
                        )}
                        <button
                            className={`btn-secondary ${showCheckpoints ? "active" : ""}`}
                            onClick={() => {
                                setShowCheckpoints(!showCheckpoints);
                                if (!showCheckpoints) {
                                    postMessage({ action: "task/getCheckpoints" });
                                }
                            }}
                            title="Checkpoints & Undo"
                            style={{ padding: "4px 8px", fontSize: "11px", background: showCheckpoints ? "var(--vscode-button-background)" : "transparent", color: showCheckpoints ? "var(--vscode-button-foreground)" : "inherit" }}
                        >
                            💾
                        </button>
                        <button
                            className={`btn-secondary ${showHistory ? "active" : ""}`}
                            onClick={() => setShowHistory(!showHistory)}
                            title="History"
                            style={{ padding: "4px 8px", fontSize: "11px", background: showHistory ? "var(--vscode-button-background)" : "transparent", color: showHistory ? "var(--vscode-button-foreground)" : "inherit" }}
                        >
                            ⏱️
                        </button>
                        <button
                            className="btn-secondary"
                            onClick={() => {
                                postMessage({ action: "task/undo" as any, payload: {} });
                            }}
                            title="Undo Last Code Edit"
                            style={{ padding: "4px 8px", fontSize: "11px", color: "var(--vscode-charts-yellow)" }}
                        >
                            ↩️
                        </button>
                        <button
                            className="btn-secondary"
                            onClick={() => {
                                postMessage({ action: "task/checkpoint" as any, payload: {} });
                            }}
                            title="Create Git Checkpoint"
                            style={{ padding: "4px 8px", fontSize: "11px", color: "var(--vscode-testing-iconPassed)" }}
                        >
                            💾
                        </button>
                        <button
                            className="btn-secondary"
                            onClick={() => {
                                if (confirm("Are you sure you want to clear/delete this chat?")) {
                                    handleClear();
                                }
                            }}
                            title="Clear Chat"
                            style={{ padding: "4px 8px", fontSize: "11px", color: "var(--vscode-errorForeground)" }}
                        >
                            🗑
                        </button>
                        <button
                            className="btn-secondary"
                            onClick={() => setShowSettings(!showSettings)}
                            title="Settings"
                            style={{ padding: "4px 8px", fontSize: "11px" }}
                        >
                            ⚙
                        </button>
                    </div>
                </div>

                {/* Settings Panel */}
                {showSettings && <SettingsPanel />}

                {/* History Panel */}
                {showHistory && <HistoryPanel />}

                {/* Checkpoint Timeline Panel */}
                {showCheckpoints && (
                    <CheckpointTimeline
                        tasks={checkpointTasks}
                        visible={showCheckpoints}
                    />
                )}

                {/* Error Banner */}
                {error && (
                    <div style={{
                        padding: "8px 12px",
                        background: "var(--vscode-inputValidation-errorBackground, #5a1d1d)",
                        border: "1px solid var(--vscode-inputValidation-errorBorder, #be1100)",
                        color: "var(--vscode-errorForeground)",
                        fontSize: "12px",
                        flexShrink: 0,
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>⚠ {error}</span>
                            <button
                                onClick={() => setError(null)}
                                style={{
                                    background: "none",
                                    border: "none",
                                    color: "inherit",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}

                {/* API Key Warning */}
                {!settings.hasApiKey && settings.provider !== "ollama" && (
                    <div style={{
                        padding: "8px 12px",
                        background: "var(--vscode-inputValidation-warningBackground, #352a05)",
                        border: "1px solid var(--vscode-inputValidation-warningBorder, #b89500)",
                        color: "var(--vscode-editorWarning-foreground)",
                        fontSize: "12px",
                        flexShrink: 0,
                    }}>
                        ⚠ No API key configured for {PROVIDER_LABELS[settings.provider]}.{" "}
                        <button
                            onClick={() => setShowSettings(true)}
                            style={{
                                background: "none",
                                border: "none",
                                color: "var(--vscode-textLink-foreground)",
                                cursor: "pointer",
                                textDecoration: "underline",
                                fontSize: "inherit",
                            }}
                        >
                            Configure settings
                        </button>
                    </div>
                )}

                {/* Messages Area */}
                <div style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "12px",
                }}>
                    {/* Welcome Screen */}
                    {showWelcome && messages.length === 0 && (
                        <WelcomePanel
                            onDismiss={handleDismissWelcome}
                            onOpenSettings={handleOpenSettings}
                            hasApiKey={settings.hasApiKey}
                            provider={PROVIDER_LABELS[settings.provider]}
                        />
                    )}

                    {/* Empty State */}
                    {!showWelcome && messages.length === 0 && (
                        <div style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "50%",
                            opacity: 0.5,
                            textAlign: "center"
                        }}>
                            <span style={{ fontSize: "32px", marginBottom: "16px" }}>👋</span>
                            <h3 style={{ margin: 0, fontWeight: "normal" }}>What are we working on today?</h3>
                            <p style={{ fontSize: "12px", marginTop: "8px" }}>SHEN AI is ready.</p>
                        </div>
                    )}

                    {/* Agent Status Panel */}
                    <AgentStatusPanel
                        agents={agentStatuses}
                        isOrchestrating={isOrchestrating}
                    />

                    {/* Messages */}
                    {messages.map((msg) => (
                        <div key={msg.id} className="animate-fade-in">
                            <MessageBubble
                                message={msg}
                                showUndo={msg.type === "user" && !isProcessing}
                                onUndoToHere={handleUndoToHere}
                            />
                        </div>
                    ))}

                    {/* Streaming content */}
                    {streamingContent && (
                        <div className="animate-fade-in">
                            <MessageBubble
                                message={{
                                    id: "streaming",
                                    type: "assistant",
                                    content: streamingContent,
                                    timestamp: Date.now(),
                                    isStreaming: true,
                                }}
                            />
                        </div>
                    )}

                    {/* Unified Activity Timeline — replaces activity feed, focus chain, tool calls, thinking state */}
                    <ActivityTimeline
                        isProcessing={isProcessing}
                        thinkingPhase={thinkingPhase}
                        currentToolCall={currentToolCall}
                        currentToolResult={currentToolResult}
                        streamingToolCalls={streamingToolCalls}
                        agentSteps={agentStatuses.map((a) => ({
                            id: a.role,
                            label: `${a.displayName || a.role}: ${a.currentTask || "Waiting"}`,
                            status: a.status === "done" ? "completed" : a.status === "error" ? "failed" : a.status === "working" || a.status === "thinking" ? "active" : "pending",
                        }))}
                    />

                    {/* Live File Preview — shows real-time code being written to files */}
                    <LiveFilePreview
                        streamingToolCalls={streamingToolCalls}
                        currentToolCall={currentToolCall}
                        isProcessing={isProcessing}
                    />

                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <ChatInput
                    value={inputText}
                    onChange={setInputText}
                    onSend={handleSend}
                    onCancel={handleCancel}
                    onClear={handleClear}
                    isProcessing={isProcessing}
                    isStreaming={isStreaming}
                />

                {/* Footer */}
                <div style={{
                    padding: "4px 12px",
                    fontSize: "10px",
                    color: "var(--vscode-descriptionForeground)",
                    textAlign: "center",
                    borderTop: "1px solid var(--vscode-panel-border, #404040)",
                    background: "var(--vscode-sideBar-background)",
                    flexShrink: 0,
                }}>
                    SHEN AI v0.1.0 • {PROVIDER_LABELS[settings.provider]} ({settings.model}) • {PERSONALITY_LABELS[settings.personality]}
                </div>
            </div>
        </ErrorBoundary>
    );
}