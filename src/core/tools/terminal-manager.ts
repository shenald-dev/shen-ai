import * as vscode from "vscode";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Terminal Manager (Streaming Terminal Execution)
// ============================================================

export interface TerminalOutput {
    text: string;
    isError: boolean;
    timestamp: number;
}

export interface TerminalResult {
    output: string;
    exitCode: number | null;
    duration: number;
    timedOut: boolean;
}

export type TerminalOutputCallback = (output: TerminalOutput) => void;

export class TerminalManager extends EventEmitter {
    private terminals: Map<string, vscode.Terminal>;
    private outputBuffers: Map<string, string>;
    private activeExecutions: Map<string, {
        resolve: (result: TerminalResult) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
        startTime: number;
    }>;
    private disposables: vscode.Disposable[];
    private outputCallback: TerminalOutputCallback | null;

    constructor() {
        super();
        this.terminals = new Map();
        this.outputBuffers = new Map();
        this.activeExecutions = new Map();
        this.disposables = [];
        this.outputCallback = null;
        this.setupListeners();
    }

    private setupListeners(): void {
        // Listen for terminal close
        this.disposables.push(
            vscode.window.onDidCloseTerminal((terminal) => {
                for (const [id, t] of this.terminals) {
                    if (t === terminal) {
                        this.terminals.delete(id);
                        this.outputBuffers.delete(id);
                        break;
                    }
                }
            })
        );
    }

    setOutputCallback(callback: TerminalOutputCallback | null): void {
        this.outputCallback = callback;
    }

    async executeCommand(
        command: string,
        cwd?: string,
        timeoutMs: number = 30000
    ): Promise<TerminalResult> {
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        logger.info(`Executing command [${executionId}]: ${command}`);

        return new Promise<TerminalResult>((resolve, reject) => {
            // Create a dedicated terminal for this execution
            const terminalName = `SHEN AI: ${executionId.substring(0, 8)}`;
            const terminal = vscode.window.createTerminal({
                name: terminalName,
                cwd: cwd || this.getWorkspaceRoot(),
                hideFromUser: true,
            });

            this.terminals.set(executionId, terminal);
            this.outputBuffers.set(executionId, "");

            const timeout = setTimeout(() => {
                this.cleanupExecution(executionId, true);
                resolve({
                    output: this.outputBuffers.get(executionId) || "",
                    exitCode: null,
                    duration: timeoutMs,
                    timedOut: true,
                });
            }, timeoutMs);

            this.activeExecutions.set(executionId, {
                resolve,
                reject,
                timeout,
                startTime: Date.now(),
            });

            terminal.show();

            // Use a sentinel to detect command completion
            const sentinel = `__SHEN_DONE_${executionId}__`;
            const wrappedCommand = `${command}; echo "${sentinel}:\$?"`;

            // Send the command to the terminal
            terminal.sendText(wrappedCommand, true);

            // Start polling for output
            this.pollTerminalOutput(executionId, sentinel);
        });
    }

    private pollTerminalOutput(executionId: string, sentinel: string): void {
        const interval = setInterval(() => {
            const buffer = this.outputBuffers.get(executionId) || "";

            // Check if sentinel is in the output
            if (buffer.includes(sentinel)) {
                clearInterval(interval);

                // Extract exit code
                const match = buffer.match(new RegExp(`${sentinel}:(\\d+)`));
                const exitCode = match ? parseInt(match[1]) : null;

                // Clean output (remove sentinel line)
                const cleanOutput = buffer
                    .replace(new RegExp(`.*${sentinel}:\\d+.*`, "g"), "")
                    .trim();

                const exec = this.activeExecutions.get(executionId);
                if (exec) {
                    clearTimeout(exec.timeout);
                    const duration = Date.now() - exec.startTime;
                    exec.resolve({
                        output: cleanOutput,
                        exitCode,
                        duration,
                        timedOut: false,
                    });
                    this.activeExecutions.delete(executionId);
                }

                this.cleanupExecution(executionId, false);
                return;
            }

            // Stream current output
            if (this.outputCallback && buffer.length > 0) {
                this.outputCallback({
                    text: buffer,
                    isError: false,
                    timestamp: Date.now(),
                });
            }
        }, 200);

        // Store interval for cleanup
        const exec = this.activeExecutions.get(executionId);
        if (exec) {
            const originalResolve = exec.resolve;
            exec.resolve = (result: TerminalResult) => {
                clearInterval(interval);
                originalResolve(result);
            };
        }
    }

    private cleanupExecution(executionId: string, dispose: boolean): void {
        const terminal = this.terminals.get(executionId);
        if (terminal && dispose) {
            terminal.dispose();
        }
        this.terminals.delete(executionId);
        this.outputBuffers.delete(executionId);
    }

    private getWorkspaceRoot(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return undefined;
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        for (const terminal of this.terminals.values()) {
            terminal.dispose();
        }
        for (const exec of this.activeExecutions.values()) {
            clearTimeout(exec.timeout);
        }
        this.terminals.clear();
        this.outputBuffers.clear();
        this.activeExecutions.clear();
    }
}