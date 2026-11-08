import React, { useEffect, useState } from "react";
import { useChatStore } from "../store/chat-store";
import { postMessage } from "../vscode-api";

// ============================================================
// SHEN AI — History Panel Component
// Displays past conversations with load/delete functionality
// ============================================================

interface ConversationMeta {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    totalTokens: number;
}

function HistoryPanel(): JSX.Element {
    const { setShowHistory, clearMessages } = useChatStore();
    const [history, setHistory] = useState<ConversationMeta[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        postMessage({ action: "chat/getHistory" as any, payload: {} });

        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.action === "chat/historyList") {
                setHistory(message.payload);
                setLoading(false);
            } else if (message.action === "chat/done" && message.payload?.loaded) {
                setShowHistory(false);
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [setShowHistory]);

    const handleLoadConversation = (id: string) => {
        clearMessages();
        postMessage({ action: "chat/loadHistory" as any, payload: { id } });
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    };

    return (
        <div style={{
            position: "absolute",
            top: "40px",
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--vscode-editor-background)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            borderTop: "1px solid var(--vscode-panel-border, #404040)",
        }}>
            <div style={{
                padding: "16px",
                borderBottom: "1px solid var(--vscode-panel-border, #404040)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
            }}>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>Conversation History</h3>
                <button
                    onClick={() => setShowHistory(false)}
                    style={{
                        background: "none",
                        border: "none",
                        color: "var(--vscode-descriptionForeground)",
                        cursor: "pointer",
                        fontSize: "16px",
                    }}
                >
                    ✕
                </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
                {loading ? (
                    <div style={{ textAlign: "center", color: "var(--vscode-descriptionForeground)", marginTop: "20px" }}>
                        Loading history...
                    </div>
                ) : history.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--vscode-descriptionForeground)", marginTop: "20px" }}>
                        No past conversations found.
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {history.map((conv) => (
                            <HistoryItem key={conv.id} conv={conv} onSelect={handleLoadConversation} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function HistoryItem({ conv, onSelect }: { conv: ConversationMeta; onSelect: (id: string) => void }) {
    const [showConfirm, setShowConfirm] = useState(false);

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (showConfirm) {
            postMessage({ action: "chat/deleteHistory" as any, payload: { id: conv.id } });
        } else {
            setShowConfirm(true);
            setTimeout(() => setShowConfirm(false), 3000);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });
    };

    return (
        <div
            onClick={() => onSelect(conv.id)}
            style={{
                padding: "12px",
                background: showConfirm
                    ? "var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.1))"
                    : "var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))",
                border: showConfirm
                    ? "1px solid var(--vscode-inputValidation-errorBorder, red)"
                    : "1px solid var(--vscode-panel-border, #404040)",
                borderRadius: "6px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                position: "relative",
            }}
            onMouseEnter={(e) => {
                if (!showConfirm) e.currentTarget.style.background = "var(--vscode-list-hoverBackground)";
            }}
            onMouseLeave={(e) => {
                if (!showConfirm)
                    e.currentTarget.style.background =
                        "var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.1))";
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div
                    style={{
                        fontWeight: 600,
                        fontSize: "13px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        paddingRight: "24px",
                    }}
                >
                    {conv.title}
                </div>
                <button
                    onClick={handleDelete}
                    title={showConfirm ? "Click again to confirm delete" : "Delete chat"}
                    style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        background: showConfirm ? "var(--vscode-button-background)" : "transparent",
                        color: showConfirm
                            ? "var(--vscode-button-foreground)"
                            : "var(--vscode-descriptionForeground)",
                        border: "none",
                        borderRadius: "4px",
                        padding: "4px 8px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: showConfirm ? "bold" : "normal",
                    }}
                    onMouseEnter={(e) => {
                        if (!showConfirm) e.currentTarget.style.color = "var(--vscode-errorForeground)";
                    }}
                    onMouseLeave={(e) => {
                        if (!showConfirm)
                            e.currentTarget.style.color = "var(--vscode-descriptionForeground)";
                    }}
                >
                    {showConfirm ? "Confirm Delete" : "🗑"}
                </button>
            </div>
            {showConfirm && (
                <div style={{ color: "var(--vscode-errorForeground)", fontSize: "11px", marginTop: "2px" }}>
                    ⚠ Are you sure you want to delete this chat?
                </div>
            )}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "var(--vscode-descriptionForeground)",
                }}
            >
                <span>{formatDate(conv.updatedAt)}</span>
                <span>{conv.totalTokens} tokens</span>
            </div>
        </div>
    );
}

export default HistoryPanel;