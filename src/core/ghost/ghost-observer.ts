import * as vscode from "vscode";
import { EventEmitter } from "events";
import { StyleExtractor, type CodingStyle } from "./style-extractor";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Ghost Observer (Passive Style Learning)
// Silently observes coding sessions to learn the user's
// coding DNA: patterns, conventions, and preferences.
// ============================================================

export interface EditSnapshot {
    timestamp: number;
    filePath: string;
    before: string;
    after: string;
    change: string;
    line: number;
}

export interface SessionData {
    startTime: number;
    endTime: number;
    filesEdited: string[];
    totalEdits: number;
    snapshots: EditSnapshot[];
}

export class GhostObserver extends EventEmitter {
    private styleExtractor: StyleExtractor;
    private isObserving: boolean;
    private disposables: vscode.Disposable[];
    private currentSession: SessionData | null;
    private fileContents: Map<string, string>;
    private editCount: number;

    constructor(styleExtractor: StyleExtractor) {
        super();
        this.styleExtractor = styleExtractor;
        this.isObserving = false;
        this.disposables = [];
        this.currentSession = null;
        this.fileContents = new Map();
        this.editCount = 0;
    }

    /**
     * Start ghost mode observation.
     */
    startObserving(): void {
        if (this.isObserving) return;
        this.isObserving = true;

        this.currentSession = {
            startTime: Date.now(),
            endTime: 0,
            filesEdited: [],
            totalEdits: 0,
            snapshots: [],
        };

        // Capture initial file contents for open editors
        for (const editor of vscode.window.visibleTextEditors) {
            this.fileContents.set(
                editor.document.uri.fsPath,
                editor.document.getText()
            );
        }

        // Listen for document opens
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument((doc) => {
                this.fileContents.set(doc.uri.fsPath, doc.getText());
            })
        );

        // Listen for text changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (!this.isObserving) return;

                const filePath = e.document.uri.fsPath;
                const before = this.fileContents.get(filePath) || "";
                const after = e.document.getText();

                for (const change of e.contentChanges) {
                    const snapshot: EditSnapshot = {
                        timestamp: Date.now(),
                        filePath,
                        before: before.substring(
                            Math.max(0, change.rangeOffset - 100),
                            change.rangeOffset
                        ),
                        after: change.text,
                        change: change.text,
                        line: change.range.start.line,
                    };

                    this.currentSession?.snapshots.push(snapshot);
                    this.editCount++;

                    // Analyze the edit for style patterns
                    this.styleExtractor.analyzeEdit(
                        filePath,
                        before,
                        after
                    );
                }

                this.fileContents.set(filePath, after);

                if (this.currentSession && !this.currentSession.filesEdited.includes(filePath)) {
                    this.currentSession.filesEdited.push(filePath);
                }
                if (this.currentSession) {
                    this.currentSession.totalEdits = this.editCount;
                }
            })
        );

        // Listen for document saves (trigger style extraction)
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                if (!this.isObserving) return;
                const content = doc.getText();
                this.styleExtractor.extractStyle(doc.uri.fsPath, content);
            })
        );

        // Periodic style profile updates
        const interval = setInterval(() => {
            if (!this.isObserving) {
                clearInterval(interval);
                return;
            }
            const profile = this.styleExtractor.getStyleProfile();
            this.emit("styleUpdate", profile);
        }, 30000); // Every 30 seconds

        logger.info("Ghost mode observation started.");
    }

    /**
     * Stop ghost mode observation.
     */
    stopObserving(): void {
        if (!this.isObserving) return;
        this.isObserving = false;

        if (this.currentSession) {
            this.currentSession.endTime = Date.now();
            logger.info(
                `Ghost session ended: ${this.currentSession.totalEdits} edits across ${this.currentSession.filesEdited.length} files`
            );
        }

        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];

        // Final style extraction
        const profile = this.styleExtractor.getStyleProfile();
        this.emit("styleUpdate", profile);
        this.emit("sessionEnd", this.currentSession);

        logger.info("Ghost mode observation stopped.");
    }

    /**
     * Get the current coding style profile.
     */
    getStyleProfile(): CodingStyle {
        return this.styleExtractor.getStyleProfile();
    }

    /**
     * Get the coding DNA summary.
     */
    getCodingDNA(): string {
        return this.styleExtractor.generateCodingDNA();
    }

    /**
     * Get observation statistics.
     */
    getStats(): {
        isObserving: boolean;
        totalEdits: number;
        filesEdited: number;
        sessionDuration: number;
        styleConfidence: number;
    } {
        const profile = this.styleExtractor.getStyleProfile();
        return {
            isObserving: this.isObserving,
            totalEdits: this.editCount,
            filesEdited: this.currentSession?.filesEdited.length || 0,
            sessionDuration: this.currentSession
                ? Date.now() - this.currentSession.startTime
                : 0,
            styleConfidence: profile.confidence,
        };
    }

    /**
     * Reset all learned style data.
     */
    resetStyle(): void {
        this.styleExtractor.reset();
        this.editCount = 0;
        this.fileContents.clear();
        logger.info("Ghost mode style data reset.");
    }

    dispose(): void {
        this.stopObserving();
        this.removeAllListeners();
    }
}