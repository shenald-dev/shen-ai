import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../../utils/logger";
import { getWorkspaceRoot } from "../../utils/helpers";

const execAsync = promisify(exec);

// ============================================================
// SHEN AI — Git Tools
// Comprehensive git operations for version control management.
// ============================================================

export interface GitStatus {
    branch: string;
    ahead: number;
    behind: number;
    staged: GitFileChange[];
    unstaged: GitFileChange[];
    untracked: string[];
    isClean: boolean;
}

export interface GitFileChange {
    file: string;
    status: "added" | "modified" | "deleted" | "renamed";
    oldPath?: string;
}

export interface GitCommit {
    hash: string;
    shortHash: string;
    author: string;
    date: string;
    message: string;
    files: string[];
}

export interface GitBranch {
    name: string;
    isCurrent: boolean;
    isRemote: boolean;
    lastCommit: string;
    lastCommitDate: string;
}

export interface GitDiff {
    file: string;
    diff: string;
    additions: number;
    deletions: number;
}

export class GitTools {
    private workspaceRoot: string | undefined;

    constructor() {
        this.workspaceRoot = getWorkspaceRoot();
    }

    private async runGit(args: string[], cwd?: string): Promise<string> {
        const dir = cwd || this.workspaceRoot;
        if (!dir) {
            throw new Error("No workspace folder open.");
        }

        try {
            const { stdout, stderr } = await execAsync(`git ${args.join(" ")}`, {
                cwd: dir,
                maxBuffer: 10 * 1024 * 1024,
            });
            return stdout.trim();
        } catch (error) {
            const err = error as { stdout?: string; stderr?: string; message: string };
            if (err.stderr && !err.stderr.includes("warning")) {
                throw new Error(`Git error: ${err.stderr.trim()}`);
            }
            return err.stdout || "";
        }
    }

    /**
     * Get current git status.
     */
    async getStatus(): Promise<GitStatus> {
        // Get branch info
        const branchOutput = await this.runGit(["branch", "--show-current"]);
        const branch = branchOutput || "HEAD";

        // Get ahead/behind
        let ahead = 0;
        let behind = 0;
        try {
            const countOutput = await this.runGit(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
            const parts = countOutput.split("\t");
            behind = parseInt(parts[0]) || 0;
            ahead = parseInt(parts[1]) || 0;
        } catch {
            // No upstream configured
        }

        // Get staged changes
        const stagedOutput = await this.runGit(["diff", "--cached", "--name-status"]);
        const staged = this.parseNameStatus(stagedOutput);

        // Get unstaged changes
        const unstagedOutput = await this.runGit(["diff", "--name-status"]);
        const unstaged = this.parseNameStatus(unstagedOutput);

        // Get untracked files
        const untrackedOutput = await this.runGit(["ls-files", "--others", "--exclude-standard"]);
        const untracked = untrackedOutput ? untrackedOutput.split("\n").filter(Boolean) : [];

        return {
            branch,
            ahead,
            behind,
            staged,
            unstaged,
            untracked,
            isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
        };
    }

    /**
     * Get recent commits.
     */
    async getCommits(count: number = 10): Promise<GitCommit[]> {
        const format = "%H%n%h%n%an%n%ai%n%s";
        const output = await this.runGit(["log", `-${count}`, `--format=${format}`, "--name-only"]);

        if (!output) return [];

        const commits: GitCommit[] = [];
        const blocks = output.split("\n\n");

        for (const block of blocks) {
            const lines = block.split("\n");
            if (lines.length < 5) continue;

            commits.push({
                hash: lines[0],
                shortHash: lines[1],
                author: lines[2],
                date: lines[3],
                message: lines[4],
                files: lines.slice(5).filter(Boolean),
            });
        }

        return commits;
    }

    /**
     * Get all branches.
     */
    async getBranches(): Promise<GitBranch[]> {
        const output = await this.runGit(["branch", "-a", "-v", "--format=%(refname:short)|%(HEAD)|%(committerdate:iso)|%(subject)"]);

        if (!output) return [];

        return output.split("\n").filter(Boolean).map((line) => {
            const [name, head, date, message] = line.split("|");
            return {
                name: name.trim(),
                isCurrent: head === "*",
                isRemote: name.includes("remotes/"),
                lastCommit: message || "",
                lastCommitDate: date || "",
            };
        });
    }

    /**
     * Get diff for staged or unstaged changes.
     */
    async getDiff(staged: boolean = false, file?: string): Promise<GitDiff[]> {
        const args = ["diff"];
        if (staged) args.push("--cached");
        if (file) args.push("--", file);
        args.push("--stat", "--unified=0");

        const statOutput = await this.runGit([...args]);

        // Get full diff
        const diffArgs = ["diff"];
        if (staged) diffArgs.push("--cached");
        if (file) diffArgs.push("--", file);

        const diffOutput = await this.runGit(diffArgs);

        if (!diffOutput) return [];

        // Parse diff into per-file diffs
        const diffs: GitDiff[] = [];
        const fileDiffs = diffOutput.split(/(?=^diff --git)/m);

        for (const fileDiff of fileDiffs) {
            if (!fileDiff.trim()) continue;

            const fileMatch = fileDiff.match(/diff --git a\/(.+?) b\/(.+)/);
            const fileName = fileMatch ? fileMatch[2] : "unknown";

            const additions = (fileDiff.match(/^\+/gm) || []).length;
            const deletions = (fileDiff.match(/^-/gm) || []).length;

            diffs.push({
                file: fileName,
                diff: fileDiff.trim(),
                additions,
                deletions,
            });
        }

        return diffs;
    }

    /**
     * Stage files.
     */
    async stage(files: string[]): Promise<string> {
        const args = ["add", "--", ...files];
        return this.runGit(args);
    }

    /**
     * Stage all changes.
     */
    async stageAll(): Promise<string> {
        return this.runGit(["add", "-A"]);
    }

    /**
     * Unstage files.
     */
    async unstage(files: string[]): Promise<string> {
        return this.runGit(["reset", "HEAD", "--", ...files]);
    }

    /**
     * Create a commit.
     */
    async commit(message: string, amend: boolean = false): Promise<string> {
        const args = ["commit", "-m", `"${message}"`, "--"];
        if (amend) args.push("--amend", "--no-edit");
        return this.runGit(args);
    }

    /**
     * Create a new branch.
     */
    async createBranch(name: string, fromBranch?: string): Promise<string> {
        const args = ["checkout", "-b", name, "--"];
        if (fromBranch) args.push(fromBranch);
        return this.runGit(args);
    }

    /**
     * Switch to a branch.
     */
    async switchBranch(name: string): Promise<string> {
        return this.runGit(["checkout", "--", name]);
    }

    /**
     * Delete a branch.
     */
    async deleteBranch(name: string, force: boolean = false): Promise<string> {
        return this.runGit(["branch", force ? "-D" : "-d", "--", name]);
    }

    /**
     * Pull from remote.
     */
    async pull(remote: string = "origin", branch?: string): Promise<string> {
        const args = ["pull", remote, "--"];
        if (branch) args.push(branch);
        return this.runGit(args);
    }

    /**
     * Push to remote.
     */
    async push(remote: string = "origin", branch?: string, setUpstream: boolean = false): Promise<string> {
        const args = ["push", remote];
        if (setUpstream) args.push("-u");
        args.push("--");
        if (branch) args.push(branch);
        return this.runGit(args);
    }

    /**
     * Get the diff of a specific commit.
     */
    async getCommitDiff(hash: string): Promise<string> {
        return this.runGit(["show", hash]);
    }

    /**
     * Get blame for a file.
     */
    async blame(file: string, lineStart?: number, lineEnd?: number): Promise<string> {
        const args = ["blame"];
        if (lineStart && lineEnd) {
            args.push(`-L`, `${lineStart},${lineEnd}`);
        }
        args.push("--", file);
        return this.runGit(args);
    }

    /**
     * Stash changes.
     */
    async stash(message?: string): Promise<string> {
        const args = ["stash", "push"];
        if (message) args.push("-m", `"${message}"`);
        return this.runGit(args);
    }

    /**
     * Apply stash.
     */
    async stashApply(index?: number): Promise<string> {
        const args = ["stash", "apply"];
        if (index !== undefined) args.push(`stash@{${index}}`);
        return this.runGit(args);
    }

    /**
     * List stashes.
     */
    async stashList(): Promise<string> {
        return this.runGit(["stash", "list"]);
    }

    /**
     * Format a status summary for the AI.
     */
    async formatStatusSummary(): Promise<string> {
        const status = await this.getStatus();
        const lines: string[] = [];

        lines.push(`**Branch**: ${status.branch}`);
        if (status.ahead > 0) lines.push(`  ⬆️ ${status.ahead} commits ahead of remote`);
        if (status.behind > 0) lines.push(`  ⬇️ ${status.behind} commits behind remote`);

        if (status.staged.length > 0) {
            lines.push(`\n**Staged** (${status.staged.length}):`);
            for (const change of status.staged) {
                lines.push(`  ${this.statusIcon(change.status)} ${change.file}`);
            }
        }

        if (status.unstaged.length > 0) {
            lines.push(`\n**Unstaged** (${status.unstaged.length}):`);
            for (const change of status.unstaged) {
                lines.push(`  ${this.statusIcon(change.status)} ${change.file}`);
            }
        }

        if (status.untracked.length > 0) {
            lines.push(`\n**Untracked** (${status.untracked.length}):`);
            for (const file of status.untracked.slice(0, 10)) {
                lines.push(`  📄 ${file}`);
            }
            if (status.untracked.length > 10) {
                lines.push(`  ... and ${status.untracked.length - 10} more`);
            }
        }

        if (status.isClean) {
            lines.push("\n✅ Working tree is clean.");
        }

        return lines.join("\n");
    }

    private parseNameStatus(output: string): GitFileChange[] {
        if (!output) return [];

        return output.split("\n").filter(Boolean).map((line) => {
            const statusChar = line[0];
            const file = line.substring(2).trim();

            let status: GitFileChange["status"];
            let oldPath: string | undefined;

            switch (statusChar) {
                case "A": status = "added"; break;
                case "M": status = "modified"; break;
                case "D": status = "deleted"; break;
                case "R":
                    status = "renamed";
                    const parts = file.split("\t");
                    oldPath = parts[0];
                    break;
                default: status = "modified";
            }

            return {
                file: status === "renamed" ? file.split("\t")[1] || file : file,
                status,
                oldPath,
            };
        });
    }

    private statusIcon(status: GitFileChange["status"]): string {
        switch (status) {
            case "added": return "➕";
            case "modified": return "✏️";
            case "deleted": return "🗑️";
            case "renamed": return "🔄";
            default: return "❓";
        }
    }
}

// ============================================================
// Git Tool Registration Helpers
// ============================================================

export function registerGitTools(toolRegistry: any): void {
    const git = new GitTools();

    toolRegistry.register({
        name: "git_status",
        description: "Get the current git status including branch, staged/unstaged changes, and untracked files.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    }, async () => {
        return git.formatStatusSummary();
    });

    toolRegistry.register({
        name: "git_diff",
        description: "Get the git diff of changes. Can show staged or unstaged changes.",
        parameters: {
            type: "object",
            properties: {
                staged: {
                    type: "boolean",
                    description: "Show staged (cached) changes instead of unstaged",
                },
                file: {
                    type: "string",
                    description: "Optional: show diff for a specific file only",
                },
            },
            required: [],
        },
    }, async (args: Record<string, unknown>) => {
        const staged = args.staged as boolean || false;
        const file = args.file as string | undefined;
        const diffs = await git.getDiff(staged, file);

        if (diffs.length === 0) {
            return "No changes to show.";
        }

        return diffs.map((d) => `**${d.file}** (+${d.additions} -${d.deletions}):\n\`\`\`diff\n${d.diff.substring(0, 3000)}\n\`\`\``).join("\n\n");
    });

    toolRegistry.register({
        name: "git_commit",
        description: "Stage all changes and create a commit.",
        parameters: {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "The commit message",
                },
            },
            required: ["message"],
        },
    }, async (args: Record<string, unknown>) => {
        const message = args.message as string;
        await git.stageAll();
        const result = await git.commit(message);
        return `Committed: "${message}"\n${result || "Commit successful."}`;
    });

    toolRegistry.register({
        name: "git_branch",
        description: "Create, switch, or list git branches.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["create", "switch", "delete", "list"],
                    description: "The branch action to perform",
                },
                name: {
                    type: "string",
                    description: "Branch name (required for create, switch, delete)",
                },
            },
            required: ["action"],
        },
    }, async (args: Record<string, unknown>) => {
        const action = args.action as string;
        const name = args.name as string | undefined;

        switch (action) {
            case "list": {
                const branches = await git.getBranches();
                return branches.map((b) => `${b.isCurrent ? "→ " : "  "}${b.name} — ${b.lastCommit}`).join("\n");
            }
            case "create":
                if (!name) return "Branch name is required for create action.";
                return await git.createBranch(name);
            case "switch":
                if (!name) return "Branch name is required for switch action.";
                return await git.switchBranch(name);
            case "delete":
                if (!name) return "Branch name is required for delete action.";
                return await git.deleteBranch(name);
            default:
                return `Unknown action: ${action}`;
        }
    });

    toolRegistry.register({
        name: "git_log",
        description: "View recent git commit history.",
        parameters: {
            type: "object",
            properties: {
                count: {
                    type: "number",
                    description: "Number of commits to show (default: 10)",
                },
            },
            required: [],
        },
    }, async (args: Record<string, unknown>) => {
        const count = (args.count as number) || 10;
        const commits = await git.getCommits(count);

        return commits.map((c) =>
            `${c.shortHash} — ${c.author} — ${c.date.substring(0, 10)}\n  ${c.message}`
        ).join("\n\n");
    });

    toolRegistry.register({
        name: "git_push",
        description: "Push commits to remote repository.",
        parameters: {
            type: "object",
            properties: {
                remote: {
                    type: "string",
                    description: "Remote name (default: origin)",
                },
                branch: {
                    type: "string",
                    description: "Branch to push (default: current)",
                },
            },
            required: [],
        },
    }, async (args: Record<string, unknown>) => {
        const remote = (args.remote as string) || "origin";
        const branch = args.branch as string | undefined;
        return await git.push(remote, branch, true);
    });

    toolRegistry.register({
        name: "git_pull",
        description: "Pull changes from remote repository.",
        parameters: {
            type: "object",
            properties: {
                remote: {
                    type: "string",
                    description: "Remote name (default: origin)",
                },
            },
            required: [],
        },
    }, async (args: Record<string, unknown>) => {
        const remote = (args.remote as string) || "origin";
        return await git.pull(remote);
    });

    logger.info("Git tools registered.");
}