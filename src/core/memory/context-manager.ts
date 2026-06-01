import type { ProviderMessage, ToolDefinition } from "../../types";
import { estimateTokens, truncateToTokenLimit } from "../../utils/helpers";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Context Manager (Smart Context Window Management)
// ============================================================

export interface ContextWindow {
    systemPrompt: string;
    messages: ProviderMessage[];
    totalTokens: number;
    maxTokens: number;
    truncated: boolean;
}

export interface FileContext {
    path: string;
    content: string;
    priority: number; // Higher = more important
    reason: string;
}

export class ContextManager {
    private maxContextTokens: number;
    private fileContexts: Map<string, FileContext>;
    private systemPrompt: string;

    constructor(maxContextTokens: number = 200000) {
        this.maxContextTokens = maxContextTokens;
        this.fileContexts = new Map();
        this.systemPrompt = "";
    }

    setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    setMaxTokens(max: number): void {
        this.maxContextTokens = max;
    }

    addFileContext(context: FileContext): void {
        this.fileContexts.set(context.path, context);
        logger.debug(`Added file context: ${context.path} (priority: ${context.priority})`);
    }

    removeFileContext(path: string): void {
        this.fileContexts.delete(path);
    }

    clearFileContexts(): void {
        this.fileContexts.clear();
    }

    getFileContext(path: string): FileContext | undefined {
        return this.fileContexts.get(path);
    }

    buildContextWindow(messages: ProviderMessage[]): ContextWindow {
        const systemTokens = estimateTokens(this.systemPrompt);
        let remainingTokens = this.maxContextTokens - systemTokens - 500; // 500 buffer for response

        // Build file context block
        const fileContextBlock = this.buildFileContextBlock(remainingTokens * 0.3); // Max 30% for file context
        const fileContextTokens = estimateTokens(fileContextBlock);

        remainingTokens -= fileContextTokens;

        // Select and truncate messages
        const selectedMessages = this.selectMessages(messages, remainingTokens);

        // Prepend file context to system prompt if we have any
        const fullSystemPrompt = fileContextBlock
            ? `${this.systemPrompt}\n\n## Relevant File Context\n${fileContextBlock}`
            : this.systemPrompt;

        const totalTokens = estimateTokens(fullSystemPrompt) +
            selectedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

        return {
            systemPrompt: fullSystemPrompt,
            messages: selectedMessages,
            totalTokens,
            maxTokens: this.maxContextTokens,
            truncated: selectedMessages.length < messages.length,
        };
    }

    private buildFileContextBlock(maxTokens: number): string {
        if (this.fileContexts.size === 0) return "";

        // Sort by priority (highest first)
        const sorted = Array.from(this.fileContexts.values())
            .sort((a, b) => b.priority - a.priority);

        let block = "";
        let currentTokens = 0;

        for (const ctx of sorted) {
            const entry = `\n### ${ctx.path} (${ctx.reason})\n\`\`\`\n${ctx.content}\n\`\`\`\n`;
            const entryTokens = estimateTokens(entry);

            if (currentTokens + entryTokens > maxTokens) {
                // Truncate this file's content to fit
                const remaining = maxTokens - currentTokens;
                if (remaining > 100) {
                    const truncated = truncateToTokenLimit(ctx.content, remaining / 4);
                    block += `\n### ${ctx.path} (${ctx.reason}) [truncated]\n\`\`\`\n${truncated}\n\`\`\`\n`;
                }
                break;
            }

            block += entry;
            currentTokens += entryTokens;
        }

        return block;
    }

    private selectMessages(messages: ProviderMessage[], maxTokens: number): ProviderMessage[] {
        if (messages.length === 0) return [];

        // Always keep the last N messages (most recent conversation)
        const RECENT_KEEP = 10;
        const recent = messages.slice(-RECENT_KEEP);
        const recentTokens = recent.reduce((sum, m) => sum + estimateTokens(m.content), 0);

        if (recentTokens >= maxTokens) {
            // Even recent messages are too much — truncate the oldest of the recent
            return this.truncateMessages(recent, maxTokens);
        }

        const remaining = maxTokens - recentTokens;
        const older = messages.slice(0, -RECENT_KEEP);

        // Summarize older messages
        const summarized = this.summarizeOlderMessages(older, remaining);

        return [...summarized, ...recent];
    }

    private truncateMessages(messages: ProviderMessage[], maxTokens: number): ProviderMessage[] {
        const result: ProviderMessage[] = [];
        let tokens = 0;

        // Keep from newest to oldest
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const msgTokens = estimateTokens(msg.content);

            if (tokens + msgTokens > maxTokens) {
                // Truncate this message
                const remaining = maxTokens - tokens;
                if (remaining > 50) {
                    result.unshift({
                        ...msg,
                        content: truncateToTokenLimit(msg.content, remaining / 4),
                    });
                }
                break;
            }

            result.unshift(msg);
            tokens += msgTokens;
        }

        return result;
    }

    private summarizeOlderMessages(messages: ProviderMessage[], maxTokens: number): ProviderMessage[] {
        if (messages.length === 0) return [];

        // Group tool call + result pairs and summarize
        const summarized: ProviderMessage[] = [];
        let i = 0;

        while (i < messages.length) {
            const msg = messages[i];

            if (msg.role === "assistant" && i + 1 < messages.length && messages[i + 1].role === "tool") {
                // This is a tool call followed by result — summarize as single message
                const toolMsg = messages[i + 1];
                const summary = `[Tool used → Result received]`;
                const summaryTokens = estimateTokens(summary);

                if (summarized.length === 0 || estimateTokens(summarized[summarized.length - 1].content) + summaryTokens < maxTokens / 3) {
                    if (summarized.length > 0 && summarized[summarized.length - 1].role === "user") {
                        summarized[summarized.length - 1].content += "\n" + summary;
                    } else {
                        summarized.push({ role: "user", content: summary });
                    }
                }
                i += 2;
            } else {
                // Keep user/assistant messages but truncate if long
                const maxMsgTokens = maxTokens / Math.max(messages.length - i, 1);
                const msgTokens = estimateTokens(msg.content);

                if (msgTokens > maxMsgTokens) {
                    summarized.push({
                        ...msg,
                        content: truncateToTokenLimit(msg.content, maxMsgTokens / 4),
                    });
                } else {
                    summarized.push(msg);
                }
                i++;
            }
        }

        return summarized;
    }

    getStats(): { fileContexts: number; totalFileTokens: number } {
        let totalFileTokens = 0;
        for (const ctx of this.fileContexts.values()) {
            totalFileTokens += estimateTokens(ctx.content);
        }
        return {
            fileContexts: this.fileContexts.size,
            totalFileTokens,
        };
    }
}