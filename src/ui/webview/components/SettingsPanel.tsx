import React from "react";
import { useChatStore } from "../store/chat-store";
import type { ProviderName, PersonalityType } from "../../../types";
import { postMessage } from "../vscode-api";

// ============================================================
// SHEN AI — Settings Panel Component
// ============================================================

const PROVIDERS: { value: ProviderName; label: string; icon: string }[] = [
    { value: "anthropic", label: "Anthropic (Claude)", icon: "🟣" },
    { value: "openai", label: "OpenAI (GPT)", icon: "🟢" },
    { value: "google", label: "Google (Gemini)", icon: "🔵" },
    { value: "ollama", label: "Ollama (Local)", icon: "🦙" },
    { value: "groq", label: "Groq", icon: "⚡" },
    { value: "mistral", label: "Mistral", icon: "🌊" },
    { value: "azure", label: "Azure OpenAI", icon: "☁️" },
    { value: "custom", label: "Custom Endpoint", icon: "🔧" },
];

const PERSONALITIES: { value: PersonalityType; label: string; description: string }[] = [
    { value: "senior-dev", label: "💻 Senior Dev", description: "Direct, concise, production-focused" },
    { value: "mentor", label: "🎓 Mentor", description: "Thorough explanations, teaches concepts" },
    { value: "hacker", label: "🔓 Hacker", description: "Creative, fast, pushes boundaries" },
    { value: "reviewer", label: "🔍 Reviewer", description: "Strict, security-focused, catches issues" },
    { value: "socratic", label: "❓ Socratic", description: "Guides through questions" },
    { value: "silent-partner", label: "🤫 Silent", description: "Minimal, only when needed" },
];

const MODEL_PRESETS: Record<ProviderName, string[]> = {
    anthropic: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-3-5-sonnet-20241022"],
    openai: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
    google: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-pro"],
    ollama: ["codellama", "llama3", "mistral", "phi3"],
    groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
    mistral: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
    azure: ["gpt-4o", "gpt-4", "gpt-35-turbo"],
    custom: [],
};

export default function SettingsPanel(): JSX.Element {
    const { settings, updateSettings, setShowSettings } = useChatStore();
    const [apiKey, setApiKey] = React.useState("");
    const [showApiKey, setShowApiKey] = React.useState(false);
    const [fetchedModels, setFetchedModels] = React.useState<string[]>([]);
    const [connectionStatus, setConnectionStatus] = React.useState<string>("");

    React.useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.action === "settings/testConnectionResult") {
                const { success, models, error } = message.payload;
                if (success) {
                    setFetchedModels(models);
                    if (models.length > 0) {
                        setConnectionStatus(`✅ Success! Found ${models.length} models.`);
                        if (!settings.model || settings.model.trim() === "") {
                            handleModelChange(models[0]);
                        }
                    } else {
                        setConnectionStatus(`✅ Connected! (No auto-discovery, please enter model manually)`);
                    }
                } else {
                    setConnectionStatus("❌ Connection failed: " + error);
                }
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [settings.model]);

    const handleFetchModels = () => {
        if (!settings.customBaseUrl) {
            setConnectionStatus("⚠ Please enter a Base URL first.");
            return;
        }

        setConnectionStatus("⏳ Connecting...");
        postMessage({
            action: "settings/testConnection" as any,
            payload: {
                provider: settings.provider,
                baseUrl: settings.customBaseUrl,
                apiKey: apiKey
            }
        });
    };

    const handleProviderChange = (provider: ProviderName) => {
        const models = MODEL_PRESETS[provider] || [];
        const newModel = models[0] || "";
        updateSettings({ provider, model: newModel, hasApiKey: false });

        const payload: Record<string, unknown> = { provider, model: newModel };
        if (provider === "custom") {
            payload.customModel = newModel;
        }

        postMessage({
            action: "settings/update",
            payload,
        });
    };

    const handleModelChange = (model: string) => {
        updateSettings({ model });
        if (settings.provider === "custom") {
            postMessage({
                action: "settings/update",
                payload: { model, customModel: model },
            });
        } else {
            postMessage({
                action: "settings/update",
                payload: { model },
            });
        }
    };

    const handlePersonalityChange = (personality: PersonalityType) => {
        updateSettings({ personality });
        postMessage({
            action: "settings/update",
            payload: { personality },
        });
    };

    const handleApiKeySave = () => {
        const keyMap: Record<ProviderName, string> = {
            openai: "openaiApiKey",
            anthropic: "anthropicApiKey",
            google: "googleApiKey",
            groq: "groqApiKey",
            mistral: "mistralApiKey",
            azure: "azureApiKey",
            ollama: "",
            custom: "customApiKey",
        };
        const settingKey = keyMap[settings.provider];
        if (settingKey && apiKey.trim()) {
            postMessage({
                action: "settings/update",
                payload: { [settingKey]: apiKey.trim() },
            });
            setApiKey("");
            updateSettings({ hasApiKey: true });
        }
    };

    const models = MODEL_PRESETS[settings.provider] || [];

    const sectionStyle: React.CSSProperties = {
        marginBottom: "12px",
    };

    const labelStyle: React.CSSProperties = {
        display: "block",
        fontSize: "11px",
        fontWeight: 600,
        color: "var(--vscode-descriptionForeground)",
        marginBottom: "4px",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
    };

    const selectStyle: React.CSSProperties = {
        width: "100%",
        padding: "6px 8px",
        background: "var(--vscode-input-background)",
        color: "var(--vscode-input-foreground)",
        border: "1px solid var(--vscode-input-border, #404040)",
        borderRadius: "4px",
        fontSize: "12px",
        fontFamily: "inherit",
        outline: "none",
        cursor: "pointer",
    };

    return (
        <div style={{
            padding: "12px",
            borderBottom: "1px solid var(--vscode-panel-border, #404040)",
            background: "var(--vscode-sideBar-background)",
            maxHeight: "400px",
            overflowY: "auto",
            flexShrink: 0,
        }}>
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
            }}>
                <h3 style={{ fontSize: "13px", fontWeight: 600, margin: 0 }}>⚙ Settings</h3>
                <button
                    onClick={() => {
                        const payload: Record<string, unknown> = {
                            provider: settings.provider,
                            model: settings.model,
                            temperature: settings.temperature,
                            maxTokens: settings.maxTokens,
                            personality: settings.personality,
                        };

                        if (settings.provider === "custom") {
                            payload.customModel = settings.model;
                            payload.customBaseUrl = settings.customBaseUrl;
                        } else if (settings.provider === "ollama") {
                            payload.ollamaBaseUrl = settings.customBaseUrl;
                        } else if (settings.provider === "azure") {
                            payload.azureEndpoint = settings.customBaseUrl;
                        }

                        postMessage({
                            action: "settings/update",
                            payload,
                        });

                        if (apiKey.trim()) {
                            handleApiKeySave();
                        }

                        setShowSettings(false);
                    }}
                    className="btn-primary"
                    style={{ padding: "4px 12px", fontSize: "11px", fontWeight: "bold", background: "#0e639c", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >
                    Save & Close
                </button>
            </div>

            {/* Provider Selection */}
            <div style={sectionStyle}>
                <label style={labelStyle}>AI Provider</label>
                <select
                    value={settings.provider}
                    onChange={(e) => handleProviderChange(e.target.value as ProviderName)}
                    style={selectStyle}
                >
                    {PROVIDERS.map((p) => (
                        <option key={p.value} value={p.value}>
                            {p.icon} {p.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Model Selection */}
            <div style={sectionStyle}>
                <label style={labelStyle}>Model</label>
                {models.length > 0 ? (
                    <select
                        value={settings.model}
                        onChange={(e) => handleModelChange(e.target.value)}
                        style={selectStyle}
                    >
                        {models.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                ) : fetchedModels.length > 0 ? (
                    <select
                        value={settings.model}
                        onChange={(e) => handleModelChange(e.target.value)}
                        style={selectStyle}
                    >
                        {fetchedModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                ) : (
                    <input
                        type="text"
                        value={settings.model}
                        onChange={(e) => handleModelChange(e.target.value)}
                        placeholder="Enter model name..."
                        style={{
                            ...selectStyle,
                            cursor: "text",
                        }}
                    />
                )}
            </div>

            {/* Custom Base URL */}
            {["custom", "ollama", "azure"].includes(settings.provider) && (
                <div style={sectionStyle}>
                    <label style={labelStyle}>
                        {settings.provider === "azure" ? "Azure Endpoint" : "Base URL"}
                    </label>
                    <input
                        type="text"
                        value={settings.customBaseUrl}
                        onChange={(e) => {
                            const val = e.target.value;
                            updateSettings({ customBaseUrl: val });
                            const settingKey = settings.provider === "azure" ? "azureEndpoint" : (settings.provider === "ollama" ? "ollamaBaseUrl" : "customBaseUrl");
                            postMessage({
                                action: "settings/update",
                                payload: { [settingKey]: val },
                            });
                        }}
                        placeholder="e.g. http://localhost:11434"
                        style={{
                            ...selectStyle,
                            cursor: "text",
                        }}
                    />

                    {["custom", "ollama"].includes(settings.provider) && (
                        <div style={{ marginTop: "8px" }}>
                            <button
                                onClick={handleFetchModels}
                                className="btn-secondary"
                                style={{ padding: "4px 8px", fontSize: "11px", width: "100%", marginBottom: "4px" }}
                            >
                                🔌 Connect API & Fetch Models
                            </button>
                            {connectionStatus && (
                                <div style={{ fontSize: "11px", color: connectionStatus.includes("❌") ? "var(--vscode-errorForeground)" : "var(--vscode-testing-iconPassed)" }}>
                                    {connectionStatus}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* API Key */}
            {settings.provider !== "ollama" && (
                <div style={sectionStyle}>
                    <label style={labelStyle}>API Key</label>
                    <div style={{ display: "flex", gap: "4px" }}>
                        <input
                            type={showApiKey ? "text" : "password"}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={settings.hasApiKey ? "•••••• configured ••••••" : "Enter API key..."}
                            style={{
                                ...selectStyle,
                                flex: 1,
                                cursor: "text",
                            }}
                        />
                        <button
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="btn-secondary"
                            style={{ padding: "6px 8px", fontSize: "12px" }}
                            title={showApiKey ? "Hide" : "Show"}
                        >
                            {showApiKey ? "🙈" : "👁"}
                        </button>
                        <button
                            onClick={handleApiKeySave}
                            className="btn-primary"
                            style={{ padding: "6px 8px", fontSize: "12px" }}
                            disabled={!apiKey.trim()}
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}

            {/* Personality */}
            <div style={sectionStyle}>
                <label style={labelStyle}>Personality</label>
                <select
                    value={settings.personality}
                    onChange={(e) => handlePersonalityChange(e.target.value as PersonalityType)}
                    style={selectStyle}
                >
                    {PERSONALITIES.map((p) => (
                        <option key={p.value} value={p.value}>
                            {p.label} — {p.description}
                        </option>
                    ))}
                </select>
            </div>

            {/* Temperature */}
            <div style={sectionStyle}>
                <label style={labelStyle}>Temperature: {settings.temperature.toFixed(1)}</label>
                <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={settings.temperature}
                    onChange={(e) => {
                        const temp = parseFloat(e.target.value);
                        updateSettings({ temperature: temp });
                        postMessage({
                            action: "settings/update",
                            payload: { temperature: temp },
                        });
                    }}
                    style={{ width: "100%" }}
                />
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "10px",
                    color: "var(--vscode-descriptionForeground)",
                }}>
                    <span>Precise</span>
                    <span>Creative</span>
                </div>
            </div>

            {/* Max Tokens */}
            <div style={sectionStyle}>
                <label style={labelStyle}>Max Tokens: {settings.maxTokens.toLocaleString()}</label>
                <input
                    type="range"
                    min="1024"
                    max="128000"
                    step="1024"
                    value={settings.maxTokens}
                    onChange={(e) => {
                        const tokens = parseInt(e.target.value);
                        updateSettings({ maxTokens: tokens });
                        postMessage({
                            action: "settings/update",
                            payload: { maxTokens: tokens },
                        });
                    }}
                    style={{ width: "100%" }}
                />
            </div>

            {/* Feature Toggles */}
            <div style={sectionStyle}>
                <label style={labelStyle}>Core Features</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <ToggleRow
                        label="Self-Evolving Prompts"
                        description="Learns from your corrections"
                        checked={settings.enableSelfEvolvingPrompts}
                        onChange={(val) => {
                            updateSettings({ enableSelfEvolvingPrompts: val });
                            postMessage({
                                action: "settings/update",
                                payload: { enableSelfEvolvingPrompts: val },
                            });
                        }}
                    />
                    <ToggleRow
                        label="Predictive Intent"
                        description="Anticipates your next moves"
                        checked={settings.enablePredictiveIntent}
                        onChange={(val) => {
                            updateSettings({ enablePredictiveIntent: val });
                            postMessage({
                                action: "settings/update",
                                payload: { enablePredictiveIntent: val },
                            });
                        }}
                    />
                    <ToggleRow
                        label="Ghost Mode"
                        description="Passively learns your coding style"
                        checked={settings.enableGhostMode}
                        onChange={(val) => {
                            updateSettings({ enableGhostMode: val });
                            postMessage({
                                action: "settings/update",
                                payload: { enableGhostMode: val },
                            });
                        }}
                    />
                </div>
            </div>

            {/* 10 Unique Features - No Other Agent Has */}
            <div style={sectionStyle}>
                <label style={{ ...labelStyle, color: "var(--shen-accent, #6366f1)" }}>🧬 Unique SHEN Features</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <ToggleRow
                        label="🧠 Neural Context Weaving"
                        description="Links related code across files using semantic analysis"
                        checked={settings.enableNeuralContextWeaving}
                        onChange={(val) => {
                            updateSettings({ enableNeuralContextWeaving: val });
                            postMessage({ action: "settings/update", payload: { enableNeuralContextWeaving: val } });
                        }}
                    />
                    <ToggleRow
                        label="⏳ Temporal Memory"
                        description="Remembers project decisions across sessions"
                        checked={settings.enableTemporalMemory}
                        onChange={(val) => {
                            updateSettings({ enableTemporalMemory: val });
                            postMessage({ action: "settings/update", payload: { enableTemporalMemory: val } });
                        }}
                    />
                    <ToggleRow
                        label="🧬 Code DNA Profiling"
                        description="Learns and replicates your unique coding style"
                        checked={settings.enableCodeDNAProfiling}
                        onChange={(val) => {
                            updateSettings({ enableCodeDNAProfiling: val });
                            postMessage({ action: "settings/update", payload: { enableCodeDNAProfiling: val } });
                        }}
                    />
                    <ToggleRow
                        label="🛡️ Predictive Error Shield"
                        description="Pre-scans generated code for likely bugs"
                        checked={settings.enablePredictiveErrorShield}
                        onChange={(val) => {
                            updateSettings({ enablePredictiveErrorShield: val });
                            postMessage({ action: "settings/update", payload: { enablePredictiveErrorShield: val } });
                        }}
                    />
                    <ToggleRow
                        label="♻️ Autonomous Refactoring"
                        description="Proactively suggests code quality improvements"
                        checked={settings.enableAutonomousRefactoring}
                        onChange={(val) => {
                            updateSettings({ enableAutonomousRefactoring: val });
                            postMessage({ action: "settings/update", payload: { enableAutonomousRefactoring: val } });
                        }}
                    />
                    <ToggleRow
                        label="🔮 Multi-Modal Reasoning"
                        description="Combines code analysis with architecture-level thinking"
                        checked={settings.enableMultiModalReasoning}
                        onChange={(val) => {
                            updateSettings({ enableMultiModalReasoning: val });
                            postMessage({ action: "settings/update", payload: { enableMultiModalReasoning: val } });
                        }}
                    />
                    <ToggleRow
                        label="🌊 Intent Cascade"
                        description="Breaks complex requests into sub-tasks automatically"
                        checked={settings.enableIntentCascade}
                        onChange={(val) => {
                            updateSettings({ enableIntentCascade: val });
                            postMessage({ action: "settings/update", payload: { enableIntentCascade: val } });
                        }}
                    />
                    <ToggleRow
                        label="🪞 Live Code Mirroring"
                        description="Shows real-time code being written as it streams"
                        checked={settings.enableLiveCodeMirroring}
                        onChange={(val) => {
                            updateSettings({ enableLiveCodeMirroring: val });
                            postMessage({ action: "settings/update", payload: { enableLiveCodeMirroring: val } });
                        }}
                    />
                    <ToggleRow
                        label="💾 Smart Checkpoint Rollback"
                        description="Auto-creates restore points before risky operations"
                        checked={settings.enableSmartCheckpointRollback}
                        onChange={(val) => {
                            updateSettings({ enableSmartCheckpointRollback: val });
                            postMessage({ action: "settings/update", payload: { enableSmartCheckpointRollback: val } });
                        }}
                    />
                    <ToggleRow
                        label="💬 Contextual Whisper"
                        description="Provides inline hints and suggestions as you type"
                        checked={settings.enableContextualWhisper}
                        onChange={(val) => {
                            updateSettings({ enableContextualWhisper: val });
                            postMessage({ action: "settings/update", payload: { enableContextualWhisper: val } });
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

// Toggle Row Sub-component (Enhanced with smooth animations)
function ToggleRow({
    label,
    description,
    checked,
    onChange,
}: {
    label: string;
    description: string;
    checked: boolean;
    onChange: (val: boolean) => void;
}): JSX.Element {
    return (
        <div
            onClick={() => onChange(!checked)}
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "5px 6px",
                cursor: "pointer",
                borderRadius: "4px",
                transition: "background 0.2s ease",
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "var(--vscode-list-hoverBackground)";
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
        >
            <div style={{ flex: 1, minWidth: 0, marginRight: "8px" }}>
                <div style={{ fontSize: "12px", color: "var(--vscode-editor-foreground)", fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: "10px", color: "var(--vscode-descriptionForeground)", marginTop: "1px" }}>{description}</div>
            </div>
            <div className={`toggle-track ${checked ? "active" : ""}`} style={{ flexShrink: 0 }}>
                <div className="toggle-thumb" />
            </div>
        </div>
    );
}
