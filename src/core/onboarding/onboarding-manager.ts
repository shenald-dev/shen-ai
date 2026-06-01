import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Onboarding Manager
// Detects first-run users and manages onboarding state.
// ============================================================

export interface OnboardingState {
    hasCompletedOnboarding: boolean;
    hasConfiguredProvider: boolean;
    hasSentFirstMessage: boolean;
    hasUsedTool: boolean;
    firstSeenAt: number;
    onboardingCompletedAt?: number;
    dismissedWelcome: boolean;
}

const STATE_FILE = path.join(os.homedir(), ".shen-ai", "onboarding.json");

export class OnboardingManager {
    private state: OnboardingState;

    constructor() {
        this.state = this.loadState();
    }

    /**
     * Check if this is the user's first time using SHEN AI.
     */
    isFirstRun(): boolean {
        return !this.state.hasCompletedOnboarding && !this.state.hasSentFirstMessage;
    }

    /**
     * Check if welcome panel should be shown.
     */
    shouldShowWelcome(): boolean {
        return !this.state.dismissedWelcome && !this.state.hasCompletedOnboarding;
    }

    /**
     * Mark welcome as dismissed.
     */
    dismissWelcome(): void {
        this.state.dismissedWelcome = true;
        this.saveState();
    }

    /**
     * Mark provider as configured.
     */
    markProviderConfigured(): void {
        this.state.hasConfiguredProvider = true;
        this.checkCompletion();
        this.saveState();
    }

    /**
     * Mark first message sent.
     */
    markFirstMessageSent(): void {
        this.state.hasSentFirstMessage = true;
        this.checkCompletion();
        this.saveState();
        logger.info("User sent their first SHEN AI message!");
    }

    /**
     * Mark first tool used.
     */
    markFirstToolUsed(): void {
        this.state.hasUsedTool = true;
        this.checkCompletion();
        this.saveState();
    }

    /**
     * Get current onboarding state.
     */
    getState(): OnboardingState {
        return { ...this.state };
    }

    /**
     * Get onboarding progress (0-100).
     */
    getProgress(): number {
        let progress = 0;
        if (this.state.hasConfiguredProvider) progress += 30;
        if (this.state.hasSentFirstMessage) progress += 40;
        if (this.state.hasUsedTool) progress += 30;
        return progress;
    }

    /**
     * Reset onboarding (for testing).
     */
    reset(): void {
        this.state = {
            hasCompletedOnboarding: false,
            hasConfiguredProvider: false,
            hasSentFirstMessage: false,
            hasUsedTool: false,
            firstSeenAt: Date.now(),
            dismissedWelcome: false,
        };
        this.saveState();
        logger.info("Onboarding state reset.");
    }

    private checkCompletion(): void {
        if (
            this.state.hasConfiguredProvider &&
            this.state.hasSentFirstMessage &&
            !this.state.hasCompletedOnboarding
        ) {
            this.state.hasCompletedOnboarding = true;
            this.state.onboardingCompletedAt = Date.now();
            logger.info("Onboarding completed! Welcome to SHEN AI.");
        }
    }

    private loadState(): OnboardingState {
        try {
            if (fs.existsSync(STATE_FILE)) {
                const content = fs.readFileSync(STATE_FILE, "utf-8");
                return JSON.parse(content);
            }
        } catch (error) {
            logger.error("Failed to load onboarding state:", error);
        }

        // Default state for new users
        return {
            hasCompletedOnboarding: false,
            hasConfiguredProvider: false,
            hasSentFirstMessage: false,
            hasUsedTool: false,
            firstSeenAt: Date.now(),
            dismissedWelcome: false,
        };
    }

    private saveState(): void {
        try {
            const dir = path.dirname(STATE_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2), "utf-8");
        } catch (error) {
            logger.error("Failed to save onboarding state:", error);
        }
    }
}