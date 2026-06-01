import React from "react";

// ============================================================
// SHEN AI — Agent Status Panel
// Real-time visualization of which agents are working,
// their current tasks, and progress.
// ============================================================

export interface AgentStatus {
    role: string;
    displayName: string;
    icon: string;
    status: "idle" | "thinking" | "working" | "waiting" | "done" | "error";
    currentTask?: string;
    progress?: number;
    color: string;
}

interface AgentStatusPanelProps {
    agents: AgentStatus[];
    isOrchestrating: boolean;
    strategy?: "sequential" | "parallel" | "pipeline";
    onAgentClick?: (role: string) => void;
}

const AGENT_CONFIGS: Record<string, Partial<AgentStatus>> = {
    orchestrator: { displayName: "Orchestrator", icon: "🎯", color: "#e06c75" },
    architect: { displayName: "Architect", icon: "🏗️", color: "#61afef" },
    coder: { displayName: "Coder", icon: "💻", color: "#98c379" },
    debugger: { displayName: "Debugger", icon: "🐛", color: "#e5c07b" },
    reviewer: { displayName: "Reviewer", icon: "🔍", color: "#c678dd" },
    researcher: { displayName: "Researcher", icon: "📚", color: "#56b6c2" },
    terminal: { displayName: "Terminal", icon: "⚡", color: "#d19a66" },
};

const STATUS_LABELS: Record<string, string> = {
    idle: "Idle",
    thinking: "Thinking...",
    working: "Working...",
    waiting: "Waiting...",
    done: "Done ✓",
    error: "Error ✗",
};

const STATUS_COLORS: Record<string, string> = {
    idle: "#666",
    thinking: "#61afef",
    working: "#98c379",
    waiting: "#e5c07b",
    done: "#98c379",
    error: "#e06c75",
};

export const AgentStatusPanel: React.FC<AgentStatusPanelProps> = ({
    agents,
    isOrchestrating,
    strategy,
    onAgentClick,
}) => {
    if (agents.length === 0 && !isOrchestrating) {
        return null;
    }

    return (
        <div className="agent-status-panel">
            <div className="agent-status-header">
                <span className="agent-status-title">
                    {isOrchestrating ? "🐝 Agents Working" : "🤖 Agent Status"}
                </span>
                {strategy && isOrchestrating && (
                    <span className="agent-strategy-badge">{strategy}</span>
                )}
            </div>

            <div className="agent-grid">
                {agents.map((agent) => {
                    const config = AGENT_CONFIGS[agent.role] || {};
                    const displayName = agent.displayName || config.displayName || agent.role;
                    const icon = agent.icon || config.icon || "🤖";
                    const color = agent.color || config.color || "#666";
                    const isActive = agent.status === "thinking" || agent.status === "working";

                    return (
                        <div
                            key={agent.role}
                            className={`agent-card ${agent.status} ${isActive ? "active" : ""}`}
                            onClick={() => onAgentClick?.(agent.role)}
                            style={{ borderColor: isActive ? color : "transparent" }}
                        >
                            <div className="agent-card-header">
                                <span className="agent-icon">{icon}</span>
                                <span className="agent-name">{displayName}</span>
                                <span
                                    className="agent-status-dot"
                                    style={{ backgroundColor: STATUS_COLORS[agent.status] }}
                                />
                            </div>

                            <div className="agent-status-label">
                                {STATUS_LABELS[agent.status] || agent.status}
                            </div>

                            {agent.currentTask && (
                                <div className="agent-task">{agent.currentTask}</div>
                            )}

                            {agent.progress !== undefined && agent.progress > 0 && (
                                <div className="progress-bar-enhanced">
                                    <div
                                        className="progress-bar-fill"
                                        style={{
                                            width: `${agent.progress}%`,
                                            backgroundColor: color,
                                        }}
                                    />
                                </div>
                            )}

                            {isActive && (
                                <div className="agent-pulse" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
