import * as vscode from "vscode";
import type { ToolDefinition, ToolCall, ToolResult } from "../../types";
import { logger } from "../../utils/logger";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import * as util from "util";
import { registerGitTools } from "./git-tools";
import { UndoManager } from "./undo-manager";

// ============================================================
// SHEN AI — Tool Registry
// ============================================================

type ToolHandler = (args: Record<string, unknown>) => Promise<string>;

export class ToolRegistry {
    private tools: Map<string, { definition: ToolDefinition; handler: ToolHandler }>;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.tools = new Map();
        this.registerBuiltinTools();
        registerGitTools(this);
    }

    private registerBuiltinTools(): void {
        // read_file
        this.register({
            name: "read_file",
            description: "Read the contents of a file in the workspace. Use this to examine existing files.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative path to the file from workspace root",
                    },
                    start_line: {
                        type: "number",
                        description: "Optional: 1-based line number to start reading from",
                    },
                    end_line: {
                        type: "number",
                        description: "Optional: 1-based line number to stop reading at",
                    },
                },
                required: ["path"],
            },
        }, async (args) => {
            const filePath = args.path as string;
            const startLine = (args.start_line as number) || 1;
            const endLine = args.end_line as number | undefined;

            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return "Error: No workspace folder open.";
            }

            const fullPath = path.join(workspaceRoot, filePath);

            try {
                const content = await fs.promises.readFile(fullPath, "utf-8");
                const lines = content.split("\n");

                const start = Math.max(0, startLine - 1);
                const end = endLine ? Math.min(lines.length, endLine) : lines.length;
                const selectedLines = lines.slice(start, end);

                let result = "";
                for (let i = 0; i < selectedLines.length; i++) {
                    result += `${start + i + 1} | ${selectedLines[i]}\n`;
                }

                if (endLine && endLine < lines.length) {
                    result += `\n... (${lines.length - endLine} more lines)`;
                }

                return result || "(empty file)";
            } catch (error) {
                return `Error reading file: ${(error as Error).message}`;
            }
        });

        // write_to_file
        this.register({
            name: "write_to_file",
            description: "Write content to a file. Creates the file and any necessary parent directories if they don't exist. Overwrites existing files.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative path to the file from workspace root",
                    },
                    content: {
                        type: "string",
                        description: "The complete content to write to the file",
                    },
                },
                required: ["path", "content"],
            },
        }, async (args) => {
            const filePath = args.path as string;
            const content = args.content as string;

            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return "Error: No workspace folder open.";
            }

            const fullPath = path.join(workspaceRoot, filePath);

            try {
                // Take a snapshot before editing
                await UndoManager.getInstance().snapshotFile(fullPath);

                const dir = path.dirname(fullPath);
                await fs.promises.mkdir(dir, { recursive: true });
                await fs.promises.writeFile(fullPath, content, "utf-8");
                return `Successfully wrote ${content.split("\n").length} lines to ${filePath}`;
            } catch (error) {
                return `Error writing file: ${(error as Error).message}`;
            }
        });

        // list_files
        this.register({
            name: "list_files",
            description: "List files and directories within a specified directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative path to the directory from workspace root. Use '.' for root.",
                    },
                    recursive: {
                        type: "boolean",
                        description: "Whether to list files recursively",
                    },
                },
                required: ["path"],
            },
        }, async (args) => {
            const dirPath = args.path as string;
            const recursive = args.recursive as boolean || false;

            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return "Error: No workspace folder open.";
            }

            const fullPath = path.join(workspaceRoot, dirPath === "." ? "" : dirPath);

            try {
                const entries = await this.listDir(fullPath, recursive, 0, 3);
                return entries.join("\n");
            } catch (error) {
                return `Error listing directory: ${(error as Error).message}`;
            }
        });

        // search_files
        this.register({
            name: "search_files",
            description: "Search for a regex pattern across files in a directory.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative path to the directory to search in",
                    },
                    regex: {
                        type: "string",
                        description: "Regular expression pattern to search for",
                    },
                    file_pattern: {
                        type: "string",
                        description: "Glob pattern to filter files (e.g., '*.ts')",
                    },
                },
                required: ["path", "regex"],
            },
        }, async (args) => {
            const dirPath = args.path as string;
            const regexStr = args.regex as string;
            const filePattern = args.file_pattern as string || "*";

            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return "Error: No workspace folder open.";
            }

            const fullPath = path.join(workspaceRoot, dirPath === "." ? "" : dirPath);

            try {
                const regex = new RegExp(regexStr);
                const results = await this.searchInDir(fullPath, regex, filePattern);
                if (results.length === 0) {
                    return "No matches found.";
                }
                return results.slice(0, 50).join("\n") + (results.length > 50 ? `\n... (${results.length - 50} more matches)` : "");
            } catch (error) {
                return `Error searching files: ${(error as Error).message}`;
            }
        });

        // execute_command
        this.register({
            name: "execute_command",
            description: "Execute a shell command in the workspace directory.",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "The shell command to execute",
                    },
                },
                required: ["command"],
            },
        }, async (args) => {
            const command = args.command as string;
            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return "Error: No workspace folder open.";
            }

            try {
                const execPromise = util.promisify(exec);

                const { stdout, stderr } = await execPromise(command, {
                    cwd: workspaceRoot,
                    timeout: 30000,
                    maxBuffer: 1024 * 1024,
                });

                let result = "";
                if (stdout) result += stdout;
                if (stderr) result += (result ? "\n" : "") + "STDERR:\n" + stderr;
                return result || "(command completed with no output)";
            } catch (error) {
                const err = error as { stdout?: string; stderr?: string; message: string };
                let result = `Command failed: ${err.message}`;
                if (err.stdout) result += "\n" + err.stdout;
                if (err.stderr) result += "\n" + err.stderr;
                return result;
            }
        });

        // replace_in_file
        this.register({
            name: "replace_in_file",
            description: "Replace specific sections of an existing file using SEARCH/REPLACE blocks. This is more precise than write_to_file when you only need to change specific parts of a file. Each SEARCH block must match the file content EXACTLY (including whitespace and indentation).",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative path to the file from workspace root",
                    },
                    diff: {
                        type: "string",
                        description: "One or more SEARCH/REPLACE blocks in this format:\n------- SEARCH\n[exact content to find]\n=======\n[new content to replace with]\n+++++++ REPLACE",
                    },
                },
                required: ["path", "diff"],
            },
        }, async (args) => {
            const filePath = args.path as string;
            const diffContent = args.diff as string;

            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return "Error: No workspace folder open.";
            }

            const fullPath = path.join(workspaceRoot, filePath);

            try {
                let fileContent = await fs.promises.readFile(fullPath, "utf-8");

                // Parse SEARCH/REPLACE blocks
                const blocks = this.parseSearchReplaceBlocks(diffContent);
                if (blocks.length === 0) {
                    return "Error: No valid SEARCH/REPLACE blocks found. Use the format:\n------- SEARCH\n[content]\n=======\n[replacement]\n+++++++ REPLACE";
                }

                let replacements = 0;
                const errors: string[] = [];
                let hasAnyError = false;

                for (const block of blocks) {
                    const searchIdx = fileContent.indexOf(block.search);
                    if (searchIdx === -1) {
                        errors.push(`SEARCH block not found: "${block.search.substring(0, 50)}..."`);
                        hasAnyError = true;
                        continue;
                    }

                    // Check for multiple matches
                    const secondIdx = fileContent.indexOf(block.search, searchIdx + block.search.length);
                    if (secondIdx !== -1) {
                        errors.push(`SEARCH block matches multiple locations. Make it more specific: "${block.search.substring(0, 50)}..."`);
                        hasAnyError = true;
                        continue;
                    }

                    fileContent = fileContent.substring(0, searchIdx) + block.replace + fileContent.substring(searchIdx + block.search.length);
                    replacements++;
                }

                // If ANY block failed, abort the entire write to prevent partial/corrupt changes
                if (hasAnyError) {
                    return `Failed to apply changes. ${replacements}/${blocks.length} blocks matched, but some failed. NO changes were written to the file (all-or-nothing safety).\nErrors:\n${errors.map((e) => `  - ${e}`).join("\n")}`;
                }

                await fs.promises.writeFile(fullPath, fileContent, "utf-8");
                return `Successfully applied ${replacements} replacement(s) to ${filePath}`;
            } catch (error) {
                return `Error in replace_in_file: ${(error as Error).message}`;
            }
        });

        // read_multiple_files
        this.register({
            name: "read_multiple_files",
            description: "Read the contents of multiple files in a single operation. More efficient than reading files one by one. Returns all file contents with clear separators.",
            parameters: {
                type: "object",
                properties: {
                    paths: {
                        type: "array",
                        items: { type: "string" },
                        description: "Array of relative file paths to read from workspace root",
                    },
                },
                required: ["paths"],
            },
        }, async (args) => {
            const paths = args.paths as string[];
            if (!Array.isArray(paths) || paths.length === 0) {
                return "Error: 'paths' must be a non-empty array of file paths.";
            }

            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return "Error: No workspace folder open.";
            }

            const results: string[] = [];
            let successCount = 0;
            let errorCount = 0;

            for (const filePath of paths) {
                const fullPath = path.join(workspaceRoot, filePath);
                try {
                    const content = await fs.promises.readFile(fullPath, "utf-8");
                    const lines = content.split("\n");
                    results.push(`\n${"═".repeat(60)}\n📄 ${filePath} (${lines.length} lines)\n${"═".repeat(60)}\n`);
                    for (let i = 0; i < lines.length; i++) {
                        results.push(`${i + 1} | ${lines[i]}`);
                    }
                    successCount++;
                } catch (error) {
                    results.push(`\n${"═".repeat(60)}\n❌ ${filePath} — ERROR: ${(error as Error).message}\n${"═".repeat(60)}\n`);
                    errorCount++;
                }
            }

            const header = `📚 Read ${successCount}/${paths.length} files${errorCount > 0 ? ` (${errorCount} errors)` : ""}\n`;
            return header + results.join("\n");
        });

        // apply_diff
        this.register({
            name: "apply_diff",
            description: "Apply a unified diff patch to a file. Use this when you have a standard unified diff format to apply.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Relative path to the file from workspace root",
                    },
                    diff: {
                        type: "string",
                        description: "Unified diff content to apply",
                    },
                },
                required: ["path", "diff"],
            },
        }, async (args) => {
            const filePath = args.path as string;
            const diffContent = args.diff as string;

            const workspaceRoot = this.getWorkspaceRoot();
            if (!workspaceRoot) {
                return "Error: No workspace folder open.";
            }

            const fullPath = path.join(workspaceRoot, filePath);

            try {
                const originalContent = await fs.promises.readFile(fullPath, "utf-8");
                const result = this.applyUnifiedDiff(originalContent, diffContent);

                if (result.error) {
                    return `Error applying diff: ${result.error}`;
                }

                await fs.promises.writeFile(fullPath, result.content, "utf-8");
                return `Successfully applied diff to ${filePath} (${result.added} additions, ${result.removed} removals)`;
            } catch (error) {
                return `Error in apply_diff: ${(error as Error).message}`;
            }
        });

        logger.info(`Tool registry initialized with ${this.tools.size} tools.`);
    }

    register(definition: ToolDefinition, handler: ToolHandler): void {
        this.tools.set(definition.name, { definition, handler });
        logger.info(`Tool registered: ${definition.name}`);
    }

    getToolDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map((t) => t.definition);
    }

    async executeTool(call: ToolCall): Promise<ToolResult> {
        const tool = this.tools.get(call.name);
        if (!tool) {
            return {
                toolCallId: call.id,
                name: call.name,
                content: `Error: Unknown tool '${call.name}'`,
                isError: true,
            };
        }

        try {
            const result = await tool.handler(call.arguments);
            return {
                toolCallId: call.id,
                name: call.name,
                content: result,
                isError: false,
            };
        } catch (error) {
            return {
                toolCallId: call.id,
                name: call.name,
                content: `Error executing tool '${call.name}': ${(error as Error).message}`,
                isError: true,
            };
        }
    }

    private getWorkspaceRoot(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return undefined;
    }

    private async listDir(dir: string, recursive: boolean, depth: number, maxDepth: number): Promise<string[]> {
        if (depth > maxDepth) return [];

        const IGNORED = ["node_modules", ".git", "dist", "out", ".vscode"];
        const entries: string[] = [];

        try {
            const items = await fs.promises.readdir(dir, { withFileTypes: true });
            for (const item of items) {
                if (item.name.startsWith(".")) continue;
                if (IGNORED.includes(item.name)) continue;

                const prefix = "  ".repeat(depth);
                const icon = item.isDirectory() ? "📁" : "📄";
                entries.push(`${prefix}${icon} ${item.name}`);

                if (recursive && item.isDirectory() && depth < maxDepth) {
                    const subEntries = await this.listDir(path.join(dir, item.name), recursive, depth + 1, maxDepth);
                    entries.push(...subEntries);
                }
            }
        } catch {
            // Skip inaccessible directories
        }

        return entries;
    }

    private async searchInDir(dir: string, regex: RegExp, filePattern: string): Promise<string[]> {
        const results: string[] = [];
        const IGNORED = ["node_modules", ".git", "dist", "out"];

        async function walk(currentDir: string): Promise<void> {
            try {
                const items = await fs.promises.readdir(currentDir, { withFileTypes: true });
                for (const item of items) {
                    if (item.name.startsWith(".")) continue;
                    if (IGNORED.includes(item.name)) continue;

                    const fullPath = path.join(currentDir, item.name);

                    if (item.isDirectory()) {
                        await walk(fullPath);
                    } else {
                        if (filePattern !== "*") {
                            const ext = filePattern.replace("*", "");
                            if (!item.name.endsWith(ext)) continue;
                        }

                        try {
                            const content = await fs.promises.readFile(fullPath, "utf-8");
                            const lines = content.split("\n");
                            for (let i = 0; i < lines.length; i++) {
                                if (regex.test(lines[i])) {
                                    results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                                }
                            }
                        } catch {
                            // Skip unreadable files
                        }
                    }
                }
            } catch {
                // Skip inaccessible directories
            }
        }

        await walk(dir);
        return results;
    }

    private parseSearchReplaceBlocks(diffContent: string): Array<{ search: string; replace: string }> {
        const blocks: Array<{ search: string; replace: string }> = [];
        const lines = diffContent.split("\n");
        let i = 0;

        while (i < lines.length) {
            // Look for SEARCH marker
            if (lines[i].trim() === "------- SEARCH") {
                const searchLines: string[] = [];
                i++;

                // Collect search content until =======
                while (i < lines.length && lines[i].trim() !== "=======") {
                    searchLines.push(lines[i]);
                    i++;
                }

                if (i >= lines.length) break; // Malformed
                i++; // Skip =======

                const replaceLines: string[] = [];

                // Collect replace content until +++++++ REPLACE
                while (i < lines.length && lines[i].trim() !== "+++++++ REPLACE") {
                    replaceLines.push(lines[i]);
                    i++;
                }

                if (i >= lines.length) break; // Malformed
                i++; // Skip +++++++ REPLACE

                blocks.push({
                    search: searchLines.join("\n"),
                    replace: replaceLines.join("\n"),
                });
            } else {
                i++;
            }
        }

        return blocks;
    }

    private applyUnifiedDiff(originalContent: string, diffContent: string): {
        content: string;
        added: number;
        removed: number;
        error?: string;
    } {
        const lines = originalContent.split("\n");
        const diffLines = diffContent.split("\n");
        let added = 0;
        let removed = 0;
        let result = [...lines];
        let lineOffset = 0;

        // Parse hunks from unified diff
        let i = 0;
        while (i < diffLines.length) {
            const line = diffLines[i];

            // Skip header lines
            if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ")) {
                i++;
                continue;
            }

            // Parse hunk header: @@ -start,count +start,count @@
            const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
            if (hunkMatch) {
                const oldStart = parseInt(hunkMatch[1]);
                const oldCount = parseInt(hunkMatch[2] === undefined ? "1" : hunkMatch[2]);
                const newStart = parseInt(hunkMatch[3]);

                i++;

                // Collect hunk lines
                const hunkLines: string[] = [];
                while (i < diffLines.length && !diffLines[i].startsWith("@@") && !diffLines[i].startsWith("diff ")) {
                    hunkLines.push(diffLines[i]);
                    i++;
                }

                // Apply hunk
                const newLines: string[] = [];

                for (const hunkLine of hunkLines) {
                    if (hunkLine.startsWith("-")) {
                        removed++;
                    } else if (hunkLine.startsWith("+")) {
                        newLines.push(hunkLine.substring(1));
                        added++;
                    } else if (hunkLine.startsWith(" ") || hunkLine === "") {
                        newLines.push(hunkLine.startsWith(" ") ? hunkLine.substring(1) : hunkLine);
                    }
                }

                // Replace the old lines with new lines, taking into account previous hunk offsets
                // If oldCount is 0, it's a pure insertion after oldStart
                const startIdx = Math.max(0, oldStart - (oldCount === 0 ? 0 : 1) + lineOffset);
                const endIdx = startIdx + oldCount;

                result = [...result.slice(0, startIdx), ...newLines, ...result.slice(endIdx)];

                // Track offset for next hunks
                lineOffset += newLines.length - oldCount;
            } else {
                i++;
            }
        }

        return {
            content: result.join("\n"),
            added,
            removed,
        };
    }
}
