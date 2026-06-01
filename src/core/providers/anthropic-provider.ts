import Anthropic from "@anthropic-ai/sdk";
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
// SHEN AI — Anthropic Provider (Claude)
// ============================================================

export class AnthropicProvider implements IProvider {
    readonly name = "anthropic";
    readonly supportsTools = true;
    readonly supportsStreaming = true;

    private client: Anthropic | null = null;
    private config: ProviderConfig | null = null;

    initialize(config: ProviderConfig): void {
        this.config = config;
        this.client = new Anthropic({
            apiKey: config.apiKey,
        });
        logger.info(`Anthropic provider initialized with model: ${config.model}`);
    }

    validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            errors.push("Anthropic API key is required");
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
            throw new Error("Anthropic provider not initialized. Call initialize() first.");
        }

        const systemMessage = messages.find((m) => m.role === "system");
        const nonSystemMessages = messages.filter((m) => m.role !== "system");

        let anthropicMessages: Anthropic.MessageParam[] = nonSystemMessages.map((m) =>
            this.toAnthropicMessage(m)
        );
        anthropicMessages = this.mergeConsecutiveMessages(anthropicMessages);

        const anthropicTools: Anthropic.Tool[] | undefined = tools?.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as unknown as Anthropic.Tool["input_schema"],
        }));

        const response = await this.client.messages.create(
            {
                model: this.config.model,
                messages: anthropicMessages,
                system: systemMessage?.content || undefined,
                tools: anthropicTools,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
            },
            { signal: abortSignal }
        );

        const textContent = response.content
            .filter((c: any): c is Anthropic.TextBlock => c.type === "text")
            .map((c: any) => c.text)
            .join("\n");

        const toolUseBlocks = response.content.filter(
            (c: any): c is Anthropic.ToolUseBlock => c.type === "tool_use"
        );

        const toolCalls: ProviderToolCall[] = toolUseBlocks.map((block) => ({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input),
        }));

        return {
            content: textContent,
            toolCalls,
            usage: {
                promptTokens: response.usage.input_tokens,
                completionTokens: response.usage.output_tokens,
                totalTokens: response.usage.input_tokens + response.usage.output_tokens,
            },
            stopReason: this.mapStopReason(response.stop_reason),
        };
    }

    async sendMessageStreaming(
        messages: ProviderMessage[],
        onChunk: StreamingCallback,
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse> {
        if (!this.client || !this.config) {
            throw new Error("Anthropic provider not initialized. Call initialize() first.");
        }

        const systemMessage = messages.find((m) => m.role === "system");
        const nonSystemMessages = messages.filter((m) => m.role !== "system");

        let anthropicMessages: Anthropic.MessageParam[] = nonSystemMessages.map((m) =>
            this.toAnthropicMessage(m)
        );
        anthropicMessages = this.mergeConsecutiveMessages(anthropicMessages);

        const anthropicTools: Anthropic.Tool[] | undefined = tools?.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as unknown as Anthropic.Tool["input_schema"],
        }));

        const stream = await this.client.messages.create(
            {
                model: this.config.model,
                messages: anthropicMessages,
                system: systemMessage?.content || undefined,
                tools: anthropicTools,
                temperature: this.config.temperature,
                max_tokens: this.config.maxTokens,
                stream: true,
            },
            { signal: abortSignal }
        );

        let fullContent = "";
        const toolCalls: ProviderToolCall[] = [];
        const toolInputBuffers: Record<string, string> = {};
        let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        for await (const event of stream) {
            if (event.type === "content_block_delta") {
                const delta = event.delta;

                if (delta.type === "text_delta") {
                    fullContent += delta.text;
                    onChunk({
                        content: delta.text,
                        isComplete: false,
                    });
                }

                if (delta.type === "input_json_delta") {
                    const blockIndex = event.index;
                    if (!toolInputBuffers[blockIndex]) {
                        toolInputBuffers[blockIndex] = "";
                    }
                    toolInputBuffers[blockIndex] += delta.partial_json;

                    // Stream the partial tool call to UI
                    if (toolCalls[blockIndex]) {
                        toolCalls[blockIndex].arguments = toolInputBuffers[blockIndex];
                        onChunk({
                            content: "",
                            toolCalls: [...toolCalls],
                            isComplete: false,
                        });
                    }
                }
            }

            if (event.type === "content_block_start") {
                const block = event.content_block;
                if (block.type === "tool_use") {
                    const idx = event.index;
                    toolInputBuffers[idx] = "";
                    toolCalls.push({
                        id: block.id,
                        name: block.name,
                        arguments: "",
                    });
                }
            }

            if (event.type === "message_delta") {
                if (event.usage) {
                    usage.completionTokens = event.usage.output_tokens || usage.completionTokens;
                }
            }

            if (event.type === "message_start") {
                usage.promptTokens = event.message.usage.input_tokens;
                usage.completionTokens = event.message.usage.output_tokens;
            }
        }

        // Finalize tool call arguments
        for (let i = 0; i < toolCalls.length; i++) {
            const rawArgs = toolInputBuffers[i] || "{}";
            try {
                toolCalls[i].arguments = rawArgs;
            } catch {
                toolCalls[i].arguments = "{}";
            }
        }

        usage.totalTokens = usage.promptTokens + usage.completionTokens;

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
            role: "user",
            content: JSON.stringify([
                {
                    type: "tool_result",
                    tool_use_id: toolCallId,
                    content: result,
                },
            ]),
        };
    }

    formatToolCalls(toolCalls: ProviderToolCall[]): string {
        return toolCalls
            .map((tc) => `[Tool: ${tc.name}] ${tc.arguments}`)
            .join("\n");
    }

    private toAnthropicMessage(msg: ProviderMessage): Anthropic.MessageParam {
        if (msg.role === "tool") {
            return {
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: msg.tool_call_id || "",
                        content: msg.content,
                    },
                ],
            };
        }

        if (msg.role === "assistant" && msg.content) {
            // Check if it's our serialized JSON array from conversation-history.ts
            const trimmed = msg.content.trim();
            if (trimmed.startsWith("[")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        return {
                            role: "assistant",
                            content: parsed,
                        };
                    }
                } catch {
                    // Fall through to text content
                }
            }
        }

        return {
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content,
        };
    }

    private mapStopReason(reason: string | null | undefined): ProviderResponse["stopReason"] {
        switch (reason) {
            case "end_turn":
            case "stop_sequence":
                return "stop";
            case "tool_use":
                return "tool_use";
            case "max_tokens":
                return "max_tokens";
            default:
                return "stop";
        }
    }

    private mergeConsecutiveMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
        if (messages.length === 0) return [];
        const merged: Anthropic.MessageParam[] = [];
        let current = messages[0];

        for (let i = 1; i < messages.length; i++) {
            const next = messages[i];
            if (current.role === next.role) {
                const currentContent = Array.isArray(current.content)
                    ? current.content
                    : [{ type: "text", text: current.content || "" }];
                const nextContent = Array.isArray(next.content)
                    ? next.content
                    : [{ type: "text", text: next.content || "" }];

                current = {
                    role: current.role,
                    content: [...currentContent, ...nextContent] as any
                };
            } else {
                merged.push(current);
                current = next;
            }
        }
        merged.push(current);
        return merged;
    }
}