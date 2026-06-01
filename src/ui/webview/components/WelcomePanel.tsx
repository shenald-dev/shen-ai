import React from "react";

// ============================================================
// SHEN AI — Welcome Panel (Onboarding)
// Displayed to first-time users to guide them through setup.
// ============================================================

interface WelcomePanelProps {
    onDismiss: () => void;
    onOpenSettings: () => void;
    hasApiKey: boolean;
    provider: string;
}

export const WelcomePanel: React.FC<WelcomePanelProps> = ({
    onDismiss,
    onOpenSettings,
    hasApiKey,
    provider,
}) => {
    const [step, setStep] = React.useState(0);

    const steps = [
        {
            icon: "👋",
            title: "Welcome to SHEN AI",
            description: "Your autonomous AI coding assistant that thinks ahead, learns from you, and builds features end-to-end.",
            tips: [
                "Multi-agent system with 5 specialist agents",
                "8 AI providers supported (OpenAI, Anthropic, Google, Ollama, and more)",
                "10 unique features no other agent has",
            ],
        },
        {
            icon: "🔑",
            title: "Connect Your AI Provider",
            description: hasApiKey
                ? `You're connected with ${provider}! You can change providers anytime in settings.`
                : "Choose an AI provider and enter your API key to get started. Ollama works locally with no API key needed.",
            tips: [
                "Anthropic Claude — Best for coding tasks",
                "OpenAI GPT-4o — Great all-rounder",
                "Ollama — Free, runs locally on your machine",
                "Custom — Any OpenAI-compatible API endpoint",
            ],
        },
        {
            icon: "💬",
            title: "Start Coding",
            description: "Type a message below to start. SHEN AI can read files, write code, execute commands, and build complete features.",
            tips: [
                'Try: "Build a REST API for users with CRUD operations"',
                'Try: "Review my code for security issues"',
                'Try: "Explain this codebase architecture"',
                'Try: "Fix the bug in my test output"',
            ],
        },
        {
            icon: "🧬",
            title: "Discover Unique Features",
            description: "SHEN AI has capabilities no other coding agent offers. Explore them as you use the extension.",
            tips: [
                "🔮 Predictive Intent — SHEN anticipates your next moves",
                "🧠 Self-Evolving Prompts — Learns from your corrections",
                "🐝 Swarm Mode — Multiple agents work in parallel",
                "👻 Ghost Mode — Learns your coding DNA silently",
            ],
        },
    ];

    const currentStep = steps[step];
    const isLastStep = step === steps.length - 1;

    return (
        <div className="welcome-panel">
            <div className="welcome-header">
                <span className="welcome-icon">{currentStep.icon}</span>
                <h2 className="welcome-title">{currentStep.title}</h2>
            </div>

            <p className="welcome-description">{currentStep.description}</p>

            <div className="welcome-tips">
                {currentStep.tips.map((tip, i) => (
                    <div key={i} className="welcome-tip">
                        <span className="welcome-tip-dot">•</span>
                        <span>{tip}</span>
                    </div>
                ))}
            </div>

            <div className="welcome-progress">
                {steps.map((_, i) => (
                    <div
                        key={i}
                        className={`welcome-progress-dot ${i === step ? "active" : ""} ${i < step ? "completed" : ""}`}
                        onClick={() => setStep(i)}
                    />
                ))}
            </div>

            <div className="welcome-actions">
                {!hasApiKey && step === 1 && (
                    <button className="welcome-btn primary" onClick={onOpenSettings}>
                        ⚙️ Open Settings
                    </button>
                )}

                {step > 0 && (
                    <button className="welcome-btn secondary" onClick={() => setStep(step - 1)}>
                        ← Back
                    </button>
                )}

                {!isLastStep ? (
                    <button className="welcome-btn primary" onClick={() => setStep(step + 1)}>
                        Next →
                    </button>
                ) : (
                    <button className="welcome-btn primary" onClick={onDismiss}>
                        🚀 Start Coding
                    </button>
                )}
            </div>
        </div>
    );
};