import { logger } from "../../utils/logger";
import { estimateTokens, generateId } from "../../utils/helpers";
import type { ChatMessage, ConversationSummary } from "../../types";

// ============================================================
// SHEN AI — Smart Conversation Summarizer
// Automatically compresses long conversations to save context
// tokens while preserving key decisions and code changes.
// ============================================================

export class ConversationSummarizer {
    private summaries: Map<string, ConversationSummary> = new Map();
    private readonly SUMMARY_THRESHOLD = 0.5; // Trigger at 50% of max context
    private readonly RECENT_MESSAGES_TO_KEEP = 10; // Always keep last N messages

    /**
     * Check if conversation needs summarization.
     */
    needsSummarization(messages: ChatMessage[], maxContextTokens: number): boolean {
        const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
        const threshold = maxContextTokens * this.SUMMARY_THRESHOLD;
        
        return totalTokens > threshold && messages.length > this.RECENT_MESSAGES_TO_KEEP * 2;
    }

    /**
     * Summarize older messages in a conversation.
     * Returns the summary and the messages to keep.
     */
    async summarizeConversation(
        messages: ChatMessage[],
        conversationId: string
    ): Promise<{ summary: ConversationSummary; messagesToKeep: ChatMessage[] }> {
        // Split messages: older ones to summarize, recent ones to keep
        const messagesToSummarize = messages.slice(0, -this.RECENT_MESSAGES_TO_KEEP);
        const messagesToKeep = messages.slice(-this.RECENT_MESSAGES_TO_KEEP);

        // Extract key information
        const keyDecisions = this.extractKeyDecisions(messagesToSummarize);
        const filesModified = this.extractFilesModified(messagesToSummarize);
        const codePatterns = this.extractCodePatterns(messagesToSummarize);

        // Generate summary text
        const summaryText = this.generateSummaryText(
            messagesToSummarize,
            keyDecisions,
            filesModified,
            codePatterns
        );

        // Calculate tokens saved
        const originalTokens = messagesToSummarize.reduce(
            (sum, msg) => sum + estimateTokens(msg.content),
            0
        );
        const summaryTokens = estimateTokens(summaryText);
        const tokensSaved = originalTokens - summaryTokens;

        const summary: ConversationSummary = {
            id: generateId(),
            conversationId,
            originalMessageCount: messagesToSummarize.length,
            summaryMessageCount: 1,
            tokensSaved,
            keyDecisions,
            filesModified,
            codePatterns,
            summary: summaryText,
            createdAt: Date.now()
        };

        this.summaries.set(summary.id, summary);

        logger.info(
            `Conversation summarized: ${messagesToSummarize.length} messages → 1 summary (saved ${tokensSaved} tokens)`
        );

        return { summary, messagesToKeep };
    }

    /**
     * Extract key decisions from messages.
     */
    private extractKeyDecisions(messages: ChatMessage[]): string[] {
        const decisions: string[] = [];

        for (const msg of messages) {
            if (msg.type === "assistant" || msg.type === "user") {
                // Look for decision keywords
                const content = msg.content.toLowerCase();
                
                if (content.includes("decided to") || 
                    content.includes("we'll use") || 
                    content.includes("choosing") ||
                    content.includes("architecture") ||
                    content.includes("approach")) {
                    
                    // Extract first sentence as decision
                    const firstSentence = msg.content.split(/[.!?]/)[0].trim();
                    if (firstSentence.length > 10 && firstSentence.length < 200) {
                        decisions.push(firstSentence);
                    }
                }
            }
        }

        return decisions.slice(0, 10); // Limit to 10 key decisions
    }

    /**
     * Extract files that were modified.
     */
    private extractFilesModified(messages: ChatMessage[]): string[] {
        const files = new Set<string>();

        for (const msg of messages) {
            if (msg.toolResults) {
                for (const result of msg.toolResults) {
                    // Extract file paths from tool results
                    const pathMatch = result.content.match(/[Ff]ile[:\s]+([^\s]+\.[a-z]+)/);
                    if (pathMatch) {
                        files.add(pathMatch[1]);
                    }
                }
            }

            if (msg.toolCalls) {
                for (const call of msg.toolCalls) {
                    if (call.arguments.path) {
                        files.add(call.arguments.path as string);
                    }
                    if (call.arguments.filePath) {
                        files.add(call.arguments.filePath as string);
                    }
                }
            }
        }

        return Array.from(files).slice(0, 20); // Limit to 20 files
    }

    /**
     * Extract code patterns mentioned in the conversation.
     */
    private extractCodePatterns(messages: ChatMessage[]): string[] {
        const patterns: string[] = [];
        const patternKeywords = [
            "pattern", "approach", "technique", "method",
            "function", "class", "interface", "type",
            "async", "await", "promise", "callback"
        ];

        for (const msg of messages) {
            if (msg.type === "assistant") {
                const content = msg.content.toLowerCase();
                
                for (const keyword of patternKeywords) {
                    if (content.includes(keyword)) {
                        // Extract context around keyword
                        const regex = new RegExp(`[^.]*${keyword}[^.]*\\.`, "gi");
                        const matches = msg.content.match(regex);
                        if (matches) {
                            patterns.push(...matches.slice(0, 2));
                        }
                    }
                }
            }
        }

        return patterns.slice(0, 10); // Limit to 10 patterns
    }

    /**
     * Generate a summary text from the conversation.
     */
    private generateSummaryText(
        messages: ChatMessage[],
        keyDecisions: string[],
        filesModified: string[],
        codePatterns: string[]
    ): string {
        const parts: string[] = [];

        parts.push("## Conversation Summary");
        parts.push(`This conversation had ${messages.length} messages and was compressed to save context tokens.\n`);

        if (keyDecisions.length > 0) {
            parts.push("### Key Decisions Made:");
            for (const decision of keyDecisions.slice(0, 5)) {
                parts.push(`- ${decision}`);
            }
            parts.push("");
        }

        if (filesModified.length > 0) {
            parts.push("### Files Modified:");
            for (const file of filesModified.slice(0, 10)) {
                parts.push(`- ${file}`);
            }
            parts.push("");
        }

        if (codePatterns.length > 0) {
            parts.push("### Code Patterns Discussed:");
            for (const pattern of codePatterns.slice(0, 5)) {
                parts.push(`- ${pattern.trim()}`);
            }
            parts.push("");
        }

        // Add user's original request (first message)
        const firstUserMsg = messages.find(m => m.type === "user");
        if (firstUserMsg) {
            parts.push("### Original Request:");
            const requestPreview = firstUserMsg.content.substring(0, 300);
            parts.push(requestPreview + (firstUserMsg.content.length > 300 ? "..." : ""));
            parts.push("");
        }

        parts.push("---");
        parts.push("*Continuing from summary. Recent messages below:*");

        return parts.join("\n");
    }

    /**
     * Get a summary by ID.
     */
    getSummary(id: string): ConversationSummary | undefined {
        return this.summaries.get(id);
    }

    /**
     * Get all summaries for a conversation.
     */
    getSummariesForConversation(conversationId: string): ConversationSummary[] {
        return Array.from(this.summaries.values())
            .filter(s => s.conversationId === conversationId)
            .sort((a, b) => b.createdAt - a.createdAt);
    }

    /**
     * Get statistics.
     */
    getStats(): {
        totalSummaries: number;
        totalTokensSaved: number;
        averageTokensSaved: number;
    } {
        const summaries = Array.from(this.summaries.values());
        const totalTokensSaved = summaries.reduce((sum, s) => sum + s.tokensSaved, 0);

        return {
            totalSummaries: summaries.length,
            totalTokensSaved,
            averageTokensSaved: summaries.length > 0 
                ? Math.round(totalTokensSaved / summaries.length) 
                : 0
        };
    }

    /**
     * Clear all summaries.
     */
    clear(): void {
        this.summaries.clear();
    }
}