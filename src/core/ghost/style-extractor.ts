import { logger } from "../../utils/logger";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// SHEN AI — Style Extractor (Coding Pattern Extraction)
// Analyzes code to extract the user's coding DNA:
// naming conventions, patterns, preferences, and idioms.
// ============================================================

export interface StyleMetric {
    name: string;
    value: string | number | boolean;
    confidence: number;
    samples: number;
}

export interface CodingStyle {
    // Naming conventions
    namingConvention: "camelCase" | "snake_case" | "PascalCase" | "mixed";
    namingConfidence: number;

    // Code structure
    indentationStyle: "spaces" | "tabs";
    indentationSize: number;
    maxLineLength: number;
    braceStyle: "same-line" | "new-line";

    // Language preferences
    quoteStyle: "single" | "double" | "mixed";
    semicolonUsage: "always" | "never" | "mixed";
    arrowFunctionPreference: "always" | "never" | "mixed";
    constVsLet: "const-preferred" | "let-preferred" | "mixed";

    // Patterns
    errorHandlingStyle: "try-catch" | "error-callback" | "optional-chaining" | "mixed";
    importStyle: "named" | "default" | "mixed";
    exportStyle: "inline" | "end-of-file" | "mixed";
    commentStyle: "jsdoc" | "line" | "minimal" | "verbose";

    // Architecture preferences
    functionLength: "short" | "medium" | "long";
    fileLength: "short" | "medium" | "long";
    classUsage: "oop-heavy" | "functional" | "mixed";

    // Overall
    confidence: number;
    totalSamples: number;
    lastUpdated: number;
}

export class StyleExtractor {
    private metrics: Map<string, StyleMetric>;
    private styleProfile: CodingStyle;
    private storagePath: string;

    constructor(storagePath: string) {
        this.storagePath = storagePath;
        this.metrics = new Map();
        this.styleProfile = this.getDefaultProfile();
        this.loadFromDisk();
    }

    /**
     * Analyze an edit for style patterns.
     */
    analyzeEdit(filePath: string, before: string, after: string): void {
        const ext = path.extname(filePath);
        if (![".ts", ".tsx", ".js", ".jsx", ".py"].includes(ext)) return;

        // Analyze the changed content
        this.analyzeNamingConventions(after);
        this.analyzeCodeStructure(after);
        this.analyzeLanguagePreferences(after);
        this.analyzePatterns(after);
        this.analyzeArchitecture(after);

        // Update the style profile
        this.updateStyleProfile();
    }

    /**
     * Extract style from a complete file (on save).
     */
    extractStyle(filePath: string, content: string): void {
        const ext = path.extname(filePath);
        if (![".ts", ".tsx", ".js", ".jsx", ".py"].includes(ext)) return;

        this.analyzeNamingConventions(content);
        this.analyzeCodeStructure(content);
        this.analyzeLanguagePreferences(content);
        this.analyzePatterns(content);
        this.analyzeArchitecture(content);

        this.updateStyleProfile();
        this.saveToDisk();
    }

    /**
     * Analyze naming conventions.
     */
    private analyzeNamingConventions(code: string): void {
        // Count camelCase identifiers
        const camelCaseMatches = code.match(/[a-z][a-zA-Z0-9]*/g) || [];
        const camelCount = camelCaseMatches.filter(
            (m) => /[A-Z]/.test(m) && m.length > 2
        ).length;

        // Count snake_case identifiers
        const snakeCaseMatches = code.match(/[a-z]+_[a-z_]+/g) || [];
        const snakeCount = snakeCaseMatches.length;

        // Count PascalCase identifiers
        const pascalCaseMatches = code.match(/[A-Z][a-zA-Z0-9]*/g) || [];
        const pascalCount = pascalCaseMatches.filter(
            (m) => m.length > 2 && /[a-z]/.test(m)
        ).length;

        this.recordMetric("naming_camel", camelCount);
        this.recordMetric("naming_snake", snakeCount);
        this.recordMetric("naming_pascal", pascalCount);
    }

    /**
     * Analyze code structure (indentation, braces, line length).
     */
    private analyzeCodeStructure(code: string): void {
        const lines = code.split("\n");

        // Indentation analysis
        let spaceIndents = 0;
        let tabIndents = 0;
        let indentSizes: number[] = [];

        for (const line of lines) {
            const match = line.match(/^(\s+)/);
            if (match) {
                const indent = match[1];
                if (indent.includes("\t")) {
                    tabIndents++;
                } else {
                    spaceIndents++;
                    indentSizes.push(indent.length);
                }
            }
        }

        this.recordMetric("indent_spaces", spaceIndents);
        this.recordMetric("indent_tabs", tabIndents);

        if (indentSizes.length > 0) {
            // Find most common indent size
            const sizeCounts: Record<number, number> = {};
            for (const size of indentSizes) {
                if (size > 0 && size <= 8) {
                    sizeCounts[size] = (sizeCounts[size] || 0) + 1;
                }
            }
            const mostCommon = Object.entries(sizeCounts).sort(
                (a, b) => b[1] - a[1]
            )[0];
            if (mostCommon) {
                this.recordMetric("indent_size", parseInt(mostCommon[0]));
            }
        }

        // Brace style
        const sameLineBraces = (code.match(/\)\s*\{/g) || []).length;
        const newLineBraces = (code.match(/\)\s*\n\s*\{/g) || []).length;
        this.recordMetric("brace_same_line", sameLineBraces);
        this.recordMetric("brace_new_line", newLineBraces);

        // Line length
        const longLines = lines.filter((l) => l.length > 100).length;
        const totalLines = lines.length;
        if (totalLines > 0) {
            this.recordMetric("long_line_ratio", longLines / totalLines);
        }
    }

    /**
     * Analyze language preferences (quotes, semicolons, etc.).
     */
    private analyzeLanguagePreferences(code: string): void {
        // Quote style
        const singleQuotes = (code.match(/'[^']*'/g) || []).length;
        const doubleQuotes = (code.match(/"[^"]*"/g) || []).length;
        this.recordMetric("single_quotes", singleQuotes);
        this.recordMetric("double_quotes", doubleQuotes);

        // Semicolon usage
        const semicolons = (code.match(/;/g) || []).length;
        const statements = (code.match(/\n\s*(const|let|var|return|if|for|while|throw|import|export)/g) || []).length;
        this.recordMetric("semicolons", semicolons);
        this.recordMetric("statements", statements);

        // Arrow functions vs function keyword
        const arrowFunctions = (code.match(/=>/g) || []).length;
        const functionKeywords = (code.match(/\bfunction\b/g) || []).length;
        this.recordMetric("arrow_functions", arrowFunctions);
        this.recordMetric("function_keyword", functionKeywords);

        // const vs let
        const constUsage = (code.match(/\bconst\b/g) || []).length;
        const letUsage = (code.match(/\blet\b/g) || []).length;
        this.recordMetric("const_usage", constUsage);
        this.recordMetric("let_usage", letUsage);
    }

    /**
     * Analyze coding patterns (error handling, imports, etc.).
     */
    private analyzePatterns(code: string): void {
        // Error handling
        const tryCatch = (code.match(/\btry\s*\{/g) || []).length;
        const errorCallbacks = (code.match(/\b(err|error)\s*=>/g) || []).length;
        const optionalChaining = (code.match(/\?\./g) || []).length;
        this.recordMetric("error_try_catch", tryCatch);
        this.recordMetric("error_callback", errorCallbacks);
        this.recordMetric("optional_chaining", optionalChaining);

        // Import style
        const namedImports = (code.match(/import\s*\{/g) || []).length;
        const defaultImports = (code.match(/import\s+\w+\s+from/g) || []).length;
        this.recordMetric("named_imports", namedImports);
        this.recordMetric("default_imports", defaultImports);

        // Export style
        const inlineExports = (code.match(/export\s+(const|function|class|interface|type)/g) || []).length;
        const endExports = (code.match(/export\s*\{/g) || []).length;
        this.recordMetric("inline_exports", inlineExports);
        this.recordMetric("end_exports", endExports);

        // Comments
        const jsDocComments = (code.match(/\/\*\*/g) || []).length;
        const lineComments = (code.match(/\/\//g) || []).length;
        const totalLines = code.split("\n").length;
        const commentRatio = (jsDocComments + lineComments) / Math.max(totalLines, 1);
        this.recordMetric("jsdoc_comments", jsDocComments);
        this.recordMetric("line_comments", lineComments);
        this.recordMetric("comment_ratio", commentRatio);
    }

    /**
     * Analyze architecture preferences.
     */
    private analyzeArchitecture(code: string): void {
        const lines = code.split("\n");

        // Function length
        const functionRegex = /function\s+\w+|const\s+\w+\s*=\s*\(|=>/g;
        let match;
        const functionLengths: number[] = [];
        while ((match = functionRegex.exec(code)) !== null) {
            const startLine = code.substring(0, match.index).split("\n").length;
            // Rough estimate: find next function or end of block
            const remaining = code.substring(match.index);
            const braceCount = (remaining.match(/\{/g) || []).length;
            const estimatedLength = Math.min(braceCount * 5, 100);
            functionLengths.push(estimatedLength);
        }

        if (functionLengths.length > 0) {
            const avgLength = functionLengths.reduce((a, b) => a + b, 0) / functionLengths.length;
            this.recordMetric("avg_function_length", avgLength);
        }

        // File length
        this.recordMetric("file_lines", lines.length);

        // Class usage
        const classCount = (code.match(/\bclass\s+/g) || []).length;
        const functionCount = (code.match(/\bfunction\s+|=>/g) || []).length;
        this.recordMetric("class_count", classCount);
        this.recordMetric("function_count", functionCount);
    }

    /**
     * Record a metric observation.
     */
    private recordMetric(name: string, value: number): void {
        const existing = this.metrics.get(name);
        if (existing) {
            // Running average
            existing.value = ((existing.value as number) * existing.samples + value) / (existing.samples + 1);
            existing.samples++;
            existing.confidence = Math.min(existing.samples / 10, 1);
        } else {
            this.metrics.set(name, {
                name,
                value,
                confidence: 0.1,
                samples: 1,
            });
        }
    }

    /**
     * Update the style profile from collected metrics.
     */
    private updateStyleProfile(): void {
        const m = (name: string): number => {
            const metric = this.metrics.get(name);
            return metric ? (metric.value as number) : 0;
        };

        // Naming convention
        const camel = m("naming_camel");
        const snake = m("naming_snake");
        const pascal = m("naming_pascal");
        const totalNaming = camel + snake + pascal;

        if (totalNaming > 0) {
            if (camel > snake && camel > pascal) {
                this.styleProfile.namingConvention = "camelCase";
                this.styleProfile.namingConfidence = camel / totalNaming;
            } else if (snake > camel && snake > pascal) {
                this.styleProfile.namingConvention = "snake_case";
                this.styleProfile.namingConfidence = snake / totalNaming;
            } else if (pascal > camel && pascal > snake) {
                this.styleProfile.namingConvention = "PascalCase";
                this.styleProfile.namingConfidence = pascal / totalNaming;
            } else {
                this.styleProfile.namingConvention = "mixed";
                this.styleProfile.namingConfidence = 0.3;
            }
        }

        // Indentation
        this.styleProfile.indentationStyle = m("indent_spaces") > m("indent_tabs") ? "spaces" : "tabs";
        this.styleProfile.indentationSize = Math.round(m("indent_size")) || 4;

        // Brace style
        this.styleProfile.braceStyle = m("brace_same_line") > m("brace_new_line") ? "same-line" : "new-line";

        // Quote style
        const sq = m("single_quotes");
        const dq = m("double_quotes");
        if (sq > dq * 1.5) this.styleProfile.quoteStyle = "single";
        else if (dq > sq * 1.5) this.styleProfile.quoteStyle = "double";
        else this.styleProfile.quoteStyle = "mixed";

        // Semicolons
        const semiRatio = m("statements") > 0 ? m("semicolons") / m("statements") : 0.5;
        if (semiRatio > 0.7) this.styleProfile.semicolonUsage = "always";
        else if (semiRatio < 0.3) this.styleProfile.semicolonUsage = "never";
        else this.styleProfile.semicolonUsage = "mixed";

        // Arrow functions
        const arrow = m("arrow_functions");
        const func = m("function_keyword");
        if (arrow > func * 2) this.styleProfile.arrowFunctionPreference = "always";
        else if (func > arrow * 2) this.styleProfile.arrowFunctionPreference = "never";
        else this.styleProfile.arrowFunctionPreference = "mixed";

        // const vs let
        const constCount = m("const_usage");
        const letCount = m("let_usage");
        if (constCount > letCount * 2) this.styleProfile.constVsLet = "const-preferred";
        else if (letCount > constCount * 2) this.styleProfile.constVsLet = "let-preferred";
        else this.styleProfile.constVsLet = "mixed";

        // Error handling
        const tryC = m("error_try_catch");
        const errCb = m("error_callback");
        const optChain = m("optional_chaining");
        const totalError = tryC + errCb + optChain;
        if (totalError > 0) {
            if (tryC > errCb && tryC > optChain) this.styleProfile.errorHandlingStyle = "try-catch";
            else if (errCb > tryC && errCb > optChain) this.styleProfile.errorHandlingStyle = "error-callback";
            else if (optChain > tryC && optChain > errCb) this.styleProfile.errorHandlingStyle = "optional-chaining";
            else this.styleProfile.errorHandlingStyle = "mixed";
        }

        // Import style
        const named = m("named_imports");
        const defaultImp = m("default_imports");
        if (named > defaultImp * 1.5) this.styleProfile.importStyle = "named";
        else if (defaultImp > named * 1.5) this.styleProfile.importStyle = "default";
        else this.styleProfile.importStyle = "mixed";

        // Export style
        const inlineExp = m("inline_exports");
        const endExp = m("end_exports");
        if (inlineExp > endExp * 2) this.styleProfile.exportStyle = "inline";
        else if (endExp > inlineExp * 2) this.styleProfile.exportStyle = "end-of-file";
        else this.styleProfile.exportStyle = "mixed";

        // Comment style
        const jsdoc = m("jsdoc_comments");
        const lineComm = m("line_comments");
        const commRatio = m("comment_ratio");
        if (jsdoc > lineComm) this.styleProfile.commentStyle = "jsdoc";
        else if (commRatio > 0.2) this.styleProfile.commentStyle = "verbose";
        else if (commRatio < 0.05) this.styleProfile.commentStyle = "minimal";
        else this.styleProfile.commentStyle = "line";

        // Function length
        const avgFuncLen = m("avg_function_length");
        if (avgFuncLen < 15) this.styleProfile.functionLength = "short";
        else if (avgFuncLen < 40) this.styleProfile.functionLength = "medium";
        else this.styleProfile.functionLength = "long";

        // File length
        const fileLines = m("file_lines");
        if (fileLines < 100) this.styleProfile.fileLength = "short";
        else if (fileLines < 300) this.styleProfile.fileLength = "medium";
        else this.styleProfile.fileLength = "long";

        // Class usage
        const classes = m("class_count");
        const functions = m("function_count");
        if (classes > functions) this.styleProfile.classUsage = "oop-heavy";
        else if (functions > classes * 3) this.styleProfile.classUsage = "functional";
        else this.styleProfile.classUsage = "mixed";

        // Overall confidence
        const totalSamples = Array.from(this.metrics.values()).reduce((sum, m) => sum + m.samples, 0);
        this.styleProfile.totalSamples = totalSamples;
        this.styleProfile.confidence = Math.min(totalSamples / 50, 1);
        this.styleProfile.lastUpdated = Date.now();
    }

    /**
     * Get the current style profile.
     */
    getStyleProfile(): CodingStyle {
        return { ...this.styleProfile };
    }

    /**
     * Generate a "Coding DNA" string — a compact representation
     * of the user's coding style that can be injected into prompts.
     */
    generateCodingDNA(): string {
        const s = this.styleProfile;
        if (s.confidence < 0.2) {
            return ""; // Not enough data yet
        }

        let dna = "\n\n## User's Coding DNA (Learned from observation)\n";
        dna += "Follow these conventions automatically:\n\n";

        dna += `- **Naming:** ${s.namingConvention} (confidence: ${Math.round(s.namingConfidence * 100)}%)\n`;
        dna += `- **Indentation:** ${s.indentationSize} ${s.indentationStyle}\n`;
        dna += `- **Braces:** ${s.braceStyle}\n`;
        dna += `- **Quotes:** ${s.quoteStyle}\n`;
        dna += `- **Semicolons:** ${s.semicolonUsage}\n`;
        dna += `- **Functions:** ${s.arrowFunctionPreference === "always" ? "arrow functions" : s.arrowFunctionPreference === "never" ? "function keyword" : "mixed"}\n`;
        dna += `- **Variables:** ${s.constVsLet}\n`;
        dna += `- **Error handling:** ${s.errorHandlingStyle}\n`;
        dna += `- **Imports:** ${s.importStyle}\n`;
        dna += `- **Comments:** ${s.commentStyle}\n`;
        dna += `- **Function length:** ${s.functionLength}\n`;
        dna += `- **Style:** ${s.classUsage === "functional" ? "functional programming" : s.classUsage === "oop-heavy" ? "OOP" : "mixed paradigm"}\n`;

        return dna;
    }

    /**
     * Reset all style data.
     */
    reset(): void {
        this.metrics.clear();
        this.styleProfile = this.getDefaultProfile();
        this.saveToDisk();
    }

    private getDefaultProfile(): CodingStyle {
        return {
            namingConvention: "camelCase",
            namingConfidence: 0,
            indentationStyle: "spaces",
            indentationSize: 4,
            maxLineLength: 100,
            braceStyle: "same-line",
            quoteStyle: "double",
            semicolonUsage: "always",
            arrowFunctionPreference: "mixed",
            constVsLet: "const-preferred",
            errorHandlingStyle: "try-catch",
            importStyle: "named",
            exportStyle: "inline",
            commentStyle: "line",
            functionLength: "medium",
            fileLength: "medium",
            classUsage: "mixed",
            confidence: 0,
            totalSamples: 0,
            lastUpdated: Date.now(),
        };
    }

    private loadFromDisk(): void {
        try {
            const filePath = path.join(this.storagePath, "coding-style.json");
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                if (data.profile) {
                    this.styleProfile = { ...this.getDefaultProfile(), ...data.profile };
                }
                if (data.metrics) {
                    for (const [key, value] of Object.entries(data.metrics)) {
                        this.metrics.set(key, value as StyleMetric);
                    }
                }
                logger.info(`Style profile loaded: confidence ${Math.round(this.styleProfile.confidence * 100)}%`);
            }
        } catch (error) {
            logger.warn("Failed to load style profile:", error);
        }
    }

    private saveToDisk(): void {
        try {
            const filePath = path.join(this.storagePath, "coding-style.json");
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(
                filePath,
                JSON.stringify({
                    profile: this.styleProfile,
                    metrics: Object.fromEntries(this.metrics),
                }, null, 2),
                "utf-8"
            );
        } catch (error) {
            logger.warn("Failed to save style profile:", error);
        }
    }
}