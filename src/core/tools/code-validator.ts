import * as vm from "vm";
import { logger } from "../../utils/logger";
import type { ValidationResult, ValidationIssue } from "../../types";

// ============================================================
// SHEN AI — Code Validator
// Validates AI-generated code before applying changes.
// Checks for syntax errors, balanced brackets, common bugs.
// ============================================================

export class CodeValidator {
    /**
     * Validate code content before applying to a file.
     */
    validateCode(content: string, filePath: string): ValidationResult {
        const issues: ValidationIssue[] = [];
        const lines = content.split("\n");

        // Check for balanced brackets
        const bracketIssues = this.checkBalancedBrackets(content);
        issues.push(...bracketIssues);

        // Check for unclosed strings
        const stringIssues = this.checkUnclosedStrings(lines);
        issues.push(...stringIssues);

        // Check for common syntax errors
        const syntaxIssues = this.checkCommonSyntaxErrors(lines);
        issues.push(...syntaxIssues);

        // Try to parse as JavaScript/TypeScript
        if (filePath.endsWith(".js") || filePath.endsWith(".jsx") || filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
            const parseIssues = this.checkJavaScriptSyntax(content);
            issues.push(...parseIssues);
        }

        // Check for duplicate variable declarations
        const duplicateIssues = this.checkDuplicateDeclarations(lines);
        issues.push(...duplicateIssues);

        const errorCount = issues.filter(i => i.severity === "error").length;
        const warningCount = issues.filter(i => i.severity === "warning").length;

        const result: ValidationResult = {
            isValid: errorCount === 0,
            issues,
            errorCount,
            warningCount,
            filePath,
            timestamp: Date.now()
        };

        if (errorCount > 0) {
            logger.warn(`Code validation failed for ${filePath}: ${errorCount} errors, ${warningCount} warnings`);
        } else if (warningCount > 0) {
            logger.debug(`Code validation passed for ${filePath} with ${warningCount} warnings`);
        } else {
            logger.debug(`Code validation passed for ${filePath}: no issues found`);
        }

        return result;
    }

    /**
     * Check for balanced brackets: {}, (), []
     */
    private checkBalancedBrackets(content: string): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const stack: { char: string; line: number; column: number }[] = [];
        const lines = content.split("\n");
        const pairs: Record<string, string> = { "{": "}", "(": ")", "[": "]" };
        const openers = new Set(Object.keys(pairs));
        const closers = new Set(Object.values(pairs));

        let inString = false;
        let stringChar = "";
        const inComment = false;
        let inMultiLineComment = false;

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];

            for (let colIdx = 0; colIdx < line.length; colIdx++) {
                const char = line[colIdx];
                const nextChar = colIdx + 1 < line.length ? line[colIdx + 1] : "";

                // Handle multi-line comments
                if (!inString && !inComment && char === "/" && nextChar === "*") {
                    inMultiLineComment = true;
                    colIdx++;
                    continue;
                }
                if (inMultiLineComment && char === "*" && nextChar === "/") {
                    inMultiLineComment = false;
                    colIdx++;
                    continue;
                }
                if (inMultiLineComment) continue;

                // Handle single-line comments
                if (!inString && !inMultiLineComment && char === "/" && nextChar === "/") {
                    break; // Rest of line is comment
                }

                // Handle strings
                if (!inComment && !inMultiLineComment) {
                    if (!inString && (char === '"' || char === "'" || char === "`")) {
                        inString = true;
                        stringChar = char;
                        continue;
                    }
                    if (inString && char === stringChar && line[colIdx - 1] !== "\\") {
                        inString = false;
                        stringChar = "";
                        continue;
                    }
                    if (inString) continue;
                }

                // Check brackets
                if (openers.has(char)) {
                    stack.push({ char, line: lineIdx + 1, column: colIdx + 1 });
                } else if (closers.has(char)) {
                    const last = stack.pop();
                    if (!last) {
                        issues.push({
                            line: lineIdx + 1,
                            column: colIdx + 1,
                            severity: "error",
                            message: `Unexpected closing bracket '${char}'`,
                            rule: "balanced-brackets"
                        });
                    } else if (pairs[last.char] !== char) {
                        issues.push({
                            line: lineIdx + 1,
                            column: colIdx + 1,
                            severity: "error",
                            message: `Mismatched bracket: expected '${pairs[last.char]}' but found '${char}' (opened at line ${last.line})`,
                            rule: "balanced-brackets"
                        });
                    }
                }
            }
        }

        // Check for unclosed brackets
        for (const unclosed of stack) {
            issues.push({
                line: unclosed.line,
                column: unclosed.column,
                severity: "error",
                message: `Unclosed bracket '${unclosed.char}'`,
                rule: "balanced-brackets"
            });
        }

        return issues;
    }

    /**
     * Check for unclosed strings.
     */
    private checkUnclosedStrings(lines: string[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            let inSingleQuote = false;
            let inDoubleQuote = false;
            let inTemplate = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                const prevChar = i > 0 ? line[i - 1] : "";

                if (char === "'" && prevChar !== "\\" && !inDoubleQuote && !inTemplate) {
                    inSingleQuote = !inSingleQuote;
                } else if (char === '"' && prevChar !== "\\" && !inSingleQuote && !inTemplate) {
                    inDoubleQuote = !inDoubleQuote;
                } else if (char === "`" && prevChar !== "\\" && !inSingleQuote && !inDoubleQuote) {
                    inTemplate = !inTemplate;
                }
            }

            if (inSingleQuote || inDoubleQuote) {
                issues.push({
                    line: lineIdx + 1,
                    column: 1,
                    severity: "error",
                    message: "Unclosed string literal",
                    rule: "unclosed-string"
                });
            }
        }

        return issues;
    }

    /**
     * Check for common syntax errors.
     */
    private checkCommonSyntaxErrors(lines: string[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx].trim();

            // Check for missing semicolons after statements (warning only)
            if (line.match(/^(const|let|var|return|import|export)\s+.+[^;{},\s]$/) && 
                !line.endsWith("{") && !line.endsWith("}") && !line.endsWith(",")) {
                issues.push({
                    line: lineIdx + 1,
                    column: line.length,
                    severity: "warning",
                    message: "Missing semicolon",
                    rule: "missing-semicolon"
                });
            }

            // Check for double semicolons
            if (line.includes(";;")) {
                issues.push({
                    line: lineIdx + 1,
                    column: line.indexOf(";;") + 1,
                    severity: "warning",
                    message: "Double semicolon",
                    rule: "double-semicolon"
                });
            }

            // Check for trailing commas in objects/arrays (warning)
            if (line.match(/,\s*$/)) {
                issues.push({
                    line: lineIdx + 1,
                    column: line.length,
                    severity: "info",
                    message: "Trailing comma",
                    rule: "trailing-comma"
                });
            }
        }

        return issues;
    }

    /**
     * Try to parse JavaScript/TypeScript code using Node.js vm module.
     */
    private checkJavaScriptSyntax(content: string): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        try {
            // Remove TypeScript-specific syntax for basic validation
            const jsContent = content
                .replace(/:\s*\w+(\[\])?(\s*[,)])?/g, "$2") // Remove type annotations
                .replace(/<[^>]+>/g, "") // Remove generic types
                .replace(/\binterface\s+\w+\s*{[^}]*}/g, "") // Remove interfaces
                .replace(/\btype\s+\w+\s*=\s*[^;]+;/g, ""); // Remove type aliases

            new vm.Script(jsContent);
        } catch (error: any) {
            const message = error.message || "Syntax error";
            const lineMatch = message.match(/:(\d+)/);
            const line = lineMatch ? parseInt(lineMatch[1]) : 1;

            issues.push({
                line,
                column: 1,
                severity: "error",
                message: `Syntax error: ${message}`,
                rule: "syntax-error"
            });
        }

        return issues;
    }

    /**
     * Check for duplicate variable declarations.
     */
    private checkDuplicateDeclarations(lines: string[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const declarations = new Map<string, number>();

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];

            // Match: const/let/var variableName
            const matches = line.matchAll(/\b(const|let|var)\s+(\w+)/g);
            for (const match of matches) {
                const varName = match[2];
                if (declarations.has(varName)) {
                    issues.push({
                        line: lineIdx + 1,
                        column: match.index || 1,
                        severity: "warning",
                        message: `Duplicate declaration of '${varName}' (first declared at line ${declarations.get(varName)})`,
                        rule: "duplicate-declaration"
                    });
                } else {
                    declarations.set(varName, lineIdx + 1);
                }
            }
        }

        return issues;
    }

    /**
     * Validate import statements exist in target files.
     */
    validateImports(content: string, filePath: string, fileExists: (path: string) => boolean): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        const lines = content.split("\n");

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];

            // Match import statements
            const importMatch = line.match(/from\s+['"]([^'"]+)['"]/);
            if (importMatch) {
                const importPath = importMatch[1];

                // Skip external packages
                if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
                    continue;
                }

                // Check if file exists (simplified check)
                if (!fileExists(importPath)) {
                    issues.push({
                        line: lineIdx + 1,
                        column: line.indexOf(importPath) + 1,
                        severity: "warning",
                        message: `Import path '${importPath}' may not exist`,
                        rule: "import-exists"
                    });
                }
            }
        }

        return issues;
    }
}