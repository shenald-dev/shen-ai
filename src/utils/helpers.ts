import * as vscode from "vscode";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { FileEntry, FileReadResult } from "../types";

// ============================================================
// SHEN AI — Utility Helpers
// ============================================================

// --- ID Generation ---

export function generateId(): string {
    return crypto.randomUUID();
}

export function generateShortId(): string {
    return crypto.randomBytes(4).toString("hex");
}

// --- Token Estimation (rough estimate without tiktoken) ---

export function estimateTokens(text: string): number {
    // Rough approximation: ~4 characters per token for English/code
    return Math.ceil(text.length / 4);
}

export function truncateToTokenLimit(text: string, maxTokens: number): string {
    const estimatedTokens = estimateTokens(text);
    if (estimatedTokens <= maxTokens) {
        return text;
    }
    // Truncate proportionally
    const ratio = maxTokens / estimatedTokens;
    const maxChars = Math.floor(text.length * ratio * 0.9);
    return text.substring(0, maxChars) + "\n... [truncated]";
}

// --- File Utilities ---

export function getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        return workspaceFolders[0].uri.fsPath;
    }
    return undefined;
}

export function resolveWorkspacePath(filePath: string): string {
    const root = getWorkspaceRoot();
    if (!root) {
        return filePath;
    }
    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    return path.join(root, filePath);
}

export function getRelativePath(filePath: string): string {
    const root = getWorkspaceRoot();
    if (!root) {
        return filePath;
    }
    return path.relative(root, filePath);
}

export async function readFile(filePath: string): Promise<FileReadResult> {
    const resolvedPath = resolveWorkspacePath(filePath);
    const content = await fs.promises.readFile(resolvedPath, "utf-8");
    const lines = content.split("\n");
    return {
        content,
        path: getRelativePath(resolvedPath),
        lineCount: lines.length,
    };
}

export async function writeFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = resolveWorkspacePath(filePath);
    const dir = path.dirname(resolvedPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(resolvedPath, content, "utf-8");
}

export async function listDirectory(dirPath: string, recursive = false): Promise<FileEntry[]> {
    const resolvedPath = resolveWorkspacePath(dirPath);
    const entries: FileEntry[] = [];

    async function walk(dir: string, baseRel: string): Promise<void> {
        const items = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const item of items) {
            // Skip hidden files and common ignored directories
            if (item.name.startsWith(".")) continue;
            if (item.isDirectory() && ["node_modules", "dist", "out", ".git"].includes(item.name)) continue;

            const fullPath = path.join(dir, item.name);
            const relPath = path.join(baseRel, item.name);

            entries.push({
                name: item.name,
                path: relPath,
                isDirectory: item.isDirectory(),
            });

            if (recursive && item.isDirectory()) {
                await walk(fullPath, relPath);
            }
        }
    }

    await walk(resolvedPath, "");
    return entries;
}

export async function fileExists(filePath: string): Promise<boolean> {
    const resolvedPath = resolveWorkspacePath(filePath);
    try {
        await fs.promises.access(resolvedPath);
        return true;
    } catch {
        return false;
    }
}

export async function searchFiles(
    dirPath: string,
    pattern: RegExp,
    filePattern = "*"
): Promise<{ file: string; line: number; content: string }[]> {
    const results: { file: string; line: number; content: string }[] = [];
    const files = await listDirectory(dirPath, true);

    for (const file of files) {
        if (file.isDirectory) continue;
        if (filePattern !== "*" && !file.name.match(filePattern)) continue;

        try {
            const content = await readFile(file.path);
            const lines = content.content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (pattern.test(lines[i])) {
                    results.push({
                        file: file.path,
                        line: i + 1,
                        content: lines[i].trim(),
                    });
                }
            }
        } catch {
            // Skip files that can't be read
        }
    }

    return results;
}

// --- String Utilities ---

export function escapeXml(str: string): string {
    let result = "";
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        switch (ch) {
            case "&":
                result += "\u0026amp;";
                break;
            case "<":
                result += "\u0026lt;";
                break;
            case ">":
                result += "\u0026gt;";
                break;
            case '"':
                result += "\u0026quot;";
                break;
            case "'":
                result += "\u0026#39;";
                break;
            default:
                result += ch;
        }
    }
    return result;
}

export function truncate(str: string, maxLength: number, suffix = "..."): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - suffix.length) + suffix;
}

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
}

// --- Time Utilities ---

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- JSON Utilities ---

export function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        return fallback;
    }
}

export function safeJsonStringify(obj: unknown, indent = 2): string {
    try {
        return JSON.stringify(obj, null, indent);
    } catch {
        return String(obj);
    }
}

// --- Validation ---

export function isValidUrl(str: string): boolean {
    try {
        new URL(str);
        return true;
    } catch {
        return false;
    }
}

export function isValidJson(str: string): boolean {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}

// --- VS Code Utilities ---

export async function showTextDocument(filePath: string): Promise<void> {
    const resolvedPath = resolveWorkspacePath(filePath);
    const uri = vscode.Uri.file(resolvedPath);
    await vscode.window.showTextDocument(uri);
}

export function getActiveEditorContent(): { content: string; filePath: string; selection?: string } | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return undefined;

    const filePath = getRelativePath(editor.document.uri.fsPath);
    const content = editor.document.getText();
    const selection = editor.selection.isEmpty ? undefined : editor.document.getText(editor.selection);

    return { content, filePath, selection };
}

export async function insertTextAtCursor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    await editor.edit((editBuilder: vscode.TextEditorEdit) => {
        editBuilder.insert(editor.selection.active, text);
    });
}

export async function replaceSelection(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return;

    await editor.edit((editBuilder: vscode.TextEditorEdit) => {
        editBuilder.replace(editor.selection, text);
    });
}