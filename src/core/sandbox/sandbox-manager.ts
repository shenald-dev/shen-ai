import * as vm from "vm";
import * as path from "path";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Sandbox Manager (Isolated Code Execution)
// Safely executes code snippets in an isolated VM context
// to test changes before applying them.
// ============================================================

export interface SandboxResult {
    success: boolean;
    output: string;
    error: string | null;
    executionTime: number;
    consoleOutput: string[];
}

export interface SandboxOptions {
    timeout?: number; // milliseconds (max 30000)
    maxMemory?: number; // MB (max 256)
    allowedModules?: string[];
    globals?: Record<string, unknown>;
    workingDir?: string; // restricted working directory
}

// Safety limits
const MAX_TIMEOUT = 30000;
const MAX_MEMORY_MB = 256;
const DANGEROUS_GLOBALS = ["process", "require", "module", "exports", "__dirname", "__filename", "global", "globalThis", "root"];

export class SandboxManager {
    private defaultOptions: SandboxOptions;

    constructor(options: SandboxOptions = {}) {
        this.defaultOptions = {
            timeout: Math.min(options.timeout ?? 5000, MAX_TIMEOUT),
            maxMemory: Math.min(options.maxMemory ?? 50, MAX_MEMORY_MB),
            allowedModules: [],
            globals: {},
            workingDir: options.workingDir,
        };
    }

    /**
     * Execute code in an isolated sandbox.
     */
    execute(code: string, options: SandboxOptions = {}): SandboxResult {
        const opts = {
            ...this.defaultOptions,
            ...options,
            timeout: Math.min(options.timeout ?? this.defaultOptions.timeout!, MAX_TIMEOUT),
            maxMemory: Math.min(options.maxMemory ?? this.defaultOptions.maxMemory!, MAX_MEMORY_MB),
        };
        const startTime = Date.now();
        const consoleOutput: string[] = [];

        // Validate code for dangerous patterns
        const validation = this.validateCode(code);
        if (!validation.valid) {
            return {
                success: false,
                output: "",
                error: `Security violation: ${validation.reason}`,
                executionTime: 0,
                consoleOutput: [],
            };
        }

        // Create a sandboxed console
        const sandboxConsole = {
            log: (...args: unknown[]) => {
                consoleOutput.push(args.map((a) => String(a)).join(" "));
            },
            error: (...args: unknown[]) => {
                consoleOutput.push("[ERROR] " + args.map((a) => String(a)).join(" "));
            },
            warn: (...args: unknown[]) => {
                consoleOutput.push("[WARN] " + args.map((a) => String(a)).join(" "));
            },
            info: (...args: unknown[]) => {
                consoleOutput.push("[INFO] " + args.map((a) => String(a)).join(" "));
            },
        };

        // Build the sandbox context — explicitly exclude dangerous globals
        const sandbox: vm.Context = {
            console: sandboxConsole,
            setTimeout,
            setInterval,
            clearTimeout,
            clearInterval,
            Array,
            Boolean,
            Date,
            Error,
            JSON,
            Math,
            Number,
            Object,
            RegExp,
            String,
            Symbol,
            Map,
            Set,
            WeakMap,
            WeakSet,
            Int8Array,
            Uint8Array,
            Int16Array,
            Uint16Array,
            Int32Array,
            Uint32Array,
            Float32Array,
            Float64Array,
            BigInt,
            ...opts.globals,
        };

        // Explicitly block dangerous globals
        for (const key of DANGEROUS_GLOBALS) {
            Object.defineProperty(sandbox, key, {
                get: () => { throw new Error(`Access to '${key}' is not allowed in sandbox`); },
                configurable: false,
            });
        }

        try {
            const context = vm.createContext(sandbox, {
                codeGeneration: { strings: false, wasm: false },
            });

            // Wrap code to capture the result
            const wrappedCode = `
                (function() {
                    ${code}
                })()
            `;

            const result = vm.runInContext(wrappedCode, context, {
                timeout: opts.timeout,
                displayErrors: true,
            });

            // Handle async results
            let output = "";
            if (result instanceof Promise) {
                output = "(async execution - check console output)";
            } else if (result !== undefined) {
                output = String(result);
            }

            const executionTime = Date.now() - startTime;

            return {
                success: true,
                output,
                error: null,
                executionTime,
                consoleOutput,
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const err = error as Error;

            return {
                success: false,
                output: "",
                error: err.message,
                executionTime,
                consoleOutput,
            };
        }
    }

    /**
     * Validate code for dangerous patterns before execution.
     * NOTE: Node.js vm module is NOT a secure sandbox for untrusted code.
     * This validation provides defense-in-depth but should not be relied upon
     * for executing truly untrusted code. Use isolated-vm or a container for that.
     */
    private validateCode(code: string): { valid: boolean; reason: string } {
        const dangerousPatterns = [
            /\brequire\s*\(/,
            /\bprocess\s*\./,
            /\bchild_process\b/,
            /\bfs\s*\./,
            /\bexec\s*\(/,
            /\bexecSync\s*\(/,
            /\bspawn\s*\(/,
            /\bfork\s*\(/,
            /\beval\s*\(/,
            /\bFunction\s*\(/,
            /\b__proto__\b/,
            /\bconstructor\s*\[/,
            // VM escape patterns
            /\bthis\s*\.\s*constructor\b/,
            /\.constructor\s*\.\s*constructor\b/,
            /\breturn\s+globalThis\b/,
            /\breturn\s+global\b/,
            /\breturn\s+process\b/,
            /\breturn\s+require\b/,
            /__defineGetter__|__defineSetter__/,
            /Object\s*\.\s*getPrototypeOf/,
            /Reflect\s*\.\s*getPrototypeOf/,
            /Function\s*\.\s*prototype/,
            /\bimport\s*\(/,
            /\bimport\s+/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(code)) {
                return { valid: false, reason: `Blocked pattern: ${pattern.source}` };
            }
        }

        return { valid: true, reason: "" };
    }

    /**
     * Test a function with given inputs and verify expected output.
     */
    testFunction(
        functionCode: string,
        functionName: string,
        testCases: Array<{ input: unknown[]; expected: unknown }>
    ): Array<{ passed: boolean; input: unknown[]; expected: unknown; actual: unknown; error: string | null }> {
        const results: Array<{ passed: boolean; input: unknown[]; expected: unknown; actual: unknown; error: string | null }> = [];

        for (const testCase of testCases) {
            const code = `
                ${functionCode}
                const __result = ${functionName}(${testCase.input.map((i) => JSON.stringify(i)).join(", ")});
                __result;
            `;

            const result = this.execute(code);

            if (result.error) {
                results.push({
                    passed: false,
                    input: testCase.input,
                    expected: testCase.expected,
                    actual: undefined,
                    error: result.error,
                });
            } else {
                let actual: unknown;
                try {
                    actual = JSON.parse(result.output);
                } catch {
                    actual = result.output;
                }

                const passed = this.deepEqual(actual, testCase.expected);
                results.push({
                    passed,
                    input: testCase.input,
                    expected: testCase.expected,
                    actual,
                    error: null,
                });
            }
        }

        return results;
    }

    /**
     * Validate that code is syntactically correct.
     */
    validateSyntax(code: string): { valid: boolean; error: string | null } {
        try {
            new vm.Script(code);
            return { valid: true, error: null };
        } catch (error) {
            return { valid: false, error: (error as Error).message };
        }
    }

    /**
     * Preview what a code change would do.
     */
    previewChange(
        originalCode: string,
        newCode: string,
        testInput?: Record<string, unknown>
    ): {
        originalResult: SandboxResult;
        newResult: SandboxResult;
        behaviorChanged: boolean;
    } {
        const originalResult = this.execute(originalCode);
        const newResult = this.execute(newCode);

        const behaviorChanged =
            originalResult.success !== newResult.success ||
            originalResult.output !== newResult.output ||
            originalResult.error !== newResult.error;

        return {
            originalResult,
            newResult,
            behaviorChanged,
        };
    }

    /**
     * Deep equality check for test results.
     */
    private deepEqual(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (a === null || b === null) return a === b;
        if (typeof a !== typeof b) return false;

        if (typeof a === "object") {
            if (Array.isArray(a) !== Array.isArray(b)) return false;

            if (Array.isArray(a) && Array.isArray(b)) {
                if (a.length !== b.length) return false;
                return a.every((item, i) => this.deepEqual(item, b[i]));
            }

            const keysA = Object.keys(a as object);
            const keysB = Object.keys(b as object);
            if (keysA.length !== keysB.length) return false;
            return keysA.every((key) =>
                this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
            );
        }

        return false;
    }
}