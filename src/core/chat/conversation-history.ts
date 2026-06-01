import type { ChatMessage, Conversation, ProviderConfig } from "../../types";
import { generateId } from "../../utils/helpers";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Conversation History Manager
// ============================================================

export class ConversationHistory {
    private conversations: Map<string, Conversation>;
    private activeConversationId: string | null = null;

    constructor() {
        this.conversations = new Map();
        this.createNewConversation({
            provider: "anthropic",
            model: "",
            apiKey: "",
            temperature: 0,
            maxTokens: 8192,
        });
    }

    createNewConversation(providerConfig: ProviderConfig): string {
        const id = generateId();
        const now = Date.now();

        const conversation: Conversation = {
            id,
            title: "New Task",
            messages: [],
            createdAt: now,
            updatedAt: now,
            providerConfig,
            totalTokens: 0,
        };

        this.conversations.set(id, conversation);
        this.activeConversationId = id;

        logger.info(`New conversation created: ${id}`);
        return id;
    }

    getActiveConversation(): Conversation | null {
        if (!this.activeConversationId) return null;
        return this.conversations.get(this.activeConversationId) || null;
    }

    getConversation(id: string): Conversation | null {
        return this.conversations.get(id) || null;
    }

    getAllConversations(): Conversation[] {
        return Array.from(this.conversations.values())
            .filter((c) => c.messages.length > 0)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    setActiveConversation(id: string): boolean {
        if (!this.conversations.has(id)) return false;
        this.activeConversationId = id;
        return true;
    }

    addMessage(message: ChatMessage): void {
        const conv = this.getActiveConversation();
        if (!conv) return;

        conv.messages.push(message);
        conv.updatedAt = Date.now();

        // Auto-title from first user message
        if (conv.title === "New Task" && message.type === "user") {
            conv.title = this.generateTitle(message.content);
        }

        if (message.tokensUsed) {
            conv.totalTokens += message.tokensUsed;
        }
    }

    updateMessage(id: string, updates: Partial<ChatMessage>): void {
        const conv = this.getActiveConversation();
        if (!conv) return;

        const msg = conv.messages.find((m) => m.id === id);
        if (msg) {
            Object.assign(msg, updates);
            conv.updatedAt = Date.now();
        }
    }

    getMessages(): ChatMessage[] {
        const conv = this.getActiveConversation();
        return conv ? conv.messages : [];
    }

    getMessagesForProvider(): {
        role: "system" | "user" | "assistant" | "tool";
        content: string;
        tool_call_id?: string;
        name?: string;
    }[] {
        const conv = this.getActiveConversation();
        if (!conv) return [];

        const messages: {
            role: "system" | "user" | "assistant" | "tool";
            content: string;
            tool_call_id?: string;
            name?: string;
        }[] = [];

        for (const msg of conv.messages) {
            switch (msg.type) {
                case "user":
                    messages.push({ role: "user", content: msg.content });
                    break;
                case "assistant":
                    // Preserve tool call context for providers that need structured tool data (e.g., Anthropic)
                    if (msg.toolCalls && msg.toolCalls.length > 0) {
                        // Build structured content with tool_use blocks for Anthropic-style providers
                        const contentParts: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }> = [];
                        if (msg.content && msg.content.trim()) {
                            contentParts.push({ type: "text", text: msg.content });
                        }
                        for (const tc of msg.toolCalls) {
                            contentParts.push({
                                type: "tool_use",
                                id: tc.id,
                                name: tc.name,
                                input: tc.arguments,
                            });
                        }
                        messages.push({
                            role: "assistant",
                            content: JSON.stringify(contentParts),
                        });
                    } else {
                        messages.push({ role: "assistant", content: msg.content });
                    }
                    break;
                case "tool":
                    if (msg.toolResults) {
                        for (const result of msg.toolResults) {
                            messages.push({
                                role: "tool",
                                content: result.content,
                                tool_call_id: result.toolCallId,
                                name: result.name,
                            });
                        }
                    }
                    break;
                case "system":
                    messages.push({ role: "system", content: msg.content });
                    break;
                case "error":
                    messages.push({ role: "user", content: `[Error: ${msg.content}]` });
                    break;
                case "info":
                    // Skip info messages for provider
                    break;
            }
        }

        return messages;
    }

    clearMessages(): void {
        const conv = this.getActiveConversation();
        if (conv) {
            conv.messages = [];
            conv.totalTokens = 0;
            conv.updatedAt = Date.now();
        }
    }

    /**
     * Truncate all messages after a specific message ID.
     * Used by "Undo to here" — keeps messages up to and including the target,
     * removes everything after it.
     */
    truncateAfterMessage(messageId: string): void {
        const conv = this.getActiveConversation();
        if (!conv) return;

        const idx = conv.messages.findIndex(m => m.id === messageId);
        if (idx === -1) return;

        // Keep messages up to and including the target message
        conv.messages = conv.messages.slice(0, idx + 1);
        conv.updatedAt = Date.now();

        // Recalculate token count
        conv.totalTokens = conv.messages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0);

        logger.info(`Truncated conversation ${conv.id} after message ${messageId} (${idx + 1} messages kept)`);
    }

    deleteConversation(id: string): void {
        this.conversations.delete(id);
        if (this.activeConversationId === id) {
            this.activeConversationId = null;
            // Set next available conversation
            const all = this.getAllConversations();
            if (all.length > 0) {
                this.activeConversationId = all[0].id;
            }
        }
    }

    getTokenCount(): number {
        const conv = this.getActiveConversation();
        return conv ? conv.totalTokens : 0;
    }

    private generateTitle(content: string): string {
        const cleaned = content.replace(/\n/g, " ").trim();
        if (cleaned.length <= 50) return cleaned;
        return cleaned.substring(0, 47) + "...";
    }
}