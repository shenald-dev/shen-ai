import type {
    ProviderConfig,
    ProviderMessage,
    ProviderResponse,
    ProviderToolCall,
    StreamingChunk,
    ToolDefinition,
} from "../../types";

// ============================================================
// SHEN AI — Provider Interface (Abstract)
// ============================================================

export type StreamingCallback = (chunk: StreamingChunk) => void;

export interface IProvider {
    readonly name: string;
    readonly supportsTools: boolean;
    readonly supportsStreaming: boolean;

    initialize(config: ProviderConfig): void;
    validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] };

    sendMessage(
        messages: ProviderMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse>;

    sendMessageStreaming(
        messages: ProviderMessage[],
        onChunk: StreamingCallback,
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse>;

    formatToolResult(toolCallId: string, result: string): ProviderMessage;
    formatToolCalls(toolCalls: ProviderToolCall[]): string;
}