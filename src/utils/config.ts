import * as vscode from "vscode";
import type { ShenConfig, ProviderName, PersonalityType } from "../types";

// ============================================================
// SHEN AI — Configuration Manager
// ============================================================

export class ConfigManager {
    private static instance: ConfigManager;
    private config: vscode.WorkspaceConfiguration;

    private constructor() {
        this.config = vscode.workspace.getConfiguration("shen.ai");
    }

    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    reload(): void {
        this.config = vscode.workspace.getConfiguration("shen.ai");
    }

    getFullConfig(): ShenConfig {
        return {
            provider: this.get<ProviderName>("provider", "anthropic"),
            model: this.get<string>("model", "claude-sonnet-4-20250514"),
            openaiApiKey: this.get<string>("openaiApiKey", ""),
            anthropicApiKey: this.get<string>("anthropicApiKey", ""),
            googleApiKey: this.get<string>("googleApiKey", ""),
            groqApiKey: this.get<string>("groqApiKey", ""),
            mistralApiKey: this.get<string>("mistralApiKey", ""),
            azureApiKey: this.get<string>("azureApiKey", ""),
            azureEndpoint: this.get<string>("azureEndpoint", ""),
            ollamaBaseUrl: this.get<string>("ollamaBaseUrl", "http://localhost:11434"),
            customBaseUrl: this.get<string>("customBaseUrl", ""),
            customApiKey: this.get<string>("customApiKey", ""),
            customModel: this.get<string>("customModel", ""),
            temperature: this.get<number>("temperature", 0.0),
            maxTokens: this.get<number>("maxTokens", 8192),
            maxContextTokens: this.get<number>("maxContextTokens", 200000),
            personality: this.get<PersonalityType>("personality", "senior-dev"),
            autoApplyChanges: this.get<boolean>("autoApplyChanges", false),
            enablePredictiveIntent: this.get<boolean>("enablePredictiveIntent", false),
            enableGhostMode: this.get<boolean>("enableGhostMode", false),
            enableSelfEvolvingPrompts: this.get<boolean>("enableSelfEvolvingPrompts", true),
            // Real Features (Working Implementations)
            enableCodeDNAProfiling: this.get<boolean>("enableCodeDNAProfiling", true),
            enableSmartCheckpointRollback: this.get<boolean>("enableSmartCheckpointRollback", true),
            enableBlastRadiusAnalyzer: this.get<boolean>("enableBlastRadiusAnalyzer", true),
            enableCodeValidator: this.get<boolean>("enableCodeValidator", true),
            enableConversationSummarizer: this.get<boolean>("enableConversationSummarizer", true),
        };
    }

    getApiKeyForProvider(provider: ProviderName): string {
        switch (provider) {
            case "openai":
                return this.get<string>("openaiApiKey", "");
            case "anthropic":
                return this.get<string>("anthropicApiKey", "");
            case "google":
                return this.get<string>("googleApiKey", "");
            case "groq":
                return this.get<string>("groqApiKey", "");
            case "mistral":
                return this.get<string>("mistralApiKey", "");
            case "azure":
                return this.get<string>("azureApiKey", "");
            case "ollama":
                return "";
            case "custom":
                return this.get<string>("customApiKey", "");
            default:
                return "";
        }
    }

    getBaseUrlForProvider(provider: ProviderName): string | undefined {
        switch (provider) {
            case "ollama":
                return this.get<string>("ollamaBaseUrl", "http://localhost:11434");
            case "custom":
                return this.get<string>("customBaseUrl", "");
            case "azure":
                return this.get<string>("azureEndpoint", "");
            default:
                return undefined;
        }
    }

    getModelForProvider(provider: ProviderName): string {
        if (provider === "custom") {
            return this.get<string>("customModel", "");
        }
        return this.get<string>("model", this.getDefaultModel(provider));
    }

    private getDefaultModel(provider: ProviderName): string {
        const defaults: Record<ProviderName, string> = {
            openai: "gpt-4o",
            anthropic: "claude-sonnet-4-20250514",
            google: "gemini-2.0-flash",
            ollama: "codellama",
            azure: "gpt-4o",
            groq: "llama-3.3-70b-versatile",
            mistral: "mistral-large-latest",
            custom: "",
        };
        return defaults[provider];
    }

    async update(key: string, value: unknown): Promise<void> {
        await this.config.update(key, value, vscode.ConfigurationTarget.Global);
        this.reload();
    }

    private get<T>(key: string, defaultValue: T): T {
        return this.config.get<T>(key) ?? defaultValue;
    }

    hasApiKey(provider: ProviderName): boolean {
        const key = this.getApiKeyForProvider(provider);
        return key.trim().length > 0;
    }

    validateConfig(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const provider = this.get<ProviderName>("provider", "anthropic");

        if (provider !== "ollama" && !this.hasApiKey(provider)) {
            errors.push(`No API key configured for provider: ${provider}`);
        }

        if (provider === "custom") {
            const baseUrl = this.get<string>("customBaseUrl", "");
            if (!baseUrl.trim()) {
                errors.push("Custom provider requires a base URL");
            } else if (!this.isValidUrl(baseUrl)) {
                errors.push("Custom provider base URL is not a valid URL");
            }
        }

        if (provider === "azure") {
            const endpoint = this.get<string>("azureEndpoint", "");
            if (!endpoint.trim()) {
                errors.push("Azure provider requires an endpoint URL");
            } else if (!this.isValidUrl(endpoint)) {
                errors.push("Azure endpoint is not a valid URL");
            }
        }

        if (provider === "ollama") {
            const baseUrl = this.get<string>("ollamaBaseUrl", "http://localhost:11434");
            if (!this.isValidUrl(baseUrl)) {
                errors.push("Ollama base URL is not a valid URL");
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    private isValidUrl(str: string): boolean {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    }
}

export const config = ConfigManager.getInstance();