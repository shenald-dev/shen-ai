import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";
import { generateId, getWorkspaceRoot } from "../../utils/helpers";
import type { ToolDefinition } from "../../types";
import type {
    PluginManifest,
    PluginContext,
    ShenPlugin,
    PluginEvent,
    PluginEventType,
    PluginPermission,
    ToolHandler,
} from "./plugin-api";
import { PluginError } from "./plugin-api";
import type { ChatManager } from "../chat/chat-manager";
import type { ToolRegistry } from "../tools/tool-registry";
import type { ProviderRegistry } from "../providers/provider-registry";
import type { MemoryManager } from "../memory/memory-manager";
import type { RAGEngine } from "../memory/rag-engine";
import type { MCPClient } from "../tools/mcp-client";
import type * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================================
// SHEN AI — Plugin Loader
// Discovers, loads, activates, and manages SHEN AI plugins.
// Plugins are TypeScript/JavaScript modules that extend
// the agent with custom tools, commands, and behaviors.
// ============================================================

export interface LoadedPlugin {
    id: string;
    manifest: PluginManifest;
    instance: ShenPlugin | null;
    isActive: boolean;
    activatedAt?: number;
    error?: string;
    toolsRegistered: number;
    commandsRegistered: number;
}

export class PluginLoader extends EventEmitter {
    private pluginsDir: string;
    private plugins: Map<string, LoadedPlugin>;
    private disposables: Map<string, Array<{ dispose: () => void }>>;
    private webviewHandlers: Map<string, Map<string, (payload: unknown) => void>>;

    // Core services (injected)
    private chatManager: ChatManager | null;
    private toolRegistry: ToolRegistry | null;
    private providerRegistry: ProviderRegistry | null;
    private memoryManager: MemoryManager | null;
    private ragEngine: RAGEngine | null;
    private mcpClient: MCPClient | null;
    private extensionContext: vscode.ExtensionContext | null;

    constructor(pluginsDir?: string) {
        super();
        this.pluginsDir = pluginsDir || path.join(os.homedir(), ".shen-ai", "plugins");
        this.plugins = new Map();
        this.disposables = new Map();
        this.webviewHandlers = new Map();
        this.chatManager = null;
        this.toolRegistry = null;
        this.providerRegistry = null;
        this.memoryManager = null;
        this.ragEngine = null;
        this.mcpClient = null;
        this.extensionContext = null;

        this.ensurePluginsDir();
    }

    /**
     * Set core services (called during extension activation).
     */
    setServices(services: {
        chatManager: ChatManager;
        toolRegistry: ToolRegistry;
        providerRegistry: ProviderRegistry;
        memoryManager: MemoryManager;
        ragEngine: RAGEngine;
        mcpClient: MCPClient;
        extensionContext: vscode.ExtensionContext;
    }): void {
        this.chatManager = services.chatManager;
        this.toolRegistry = services.toolRegistry;
        this.providerRegistry = services.providerRegistry;
        this.memoryManager = services.memoryManager;
        this.ragEngine = services.ragEngine;
        this.mcpClient = services.mcpClient;
        this.extensionContext = services.extensionContext;
        logger.info("Plugin loader services initialized.");
    }

    /**
     * Discover and load all plugins from the plugins directory.
     */
    async loadAllPlugins(): Promise<void> {
        logger.info(`Scanning plugins directory: ${this.pluginsDir}`);

        const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
        const pluginDirs = entries.filter((e) => e.isDirectory());

        for (const dir of pluginDirs) {
            const pluginPath = path.join(this.pluginsDir, dir.name);
            try {
                await this.loadPlugin(pluginPath);
            } catch (error) {
                logger.error(`Failed to load plugin from ${pluginPath}:`, error);
            }
        }

        logger.info(`Plugin loading complete: ${this.plugins.size} plugins found`);
    }

    /**
     * Load a single plugin from a directory.
     */
    async loadPlugin(pluginPath: string): Promise<void> {
        const manifestPath = path.join(pluginPath, "shen-plugin.json");

        if (!fs.existsSync(manifestPath)) {
            // Try package.json as fallback
            const packagePath = path.join(pluginPath, "package.json");
            if (!fs.existsSync(packagePath)) {
                logger.warn(`No manifest found in ${pluginPath}, skipping.`);
                return;
            }
            await this.loadFromPackageJson(pluginPath, packagePath);
            return;
        }

        const manifestContent = fs.readFileSync(manifestPath, "utf-8");
        const manifest: PluginManifest = JSON.parse(manifestContent);

        await this.activatePlugin(manifest, pluginPath);
    }

    private async loadFromPackageJson(pluginPath: string, packagePath: string): Promise<void> {
        const pkgContent = fs.readFileSync(packagePath, "utf-8");
        const pkg = JSON.parse(pkgContent);

        const manifest: PluginManifest = {
            id: pkg.name || generateId(),
            name: pkg.displayName || pkg.name || "Unknown Plugin",
            version: pkg.version || "0.0.0",
            description: pkg.description || "",
            author: pkg.author || "Unknown",
            license: pkg.license,
            homepage: pkg.homepage,
            repository: pkg.repository?.url || pkg.repository,
            main: pkg.main || "index.js",
            contributes: pkg.contributes,
        };

        await this.activatePlugin(manifest, pluginPath);
    }

    /**
     * Activate a plugin by loading its module and calling activate().
     */
    private async activatePlugin(manifest: PluginManifest, pluginPath: string): Promise<void> {
        const loaded: LoadedPlugin = {
            id: manifest.id,
            manifest,
            instance: null,
            isActive: false,
            toolsRegistered: 0,
            commandsRegistered: 0,
        };

        try {
            // Resolve the main entry point
            const mainFile = path.resolve(pluginPath, manifest.main);

            if (!fs.existsSync(mainFile)) {
                throw new Error(`Plugin entry point not found: ${mainFile}`);
            }

            // Clear require cache for hot reload
            delete require.cache[require.resolve(mainFile)];

            // Load the plugin module
            const module = require(mainFile);
            const plugin: ShenPlugin = module.default || module;

            if (!plugin || typeof plugin.activate !== "function") {
                throw new Error("Plugin must export an activate() function");
            }

            // Create plugin context
            const context = this.createPluginContext(manifest, pluginPath);

            // Activate the plugin
            await plugin.activate(context);

            loaded.instance = plugin;
            loaded.isActive = true;
            loaded.activatedAt = Date.now();

            this.plugins.set(manifest.id, loaded);

            this.emitEvent("activated", manifest.id);
            logger.info(`Plugin activated: ${manifest.name} v${manifest.version} (${manifest.id})`);

        } catch (error) {
            loaded.error = (error as Error).message;
            this.plugins.set(manifest.id, loaded);

            this.emitEvent("error", manifest.id, { error: loaded.error });
            logger.error(`Plugin activation failed: ${manifest.id}`, error);
        }
    }

    /**
     * Check if a plugin has a specific permission.
     */
    private hasPermission(manifest: PluginManifest, permission: PluginPermission): boolean {
        const perms = manifest.permissions;
        if (!perms) return false; // No permissions declared = no access
        if (perms.denied?.includes(permission)) return false;
        return perms.granted.includes(permission);
    }

    /**
     * Validate that a file path is within the plugin's allowed scope.
     */
    private isPathAllowed(filePath: string, manifest: PluginManifest): boolean {
        const pathScope = manifest.permissions?.pathScope;
        if (!pathScope || pathScope.length === 0) return true; // No scope = allow all within workspace

        const root = getWorkspaceRoot();
        const fullPath = root ? path.resolve(root, filePath) : path.resolve(filePath);

        // Prevent path traversal
        if (root && !fullPath.startsWith(root)) {
            return false;
        }

        return pathScope.some((pattern) => {
            const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
            return regex.test(filePath);
        });
    }

    /**
     * Validate that a command is allowed per the plugin's allowlist.
     */
    private isCommandAllowed(command: string, manifest: PluginManifest): boolean {
        const allowlist = manifest.permissions?.commandAllowlist;
        if (!allowlist || allowlist.length === 0) return false; // No allowlist = no commands allowed

        const dangerousPatterns = [/\brm\s+(-rf?|--recursive)/, /\bsudo\b/, /\bchmod\b/, /\bchown\b/, /\bcurl\b.*\|\s*(bash|sh)/, /\bwget\b.*\|\s*(bash|sh)/];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) return false;
        }

        return allowlist.some((pattern) => {
            const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
            return regex.test(command);
        });
    }

    /**
     * Create the PluginContext object passed to plugins with permission enforcement.
     */
    private createPluginContext(manifest: PluginManifest, pluginPath: string): PluginContext {
        const pluginId = manifest.id;
        const storagePath = path.join(this.pluginsDir, pluginId, ".data");

        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }

        if (!this.disposables.has(pluginId)) {
            this.disposables.set(pluginId, []);
        }

        const context: PluginContext = {
            extensionContext: this.extensionContext!,

            registerTool: (definition: ToolDefinition, handler: ToolHandler) => {
                if (!this.hasPermission(manifest, "tools")) {
                    throw new PluginError(pluginId, "Permission denied: 'tools' permission required to register tools");
                }
                if (this.toolRegistry) {
                    this.toolRegistry.register(definition, handler);
                    const loaded = this.plugins.get(pluginId);
                    if (loaded) loaded.toolsRegistered++;
                    this.emitEvent("toolRegistered", pluginId, { tool: definition.name });
                    logger.info(`Plugin ${pluginId} registered tool: ${definition.name}`);
                }
            },

            registerCommand: (command: string, callback: (...args: unknown[]) => unknown) => {
                if (!this.hasPermission(manifest, "commands")) {
                    throw new PluginError(pluginId, "Permission denied: 'commands' permission required");
                }
                if (this.extensionContext) {
                    const disposable = (this.extensionContext as any).subscriptions;
                    const vscodeMod = require("vscode");
                    const cmd = vscodeMod.commands.registerCommand(command, callback);
                    disposable.push(cmd);
                    const loaded = this.plugins.get(pluginId);
                    if (loaded) loaded.commandsRegistered++;
                    this.emitEvent("commandRegistered", pluginId, { command });
                    logger.info(`Plugin ${pluginId} registered command: ${command}`);
                }
            },

            getConfiguration: () => {
                const vscodeMod = require("vscode");
                const config = vscodeMod.workspace.getConfiguration("shen.ai");
                return config as unknown as Record<string, unknown>;
            },

            getConfigValue: ((key: string, defaultValue?: unknown) => {
                const vscodeMod = require("vscode");
                const config = vscodeMod.workspace.getConfiguration("shen.ai");
                return config.get(key, defaultValue);
            }) as <T>(key: string, defaultValue?: T) => T | undefined,

            log: (message: string, ...args: unknown[]) => {
                logger.info(`[Plugin: ${pluginId}] ${message}`, ...args);
            },

            warn: (message: string, ...args: unknown[]) => {
                logger.warn(`[Plugin: ${pluginId}] ${message}`, ...args);
            },

            error: (message: string, ...args: unknown[]) => {
                logger.error(`[Plugin: ${pluginId}] ${message}`, ...args);
            },

            // Service access is conditional on permissions — undefined if not granted
            toolRegistry: this.hasPermission(manifest, "tools") ? this.toolRegistry! : undefined,
            providerRegistry: this.hasPermission(manifest, "providers") ? this.providerRegistry! : undefined,
            chatManager: this.hasPermission(manifest, "chat") ? this.chatManager! : undefined,
            memoryManager: this.hasPermission(manifest, "memory") ? this.memoryManager! : undefined,
            ragEngine: this.hasPermission(manifest, "rag") ? this.ragEngine! : undefined,
            mcpClient: this.hasPermission(manifest, "mcp") ? this.mcpClient! : undefined,

            vscode: require("vscode"),

            getWorkspaceRoot: () => getWorkspaceRoot(),

            readFile: async (filePath: string) => {
                if (!this.hasPermission(manifest, "fileRead")) {
                    throw new PluginError(pluginId, "Permission denied: 'fileRead' permission required");
                }
                if (!this.isPathAllowed(filePath, manifest)) {
                    throw new PluginError(pluginId, `Permission denied: path '${filePath}' is outside allowed scope`);
                }
                const root = getWorkspaceRoot();
                const fullPath = root ? path.join(root, filePath) : filePath;
                // Final safety check: prevent path traversal
                if (root && !path.resolve(fullPath).startsWith(path.resolve(root))) {
                    throw new PluginError(pluginId, `Permission denied: path traversal detected`);
                }
                return fs.promises.readFile(fullPath, "utf-8");
            },

            writeFile: async (filePath: string, content: string) => {
                if (!this.hasPermission(manifest, "fileWrite")) {
                    throw new PluginError(pluginId, "Permission denied: 'fileWrite' permission required");
                }
                if (!this.isPathAllowed(filePath, manifest)) {
                    throw new PluginError(pluginId, `Permission denied: path '${filePath}' is outside allowed scope`);
                }
                const root = getWorkspaceRoot();
                const fullPath = root ? path.join(root, filePath) : filePath;
                // Final safety check: prevent path traversal
                if (root && !path.resolve(fullPath).startsWith(path.resolve(root))) {
                    throw new PluginError(pluginId, `Permission denied: path traversal detected`);
                }
                const dir = path.dirname(fullPath);
                await fs.promises.mkdir(dir, { recursive: true });
                await fs.promises.writeFile(fullPath, content, "utf-8");
            },

            executeCommand: async (command: string) => {
                if (!this.hasPermission(manifest, "commandExec")) {
                    throw new PluginError(pluginId, "Permission denied: 'commandExec' permission required");
                }
                if (!this.isCommandAllowed(command, manifest)) {
                    throw new PluginError(pluginId, `Permission denied: command '${command}' is not in allowlist`);
                }
                const root = getWorkspaceRoot() || process.cwd();
                const { stdout, stderr } = await execAsync(command, {
                    cwd: root,
                    timeout: 30000,
                    maxBuffer: 1024 * 1024,
                    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
                });
                return { stdout, stderr };
            },

            sendToWebview: (action: string, payload: unknown) => {
                if (!this.hasPermission(manifest, "webview")) {
                    throw new PluginError(pluginId, "Permission denied: 'webview' permission required");
                }
                this.emit("webviewMessage", { action, payload, pluginId });
            },

            onWebviewMessage: (action: string, handler: (payload: unknown) => void) => {
                if (!this.hasPermission(manifest, "webview")) {
                    throw new PluginError(pluginId, "Permission denied: 'webview' permission required");
                }
                if (!this.webviewHandlers.has(pluginId)) {
                    this.webviewHandlers.set(pluginId, new Map());
                }
                this.webviewHandlers.get(pluginId)!.set(action, handler);
            },

            storagePath,
            manifest,
        };

        return context;
    }

    /**
     * Deactivate a specific plugin.
     */
    async deactivatePlugin(pluginId: string): Promise<void> {
        const loaded = this.plugins.get(pluginId);
        if (!loaded || !loaded.isActive) return;

        try {
            if (loaded.instance && typeof loaded.instance.deactivate === "function") {
                await loaded.instance.deactivate();
            }

            // Clean up disposables
            const disposables = this.disposables.get(pluginId);
            if (disposables) {
                for (const d of disposables) {
                    try { d.dispose(); } catch { /* ignore */ }
                }
                this.disposables.delete(pluginId);
            }

            // Clean up webview handlers
            this.webviewHandlers.delete(pluginId);

            loaded.isActive = false;
            this.emitEvent("deactivated", pluginId);
            logger.info(`Plugin deactivated: ${pluginId}`);

        } catch (error) {
            logger.error(`Plugin deactivation failed: ${pluginId}`, error);
        }
    }

    /**
     * Deactivate all plugins.
     */
    async deactivateAll(): Promise<void> {
        const promises: Promise<void>[] = [];
        for (const pluginId of this.plugins.keys()) {
            promises.push(this.deactivatePlugin(pluginId));
        }
        await Promise.allSettled(promises);
    }

    /**
     * Reload a plugin (deactivate + activate).
     */
    async reloadPlugin(pluginId: string): Promise<void> {
        const loaded = this.plugins.get(pluginId);
        if (!loaded) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        const pluginPath = path.join(this.pluginsDir, pluginId);
        await this.deactivatePlugin(pluginId);
        this.plugins.delete(pluginId);
        await this.loadPlugin(pluginPath);
    }

    /**
     * Install a plugin from a directory or npm package.
     */
    async installPlugin(source: string): Promise<void> {
        const targetDir = path.join(this.pluginsDir, path.basename(source));

        if (fs.existsSync(source) && fs.statSync(source).isDirectory()) {
            // Copy from local directory
            await this.copyDir(source, targetDir);
        } else {
            // Install from npm
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            await execAsync(`npm install ${source}`, { cwd: targetDir });
        }

        await this.loadPlugin(targetDir);
        logger.info(`Plugin installed: ${source}`);
    }

    /**
     * Uninstall a plugin.
     */
    async uninstallPlugin(pluginId: string): Promise<void> {
        await this.deactivatePlugin(pluginId);
        this.plugins.delete(pluginId);

        const pluginDir = path.join(this.pluginsDir, pluginId);
        if (fs.existsSync(pluginDir)) {
            fs.rmSync(pluginDir, { recursive: true, force: true });
        }

        logger.info(`Plugin uninstalled: ${pluginId}`);
    }

    /**
     * Get all loaded plugins.
     */
    getPlugins(): LoadedPlugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Get a specific plugin.
     */
    getPlugin(pluginId: string): LoadedPlugin | undefined {
        return this.plugins.get(pluginId);
    }

    /**
     * Get plugin statistics.
     */
    getStats(): {
        total: number;
        active: number;
        inactive: number;
        errored: number;
        totalTools: number;
        totalCommands: number;
    } {
        const plugins = this.getPlugins();
        return {
            total: plugins.length,
            active: plugins.filter((p) => p.isActive).length,
            inactive: plugins.filter((p) => !p.isActive && !p.error).length,
            errored: plugins.filter((p) => p.error).length,
            totalTools: plugins.reduce((sum, p) => sum + p.toolsRegistered, 0),
            totalCommands: plugins.reduce((sum, p) => sum + p.commandsRegistered, 0),
        };
    }

    /**
     * Handle a webview message from a plugin.
     */
    handleWebviewMessage(pluginId: string, action: string, payload: unknown): void {
        const handlers = this.webviewHandlers.get(pluginId);
        if (handlers) {
            const handler = handlers.get(action);
            if (handler) {
                handler(payload);
            }
        }
    }

    // --- Private Helpers ---

    private ensurePluginsDir(): void {
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true });
        }
    }

    private emitEvent(type: PluginEventType, pluginId: string, data?: unknown): void {
        const event: PluginEvent = {
            type,
            pluginId,
            timestamp: Date.now(),
            data,
        };
        this.emit("pluginEvent", event);
    }

    private async copyDir(src: string, dest: string): Promise<void> {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;

            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                await this.copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}