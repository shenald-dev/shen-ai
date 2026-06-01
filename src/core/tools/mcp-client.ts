import { EventEmitter } from "events";
import { logger } from "../../utils/logger";
import { generateId } from "../../utils/helpers";
import type { ToolDefinition, ToolCall, ToolResult } from "../../types";

// ============================================================
// SHEN AI — MCP Client (Model Context Protocol)
// Connects to external MCP servers to discover and use
// additional tools and resources. Enables extensibility
// through the MCP standard.
// ============================================================

export interface MCPServerConfig {
    name: string;
    transport: "stdio" | "http" | "websocket";
    command?: string; // for stdio transport
    args?: string[]; // for stdio transport
    url?: string; // for http/websocket transport
    env?: Record<string, string>;
    enabled: boolean;
}

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    serverName: string;
}

export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
    serverName: string;
}

export interface MCPServerStatus {
    name: string;
    connected: boolean;
    tools: number;
    resources: number;
    error?: string;
    lastConnected?: number;
}

interface MCPRequest {
    jsonrpc: "2.0";
    id: number | string;
    method: string;
    params?: Record<string, unknown>;
}

interface MCPResponse {
    jsonrpc: "2.0";
    id: number | string;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

interface MCPNotification {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
}

export class MCPClient extends EventEmitter {
    private servers: Map<string, MCPServerConfig>;
    private connections: Map<string, MCPConnection>;
    private tools: Map<string, MCPTool>;
    private resources: Map<string, MCPResource>;

    constructor() {
        super();
        this.servers = new Map();
        this.connections = new Map();
        this.tools = new Map();
        this.resources = new Map();
    }

    /**
     * Register an MCP server configuration.
     */
    registerServer(config: MCPServerConfig): void {
        this.servers.set(config.name, config);
        logger.info(`MCP server registered: ${config.name} (${config.transport})`);
    }

    /**
     * Connect to all registered servers.
     */
    async connectAll(): Promise<void> {
        const promises: Promise<void>[] = [];

        for (const [name, config] of this.servers) {
            if (!config.enabled) {
                logger.info(`MCP server ${name} is disabled, skipping.`);
                continue;
            }
            promises.push(this.connectServer(name, config));
        }

        await Promise.allSettled(promises);
        logger.info(`MCP: Connected to ${this.connections.size} servers, discovered ${this.tools.size} tools`);
    }

    /**
     * Connect to a specific server.
     */
    async connectServer(name: string, config: MCPServerConfig): Promise<void> {
        try {
            const connection = new MCPConnection(config);
            await connection.connect();

            this.connections.set(name, connection);

            // Discover tools
            const serverTools = await connection.listTools();
            for (const tool of serverTools) {
                const toolKey = `${name}__${tool.name}`;
                this.tools.set(toolKey, {
                    ...tool,
                    serverName: name,
                });
            }

            // Discover resources
            const serverResources = await connection.listResources();
            for (const resource of serverResources) {
                const resourceKey = `${name}__${resource.uri}`;
                this.resources.set(resourceKey, {
                    ...resource,
                    serverName: name,
                });
            }

            // Listen for notifications
            connection.on("notification", (notification: MCPNotification) => {
                this.emit("notification", { server: name, ...notification });
            });

            connection.on("error", (error: Error) => {
                this.emit("serverError", { server: name, error });
            });

            this.emit("serverConnected", { name, tools: serverTools.length, resources: serverResources.length });
            logger.info(`MCP connected to ${name}: ${serverTools.length} tools, ${serverResources.length} resources`);

        } catch (error) {
            const errorMsg = (error as Error).message;
            logger.error(`MCP failed to connect to ${name}:`, error);
            this.emit("serverError", { name, error: errorMsg });
        }
    }

    /**
     * Disconnect from a server.
     */
    async disconnectServer(name: string): Promise<void> {
        const connection = this.connections.get(name);
        if (connection) {
            await connection.disconnect();
            this.connections.delete(name);

            // Remove tools and resources from this server
            for (const [key, tool] of this.tools) {
                if (tool.serverName === name) this.tools.delete(key);
            }
            for (const [key, resource] of this.resources) {
                if (resource.serverName === name) this.resources.delete(key);
            }

            this.emit("serverDisconnected", { name });
        }
    }

    /**
     * Disconnect from all servers.
     */
    async disconnectAll(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const name of this.connections.keys()) {
            promises.push(this.disconnectServer(name));
        }
        await Promise.allSettled(promises);
    }

    /**
     * Get all discovered tools as SHEN tool definitions.
     */
    getToolDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map((tool) => ({
            name: `mcp_${tool.serverName}_${tool.name}`,
            description: `[MCP: ${tool.serverName}] ${tool.description}`,
            parameters: tool.inputSchema as unknown as ToolDefinition["parameters"],
        }));
    }

    /**
     * Execute an MCP tool call.
     */
    async executeTool(call: ToolCall): Promise<ToolResult> {
        // Parse the tool name to find the server and tool
        const match = call.name.match(/^mcp_(.+?)_(.+)$/);
        if (!match) {
            return {
                toolCallId: call.id,
                name: call.name,
                content: `Error: Invalid MCP tool name format: ${call.name}`,
                isError: true,
            };
        }

        const [, serverName, toolName] = match;
        const connection = this.connections.get(serverName);

        if (!connection) {
            return {
                toolCallId: call.id,
                name: call.name,
                content: `Error: MCP server '${serverName}' is not connected.`,
                isError: true,
            };
        }

        try {
            const result = await connection.callTool(toolName, call.arguments);
            return {
                toolCallId: call.id,
                name: call.name,
                content: this.formatToolResult(result),
                isError: false,
            };
        } catch (error) {
            return {
                toolCallId: call.id,
                name: call.name,
                content: `Error executing MCP tool '${toolName}': ${(error as Error).message}`,
                isError: true,
            };
        }
    }

    /**
     * Read an MCP resource.
     */
    async readResource(uri: string, serverName?: string): Promise<string> {
        if (serverName) {
            const connection = this.connections.get(serverName);
            if (!connection) {
                throw new Error(`MCP server '${serverName}' is not connected.`);
            }
            return connection.readResource(uri);
        }

        // Try all servers
        for (const [, connection] of this.connections) {
            try {
                return await connection.readResource(uri);
            } catch {
                // Try next server
            }
        }

        throw new Error(`Resource '${uri}' not found on any connected MCP server.`);
    }

    /**
     * Get server statuses.
     */
    getServerStatuses(): MCPServerStatus[] {
        const statuses: MCPServerStatus[] = [];

        for (const [name, config] of this.servers) {
            const connection = this.connections.get(name);
            const toolCount = Array.from(this.tools.values()).filter((t) => t.serverName === name).length;
            const resourceCount = Array.from(this.resources.values()).filter((r) => r.serverName === name).length;

            statuses.push({
                name,
                connected: !!connection && connection.isConnected,
                tools: toolCount,
                resources: resourceCount,
                error: connection?.lastError,
                lastConnected: connection?.connectedAt,
            });
        }

        return statuses;
    }

    /**
     * Get all discovered tools.
     */
    getAllTools(): MCPTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get all discovered resources.
     */
    getAllResources(): MCPResource[] {
        return Array.from(this.resources.values());
    }

    private formatToolResult(result: unknown): string {
        if (typeof result === "string") return result;
        if (typeof result === "object" && result !== null) {
            // MCP tools return content arrays with text/image blocks
            const obj = result as Record<string, unknown>;
            if (Array.isArray(obj.content)) {
                return obj.content.map((item: Record<string, unknown>) => {
                    if (item.type === "text") return item.text || "";
                    if (item.type === "image") return "[image data]";
                    return JSON.stringify(item);
                }).join("\n");
            }
            return JSON.stringify(result, null, 2);
        }
        return String(result);
    }
}

// ============================================================
// MCP Connection (Individual Server Connection)
// ============================================================

class MCPConnection extends EventEmitter {
    private config: MCPServerConfig;
    private process: import("child_process").ChildProcess | null;
    private requestId: number;
    private pendingRequests: Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
    private _isConnected: boolean;
    private _lastError: string | undefined;
    private _connectedAt: number | undefined;
    private buffer: string;

    constructor(config: MCPServerConfig) {
        super();
        this.config = config;
        this.process = null;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this._isConnected = false;
        this._lastError = undefined;
        this._connectedAt = undefined;
        this.buffer = "";
    }

    get isConnected(): boolean {
        return this._isConnected;
    }

    get lastError(): string | undefined {
        return this._lastError;
    }

    get connectedAt(): number | undefined {
        return this._connectedAt;
    }

    async connect(): Promise<void> {
        if (this.config.transport === "stdio") {
            await this.connectStdio();
        } else if (this.config.transport === "http") {
            await this.connectHttp();
        } else {
            throw new Error(`Unsupported MCP transport: ${this.config.transport}`);
        }
    }

    private async connectStdio(): Promise<void> {
        if (!this.config.command) {
            throw new Error("MCP stdio transport requires a 'command' configuration.");
        }

        const { spawn } = await import("child_process");

        const env = {
            ...process.env,
            ...this.config.env,
        };

        this.process = spawn(this.config.command, this.config.args || [], {
            env,
            stdio: ["pipe", "pipe", "pipe"],
            shell: false,
        });

        this.process.stdout?.on("data", (data: Buffer) => {
            this.handleStdioData(data.toString());
        });

        this.process.stderr?.on("data", (data: Buffer) => {
            const stderr = data.toString();
            logger.debug(`MCP [${this.config.name}] stderr: ${stderr.trim()}`);
        });

        this.process.on("error", (error: Error) => {
            this._lastError = error.message;
            this._isConnected = false;
            this.emit("error", error);
        });

        this.process.on("exit", (code: number | null) => {
            this._isConnected = false;
            logger.info(`MCP [${this.config.name}] process exited with code ${code}`);
            this.emit("disconnected");
        });

        // Initialize MCP session
        await this.sendRequest("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
                name: "shen-ai",
                version: "0.1.0",
            },
        });

        await this.sendNotification("notifications/initialized", {});

        this._isConnected = true;
        this._connectedAt = Date.now();
    }

    private async connectHttp(): Promise<void> {
        if (!this.config.url) {
            throw new Error("MCP HTTP transport requires a 'url' configuration.");
        }

        // Test connection with initialize
        await this.sendRequest("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
                name: "shen-ai",
                version: "0.1.0",
            },
        });

        await this.sendNotification("notifications/initialized", {});

        this._isConnected = true;
        this._connectedAt = Date.now();
    }

    private handleStdioData(data: string): void {
        this.buffer += data;

        // MCP uses newline-delimited JSON
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const message = JSON.parse(line);
                this.handleMessage(message);
            } catch (error) {
                logger.warn(`MCP [${this.config.name}] failed to parse message: ${line}`);
            }
        }
    }

    private handleMessage(message: MCPResponse | MCPNotification): void {
        if ("id" in message && message.id !== undefined) {
            // Response to a request
            const pending = this.pendingRequests.get(Number(message.id));
            if (pending) {
                this.pendingRequests.delete(Number(message.id));
                if (message.error) {
                    pending.reject(new Error(message.error.message));
                } else {
                    pending.resolve(message.result);
                }
            }
        } else if ("method" in message) {
            // Notification
            this.emit("notification", message);
        }
    }

    async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
        const id = ++this.requestId;

        const request: MCPRequest = {
            jsonrpc: "2.0",
            id,
            method,
            params,
        };

        if (this.config.transport === "stdio" && this.process) {
            return new Promise((resolve, reject) => {
                this.pendingRequests.set(id, { resolve, reject });

                const timeout = setTimeout(() => {
                    this.pendingRequests.delete(id);
                    reject(new Error(`MCP request timeout: ${method}`));
                }, 60000);

                // Wrap to clear timeout
                const pendingReq = this.pendingRequests.get(id);
                if (pendingReq) {
                    const origResolve = pendingReq.resolve;
                    const origReject = pendingReq.reject;
                    this.pendingRequests.set(id, {
                        resolve: (value: unknown) => { clearTimeout(timeout); origResolve(value); },
                        reject: (error: Error) => { clearTimeout(timeout); origReject(error); },
                    });
                }

                this.process?.stdin?.write(JSON.stringify(request) + "\n");
            });
        } else if (this.config.transport === "http" && this.config.url) {
            const response = await fetch(this.config.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
            });

            const data = await response.json();
            if (data.error) {
                throw new Error(data.error.message);
            }
            return data.result;
        }

        throw new Error("MCP connection not established.");
    }

    async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
        const notification: MCPNotification = {
            jsonrpc: "2.0",
            method,
            params,
        };

        if (this.config.transport === "stdio" && this.process) {
            this.process.stdin?.write(JSON.stringify(notification) + "\n");
        } else if (this.config.transport === "http" && this.config.url) {
            await fetch(this.config.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(notification),
            });
        }
    }

    async listTools(): Promise<MCPTool[]> {
        const result = await this.sendRequest("tools/list", {}) as Record<string, unknown>;
        const tools = (result?.tools || []) as Array<Record<string, unknown>>;

        return tools.map((t) => ({
            name: String(t.name || ""),
            description: String(t.description || ""),
            inputSchema: (t.inputSchema || { type: "object", properties: {} }) as Record<string, unknown>,
            serverName: this.config.name,
        }));
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        return this.sendRequest("tools/call", {
            name,
            arguments: args,
        });
    }

    async listResources(): Promise<MCPResource[]> {
        try {
            const result = await this.sendRequest("resources/list", {}) as Record<string, unknown>;
            const resources = (result?.resources || []) as Array<Record<string, unknown>>;

            return resources.map((r) => ({
                uri: String(r.uri || ""),
                name: String(r.name || ""),
                description: r.description ? String(r.description) : undefined,
                mimeType: r.mimeType ? String(r.mimeType) : undefined,
                serverName: this.config.name,
            }));
        } catch {
            return [];
        }
    }

    async readResource(uri: string): Promise<string> {
        const result = await this.sendRequest("resources/read", { uri });
        const obj = result as Record<string, unknown>;
        if (Array.isArray(obj.contents)) {
            return obj.contents.map((c: Record<string, unknown>) => c.text || "").join("\n");
        }
        return JSON.stringify(result);
    }

    async disconnect(): Promise<void> {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }

        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
            pending.reject(new Error("MCP connection closed"));
        }
        this.pendingRequests.clear();

        this._isConnected = false;
        this.emit("disconnected");
    }
}

// ============================================================
// MCP Tool Registration Helper
// ============================================================

export function registerMCPTools(toolRegistry: any, mcpClient: MCPClient): void {
    // Register a meta-tool to list MCP servers
    toolRegistry.register({
        name: "mcp_list_servers",
        description: "List all configured MCP servers and their connection status.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    }, async () => {
        const statuses = mcpClient.getServerStatuses();
        return statuses.map((s) =>
            `${s.connected ? "✅" : "❌"} ${s.name} — ${s.tools} tools, ${s.resources} resources${s.error ? ` (${s.error})` : ""}`
        ).join("\n");
    });

    // Register a meta-tool to list MCP tools
    toolRegistry.register({
        name: "mcp_list_tools",
        description: "List all available tools from connected MCP servers.",
        parameters: {
            type: "object",
            properties: {
                server: {
                    type: "string",
                    description: "Optional: filter by server name",
                },
            },
            required: [],
        },
    }, async (args: Record<string, unknown>) => {
        const server = args.server as string | undefined;
        const tools = mcpClient.getAllTools();
        const filtered = server ? tools.filter((t) => t.serverName === server) : tools;

        return filtered.map((t) =>
            `**[${t.serverName}] ${t.name}**: ${t.description}`
        ).join("\n\n");
    });

    // Register a meta-tool to read MCP resources
    toolRegistry.register({
        name: "mcp_read_resource",
        description: "Read a resource from an MCP server.",
        parameters: {
            type: "object",
            properties: {
                uri: {
                    type: "string",
                    description: "The resource URI",
                },
                server: {
                    type: "string",
                    description: "Optional: server name",
                },
            },
            required: ["uri"],
        },
    }, async (args: Record<string, unknown>) => {
        const uri = args.uri as string;
        const server = args.server as string | undefined;
        return await mcpClient.readResource(uri, server);
    });

    logger.info("MCP meta-tools registered.");
}