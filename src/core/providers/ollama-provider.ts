import { Ollama } from "ollama";
import type {
    ProviderConfig,
    ProviderMessage,
    ProviderResponse,
    ProviderToolCall,
    StreamingChunk,
    ToolDefinition,
} from "../../types";
import type { IProvider, StreamingCallback } from "./provider-interface";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Ollama Provider (Local Models)
// ============================================================

export class OllamaProvider implements IProvider {
    readonly name = "ollama";
    readonly supportsTools = true;
    readonly supportsStreaming = true;

    private client: Ollama | null = null;
    private config: ProviderConfig | null = null;

    initialize(config: ProviderConfig): void {
        this.config = config;
        this.client = new Ollama({
            host: config.baseUrl || "http://localhost:11434",
        });
        logger.info(`Ollama provider initialized with model: ${config.model} at ${config.baseUrl}`);
    }

    validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!config.model || config.model.trim().length === 0) {
            errors.push("Model name is required for Ollama");
        }
        if (!config.baseUrl || config.baseUrl.trim().length === 0) {
            errors.push("Ollama base URL is required");
        }
        return { valid: errors.length === 0, errors };
    }

    async sendMessage(
        messages: ProviderMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse> {
        if (!this.client || !this.config) {
            throw new Error("Ollama provider not initialized. Call initialize() first.");
        }

        const ollamaMessages = this.convertMessages(messages);

        const ollamaTools = tools?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));

        const response = await this.client.chat({
            model: this.config.model,
            messages: ollamaMessages,
            tools: ollamaTools,
            options: {
                temperature: this.config.temperature,
                num_predict: this.config.maxTokens,
            },
        });

        const message = response.message;
        const toolCalls: ProviderToolCall[] = [];

        if (message.tool_calls) {
            for (const tc of message.tool_calls) {
                toolCalls.push({
                    id: `ollama_tc_${Date.now()}_${toolCalls.length}`,
                    name: tc.function.name,
                    arguments: JSON.stringify(tc.function.arguments || {}),
                });
            }
        }

        return {
            content: message.content || "",
            toolCalls,
            usage: {
                promptTokens: response.prompt_eval_count || 0,
                completionTokens: response.eval_count || 0,
                totalTokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
            },
            stopReason: toolCalls.length > 0 ? "tool_use" : "stop",
        };
    }

    async sendMessageStreaming(
        messages: ProviderMessage[],
        onChunk: StreamingCallback,
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse> {
        if (!this.client || !this.config) {
            throw new Error("Ollama provider not initialized. Call initialize() first.");
        }

        const ollamaMessages = this.convertMessages(messages);

        const ollamaTools = tools?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));

        const stream = await this.client.chat({
            model: this.config.model,
            messages: ollamaMessages,
            tools: ollamaTools,
            stream: true,
            options: {
                temperature: this.config.temperature,
                num_predict: this.config.maxTokens,
            },
        });

        let fullContent = "";
        const toolCalls: ProviderToolCall[] = [];
        let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        for await (const chunk of stream) {
            if (chunk.message?.content) {
                fullContent += chunk.message.content;
                onChunk({
                    content: chunk.message.content,
                    isComplete: false,
                });
            }

            if (chunk.message?.tool_calls) {
                for (const tc of chunk.message.tool_calls) {
                    toolCalls.push({
                        id: `ollama_tc_${Date.now()}_${toolCalls.length}`,
                        name: tc.function.name,
                        arguments: JSON.stringify(tc.function.arguments || {}),
                    });
                }
            }

            if (chunk.done) {
                usage = {
                    promptTokens: chunk.prompt_eval_count || 0,
                    completionTokens: chunk.eval_count || 0,
                    totalTokens: (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
                };
            }
        }

        onChunk({
            content: "",
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            isComplete: true,
            usage,
        });

        return {
            content: fullContent,
            toolCalls,
            usage,
            stopReason: toolCalls.length > 0 ? "tool_use" : "stop",
        };
    }

    formatToolResult(toolCallId: string, result: string): ProviderMessage {
        return {
            role: "tool",
            content: result,
            tool_call_id: toolCallId,
        };
    }

    formatToolCalls(toolCalls: ProviderToolCall[]): string {
        return toolCalls
            .map((tc) => `[Tool: ${tc.name}] ${tc.arguments}`)
            .join("\n");
    }

    private convertMessages(messages: ProviderMessage[]): Array<{ role: string; content: string }> {
        return messages.map((msg) => ({
            role: msg.role === "system" ? "system" : msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
        }));
    }
}