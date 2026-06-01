import type { Correction, Lesson } from "../../types";
import { generateId } from "../../utils/helpers";
import { logger } from "../../utils/logger";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// SHEN AI — Correction Tracker (Captures User Corrections)
// ============================================================

export interface CorrectionPattern {
    pattern: string;
    rule: string;
    examples: Array<{ original: string; corrected: string }>;
    frequency: number;
}

export class CorrectionTracker {
    private corrections: Correction[];
    private lessons: Lesson[];
    private patterns: Map<string, CorrectionPattern>;
    private storagePath: string;
    private static readonly MAX_LESSONS = 50; // Cap lessons to prevent unbounded growth and prompt bloat

    constructor(storagePath: string) {
        this.corrections = [];
        this.lessons = [];
        this.patterns = new Map();
        this.storagePath = storagePath;
        this.loadFromDisk();
    }

    /**
     * Record a correction made by the user.
     * This happens when the user edits AI-generated code.
     */
    recordCorrection(originalCode: string, correctedCode: string, file: string): Correction {
        const correction: Correction = {
            id: generateId(),
            timestamp: Date.now(),
            originalCode,
            correctedCode,
            file,
        };

        this.corrections.push(correction);
        logger.info(`Correction recorded for ${file}`);

        // Analyze the correction for patterns
        this.analyzeCorrection(correction);

        // Persist to disk
        this.saveToDisk();

        return correction;
    }

    /**
     * Analyze a correction to extract patterns and generate lessons.
     */
    private analyzeCorrection(correction: Correction): void {
        const patterns = this.extractPatterns(correction.originalCode, correction.correctedCode, correction.file);

        for (const pattern of patterns) {
            const existing = this.patterns.get(pattern.pattern);
            if (existing) {
                existing.frequency++;
                existing.examples.push({
                    original: correction.originalCode,
                    corrected: correction.correctedCode,
                });

                // If pattern appears frequently enough, create or update a lesson
                if (existing.frequency >= 3) {
                    this.createOrUpdateLesson(existing);
                }
            } else {
                this.patterns.set(pattern.pattern, {
                    pattern: pattern.pattern,
                    rule: pattern.rule,
                    examples: [{
                        original: correction.originalCode,
                        corrected: correction.correctedCode,
                    }],
                    frequency: 1,
                });
            }
        }
    }

    /**
     * Extract patterns from a code correction.
     * Identifies common coding style differences.
     */
    private extractPatterns(original: string, corrected: string, file: string): Array<{ pattern: string; rule: string }> {
        const patterns: Array<{ pattern: string; rule: string }> = [];

        const originalLines = original.split("\n");
        const correctedLines = corrected.split("\n");

        // Check for common pattern categories
        // 1. const vs let preference
        if (original.includes("const ") && corrected.includes("let ")) {
            patterns.push({
                pattern: "const_to_let",
                rule: "Prefer 'let' over 'const' for variables that may be reassigned or in loop contexts.",
            });
        }
        if (original.includes("let ") && corrected.includes("const ")) {
            patterns.push({
                pattern: "let_to_const",
                rule: "Prefer 'const' over 'let' for variables that are never reassigned.",
            });
        }

        // 2. Arrow function vs function keyword
        if (original.includes("function ") && corrected.includes("=>")) {
            patterns.push({
                pattern: "function_to_arrow",
                rule: "Prefer arrow functions over function keyword for callbacks and short functions.",
            });
        }
        if (original.includes("=>") && corrected.includes("function ")) {
            patterns.push({
                pattern: "arrow_to_function",
                rule: "Prefer function keyword over arrow functions for named functions and methods.",
            });
        }

        // 3. Single vs double quotes
        const origSingleQuotes = (original.match(/'/g) || []).length;
        const origDoubleQuotes = (original.match(/"/g) || []).length;
        const corrSingleQuotes = (corrected.match(/'/g) || []).length;
        const corrDoubleQuotes = (corrected.match(/"/g) || []).length;

        if (origDoubleQuotes > corrDoubleQuotes && corrSingleQuotes > origSingleQuotes) {
            patterns.push({
                pattern: "double_to_single_quotes",
                rule: "Prefer single quotes over double quotes for strings.",
            });
        }
        if (origSingleQuotes > corrSingleQuotes && corrDoubleQuotes > origDoubleQuotes) {
            patterns.push({
                pattern: "single_to_double_quotes",
                rule: "Prefer double quotes over single quotes for strings.",
            });
        }

        // 4. Semicolon preference
        const origSemicolons = (original.match(/;/g) || []).length;
        const corrSemicolons = (corrected.match(/;/g) || []).length;
        if (origSemicolons > 0 && corrSemicolons === 0) {
            patterns.push({
                pattern: "remove_semicolons",
                rule: "Do not use semicolons at the end of statements.",
            });
        }
        if (origSemicolons === 0 && corrSemicolons > 0) {
            patterns.push({
                pattern: "add_semicolons",
                rule: "Always use semicolons at the end of statements.",
            });
        }

        // 5. Import style (default vs named)
        if (original.includes("import ") && corrected.includes("import ")) {
            if (original.includes("import {") && !corrected.includes("import {")) {
                patterns.push({
                    pattern: "named_to_default_import",
                    rule: "Prefer default imports over named imports when available.",
                });
            }
            if (!original.includes("import {") && corrected.includes("import {")) {
                patterns.push({
                    pattern: "default_to_named_import",
                    rule: "Prefer named imports over default imports.",
                });
            }
        }

        // 6. Error handling style
        if (original.includes("try {") && !corrected.includes("try {")) {
            patterns.push({
                pattern: "remove_try_catch",
                rule: "Avoid try/catch blocks; prefer error handling through return values or optional chaining.",
            });
        }
        if (!original.includes("try {") && corrected.includes("try {")) {
            patterns.push({
                pattern: "add_try_catch",
                rule: "Always wrap potentially failing operations in try/catch blocks.",
            });
        }

        // 7. Type annotation preference
        if (original.includes(": ") && !corrected.includes(": ")) {
            patterns.push({
                pattern: "remove_type_annotations",
                rule: "Prefer type inference over explicit type annotations when the type is obvious.",
            });
        }
        if (!original.includes(": ") && corrected.includes(": ")) {
            patterns.push({
                pattern: "add_type_annotations",
                rule: "Always use explicit type annotations for function parameters and return types.",
            });
        }

        // 8. Line-by-line diff patterns for custom rules
        for (let i = 0; i < Math.min(originalLines.length, correctedLines.length); i++) {
            const origLine = originalLines[i].trim();
            const corrLine = correctedLines[i].trim();

            if (origLine !== corrLine && origLine.length > 0 && corrLine.length > 0) {
                // Check for naming convention changes
                if (this.isCamelCase(origLine) && this.isSnakeCase(corrLine)) {
                    patterns.push({
                        pattern: "camel_to_snake_case",
                        rule: "Prefer snake_case naming convention over camelCase.",
                    });
                }
                if (this.isSnakeCase(origLine) && this.isCamelCase(corrLine)) {
                    patterns.push({
                        pattern: "snake_to_camel_case",
                        rule: "Prefer camelCase naming convention over snake_case.",
                    });
                }
            }
        }

        // If no specific patterns found, create a generic file-specific pattern
        if (patterns.length === 0) {
            const ext = path.extname(file || "");
            patterns.push({
                pattern: `style_${ext || "unknown"}`,
                rule: `Follow the coding style observed in user corrections for ${ext || "this"} files.`,
            });
        }

        return patterns;
    }

    private isCamelCase(str: string): boolean {
        return /[a-z][A-Z]/.test(str);
    }

    private isSnakeCase(str: string): boolean {
        return /[a-z]_[a-z]/.test(str);
    }

    /**
     * Create or update a lesson from a frequently-observed pattern.
     */
    private createOrUpdateLesson(pattern: CorrectionPattern): void {
        const existingLesson = this.lessons.find((l) => l.pattern === pattern.pattern);

        if (existingLesson) {
            existingLesson.appliedCount++;
            existingLesson.examples = pattern.examples.slice(-3).map((e) => e.corrected);
            logger.info(`Lesson updated: ${pattern.rule} (frequency: ${pattern.frequency})`);
        } else {
            // Enforce max lessons — evict least-applied lesson if at capacity
            if (this.lessons.length >= CorrectionTracker.MAX_LESSONS) {
                const sorted = [...this.lessons].sort((a, b) => a.appliedCount - b.appliedCount);
                const evicted = sorted[0];
                this.lessons = this.lessons.filter((l) => l.id !== evicted.id);
                this.patterns.delete(evicted.pattern);
                logger.info(`Lesson evicted (max ${CorrectionTracker.MAX_LESSONS}): ${evicted.rule}`);
            }
            const lesson: Lesson = {
                id: generateId(),
                pattern: pattern.pattern,
                rule: pattern.rule,
                examples: pattern.examples.slice(-3).map((e) => e.corrected),
                appliedCount: 0,
                createdAt: Date.now(),
            };
            this.lessons.push(lesson);
            logger.info(`New lesson created: ${pattern.rule}`);
        }
    }

    /**
     * Get all active lessons to inject into the system prompt.
     */
    getActiveLessons(): Lesson[] {
        return this.lessons.filter((l) => l.examples.length > 0);
    }

    /**
     * Generate a prompt suffix based on learned lessons.
     */
    generatePromptSuffix(): string {
        const activeLessons = this.getActiveLessons();
        if (activeLessons.length === 0) return "";

        let suffix = "\n\n## Learned Preferences (from user corrections)\n";
        suffix += "The user has consistently corrected your code in the following ways. Apply these rules automatically:\n\n";

        for (const lesson of activeLessons) {
            suffix += `- **${lesson.rule}**\n`;
            if (lesson.examples.length > 0) {
                suffix += `  Example: \`${lesson.examples[0].split("\n")[0]}\`\n`;
            }
        }

        return suffix;
    }

    /**
     * Get correction statistics.
     */
    getStats(): { totalCorrections: number; totalLessons: number; patterns: number } {
        return {
            totalCorrections: this.corrections.length,
            totalLessons: this.lessons.length,
            patterns: this.patterns.size,
        };
    }

    private loadFromDisk(): void {
        try {
            const filePath = path.join(this.storagePath, "corrections.json");
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                this.corrections = data.corrections || [];
                this.lessons = data.lessons || [];
                // Rebuild patterns from lessons
                for (const lesson of this.lessons) {
                    this.patterns.set(lesson.pattern, {
                        pattern: lesson.pattern,
                        rule: lesson.rule,
                        examples: lesson.examples.map((e: string) => ({ original: "", corrected: e })),
                        frequency: lesson.appliedCount + 3,
                    });
                }
                logger.info(`Loaded ${this.corrections.length} corrections and ${this.lessons.length} lessons from disk.`);
            }
        } catch (error) {
            logger.warn("Failed to load corrections from disk:", error);
        }
    }

    private saveToDisk(): void {
        try {
            const filePath = path.join(this.storagePath, "corrections.json");
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, JSON.stringify({
                corrections: this.corrections.slice(-100), // Keep last 100
                lessons: this.lessons,
            }, null, 2), "utf-8");
        } catch (error) {
            logger.warn("Failed to save corrections to disk:", error);
        }
    }
}