import Groq from "groq-sdk";
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
// SHEN AI — Groq Provider (Ultra-Fast Inference)
// ============================================================

export class GroqProvider implements IProvider {
    readonly name = "groq";
    readonly supportsTools = true;
    readonly supportsStreaming = true;

    private client: Groq | null = null;
    private config: ProviderConfig | null = null;

    initialize(config: ProviderConfig): void {
        this.config = config;
        this.client = new Groq({
            apiKey: config.apiKey,
        });
        logger.info(`Groq provider initialized with model: ${config.model}`);
    }

    validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            errors.push("Groq API key is required");
        }
        if (!config.model || config.model.trim().length === 0) {
            errors.push("Model name is required");
        }
        return { valid: errors.length === 0, errors };
    }

    async sendMessage(
        messages: ProviderMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse> {
        if (!this.client || !this.config) {
            throw new Error("Groq provider not initialized. Call initialize() first.");
        }

        const groqMessages = this.convertMessages(messages);

        const groqTools = tools?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as unknown as Record<string, unknown>,
            },
        }));

        const response = await this.client.chat.completions.create({
            model: this.config.model,
            messages: groqMessages,
            tools: groqTools as any,
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
        });

        const choice = response.choices[0];
        const message = choice?.message;

        const toolCalls: ProviderToolCall[] =
            message?.tool_calls?.map((tc: any) => ({
                id: tc.id,
                name: tc.function.name,
                arguments: tc.function.arguments,
            })) || [];

        return {
            content: message?.content || "",
            toolCalls,
            usage: {
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
            },
            stopReason: this.mapFinishReason(choice?.finish_reason),
        };
    }

    async sendMessageStreaming(
        messages: ProviderMessage[],
        onChunk: StreamingCallback,
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse> {
        if (!this.client || !this.config) {
            throw new Error("Groq provider not initialized. Call initialize() first.");
        }

        const groqMessages = this.convertMessages(messages);

        const groqTools = tools?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as unknown as Record<string, unknown>,
            },
        }));

        const stream = await this.client.chat.completions.create({
            model: this.config.model,
            messages: groqMessages,
            tools: groqTools as any,
            temperature: this.config.temperature,
            max_tokens: this.config.maxTokens,
            stream: true,
        });

        let fullContent = "";
        const toolCalls: ProviderToolCall[] = [];
        const toolCallBuffers: Record<string, string> = {};
        let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;

            if (delta?.content) {
                fullContent += delta.content;
                onChunk({
                    content: delta.content,
                    isComplete: false,
                });
            }

            if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (tc.id && !toolCallBuffers[idx.toString()]) {
                        toolCallBuffers[idx.toString()] = "";
                        toolCalls.push({
                            id: tc.id,
                            name: tc.function?.name || "",
                            arguments: "",
                        });
                    }
                    if (tc.function?.arguments) {
                        toolCallBuffers[idx.toString()] += tc.function.arguments;
                        toolCalls[idx] = {
                            ...toolCalls[idx],
                            arguments: toolCallBuffers[idx.toString()],
                        };
                    }
                }
            }

            if ((chunk as any).x_groq?.usage) {
                const groqUsage = (chunk as any).x_groq.usage;
                usage = {
                    promptTokens: groqUsage.prompt_tokens || 0,
                    completionTokens: groqUsage.completion_tokens || 0,
                    totalTokens: groqUsage.total_tokens || 0,
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

    private convertMessages(messages: ProviderMessage[]): any[] {
        return messages.map((msg) => {
            if (msg.role === "system") {
                return { role: "system", content: msg.content };
            }
            if (msg.role === "user") {
                return { role: "user", content: msg.content };
            }
            if (msg.role === "assistant") {
                return { role: "assistant", content: msg.content };
            }
            if (msg.role === "tool") {
                return {
                    role: "tool",
                    content: msg.content,
                    tool_call_id: msg.tool_call_id || "",
                };
            }
            return { role: "user", content: msg.content };
        });
    }

    private mapFinishReason(reason: string | null | undefined): ProviderResponse["stopReason"] {
        switch (reason) {
            case "stop":
                return "stop";
            case "tool_calls":
                return "tool_use";
            case "length":
                return "max_tokens";
            default:
                return "stop";
        }
    }
}