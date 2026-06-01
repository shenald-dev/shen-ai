import OpenAI from "openai";
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
// SHEN AI — Azure OpenAI Provider
// ============================================================

export class AzureProvider implements IProvider {
    readonly name = "azure";
    readonly supportsTools = true;
    readonly supportsStreaming = true;

    private client: OpenAI | null = null;
    private config: ProviderConfig | null = null;

    initialize(config: ProviderConfig): void {
        this.config = config;
        if (!config.baseUrl) {
            throw new Error("Azure provider requires an endpoint URL (baseUrl)");
        }

        // Azure OpenAI uses a specific base URL format:
        // https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version={version}
        // The OpenAI SDK handles this when we provide the endpoint and API key
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseUrl,
            defaultQuery: { "api-version": "2024-02-15-preview" },
            defaultHeaders: { "api-key": config.apiKey },
        });
        logger.info(`Azure provider initialized with model/deployment: ${config.model}`);
    }

    validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            errors.push("Azure API key is required");
        }
        if (!config.model || config.model.trim().length === 0) {
            errors.push("Deployment name (model) is required for Azure");
        }
        if (!config.baseUrl || config.baseUrl.trim().length === 0) {
            errors.push("Azure endpoint URL is required");
        }
        return { valid: errors.length === 0, errors };
    }

    async sendMessage(
        messages: ProviderMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse> {
        if (!this.client || !this.config) {
            throw new Error("Azure provider not initialized. Call initialize() first.");
        }

        const azureMessages = this.convertMessages(messages);

        const azureTools = tools?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as unknown as Record<string, unknown>,
            },
        }));

        const response = await this.client.chat.completions.create(
            {
                model: this.config.model,
                messages: azureMessages,
                tools: azureTools as any,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
            },
            { signal: abortSignal }
        );

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
            throw new Error("Azure provider not initialized. Call initialize() first.");
        }

        const azureMessages = this.convertMessages(messages);

        const azureTools = tools?.map((t) => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as unknown as Record<string, unknown>,
            },
        }));

        const stream = await this.client.chat.completions.create(
            {
                model: this.config.model,
                messages: azureMessages,
                tools: azureTools as any,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
                stream: true,
                stream_options: { include_usage: true },
            },
            { signal: abortSignal }
        );

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

            if (chunk.usage) {
                usage = {
                    promptTokens: chunk.usage.prompt_tokens,
                    completionTokens: chunk.usage.completion_tokens,
                    totalTokens: chunk.usage.total_tokens,
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

    private convertMessages(messages: ProviderMessage[]): OpenAI.ChatCompletionMessageParam[] {
        return messages.map((msg) => {
            if (msg.role === "system") {
                return { role: "system", content: msg.content } as OpenAI.ChatCompletionSystemMessageParam;
            }
            if (msg.role === "user") {
                return { role: "user", content: msg.content } as OpenAI.ChatCompletionUserMessageParam;
            }
            if (msg.role === "assistant") {
                return { role: "assistant", content: msg.content } as OpenAI.ChatCompletionAssistantMessageParam;
            }
            if (msg.role === "tool") {
                return {
                    role: "tool",
                    content: msg.content,
                    tool_call_id: msg.tool_call_id || "",
                } as OpenAI.ChatCompletionToolMessageParam;
            }
            return { role: "user", content: msg.content } as OpenAI.ChatCompletionUserMessageParam;
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