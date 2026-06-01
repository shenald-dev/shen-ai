import * as vscode from "vscode";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Behavior Analyzer (Cursor/Edit Pattern Analysis)
// ============================================================

export interface EditEvent {
    timestamp: number;
    filePath: string;
    text: string;
    rangeLength: number;
    isDeletion: boolean;
    line: number;
    character: number;
}

export interface NavigationEvent {
    timestamp: number;
    filePath: string;
    line: number;
    character: number;
    source: "click" | "keyboard" | "goto" | "search";
}

export interface BehaviorPattern {
    type: "creating" | "editing" | "debugging" | "refactoring" | "navigating" | "reviewing";
    confidence: number; // 0-1
    context: string;
    predictedIntent: string;
}

export class BehaviorAnalyzer extends EventEmitter {
    private editEvents: EditEvent[];
    private navigationEvents: NavigationEvent[];
    private currentFile: string | null;
    private disposables: vscode.Disposable[];
    private isObserving: boolean;
    private analysisInterval: NodeJS.Timeout | null;

    constructor() {
        super();
        this.editEvents = [];
        this.navigationEvents = [];
        this.currentFile = null;
        this.disposables = [];
        this.isObserving = false;
        this.analysisInterval = null;
    }

    /**
     * Start observing user behavior.
     */
    startObserving(): void {
        if (this.isObserving) return;
        this.isObserving = true;

        // Listen for text document changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (!this.isObserving) return;
                for (const change of e.contentChanges) {
                    const event: EditEvent = {
                        timestamp: Date.now(),
                        filePath: e.document.uri.fsPath,
                        text: change.text,
                        rangeLength: change.rangeLength,
                        isDeletion: change.text.length === 0 && change.rangeLength > 0,
                        line: change.range.start.line,
                        character: change.range.start.character,
                    };
                    this.editEvents.push(event);
                }
                // Keep only last 500 events
                if (this.editEvents.length > 500) {
                    this.editEvents = this.editEvents.slice(-500);
                }
            })
        );

        // Listen for cursor/selection changes
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection((e) => {
                if (!this.isObserving) return;
                const editor = e.textEditor;
                const selection = e.selections[0];
                if (selection) {
                    const event: NavigationEvent = {
                        timestamp: Date.now(),
                        filePath: editor.document.uri.fsPath,
                        line: selection.active.line,
                        character: selection.active.character,
                        source: "click",
                    };
                    this.navigationEvents.push(event);
                    this.currentFile = editor.document.uri.fsPath;

                    // Keep only last 200 events
                    if (this.navigationEvents.length > 200) {
                        this.navigationEvents = this.navigationEvents.slice(-200);
                    }
                }
            })
        );

        // Listen for active editor changes
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (!this.isObserving || !editor) return;
                this.currentFile = editor.document.uri.fsPath;
                this.navigationEvents.push({
                    timestamp: Date.now(),
                    filePath: editor.document.uri.fsPath,
                    line: editor.selection.active.line,
                    character: editor.selection.active.character,
                    source: "goto",
                });
            })
        );

        // Periodic analysis
        this.analysisInterval = setInterval(() => {
            this.analyzeBehavior();
        }, 5000);

        logger.info("Behavior analyzer started observing.");
    }

    /**
     * Stop observing user behavior.
     */
    stopObserving(): void {
        this.isObserving = false;
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
            this.analysisInterval = null;
        }
        logger.info("Behavior analyzer stopped observing.");
    }

    /**
     * Analyze recent behavior to detect patterns and predict intent.
     */
    private analyzeBehavior(): void {
        if (this.editEvents.length < 3 && this.navigationEvents.length < 5) return;

        const now = Date.now();
        const recentEdits = this.editEvents.filter((e) => now - e.timestamp < 30000); // Last 30s
        const recentNavs = this.navigationEvents.filter((e) => now - e.timestamp < 30000);

        const patterns: BehaviorPattern[] = [];

        // Detect: Creating new code
        if (recentEdits.length > 5) {
            const additions = recentEdits.filter((e) => !e.isDeletion && e.text.length > 10);
            if (additions.length > 3) {
                patterns.push({
                    type: "creating",
                    confidence: Math.min(additions.length / 10, 1),
                    context: this.currentFile || "",
                    predictedIntent: `User is actively writing new code in ${this.getFileName(this.currentFile || "")}. They may need: boilerplate generation, function completion, or error handling suggestions.`,
                });
            }
        }

        // Detect: Debugging
        const fileHops = new Set(recentNavs.map((n) => n.filePath)).size;
        if (fileHops > 3 && recentNavs.length > 10) {
            patterns.push({
                type: "debugging",
                confidence: Math.min(fileHops / 5, 1),
                context: `Visited ${fileHops} files in 30s`,
                predictedIntent: `User is navigating across multiple files rapidly, likely debugging or tracing a bug. They may need: error analysis, stack trace explanation, or fix suggestions.`,
            });
        }

        // Detect: Refactoring
        const deletions = recentEdits.filter((e) => e.isDeletion && e.rangeLength > 20);
        const additions = recentEdits.filter((e) => !e.isDeletion && e.text.length > 20);
        if (deletions.length > 2 && additions.length > 2) {
            patterns.push({
                type: "refactoring",
                confidence: Math.min((deletions.length + additions.length) / 10, 1),
                context: this.currentFile || "",
                predictedIntent: `User is deleting and rewriting code blocks in ${this.getFileName(this.currentFile || "")}. They may need: refactoring suggestions, code improvement tips, or test generation.`,
            });
        }

        // Detect: Reviewing/Reading
        if (recentNavs.length > 8 && recentEdits.length < 2) {
            patterns.push({
                type: "reviewing",
                confidence: Math.min(recentNavs.length / 15, 1),
                context: `Navigation without editing`,
                predictedIntent: `User is reading/reviewing code without making changes. They may need: code explanation, architecture overview, or documentation.`,
            });
        }

        // Emit the strongest pattern
        if (patterns.length > 0) {
            const strongest = patterns.sort((a, b) => b.confidence - a.confidence)[0];
            this.emit("pattern", strongest);
            logger.debug(`Behavior pattern detected: ${strongest.type} (confidence: ${strongest.confidence.toFixed(2)})`);
        }
    }

    /**
     * Get the current behavior snapshot.
     */
    getCurrentBehavior(): BehaviorPattern | null {
        const now = Date.now();
        const recentEdits = this.editEvents.filter((e) => now - e.timestamp < 15000);
        const recentNavs = this.navigationEvents.filter((e) => now - e.timestamp < 15000);

        if (recentEdits.length > 3) {
            return {
                type: "editing",
                confidence: 0.7,
                context: this.currentFile || "",
                predictedIntent: `User is editing ${this.getFileName(this.currentFile || "")}.`,
            };
        }

        if (recentNavs.length > 5) {
            return {
                type: "navigating",
                confidence: 0.6,
                context: this.currentFile || "",
                predictedIntent: `User is navigating the codebase.`,
            };
        }

        return null;
    }

    /**
     * Get recent edit events for a specific file.
     */
    getRecentEdits(filePath: string, maxAge: number = 60000): EditEvent[] {
        const now = Date.now();
        return this.editEvents.filter(
            (e) => e.filePath === filePath && now - e.timestamp < maxAge
        );
    }

    /**
     * Get behavior statistics.
     */
    getStats(): {
        totalEdits: number;
        totalNavigations: number;
        activeFiles: number;
        isObserving: boolean;
    } {
        const activeFiles = new Set(this.editEvents.map((e) => e.filePath)).size;
        return {
            totalEdits: this.editEvents.length,
            totalNavigations: this.navigationEvents.length,
            activeFiles,
            isObserving: this.isObserving,
        };
    }

    private getFileName(filePath: string): string {
        return filePath.split(/[/\\]/).pop() || filePath;
    }

    dispose(): void {
        this.stopObserving();
    }
}