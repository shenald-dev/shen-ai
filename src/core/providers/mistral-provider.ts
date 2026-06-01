import { Mistral } from "@mistralai/mistralai";
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
// SHEN AI — Mistral Provider
// ============================================================

export class MistralProvider implements IProvider {
    readonly name = "mistral";
    readonly supportsTools = true;
    readonly supportsStreaming = true;

    private client: Mistral | null = null;
    private config: ProviderConfig | null = null;

    initialize(config: ProviderConfig): void {
        this.config = config;
        this.client = new Mistral({
            apiKey: config.apiKey,
        });
        logger.info(`Mistral provider initialized with model: ${config.model}`);
    }

    validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            errors.push("Mistral API key is required");
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
            throw new Error("Mistral provider not initialized. Call initialize() first.");
        }

        const mistralMessages = this.convertMessages(messages);

        const mistralTools = tools?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as unknown as Record<string, unknown>,
            },
        }));

        const response = await this.client.chat.complete({
            model: this.config.model,
            messages: mistralMessages as any,
            tools: mistralTools as any,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
        });

        const choice = response.choices?.[0];
        const message = choice?.message;

        const toolCalls: ProviderToolCall[] = [];
        if (message?.toolCalls) {
            for (const tc of message.toolCalls) {
                toolCalls.push({
                    id: tc.id || `mistral_tc_${Date.now()}_${toolCalls.length}`,
                    name: (tc.function as any)?.name || "",
                    arguments: (tc.function as any)?.arguments || "{}",
                });
            }
        }

        let contentStr = "";
        if (typeof message?.content === "string") {
            contentStr = message.content;
        } else if (Array.isArray(message?.content)) {
            contentStr = message.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join("");
        }

        return {
            content: contentStr,
            toolCalls,
            usage: {
                promptTokens: response.usage?.promptTokens || 0,
                completionTokens: response.usage?.completionTokens || 0,
                totalTokens: response.usage?.totalTokens || 0,
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
            throw new Error("Mistral provider not initialized. Call initialize() first.");
        }

        const mistralMessages = this.convertMessages(messages);

        const mistralTools = tools?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as unknown as Record<string, unknown>,
            },
        }));

        const stream = await this.client.chat.stream({
            model: this.config.model,
            messages: mistralMessages as any,
            tools: mistralTools as any,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
        });

        let fullContent = "";
        const toolCalls: ProviderToolCall[] = [];
        const toolCallBuffers: Record<string, string> = {};
        let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        for await (const chunk of stream) {
            const data = chunk.data;
            const delta = data.choices?.[0]?.delta;

            if (delta?.content) {
                let text = "";
                if (typeof delta.content === "string") {
                    text = delta.content;
                } else if (Array.isArray(delta.content)) {
                    text = delta.content.map((c: any) => (typeof c === "string" ? c : c.text || "")).join("");
                }
                fullContent += text;
                onChunk({
                    content: text,
                    isComplete: false,
                });
            }

            if ((delta as any)?.tool_calls) {
                const tcList = (delta as any).tool_calls;
                for (const tc of tcList) {
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

            if (data.usage) {
                usage = {
                    promptTokens: data.usage.promptTokens || 0,
                    completionTokens: data.usage.completionTokens || 0,
                    totalTokens: data.usage.totalTokens || 0,
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
}