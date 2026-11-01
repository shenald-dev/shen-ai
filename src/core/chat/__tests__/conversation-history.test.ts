jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
        }),
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn(),
        }),
    },
}), { virtual: true });

import { ConversationHistory } from "../conversation-history";
import type { ChatMessage } from "../../../types";

describe("ConversationHistory", () => {
    let history: ConversationHistory;

    beforeEach(() => {
        history = new ConversationHistory();
    });

    it("should initialize with an active conversation", () => {
        const active = history.getActiveConversation();
        expect(active).not.toBeNull();
        expect(active?.title).toBe("New Task");
        expect(active?.messages).toEqual([]);
    });

    it("should add messages and update title automatically", () => {
        const userMsg: ChatMessage = {
            id: "msg-1",
            type: "user",
            content: "Fix the authentication handler in server.ts",
            timestamp: Date.now(),
            tokensUsed: 15,
        };

        history.addMessage(userMsg);

        const conv = history.getActiveConversation();
        expect(conv?.messages).toHaveLength(1);
        expect(conv?.title).toBe("Fix the authentication handler in server.ts");
        expect(conv?.totalTokens).toBe(15);
    });

    it("should compress older messages with replaceWithSummary", () => {
        // Add 6 messages
        for (let i = 1; i <= 6; i++) {
            history.addMessage({
                id: `msg-${i}`,
                type: i % 2 === 1 ? "user" : "assistant",
                content: `Message content ${i}`,
                timestamp: Date.now() + i * 1000,
                tokensUsed: 10,
            });
        }

        expect(history.getMessages()).toHaveLength(6);
        expect(history.getTokenCount()).toBe(60);

        const messagesToKeep = history.getMessages().slice(-2);
        const summaryText = "User asked questions about the API architecture and assistant answered.";

        history.replaceWithSummary(summaryText, messagesToKeep);

        const updatedMessages = history.getMessages();
        expect(updatedMessages).toHaveLength(3); // 1 summary system message + 2 kept
        expect(updatedMessages[0].type).toBe("system");
        expect(updatedMessages[0].content).toContain("[Previous Conversation Executive Summary]");
        expect(updatedMessages[0].content).toContain(summaryText);
        expect(updatedMessages[1].id).toBe("msg-5");
        expect(updatedMessages[2].id).toBe("msg-6");
        expect(history.getTokenCount()).toBe(20);
    });

    it("should convert messages correctly for provider", () => {
        history.addMessage({
            id: "u-1",
            type: "user",
            content: "Hello",
            timestamp: 1,
        });
        history.addMessage({
            id: "a-1",
            type: "assistant",
            content: "Hi there!",
            timestamp: 2,
        });

        const providerMsgs = history.getMessagesForProvider();
        expect(providerMsgs).toHaveLength(2);
        expect(providerMsgs[0].role).toBe("user");
        expect(providerMsgs[0].content).toBe("Hello");
        expect(providerMsgs[1].role).toBe("assistant");
        expect(providerMsgs[1].content).toBe("Hi there!");
    });
});
