import type { Lesson, PersonalityType } from "../../types";
import { CorrectionTracker } from "./correction-tracker";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Prompt Optimizer (Auto-Evolves System Prompts)
// ============================================================

export interface PromptVersion {
    id: string;
    timestamp: number;
    basePrompt: string;
    lessonsApplied: string[];
    fullPrompt: string;
    performance: number; // Lower corrections = better performance
}

export class PromptOptimizer {
    private correctionTracker: CorrectionTracker;
    private currentVersion: PromptVersion | null;
    private versions: PromptVersion[];
    private basePrompts: Record<PersonalityType, string>;

    constructor(correctionTracker: CorrectionTracker) {
        this.correctionTracker = correctionTracker;
        this.currentVersion = null;
        this.versions = [];
        this.basePrompts = this.getDefaultBasePrompts();
    }

    /**
     * Set the base prompt for a personality.
     */
    setBasePrompt(personality: PersonalityType, prompt: string): void {
        this.basePrompts[personality] = prompt;
    }

    /**
     * Build the optimized system prompt for a given personality.
     * Automatically injects learned lessons.
     */
    buildOptimizedPrompt(personality: PersonalityType): string {
        const basePrompt = this.basePrompts[personality] || this.basePrompts["senior-dev"];
        const lessons = this.correctionTracker.getActiveLessons();
        const lessonSuffix = this.correctionTracker.generatePromptSuffix();

        const fullPrompt = basePrompt + lessonSuffix;

        // Track this version
        const version: PromptVersion = {
            id: `v${this.versions.length + 1}_${Date.now()}`,
            timestamp: Date.now(),
            basePrompt,
            lessonsApplied: lessons.map((l) => l.pattern),
            fullPrompt,
            performance: this.calculatePerformance(),
        };

        this.versions.push(version);
        this.currentVersion = version;

        logger.debug(`Prompt optimized: ${lessons.length} lessons applied, performance: ${version.performance}`);

        return fullPrompt;
    }

    /**
     * Calculate prompt performance based on recent correction rate.
     * Lower = better (fewer corrections needed).
     */
    private calculatePerformance(): number {
        const stats = this.correctionTracker.getStats();
        // Simple metric: corrections per lesson (lower is better)
        if (stats.totalLessons === 0) return 100;
        return Math.round(stats.totalCorrections / stats.totalLessons * 10);
    }

    /**
     * Get the current prompt version info.
     */
    getCurrentVersion(): PromptVersion | null {
        return this.currentVersion;
    }

    /**
     * Get all prompt versions for analysis.
     */
    getVersions(): PromptVersion[] {
        return this.versions;
    }

    /**
     * Get optimization statistics.
     */
    getStats(): {
        totalVersions: number;
        activeLessons: number;
        currentPerformance: number;
        lessons: Lesson[];
    } {
        const lessons = this.correctionTracker.getActiveLessons();
        return {
            totalVersions: this.versions.length,
            activeLessons: lessons.length,
            currentPerformance: this.calculatePerformance(),
            lessons,
        };
    }

    private getDefaultBasePrompts(): Record<PersonalityType, string> {
        return {
            mentor: "You are a patient, knowledgeable mentor.",
            "senior-dev": "You are a senior software engineer.",
            hacker: "You are a creative hacker.",
            reviewer: "You are a strict code reviewer.",
            socratic: "You are a Socratic teacher.",
            "silent-partner": "You are a silent partner.",
        };
    }
}