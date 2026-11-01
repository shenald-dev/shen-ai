jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        })
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn()
        }),
        workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }]
    }
}), { virtual: true });

import { EventEmitter } from "events";
import { GitTools } from "../git-tools";
import spawn from "cross-spawn";

jest.mock("cross-spawn");

describe("GitTools", () => {
    let gitTools: GitTools;
    const mockedSpawn = spawn as unknown as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        gitTools = new GitTools("/mock/workspace");
    });

    function createMockChild(options: {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        error?: Error;
    }) {
        const child = new EventEmitter() as any;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = jest.fn();

        process.nextTick(() => {
            if (options.error) {
                child.emit("error", options.error);
                return;
            }

            if (options.stdout) {
                child.stdout.emit("data", Buffer.from(options.stdout));
            }

            if (options.stderr) {
                child.stderr.emit("data", Buffer.from(options.stderr));
            }

            child.emit("close", options.exitCode ?? 0);
        });

        return child;
    }

    describe("runGit execution and security", () => {
        it("should execute git with provided argument array directly without shell string concatenation", async () => {
            mockedSpawn.mockImplementation((cmd, args, opts) => {
                expect(cmd).toBe("git");
                expect(args).toEqual(["status", "--porcelain"]);
                expect(opts.cwd).toBe("/mock/workspace");
                return createMockChild({ stdout: "M file.ts\n" });
            });

            const result = await (gitTools as any).runGit(["status", "--porcelain"]);
            expect(result).toBe("M file.ts");
        });

        it("should pass commit message containing quotes and spaces safely without mangling", async () => {
            const commitMessage = 'feat: add support for "quoted" expressions & shell operators; test';
            mockedSpawn.mockImplementation((cmd, args) => {
                expect(args).toEqual(["commit", "-m", commitMessage]);
                return createMockChild({ stdout: "[main 1234567] commit message\n" });
            });

            const result = await gitTools.commit(commitMessage);
            expect(result).toBe("[main 1234567] commit message");
        });

        it("should handle amend flag in commit", async () => {
            mockedSpawn.mockImplementation((cmd, args) => {
                expect(args).toEqual(["commit", "-m", "update", "--amend", "--no-edit"]);
                return createMockChild({ stdout: "[main 7654321] update\n" });
            });

            await gitTools.commit("update", true);
        });

        it("should reject when git returns non-zero exit code with error message", async () => {
            mockedSpawn.mockImplementation(() => {
                return createMockChild({
                    stderr: "fatal: not a git repository",
                    exitCode: 128,
                });
            });

            await expect(gitTools.getStatus()).rejects.toThrow("Git error: fatal: not a git repository");
        });

        it("should reject when child process emits an error", async () => {
            mockedSpawn.mockImplementation(() => {
                return createMockChild({
                    error: new Error("spawn git ENOENT"),
                });
            });

            await expect(gitTools.getStatus()).rejects.toThrow("spawn git ENOENT");
        });
    });

    describe("getStatus", () => {
        it("should correctly parse clean status", async () => {
            mockedSpawn.mockImplementation((_, args) => {
                if (args[0] === "branch" && args[1] === "--show-current") {
                    return createMockChild({ stdout: "main\n" });
                }
                if (args[0] === "rev-list") {
                    return createMockChild({ stdout: "0\t0\n" });
                }
                if (args[0] === "diff" && args[1] === "--cached") {
                    return createMockChild({ stdout: "" });
                }
                if (args[0] === "diff") {
                    return createMockChild({ stdout: "" });
                }
                if (args[0] === "ls-files") {
                    return createMockChild({ stdout: "" });
                }
                return createMockChild({ stdout: "" });
            });

            const status = await gitTools.getStatus();
            expect(status.branch).toBe("main");
            expect(status.ahead).toBe(0);
            expect(status.behind).toBe(0);
            expect(status.staged).toEqual([]);
            expect(status.unstaged).toEqual([]);
            expect(status.untracked).toEqual([]);
            expect(status.isClean).toBe(true);
        });

        it("should correctly parse staged, unstaged, and untracked files", async () => {
            mockedSpawn.mockImplementation((_, args) => {
                if (args[0] === "branch" && args[1] === "--show-current") {
                    return createMockChild({ stdout: "feature/auth\n" });
                }
                if (args[0] === "rev-list") {
                    return createMockChild({ stdout: "1\t3\n" });
                }
                if (args[0] === "diff" && args[1] === "--cached") {
                    return createMockChild({ stdout: "A src/new.ts\nM src/modified.ts\n" });
                }
                if (args[0] === "diff") {
                    return createMockChild({ stdout: "D src/deleted.ts\n" });
                }
                if (args[0] === "ls-files") {
                    return createMockChild({ stdout: "untracked.log\n" });
                }
                return createMockChild({ stdout: "" });
            });

            const status = await gitTools.getStatus();
            expect(status.branch).toBe("feature/auth");
            expect(status.behind).toBe(1);
            expect(status.ahead).toBe(3);
            expect(status.isClean).toBe(false);
            expect(status.staged).toHaveLength(2);
            expect(status.staged[0]).toEqual({ file: "src/new.ts", status: "added", oldPath: undefined });
            expect(status.staged[1]).toEqual({ file: "src/modified.ts", status: "modified", oldPath: undefined });
            expect(status.unstaged).toHaveLength(1);
            expect(status.unstaged[0]).toEqual({ file: "src/deleted.ts", status: "deleted", oldPath: undefined });
            expect(status.untracked).toEqual(["untracked.log"]);
        });
    });

    describe("getCommits", () => {
        it("should parse git log output correctly", async () => {
            const logOutput =
                "abc1234567890\nabc1234\nAlice Dev\n2026-11-01 12:00:00 +0000\nfeat: implement auth\nsrc/auth.ts\nsrc/index.ts\n\n" +
                "def9876543210\ndef9876\nBob Dev\n2026-10-31 15:30:00 +0000\nfix: handle edge case\nsrc/utils.ts";

            mockedSpawn.mockImplementation((_, args) => {
                expect(args[0]).toBe("log");
                expect(args[1]).toBe("-5");
                return createMockChild({ stdout: logOutput });
            });

            const commits = await gitTools.getCommits(5);
            expect(commits).toHaveLength(2);
            expect(commits[0].hash).toBe("abc1234567890");
            expect(commits[0].shortHash).toBe("abc1234");
            expect(commits[0].author).toBe("Alice Dev");
            expect(commits[0].message).toBe("feat: implement auth");
            expect(commits[0].files).toEqual(["src/auth.ts", "src/index.ts"]);

            expect(commits[1].shortHash).toBe("def9876");
            expect(commits[1].author).toBe("Bob Dev");
        });
    });

    describe("branch operations", () => {
        it("should create a branch with checkout -b", async () => {
            mockedSpawn.mockImplementation((_, args) => {
                expect(args).toEqual(["checkout", "-b", "feature-x"]);
                return createMockChild({ stdout: "Switched to a new branch 'feature-x'\n" });
            });

            const res = await gitTools.createBranch("feature-x");
            expect(res).toContain("Switched to a new branch 'feature-x'");
        });

        it("should switch branch", async () => {
            mockedSpawn.mockImplementation((_, args) => {
                expect(args).toEqual(["checkout", "develop"]);
                return createMockChild({ stdout: "Switched to branch 'develop'\n" });
            });

            const res = await gitTools.switchBranch("develop");
            expect(res).toContain("Switched to branch 'develop'");
        });

        it("should delete branch with force or soft flag", async () => {
            mockedSpawn.mockImplementation((_, args) => {
                expect(args).toEqual(["branch", "-D", "feature-dead"]);
                return createMockChild({ stdout: "Deleted branch feature-dead\n" });
            });

            await gitTools.deleteBranch("feature-dead", true);
        });
    });

    describe("diff operations", () => {
        it("should parse diff additions and deletions per file", async () => {
            const rawDiff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,5 @@
+import express from 'express';
+const app = express();
-const old = 1;
 const keep = 2;`;

            mockedSpawn.mockImplementation((_, args) => {
                expect(args).toEqual(["diff", "--cached"]);
                return createMockChild({ stdout: rawDiff });
            });

            const diffs = await gitTools.getDiff(true);
            expect(diffs).toHaveLength(1);
            expect(diffs[0].file).toBe("src/app.ts");
            expect(diffs[0].additions).toBe(2);
            expect(diffs[0].deletions).toBe(1);
        });
    });

    describe("formatStatusSummary", () => {
        it("should format clean summary string", async () => {
            mockedSpawn.mockImplementation((_, args) => {
                if (args[0] === "branch") return createMockChild({ stdout: "main\n" });
                if (args[0] === "rev-list") return createMockChild({ stdout: "0\t0\n" });
                return createMockChild({ stdout: "" });
            });

            const summary = await gitTools.formatStatusSummary();
            expect(summary).toContain("**Branch**: main");
            expect(summary).toContain("Working tree is clean.");
        });
    });
});
