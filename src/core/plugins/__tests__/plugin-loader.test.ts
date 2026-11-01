jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        })
    },
    workspace: {
        workspaceFolders: [{
            uri: {
                fsPath: process.cwd()
            }
        }]
    }
}), { virtual: true });

import { PluginLoader } from "../plugin-loader";
import { PluginManifest } from "../plugin-api";

describe("PluginLoader Command Injection Fix", () => {
    let pluginLoader: any; // Use any to bypass private method access

    beforeEach(() => {
        pluginLoader = new PluginLoader();
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    it("should prevent command injection using shell operators and gracefully reject", async () => {
        const manifest: PluginManifest = {
            id: "test-plugin",
            name: "Test Plugin",
            version: "1.0.0",
            description: "Test",
            author: "Test",
            main: "index.js",
            permissions: {
                granted: ["commandExec"],
                commandAllowlist: ["echo *"]
            }
        };

        const context = pluginLoader.createPluginContext(manifest, "/mock/path");

        try {
            await context.executeCommand("echo hello && touch /tmp/pwned");
            throw new Error("Expected executeCommand to throw on shell operators");
        } catch (error: any) {
            expect(error.message).toMatch(/Invalid command format or unsupported operators/i);
        }

        try {
            await context.executeCommand("echo hello ; touch /tmp/pwned");
            throw new Error("Expected executeCommand to throw on shell operators");
        } catch (error: any) {
            expect(error.message).toMatch(/Invalid command format or unsupported operators/i);
        }

        try {
            await context.executeCommand("echo hello | grep hello");
            throw new Error("Expected executeCommand to throw on shell operators");
        } catch (error: any) {
            expect(error.message).toMatch(/Invalid command format or unsupported operators/i);
        }
    });

    it("should execute valid commands successfully", async () => {
        const manifest: PluginManifest = {
            id: "test-plugin",
            name: "Test Plugin",
            version: "1.0.0",
            description: "Test",
            author: "Test",
            main: "index.js",
            permissions: {
                granted: ["commandExec"],
                commandAllowlist: ["node *"]
            }
        };

        const context = pluginLoader.createPluginContext(manifest, "/mock/path");
        const { stdout } = await context.executeCommand('node -e "console.log(\'hello world\')"');
        expect(stdout.trim()).toBe("hello world");
    });

    it("should reject when command fails with non-zero exit code", async () => {
        const manifest: PluginManifest = {
            id: "test-plugin",
            name: "Test Plugin",
            version: "1.0.0",
            description: "Test",
            author: "Test",
            main: "index.js",
            permissions: {
                granted: ["commandExec"],
                commandAllowlist: ["node *"]
            }
        };

        const context = pluginLoader.createPluginContext(manifest, "/mock/path");
        try {
            await context.executeCommand('node -e "process.exit(1)"');
            throw new Error("Expected executeCommand to throw when command fails");
        } catch (error: any) {
            expect(error.message).toMatch(/Command failed with exit code 1/);
        }
    });
});
