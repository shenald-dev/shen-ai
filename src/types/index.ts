// ============================================================
// SHEN AI — Shared Type Definitions
// ============================================================

// --- Provider Types ---

export type ProviderName =
    | "openai"
    | "anthropic"
    | "google"
    | "ollama"
    | "azure"
    | "groq"
    | "mistral"
    | "custom";

export interface ProviderConfig {
    provider: ProviderName;
    model: string;
    apiKey: string;
    baseUrl?: string;
    temperature: number;
    maxTokens: number;
}

export interface ProviderMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    name?: string;
}

export interface ProviderToolCall {
    id: string;
    name: string;
    arguments: string;
}

export interface ProviderResponse {
    content: string;
    toolCalls: ProviderToolCall[];
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    stopReason: "stop" | "tool_use" | "max_tokens" | "error";
}

export interface StreamingChunk {
    content: string;
    toolCalls?: ProviderToolCall[];
    isComplete: boolean;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

// --- Tool Types ---

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
}

export interface ToolParameterSchema {
    type: "object";
    properties: Record<string, ToolProperty>;
    required: string[];
}

export interface ToolProperty {
    type: string;
    description: string;
    enum?: string[];
    items?: { type: string };
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

export interface ToolResult {
    toolCallId: string;
    name: string;
    content: string;
    isError: boolean;
}

// --- Message Types (Chat) ---

export type MessageType = "user" | "assistant" | "system" | "tool" | "error" | "info";

export interface ChatMessage {
    id: string;
    type: MessageType;
    content: string;
    timestamp: number;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
    isStreaming?: boolean;
    tokensUsed?: number;
}

// --- Agent Types ---

export type AgentRole =
    | "orchestrator"
    | "coder"
    | "architect"
    | "debugger"
    | "terminal"
    | "researcher"
    | "reviewer";

export interface AgentState {
    role: AgentRole;
    status: "idle" | "thinking" | "working" | "waiting" | "done" | "error";
    currentTask?: string;
    progress?: number;
}

// --- Personality Types ---

export type PersonalityType =
    | "mentor"
    | "senior-dev"
    | "hacker"
    | "reviewer"
    | "socratic"
    | "silent-partner";

export interface PersonalityProfile {
    name: PersonalityType;
    displayName: string;
    description: string;
    systemPrompt: string;
    tone: string;
    verbosity: "low" | "medium" | "high";
}

// --- Webview Message Types ---

export type WebviewMessageAction =
    | "chat/send"
    | "chat/cancel"
    | "chat/clear"
    | "settings/update"
    | "settings/get"
    | "task/new"
    | "feedback/correction"
    | "onboarding/dismiss"
    | "chat/getHistory"
    | "chat/loadHistory"
    | "chat/deleteHistory"
    | "task/checkpoint"
    | "task/undo"
    | "task/undoTask"
    | "task/restoreCheckpoint"
    | "task/getCheckpoints"
    | "task/restoreToMessage"
    | "settings/testConnection";

export interface WebviewMessage {
    action: WebviewMessageAction;
    payload?: unknown;
}

export type ExtensionMessageAction =
    | "chat/response"
    | "chat/streaming"
    | "chat/toolCall"
    | "chat/toolResult"
    | "chat/error"
    | "chat/done"
    | "settings/sync"
    | "agent/status"
    | "token/usage"
    | "onboarding/state"
    | "chat/historyList"
    | "settings/testConnectionResult";

export interface ExtensionMessage {
    action: ExtensionMessageAction;
    payload?: unknown;
}

// --- Configuration Types ---

export interface ShenConfig {
    provider: ProviderName;
    model: string;
    openaiApiKey: string;
    anthropicApiKey: string;
    googleApiKey: string;
    groqApiKey: string;
    mistralApiKey: string;
    azureApiKey: string;
    azureEndpoint: string;
    ollamaBaseUrl: string;
    customBaseUrl: string;
    customApiKey: string;
    customModel: string;
    temperature: number;
    maxTokens: number;
    maxContextTokens: number;
    personality: PersonalityType;
    autoApplyChanges: boolean;
    enablePredictiveIntent: boolean;
    enableGhostMode: boolean;
    enableSelfEvolvingPrompts: boolean;
    // Real Features (Working Implementations)
    enableCodeDNAProfiling: boolean;
    enableSmartCheckpointRollback: boolean;
    enableBlastRadiusAnalyzer: boolean;
    enableCodeValidator: boolean;
    enableConversationSummarizer: boolean;
}

// --- Conversation Types ---

export interface Conversation {
    id: string;
    title: string;
    messages: ChatMessage[];
    createdAt: number;
    updatedAt: number;
    providerConfig: ProviderConfig;
    totalTokens: number;
}

// --- File Types ---

export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    lastModified?: number;
}

export interface FileReadResult {
    content: string;
    path: string;
    lineCount: number;
}

// --- Correction / Evolution Types ---

export interface Correction {
    id: string;
    timestamp: number;
    originalCode: string;
    correctedCode: string;
    file: string;
    pattern?: string;
    lesson?: string;
}

export interface Lesson {
    id: string;
    pattern: string;
    rule: string;
    examples: string[];
    appliedCount: number;
    createdAt: number;
}

// --- Checkpoint / Undo Types ---

export interface FileSnapshot {
    filePath: string;
    content: string | null; // null means file didn't exist before
    timestamp: number;
}

export interface FileChange {
    id: string;
    filePath: string;
    beforeContent: string | null;
    afterContent: string | null;
    toolName: string;
    timestamp: number;
}

export interface Checkpoint {
    id: string;
    taskId: string;
    label: string;
    timestamp: number;
    gitCommit?: string;
    fileChanges: FileChange[];
    isAutoCheckpoint: boolean;
}

export interface TaskChangeGroup {
    id: string;
    label: string;
    conversationId: string;
    createdAt: number;
    updatedAt: number;
    checkpoints: Checkpoint[];
    fileChanges: FileChange[];
    isActive: boolean;
}

export interface CheckpointManagerStats {
    totalTasks: number;
    totalCheckpoints: number;
    totalFileChanges: number;
    activeTaskId: string | null;
}

// --- Utility Types ---

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    maxTokens: number;
    percentageUsed: number;
}

// --- Blast Radius Types ---

export interface DependencyInfo {
    file: string;
    importedSymbols: string[];
    importType: "default" | "named" | "namespace";
}

export interface BlastRadius {
    filePath: string;
    directDependents: DependencyInfo[];
    indirectDependents: DependencyInfo[];
    riskLevel: "low" | "medium" | "high" | "critical";
    totalDependents: number;
}

// --- Code Validator Types ---

export interface ValidationIssue {
    line: number;
    column: number;
    severity: "error" | "warning" | "info";
    message: string;
    rule: string;
}

export interface ValidationResult {
    isValid: boolean;
    issues: ValidationIssue[];
    errorCount: number;
    warningCount: number;
    filePath: string;
    timestamp: number;
}

// --- Conversation Summarizer Types ---

export interface ConversationSummary {
    id: string;
    conversationId: string;
    originalMessageCount: number;
    summaryMessageCount: number;
    tokensSaved: number;
    keyDecisions: string[];
    filesModified: string[];
    codePatterns: string[];
    summary: string;
    createdAt: number;
}
