import { EventEmitter } from "events";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Agent Message Bus (Inter-Agent Communication)
// Enables agents in swarm mode to communicate, delegate tasks,
// and share context through a publish-subscribe message bus.
// ============================================================

export interface AgentMessage {
    id: string;
    from: string; // agent id
    to: string | "broadcast"; // target agent id or broadcast
    type: MessageType;
    payload: unknown;
    timestamp: number;
    correlationId?: string; // for request-response patterns
}

export type MessageType =
    | "task_delegate"     // Delegate a subtask to another agent
    | "task_result"       // Return result of a delegated task
    | "task_progress"     // Report progress on a task
    | "context_share"     // Share context/knowledge with other agents
    | "conflict_detected" // Report a file conflict
    | "conflict_resolved" // Report conflict resolution
    | "status_update"     // Agent status change
    | "coordination"      // Coordination signal (barrier, lock, etc.)
    | "error";            // Error report

export interface AgentSubscription {
    agentId: string;
    messageTypes: MessageType[];
    handler: (message: AgentMessage) => void;
}

export class AgentMessageBus extends EventEmitter {
    private subscriptions: Map<string, AgentSubscription[]>;
    private messageHistory: AgentMessage[];
    private maxHistory: number;
    private pendingRequests: Map<string, { resolve: (msg: AgentMessage) => void; timeout: NodeJS.Timeout }>;

    constructor(maxHistory: number = 500) {
        super();
        this.subscriptions = new Map();
        this.messageHistory = [];
        this.maxHistory = maxHistory;
        this.pendingRequests = new Map();
    }

    /**
     * Subscribe an agent to specific message types.
     */
    subscribe(agentId: string, messageTypes: MessageType[], handler: (message: AgentMessage) => void): void {
        const key = agentId;
        if (!this.subscriptions.has(key)) {
            this.subscriptions.set(key, []);
        }
        this.subscriptions.get(key)!.push({ agentId, messageTypes, handler });
        logger.debug(`Agent ${agentId} subscribed to: ${messageTypes.join(", ")}`);
    }

    /**
     * Unsubscribe an agent from all messages.
     */
    unsubscribe(agentId: string): void {
        this.subscriptions.delete(agentId);
        logger.debug(`Agent ${agentId} unsubscribed.`);
    }

    /**
     * Publish a message to the bus.
     */
    publish(message: Omit<AgentMessage, "id" | "timestamp">): AgentMessage {
        const fullMessage: AgentMessage = {
            ...message,
            id: this.generateId(),
            timestamp: Date.now(),
        };

        // Store in history
        this.messageHistory.push(fullMessage);
        if (this.messageHistory.length > this.maxHistory) {
            this.messageHistory = this.messageHistory.slice(-this.maxHistory);
        }

        // Emit event
        this.emit("message", fullMessage);

        // Deliver to subscribers
        this.deliverMessage(fullMessage);

        // Check for pending request-response
        if (fullMessage.correlationId && this.pendingRequests.has(fullMessage.correlationId)) {
            const pending = this.pendingRequests.get(fullMessage.correlationId)!;
            clearTimeout(pending.timeout);
            pending.resolve(fullMessage);
            this.pendingRequests.delete(fullMessage.correlationId);
        }

        logger.debug(`Message published: ${fullMessage.type} from ${fullMessage.from} to ${fullMessage.to}`);
        return fullMessage;
    }

    /**
     * Send a message and wait for a response (request-response pattern).
     */
    async request(
        from: string,
        to: string,
        type: MessageType,
        payload: unknown,
        timeoutMs: number = 30000
    ): Promise<AgentMessage> {
        const correlationId = this.generateId();

        const requestMessage = this.publish({
            from,
            to,
            type,
            payload,
            correlationId,
        });

        return new Promise<AgentMessage>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new Error(`Request timeout after ${timeoutMs}ms (correlation: ${correlationId})`));
            }, timeoutMs);

            this.pendingRequests.set(correlationId, { resolve, timeout });
        });
    }

    /**
     * Broadcast a message to all agents.
     */
    broadcast(from: string, type: MessageType, payload: unknown): AgentMessage {
        return this.publish({
            from,
            to: "broadcast",
            type,
            payload,
        });
    }

    /**
     * Get message history.
     */
    getHistory(filter?: { type?: MessageType; from?: string; to?: string }): AgentMessage[] {
        let messages = [...this.messageHistory];

        if (filter?.type) {
            messages = messages.filter((m) => m.type === filter.type);
        }
        if (filter?.from) {
            messages = messages.filter((m) => m.from === filter.from);
        }
        if (filter?.to) {
            messages = messages.filter((m) => m.to === filter.to || m.to === "broadcast");
        }

        return messages;
    }

    /**
     * Get pending request count.
     */
    getPendingCount(): number {
        return this.pendingRequests.size;
    }

    /**
     * Clear all pending requests (useful on shutdown).
     */
    clearPending(): void {
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.resolve({
                id: "",
                from: "system",
                to: "",
                type: "error",
                payload: { message: "Bus cleared" },
                timestamp: Date.now(),
            });
        }
        this.pendingRequests.clear();
    }

    private deliverMessage(message: AgentMessage): void {
        for (const [, subs] of this.subscriptions) {
            for (const sub of subs) {
                // Check if this agent should receive the message
                const isTarget = message.to === "broadcast" || message.to === sub.agentId;
                const isTypeMatch = sub.messageTypes.includes(message.type);

                if (isTarget && isTypeMatch) {
                    try {
                        sub.handler(message);
                    } catch (error) {
                        logger.error(`Error in message handler for agent ${sub.agentId}:`, error);
                    }
                }
            }
        }
    }

    private generateId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    dispose(): void {
        this.clearPending();
        this.subscriptions.clear();
        this.removeAllListeners();
    }
}