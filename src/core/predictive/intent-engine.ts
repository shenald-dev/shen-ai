import { EventEmitter } from "events";
import { BehaviorAnalyzer, type BehaviorPattern } from "./behavior-analyzer";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Predictive Intent Engine
// Anticipates what the user wants to do next based on behavior
// ============================================================

export interface PredictedIntent {
    type: IntentType;
    confidence: number;
    description: string;
    suggestedAction: string;
    context: {
        file?: string;
        code?: string;
        error?: string;
    };
}

export type IntentType =
    | "create_function"
    | "fix_bug"
    | "add_test"
    | "refactor"
    | "explain_code"
    | "add_error_handling"
    | "add_type_annotations"
    | "generate_boilerplate"
    | "optimize_performance"
    | "add_documentation"
    | "debug_error"
    | "implement_feature";

export interface IntentSuggestion {
    intent: PredictedIntent;
    preGeneratedCode?: string;
    prompt?: string;
}

export class IntentEngine extends EventEmitter {
    private behaviorAnalyzer: BehaviorAnalyzer;
    private isEnabled: boolean;
    private lastIntent: PredictedIntent | null;
    private intentHistory: PredictedIntent[];
    private cooldownUntil: number;
    private patternHandler: (pattern: BehaviorPattern) => void;

    constructor(behaviorAnalyzer: BehaviorAnalyzer) {
        super();
        this.behaviorAnalyzer = behaviorAnalyzer;
        this.isEnabled = false;
        this.lastIntent = null;
        this.intentHistory = [];
        this.cooldownUntil = 0;

        // Store handler reference so it can be removed on dispose
        this.patternHandler = (pattern: BehaviorPattern) => {
            if (this.isEnabled) {
                this.analyzePattern(pattern);
            }
        };
        this.behaviorAnalyzer.on("pattern", this.patternHandler);
    }

    /**
     * Enable the predictive intent engine.
     */
    enable(): void {
        this.isEnabled = true;
        this.behaviorAnalyzer.startObserving();
        logger.info("Predictive intent engine enabled.");
    }

    /**
     * Disable the predictive intent engine.
     */
    disable(): void {
        this.isEnabled = false;
        logger.info("Predictive intent engine disabled.");
    }

    /**
     * Analyze a behavior pattern and predict intent.
     */
    private analyzePattern(pattern: BehaviorPattern): void {
        // Cooldown: don't emit intents too frequently
        if (Date.now() < this.cooldownUntil) return;

        let intent: PredictedIntent | null = null;

        switch (pattern.type) {
            case "creating":
                intent = this.predictCreatingIntent(pattern);
                break;
            case "debugging":
                intent = this.predictDebuggingIntent(pattern);
                break;
            case "refactoring":
                intent = this.predictRefactoringIntent(pattern);
                break;
            case "reviewing":
                intent = this.predictReviewingIntent(pattern);
                break;
            case "editing":
                intent = this.predictEditingIntent(pattern);
                break;
        }

        if (intent && intent.confidence > 0.5) {
            this.lastIntent = intent;
            this.intentHistory.push(intent);
            if (this.intentHistory.length > 50) {
                this.intentHistory = this.intentHistory.slice(-50);
            }

            // Set cooldown (30 seconds between predictions)
            this.cooldownUntil = Date.now() + 30000;

            this.emit("intent", intent);
            logger.info(`Intent predicted: ${intent.type} (confidence: ${intent.confidence.toFixed(2)})`);
        }
    }

    private predictCreatingIntent(pattern: BehaviorPattern): PredictedIntent {
        const fileName = pattern.context.split(/[/\\]/).pop() || "";

        // If creating a new file
        if (fileName.includes("test") || fileName.includes("spec")) {
            return {
                type: "add_test",
                confidence: 0.8,
                description: "You seem to be writing tests. Want me to generate test cases?",
                suggestedAction: "Generate test cases for the current module",
                context: { file: pattern.context },
            };
        }

        if (fileName.includes("controller") || fileName.includes("route") || fileName.includes("handler")) {
            return {
                type: "generate_boilerplate",
                confidence: 0.75,
                description: "You're creating a controller/route. Want me to generate the CRUD boilerplate?",
                suggestedAction: "Generate CRUD routes with validation",
                context: { file: pattern.context },
            };
        }

        return {
            type: "create_function",
            confidence: pattern.confidence * 0.8,
            description: "You're writing new code. Want me to suggest function implementations or complete the pattern?",
            suggestedAction: "Suggest function implementation based on context",
            context: { file: pattern.context },
        };
    }

    private predictDebuggingIntent(pattern: BehaviorPattern): PredictedIntent {
        return {
            type: "debug_error",
            confidence: pattern.confidence * 0.9,
            description: "You're navigating across files rapidly, possibly tracking down a bug. Want me to analyze the error or trace the issue?",
            suggestedAction: "Analyze recent errors and suggest fixes",
            context: { file: pattern.context },
        };
    }

    private predictRefactoringIntent(pattern: BehaviorPattern): PredictedIntent {
        return {
            type: "refactor",
            confidence: pattern.confidence * 0.85,
            description: "You're rewriting code blocks. Want me to suggest refactoring improvements or apply best practices?",
            suggestedAction: "Suggest refactoring improvements for the current file",
            context: { file: pattern.context },
        };
    }

    private predictReviewingIntent(pattern: BehaviorPattern): PredictedIntent {
        return {
            type: "explain_code",
            confidence: pattern.confidence * 0.7,
            description: "You're reading through code. Want me to explain the architecture or generate documentation?",
            suggestedAction: "Explain the architecture of the current module",
            context: { file: pattern.context },
        };
    }

    private predictEditingIntent(pattern: BehaviorPattern): PredictedIntent {
        return {
            type: "add_error_handling",
            confidence: pattern.confidence * 0.5,
            description: "You're editing code. Want me to add error handling or type annotations?",
            suggestedAction: "Add error handling to the current function",
            context: { file: pattern.context },
        };
    }

    /**
     * Get the latest predicted intent.
     */
    getLastIntent(): PredictedIntent | null {
        return this.lastIntent;
    }

    /**
     * Get intent prediction history.
     */
    getIntentHistory(): PredictedIntent[] {
        return this.intentHistory;
    }

    /**
     * Get engine statistics.
     */
    getStats(): {
        isEnabled: boolean;
        totalPredictions: number;
        lastPrediction: string | null;
    } {
        return {
            isEnabled: this.isEnabled,
            totalPredictions: this.intentHistory.length,
            lastPrediction: this.lastIntent?.type || null,
        };
    }

    dispose(): void {
        this.disable();
        // Remove the listener from behaviorAnalyzer to prevent memory leak
        this.behaviorAnalyzer.removeListener("pattern", this.patternHandler);
        this.removeAllListeners();
    }
}