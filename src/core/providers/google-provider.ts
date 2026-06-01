import { GoogleGenerativeAI, type GenerativeModel, type Content, type SchemaType, type FunctionDeclaration, type Tool } from "@google/generative-ai";
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
// SHEN AI — Google Provider (Gemini)
// ============================================================

export class GoogleProvider implements IProvider {
    readonly name = "google";
    readonly supportsTools = true;
    readonly supportsStreaming = true;

    private genAI: GoogleGenerativeAI | null = null;
    private model: GenerativeModel | null = null;
    private config: ProviderConfig | null = null;

    initialize(config: ProviderConfig): void {
        this.config = config;
        this.genAI = new GoogleGenerativeAI(config.apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: config.model,
            generationConfig: {
                temperature: config.temperature,
                maxOutputTokens: config.maxTokens,
            },
        });
        logger.info(`Google provider initialized with model: ${config.model}`);
    }

    validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        if (!config.apiKey || config.apiKey.trim().length === 0) {
            errors.push("Google API key is required");
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
        if (!this.model || !this.config) {
            throw new Error("Google provider not initialized. Call initialize() first.");
        }

        const { systemMessage, chatMessages } = this.convertMessages(messages);

        const geminiTools: Tool[] | undefined = tools ? [{
            functionDeclarations: tools.map((t) => this.convertToolDefinition(t)),
        }] : undefined;

        const chat = this.model.startChat({
            history: chatMessages.slice(0, -1),
            tools: geminiTools,
            systemInstruction: systemMessage || undefined,
        });

        const lastMessage = chatMessages[chatMessages.length - 1];
        const lastParts = lastMessage?.parts || [{ text: "" }];

        const result = await chat.sendMessage(lastParts);
        const response = result.response;

        let content = "";
        const toolCalls: ProviderToolCall[] = [];

        const candidates = response.candidates || [];
        for (const candidate of candidates) {
            const parts = candidate.content?.parts || [];
            for (const part of parts) {
                if (part.text) {
                    content += part.text;
                }
                if (part.functionCall) {
                    toolCalls.push({
                        id: `gemini_tc_${Date.now()}_${toolCalls.length}`,
                        name: part.functionCall.name,
                        arguments: JSON.stringify(part.functionCall.args || {}),
                    });
                }
            }
        }

        return {
            content,
            toolCalls,
            usage: {
                promptTokens: response.usageMetadata?.promptTokenCount || 0,
                completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: response.usageMetadata?.totalTokenCount || 0,
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
        if (!this.model || !this.config) {
            throw new Error("Google provider not initialized. Call initialize() first.");
        }

        const { systemMessage, chatMessages } = this.convertMessages(messages);

        const geminiTools: Tool[] | undefined = tools ? [{
            functionDeclarations: tools.map((t) => this.convertToolDefinition(t)),
        }] : undefined;

        const chat = this.model.startChat({
            history: chatMessages.slice(0, -1),
            tools: geminiTools,
            systemInstruction: systemMessage || undefined,
        });

        const lastMessage = chatMessages[chatMessages.length - 1];
        const lastParts = lastMessage?.parts || [{ text: "" }];

        const result = await chat.sendMessageStream(lastParts);

        let fullContent = "";
        const toolCalls: ProviderToolCall[] = [];
        let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

        for await (const chunk of result.stream) {
            const parts = chunk.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
                if (part.text) {
                    fullContent += part.text;
                    onChunk({
                        content: part.text,
                        isComplete: false,
                    });
                }
                if (part.functionCall) {
                    toolCalls.push({
                        id: `gemini_tc_${Date.now()}_${toolCalls.length}`,
                        name: part.functionCall.name,
                        arguments: JSON.stringify(part.functionCall.args || {}),
                    });
                }
            }

            if (chunk.usageMetadata) {
                usage = {
                    promptTokens: chunk.usageMetadata.promptTokenCount || 0,
                    completionTokens: chunk.usageMetadata.candidatesTokenCount || 0,
                    totalTokens: chunk.usageMetadata.totalTokenCount || 0,
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

    formatToolResult(toolCallId: string, result: string, functionName?: string): ProviderMessage {
        return {
            role: "user",
            content: JSON.stringify([{
                functionResponse: {
                    name: functionName || toolCallId,
                    response: { result },
                },
            }]),
        };
    }

    formatToolCalls(toolCalls: ProviderToolCall[]): string {
        return toolCalls
            .map((tc) => `[Tool: ${tc.name}] ${tc.arguments}`)
            .join("\n");
    }

    private convertToolDefinition(tool: ToolDefinition): FunctionDeclaration {
        return {
            name: tool.name,
            description: tool.description,
            parameters: {
                type: "OBJECT" as SchemaType,
                properties: Object.fromEntries(
                    Object.entries(tool.parameters.properties).map(([key, prop]) => [
                        key,
                        {
                            type: this.mapSchemaType(prop.type),
                            description: prop.description,
                            enum: prop.enum,
                            items: prop.items ? { type: this.mapSchemaType(prop.items.type) } : undefined,
                        },
                    ])
                ),
                required: tool.parameters.required,
            },
        };
    }

    private mapSchemaType(type: string): SchemaType {
        switch (type.toLowerCase()) {
            case "string": return "STRING" as SchemaType;
            case "number": return "NUMBER" as SchemaType;
            case "integer": return "INTEGER" as SchemaType;
            case "boolean": return "BOOLEAN" as SchemaType;
            case "array": return "ARRAY" as SchemaType;
            case "object": return "OBJECT" as SchemaType;
            default: return "STRING" as SchemaType;
        }
    }

    private convertMessages(messages: ProviderMessage[]): {
        systemMessage: string | undefined;
        chatMessages: Content[];
    } {
        const systemMessage = messages.find((m) => m.role === "system")?.content;
        const chatMessages: Content[] = [];

        for (const msg of messages) {
            if (msg.role === "system") continue;

            if (msg.role === "user") {
                chatMessages.push({
                    role: "user",
                    parts: [{ text: msg.content }],
                });
            } else if (msg.role === "assistant") {
                // If it's a JSON array (from conversation-history), extract text and reconstruct tool calls
                const trimmed = msg.content.trim();
                if (trimmed.startsWith("[")) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (Array.isArray(parsed)) {
                            const parts: any[] = [];
                            for (const p of parsed) {
                                if (p.type === "text" && p.text) {
                                    parts.push({ text: p.text });
                                } else if (p.type === "tool_use") {
                                    parts.push({
                                        functionCall: {
                                            name: p.name,
                                            args: typeof p.input === "string" ? JSON.parse(p.input) : p.input
                                        }
                                    });
                                }
                            }
                            chatMessages.push({ role: "model", parts });
                            continue;
                        }
                    } catch {
                        // Fall through
                    }
                }
                
                chatMessages.push({
                    role: "model",
                    parts: [{ text: msg.content }],
                });
            } else if (msg.role === "tool") {
                // Use proper Gemini functionResponse format with the actual function name
                const functionName = msg.name || "unknown_function";
                chatMessages.push({
                    role: "user",
                    parts: [{
                        functionResponse: {
                            name: functionName,
                            response: { result: msg.content },
                        },
                    }],
                });
            }
        }

        return { systemMessage, chatMessages };
    }
}