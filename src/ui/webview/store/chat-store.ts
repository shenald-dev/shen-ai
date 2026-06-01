import { create } from "zustand";
import type {
    ChatMessage,
    ToolCall,
    ToolResult,
    PersonalityType,
    ProviderName,
} from "../../../types";
import type { AgentStatus } from "../components/AgentStatusPanel";

// ============================================================
// SHEN AI — Chat Store (Zustand State Management)
// ============================================================

interface SettingsState {
    provider: ProviderName;
    model: string;
    temperature: number;
    maxTokens: number;
    personality: PersonalityType;
    autoApplyChanges: boolean;
    enablePredictiveIntent: boolean;
    enableGhostMode: boolean;
    enableSelfEvolvingPrompts: boolean;
    hasApiKey: boolean;
    customBaseUrl: string;
    agentMode: "act" | "plan";
    // 10 Unique Features
    enableNeuralContextWeaving: boolean;
    enableTemporalMemory: boolean;
    enableCodeDNAProfiling: boolean;
    enablePredictiveErrorShield: boolean;
    enableAutonomousRefactoring: boolean;
    enableMultiModalReasoning: boolean;
    enableIntentCascade: boolean;
    enableLiveCodeMirroring: boolean;
    enableSmartCheckpointRollback: boolean;
    enableContextualWhisper: boolean;
}

export type { AgentStatus };

export interface CheckpointTaskEntry {
    id: string;
    label: string;
    isActive: boolean;
    checkpoints: any[];
    fileChanges: any[];
    createdAt: number;
    [key: string]: unknown;
}

interface ChatState {
    // Messages
    messages: ChatMessage[];
    streamingContent: string;
    isStreaming: boolean;
    isProcessing: boolean;
    currentToolCall: ToolCall | null;
    currentToolResult: ToolResult | null;
    totalTokens: number;

    // UI State
    showSettings: boolean;
    showHistory: boolean;
    showCheckpoints: boolean;
    showWelcome: boolean;
    inputText: string;
    activeFile: string | null;
    inlineContext: { filePath: string; selection: string } | null;
    quickQuestion: string | null;
    error: string | null;

    // Agent & Orchestration State
    agentStatuses: AgentStatus[];
    isOrchestrating: boolean;
    streamingToolCalls: any[];
    thinkingPhase: string;
    checkpointTasks: CheckpointTaskEntry[];

    // Actions
    addMessage: (message: ChatMessage) => void;
    setStreamingContent: (content: string) => void;
    appendStreamingContent: (chunk: string) => void;
    finishStreaming: () => void;
    setProcessing: (processing: boolean) => void;
    setCurrentToolCall: (toolCall: ToolCall | null) => void;
    setCurrentToolResult: (result: ToolResult | null) => void;
    setTotalTokens: (tokens: number) => void;
    setShowSettings: (show: boolean) => void;
    setShowHistory: (show: boolean) => void;
    setShowCheckpoints: (show: boolean) => void;
    setShowWelcome: (show: boolean) => void;
    setInputText: (text: string) => void;
    setActiveFile: (file: string | null) => void;
    setInlineContext: (context: { filePath: string; selection: string } | null) => void;
    setQuickQuestion: (question: string | null) => void;
    setError: (error: string | null) => void;
    clearMessages: () => void;
    updateSettings: (settings: Partial<SettingsState>) => void;
    setAgentStatuses: (statuses: AgentStatus[]) => void;
    setIsOrchestrating: (orchestrating: boolean) => void;
    setStreamingToolCalls: (toolCalls: any[]) => void;
    setThinkingPhase: (phase: string) => void;
    setCheckpointTasks: (tasks: CheckpointTaskEntry[]) => void;
    resetStreamingState: () => void;
    truncateMessagesAfter: (messageId: string) => void;
}

export const useChatStore = create<ChatState & { settings: SettingsState }>((set) => ({
    settings: {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        temperature: 0,
        maxTokens: 8192,
        personality: "senior-dev",
        autoApplyChanges: false,
        enablePredictiveIntent: false,
        enableGhostMode: false,
        enableSelfEvolvingPrompts: true,
        hasApiKey: false,
        customBaseUrl: "",
        agentMode: "plan",
        // 10 Unique Features
        enableNeuralContextWeaving: true,
        enableTemporalMemory: false,
        enableCodeDNAProfiling: true,
        enablePredictiveErrorShield: true,
        enableAutonomousRefactoring: false,
        enableMultiModalReasoning: true,
        enableIntentCascade: true,
        enableLiveCodeMirroring: true,
        enableSmartCheckpointRollback: true,
        enableContextualWhisper: false,
    },

    messages: [],
    streamingContent: "",
    isStreaming: false,
    isProcessing: false,
    currentToolCall: null,
    currentToolResult: null,
    totalTokens: 0,

    showSettings: false,
    showHistory: false,
    showCheckpoints: false,
    showWelcome: true,
    inputText: "",
    activeFile: null,
    inlineContext: null,
    quickQuestion: null,
    error: null,

    agentStatuses: [],
    isOrchestrating: false,
    streamingToolCalls: [],
    thinkingPhase: "",
    checkpointTasks: [],

    addMessage: (message) =>
        set((state) => ({
            messages: [...state.messages, message],
        })),

    setStreamingContent: (content) =>
        set({ streamingContent: content, isStreaming: true }),

    appendStreamingContent: (chunk) =>
        set((state) => ({
            streamingContent: state.streamingContent + chunk,
            isStreaming: true,
        })),

    finishStreaming: () =>
        set((state) => {
            if (state.streamingContent.trim().length > 0) {
                const msg: ChatMessage = {
                    id: crypto.randomUUID(),
                    type: "assistant",
                    content: state.streamingContent,
                    timestamp: Date.now(),
                };
                return {
                    messages: [...state.messages, msg],
                    streamingContent: "",
                    isStreaming: false,
                    isProcessing: false,
                };
            }
            return {
                streamingContent: "",
                isStreaming: false,
                isProcessing: false,
            };
        }),

    setProcessing: (processing) => set({ isProcessing: processing }),

    setCurrentToolCall: (toolCall) => set({ currentToolCall: toolCall }),

    setCurrentToolResult: (result) => set({ currentToolResult: result }),

    setTotalTokens: (tokens) => set({ totalTokens: tokens }),

    setShowSettings: (show) => set({ showSettings: show, showHistory: false }),
    setShowHistory: (show) => set({ showHistory: show, showSettings: false }),
    setShowCheckpoints: (show) => set({ showCheckpoints: show }),
    setShowWelcome: (show) => set({ showWelcome: show }),

    setInputText: (text) => set({ inputText: text }),

    setActiveFile: (file) => set({ activeFile: file }),

    setInlineContext: (context) => set({ inlineContext: context }),

    setQuickQuestion: (question) => set({ quickQuestion: question }),

    setError: (error) => set({ error }),

    clearMessages: () =>
        set({
            messages: [],
            streamingContent: "",
            isStreaming: false,
            isProcessing: false,
            totalTokens: 0,
            error: null,
        }),

    updateSettings: (settings) =>
        set((state) => ({
            settings: { ...state.settings, ...settings },
        })),

    setAgentStatuses: (statuses) => set({ agentStatuses: statuses }),
    setIsOrchestrating: (orchestrating) => set({ isOrchestrating: orchestrating }),
    setStreamingToolCalls: (toolCalls) => set({ streamingToolCalls: toolCalls }),
    setThinkingPhase: (phase) => set({ thinkingPhase: phase }),
    setCheckpointTasks: (tasks) => set({ checkpointTasks: tasks }),

    resetStreamingState: () =>
        set({
            streamingContent: "",
            isStreaming: false,
            isProcessing: false,
            streamingToolCalls: [],
            thinkingPhase: "",
            currentToolCall: null,
            currentToolResult: null,
        }),

    truncateMessagesAfter: (messageId) =>
        set((state) => {
            const idx = state.messages.findIndex((m) => m.id === messageId);
            if (idx !== -1) {
                return { messages: state.messages.slice(0, idx + 1) };
            }
            return {};
        }),
}));
