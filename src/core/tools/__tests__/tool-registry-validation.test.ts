jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
        }),
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn(),
        }),
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    },
}), { virtual: true });

import fs from "fs";
import * as vscode from "vscode";
import { ToolRegistry } from "../tool-registry";
import { CodeValidator } from "../code-validator";

jest.mock("fs", () => {
    const originalFs = jest.requireActual("fs");
    return {
        ...originalFs,
        promises: {
            ...originalFs.promises,
            readFile: jest.fn(),
            writeFile: jest.fn().mockResolvedValue(undefined),
            mkdir: jest.fn().mockResolvedValue(undefined),
        },
    };
});

describe("ToolRegistry Pre-Flight Validation Shield", () => {
    let registry: ToolRegistry;
    let validator: CodeValidator;
    const mockContext = {
        subscriptions: [],
        extensionPath: "/mock/ext",
        globalState: { get: jest.fn(), update: jest.fn() },
        workspaceState: { get: jest.fn(), update: jest.fn() },
    } as unknown as vscode.ExtensionContext;

    beforeEach(() => {
        jest.clearAllMocks();
        validator = new CodeValidator();
        registry = new ToolRegistry(mockContext, validator);
    });

    it("should reject write_to_file with syntax error and not write to disk", async () => {
        const invalidTsCode = `function test( { return 42; }`; // Syntax error: unclosed param paren

        const result = await registry.executeTool({
            id: "call-1",
            name: "write_to_file",
            arguments: {
                path: "src/broken.ts",
                content: invalidTsCode,
            },
        });

        expect(result.content).toContain("Code validation failed for src/broken.ts");
        expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it("should allow write_to_file with valid TypeScript code", async () => {
        const validTsCode = `export function add(a: number, b: number): number {\n    return a + b;\n}`;

        const result = await registry.executeTool({
            id: "call-2",
            name: "write_to_file",
            arguments: {
                path: "src/valid.ts",
                content: validTsCode,
            },
        });

        expect(result.content).toContain("Successfully wrote");
        expect(fs.promises.writeFile).toHaveBeenCalled();
    });

    it("should reject invalid JSON content", async () => {
        const invalidJson = `{ "name": "shen-ai", "version": 1.0.0 }`; // invalid json: 1.0.0 unquoted

        const result = await registry.executeTool({
            id: "call-3",
            name: "write_to_file",
            arguments: {
                path: "package.json",
                content: invalidJson,
            },
        });

        expect(result.content).toContain("Code validation failed for package.json");
        expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it("should append blast radius warning if analyzer detects high impact", async () => {
        const validTsCode = `export const API_VERSION = 'v1';`;
        const mockBlastAnalyzer: any = {
            analyzeFile: jest.fn(),
            getBlastRadius: jest.fn().mockReturnValue({
                totalDependents: 4,
                riskLevel: "high",
            }),
        };

        registry.setBlastRadiusAnalyzer(mockBlastAnalyzer);

        const result = await registry.executeTool({
            id: "call-4",
            name: "write_to_file",
            arguments: {
                path: "src/core/constants.ts",
                content: validTsCode,
            },
        });

        expect(result.content).toContain("Successfully wrote");
        expect(result.content).toContain("Blast radius: 4 dependent file(s), risk: high");
    });
});
