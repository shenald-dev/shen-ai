import type { ToolDefinition, ToolCall, ToolResult } from "../../types";
import type { ChatManager } from "../chat/chat-manager";
import type { ToolRegistry } from "../tools/tool-registry";
import type { ProviderRegistry } from "../providers/provider-registry";
import type { MemoryManager } from "../memory/memory-manager";
import type { RAGEngine } from "../memory/rag-engine";
import type { MCPClient } from "../tools/mcp-client";
import type * as vscode from "vscode";

// ============================================================
// SHEN AI — Plugin API Definitions
// The public API that plugins use to extend SHEN AI.
// Plugins can register tools, commands, event handlers,
// and modify agent behavior.
// ============================================================

// --- Plugin Permissions ---

export type PluginPermission =
    | "tools"           // Register custom tools
    | "commands"        // Register VS Code commands
    | "fileRead"        // Read workspace files
    | "fileWrite"       // Write workspace files
    | "commandExec"     // Execute shell commands (restricted)
    | "chat"            // Access chat manager
    | "memory"          // Access memory manager
    | "rag"             // Access RAG engine
    | "mcp"             // Access MCP client
    | "providers"       // Access provider registry
    | "webview";        // Send messages to webview

export interface PluginPermissions {
    granted: PluginPermission[];
    denied?: PluginPermission[];
    commandAllowlist?: string[]; // Allowed shell commands (regex patterns)
    pathScope?: string[];        // Allowed file path patterns (relative to workspace)
}

// --- Plugin Manifest ---

export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    license?: string;
    homepage?: string;
    repository?: string;
    engines?: {
        shen?: string;
        vscode?: string;
        node?: string;
    };
    main: string; // Entry point file
    permissions?: PluginPermissions; // Required: explicit permission declaration
    contributes?: {
        tools?: PluginToolContribution[];
        commands?: PluginCommandContribution[];
        agents?: PluginAgentContribution[];
        providers?: PluginProviderContribution[];
        configuration?: PluginConfigurationContribution;
    };
}

export interface PluginToolContribution {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

export interface PluginCommandContribution {
    command: string;
    title: string;
    category?: string;
    icon?: string;
}

export interface PluginAgentContribution {
    role: string;
    description: string;
    systemPrompt: string;
    availableTools: string[];
}

export interface PluginProviderContribution {
    name: string;
    description: string;
    supportsTools: boolean;
    supportsStreaming: boolean;
}

export interface PluginConfigurationContribution {
    properties: Record<string, {
        type: string;
        default?: unknown;
        description?: string;
        enum?: string[];
        minimum?: number;
        maximum?: number;
    }>;
}

// --- Plugin Context (passed to plugins) ---

export interface PluginContext {
    /** Extension context from VS Code */
    extensionContext: vscode.ExtensionContext;

    /** Register a new tool */
    registerTool(definition: ToolDefinition, handler: ToolHandler): void;

    /** Register a new VS Code command */
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): void;

    /** Get the current configuration */
    getConfiguration(): Record<string, unknown>;

    /** Get a specific configuration value */
    getConfigValue<T>(key: string, defaultValue?: T): T | undefined;

    /** Log a message */
    log(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;

    /** Access the tool registry (requires "tools" permission) */
    toolRegistry?: ToolRegistry;

    /** Access the provider registry (requires "providers" permission) */
    providerRegistry?: ProviderRegistry;

    /** Access the chat manager (requires "chat" permission) */
    chatManager?: ChatManager;

    /** Access the memory manager (requires "memory" permission) */
    memoryManager?: MemoryManager;

    /** Access the RAG engine (requires "rag" permission) */
    ragEngine?: RAGEngine;

    /** Access the MCP client (requires "mcp" permission) */
    mcpClient?: MCPClient;

    /** Access VS Code API (always available) */
    vscode: typeof vscode;

    /** Get workspace root path */
    getWorkspaceRoot(): string | undefined;

    /** Read a file in the workspace (requires "fileRead" permission, scoped to pathScope) */
    readFile(path: string): Promise<string>;

    /** Write a file in the workspace (requires "fileWrite" permission, scoped to pathScope) */
    writeFile(path: string, content: string): Promise<void>;

    /** Execute a shell command (requires "commandExec" permission, restricted to allowlist) */
    executeCommand(command: string): Promise<{ stdout: string; stderr: string }>;

    /** Send a message to the webview */
    sendToWebview(action: string, payload: unknown): void;

    /** Register a webview message handler */
    onWebviewMessage(action: string, handler: (payload: unknown) => void): void;

    /** Storage path for plugin data */
    storagePath: string;

    /** Plugin's own manifest */
    manifest: PluginManifest;
}

// --- Tool Handler Type ---

export type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

// --- Plugin Interface (what plugins must export) ---

export interface ShenPlugin {
    /** Called when the plugin is activated */
    activate(context: PluginContext): void | Promise<void>;

    /** Called when the plugin is deactivated */
    deactivate?(): void | Promise<void>;
}

// --- Plugin Event Types ---

export interface PluginEvent {
    type: PluginEventType;
    pluginId: string;
    timestamp: number;
    data?: unknown;
}

export type PluginEventType =
    | "activated"
    | "deactivated"
    | "error"
    | "toolRegistered"
    | "commandRegistered"
    | "configChanged"
    | "messageReceived";

// --- Plugin Error ---

export class PluginError extends Error {
    constructor(
        public readonly pluginId: string,
        message: string,
        public readonly originalError?: Error
    ) {
        super(`[Plugin: ${pluginId}] ${message}`);
        this.name = "PluginError";
    }
}