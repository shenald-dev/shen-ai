import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "./chat-store";
import type { ChatMessage } from "../../../types";
import type { AgentStatus } from "../components/AgentStatusPanel";

describe("useChatStore", () => {
    beforeEach(() => {
        // Reset state before each test
        const initialState = useChatStore.getState();
        useChatStore.setState({
            ...initialState,
            messages: [],
            streamingContent: "",
            isStreaming: false,
            isProcessing: false,
            currentToolCall: null,
            currentToolResult: null,
            totalTokens: 0,
            showSettings: false,
            showHistory: false,
            showCheckpoints: false,
            showWelcome: true,
            inputText: "",
            activeFile: null,
            inlineContext: null,
            quickQuestion: null,
            error: null,
            agentStatuses: [],
            isOrchestrating: false,
            streamingToolCalls: [],
            thinkingPhase: "",
            checkpointTasks: [],
        }, true);
    });

    describe("Initial State", () => {
        it("should have correct initial values", () => {
            const state = useChatStore.getState();
            expect(state.messages).toEqual([]);
            expect(state.streamingContent).toBe("");
            expect(state.isStreaming).toBe(false);
            expect(state.isProcessing).toBe(false);
            expect(state.showWelcome).toBe(true);
            expect(state.settings.provider).toBe("anthropic");
        });
    });

    describe("Messages Actions", () => {
        it("should add a message", () => {
            const msg: ChatMessage = {
                id: "123",
                type: "user",
                content: "Hello",
                timestamp: Date.now(),
            };

            useChatStore.getState().addMessage(msg);

            const state = useChatStore.getState();
            expect(state.messages).toHaveLength(1);
            expect(state.messages[0]).toEqual(msg);
        });

        it("should clear messages", () => {
            const msg: ChatMessage = {
                id: "123",
                type: "user",
                content: "Hello",
                timestamp: Date.now(),
            };
            useChatStore.getState().addMessage(msg);

            useChatStore.getState().clearMessages();

            const state = useChatStore.getState();
            expect(state.messages).toEqual([]);
            expect(state.streamingContent).toBe("");
            expect(state.isStreaming).toBe(false);
            expect(state.isProcessing).toBe(false);
            expect(state.totalTokens).toBe(0);
            expect(state.error).toBeNull();
        });

        it("should truncate messages after a specific message id", () => {
            const msgs: ChatMessage[] = [
                { id: "1", type: "user", content: "Hi", timestamp: 1 },
                { id: "2", type: "assistant", content: "Hello", timestamp: 2 },
                { id: "3", type: "user", content: "How are you?", timestamp: 3 },
            ];

            useChatStore.setState({ messages: msgs });

            useChatStore.getState().truncateMessagesAfter("2");

            const state = useChatStore.getState();
            expect(state.messages).toHaveLength(2);
            expect(state.messages.map(m => m.id)).toEqual(["1", "2"]);
        });

        it("should not truncate if message id is not found", () => {
            const msgs: ChatMessage[] = [
                { id: "1", type: "user", content: "Hi", timestamp: 1 },
                { id: "2", type: "assistant", content: "Hello", timestamp: 2 }
            ];

            useChatStore.setState({ messages: msgs });
            useChatStore.getState().truncateMessagesAfter("999");

            expect(useChatStore.getState().messages).toHaveLength(2);
        });
    });

    describe("Streaming Actions", () => {
        it("should set streaming content", () => {
            useChatStore.getState().setStreamingContent("Testing");

            const state = useChatStore.getState();
            expect(state.streamingContent).toBe("Testing");
            expect(state.isStreaming).toBe(true);
        });

        it("should append streaming content", () => {
            useChatStore.getState().setStreamingContent("Hello");
            useChatStore.getState().appendStreamingContent(" World");

            const state = useChatStore.getState();
            expect(state.streamingContent).toBe("Hello World");
            expect(state.isStreaming).toBe(true);
        });

        it("should finish streaming and convert to message", () => {
            useChatStore.getState().setStreamingContent("Final Answer");
            useChatStore.getState().finishStreaming();

            const state = useChatStore.getState();
            expect(state.streamingContent).toBe("");
            expect(state.isStreaming).toBe(false);
            expect(state.isProcessing).toBe(false);
            expect(state.messages).toHaveLength(1);
            expect(state.messages[0].content).toBe("Final Answer");
            expect(state.messages[0].type).toBe("assistant");
        });

        it("should reset streaming state", () => {
            useChatStore.setState({
                streamingContent: "In progress",
                isStreaming: true,
                isProcessing: true,
                streamingToolCalls: [{ id: "t1" }],
                thinkingPhase: "thinking",
                currentToolCall: { id: "tc1", name: "tool", arguments: {} },
                currentToolResult: { toolCallId: "tc1", name: "tool", content: "res", isError: false },
            });

            useChatStore.getState().resetStreamingState();

            const state = useChatStore.getState();
            expect(state.streamingContent).toBe("");
            expect(state.isStreaming).toBe(false);
            expect(state.isProcessing).toBe(false);
            expect(state.streamingToolCalls).toEqual([]);
            expect(state.thinkingPhase).toBe("");
            expect(state.currentToolCall).toBeNull();
            expect(state.currentToolResult).toBeNull();
        });
    });

    describe("Settings Actions", () => {
        it("should update settings", () => {
            useChatStore.getState().updateSettings({
                model: "gpt-4",
                temperature: 0.5,
            });

            const state = useChatStore.getState();
            expect(state.settings.model).toBe("gpt-4");
            expect(state.settings.temperature).toBe(0.5);
            expect(state.settings.provider).toBe("anthropic"); // other settings preserved
        });
    });

    describe("UI Visibility Actions", () => {
        it("should toggle settings visibility and close history", () => {
            useChatStore.getState().setShowSettings(true);

            const state = useChatStore.getState();
            expect(state.showSettings).toBe(true);
            expect(state.showHistory).toBe(false);
        });

        it("should toggle history visibility and close settings", () => {
            useChatStore.getState().setShowHistory(true);

            const state = useChatStore.getState();
            expect(state.showHistory).toBe(true);
            expect(state.showSettings).toBe(false);
        });
    });

    describe("Agent & Orchestration Actions", () => {
        it("should set agent statuses", () => {
            const statuses: AgentStatus[] = [
                { role: "coder", displayName: "Coder", icon: "💻", status: "working", color: "red" }
            ];
            useChatStore.getState().setAgentStatuses(statuses);
            expect(useChatStore.getState().agentStatuses).toEqual(statuses);
        });

        it("should set isOrchestrating", () => {
            useChatStore.getState().setIsOrchestrating(true);
            expect(useChatStore.getState().isOrchestrating).toBe(true);
        });

        it("should set checkpoint tasks", () => {
            const tasks = [
                { id: "1", label: "Task 1", isActive: true, checkpoints: [], fileChanges: [], createdAt: Date.now() }
            ];
            useChatStore.getState().setCheckpointTasks(tasks);
            expect(useChatStore.getState().checkpointTasks).toEqual(tasks);
        });
    });
});
