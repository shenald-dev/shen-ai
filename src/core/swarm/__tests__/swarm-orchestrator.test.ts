import { SwarmOrchestrator } from "../swarm-orchestrator";

// Mock dependencies
jest.mock("../../chat/chat-manager");
jest.mock("../../tools/tool-registry");
jest.mock("../../memory/memory-manager");
jest.mock("../../../utils/logger", () => {
    return {
        logger: {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        }
    };
});

describe("SwarmOrchestrator", () => {
    let orchestrator: any;
    let mockChatManager: any;

    beforeEach(() => {
        mockChatManager = {
            sendMessage: jest.fn().mockResolvedValue("mocked response")
        } as any;
        const mockToolRegistry = {} as any;
        const mockMemoryManager = {} as any;

        orchestrator = new SwarmOrchestrator(mockChatManager, mockToolRegistry, mockMemoryManager);
    });

    afterEach(() => {
        orchestrator.dispose();
        jest.clearAllMocks();
    });

    it("should handle deadlocked tasks properly", async () => {
        const task = {
            id: "task_1",
            description: "test task",
            status: "pending",
            subTasks: [
                {
                    id: "sub_1",
                    description: "test subtask 1",
                    dependencies: ["missing_dep"],
                    files: [],
                    status: "pending",
                    error: ""
                }
            ],
            progress: 0,
            conflicts: 0
        };

        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve("Timeout"), 1500));
        const res = await Promise.race([orchestrator["executeSubTasks"](task as any), timeoutPromise]);
        expect(res).not.toBe("Timeout");
        expect(task.subTasks[0].status).toBe("failed");
        expect(task.subTasks[0].error).toBe("Deadlock detected: unresolvable or circular dependency");
    });
});
