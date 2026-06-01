import * as vscode from "vscode";

// ============================================================
// SHEN AI — Logger Utility
// ============================================================

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private level: LogLevel;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel("SHEN AI");
        this.level = LogLevel.INFO;
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    debug(message: string, ...args: unknown[]): void {
        if (this.level <= LogLevel.DEBUG) {
            this.log("DEBUG", message, args);
        }
    }

    info(message: string, ...args: unknown[]): void {
        if (this.level <= LogLevel.INFO) {
            this.log("INFO", message, args);
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this.level <= LogLevel.WARN) {
            this.log("WARN", message, args);
        }
    }

    error(message: string, ...args: unknown[]): void {
        if (this.level <= LogLevel.ERROR) {
            this.log("ERROR", message, args);
        }
    }

    private log(level: string, message: string, args: unknown[]): void {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? " " + args.map((a) => this.formatArg(a)).join(" ") : "";
        const line = `[${timestamp}] [${level}] ${message}${formattedArgs}`;
        this.outputChannel.appendLine(line);
    }

    private formatArg(arg: unknown): string {
        if (arg instanceof Error) {
            return arg.message + (arg.stack ? "\n" + arg.stack : "");
        }
        if (typeof arg === "object" && arg !== null) {
            try {
                return JSON.stringify(arg, null, 2);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }

    show(): void {
        this.outputChannel.show(true);
    }

    dispose(): void {
        this.outputChannel.dispose();
        // Reset singleton instance so reactivation creates a fresh output channel
        Logger.instance = undefined as unknown as Logger;
    }
}

export const logger = Logger.getInstance();
