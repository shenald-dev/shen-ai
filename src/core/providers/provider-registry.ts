import type { ProviderName, ProviderConfig, ProviderMessage, ProviderResponse, StreamingChunk, ToolDefinition } from "../../types";
import type { IProvider, StreamingCallback } from "./provider-interface";
import type { ConfigManager } from "../../utils/config";
import { OpenAIProvider } from "./openai-provider";
import { AnthropicProvider } from "./anthropic-provider";
import { CustomProvider } from "./custom-provider";
import { GoogleProvider } from "./google-provider";
import { OllamaProvider } from "./ollama-provider";
import { GroqProvider } from "./groq-provider";
import { MistralProvider } from "./mistral-provider";
import { AzureProvider } from "./azure-provider";
import { logger } from "../../utils/logger";
import { withRetry } from "../../utils/retry";

// ============================================================
// SHEN AI — Provider Registry
// ============================================================

export class ProviderRegistry {
    private providers: Map<ProviderName, IProvider>;
    private activeProvider: IProvider | null = null;
    private config: ConfigManager;
    private abortController: AbortController | null = null;

    constructor(config: ConfigManager) {
        this.config = config;
        this.providers = new Map();
        this.registerDefaults();
        this.setActiveProvider(config.getFullConfig().provider);
    }

    private registerDefaults(): void {
        this.providers.set("openai", new OpenAIProvider());
        this.providers.set("anthropic", new AnthropicProvider());
        this.providers.set("custom", new CustomProvider());
        this.providers.set("google", new GoogleProvider());
        this.providers.set("ollama", new OllamaProvider());
        this.providers.set("groq", new GroqProvider());
        this.providers.set("mistral", new MistralProvider());
        this.providers.set("azure", new AzureProvider());

        logger.info("Provider registry initialized with all 8 providers: openai, anthropic, google, ollama, groq, mistral, azure, custom");
    }

    register(name: ProviderName, provider: IProvider): void {
        this.providers.set(name, provider);
        logger.info(`Provider registered: ${name}`);
    }

    setActiveProvider(name: ProviderName): void {
        const provider = this.providers.get(name);
        if (!provider) {
            logger.error(`Provider not found: ${name}`);
            return;
        }

        const config = this.config.getFullConfig();
        const providerConfig: ProviderConfig = {
            provider: name,
            model: this.config.getModelForProvider(name),
            apiKey: this.config.getApiKeyForProvider(name),
            baseUrl: this.config.getBaseUrlForProvider(name),
            temperature: config.temperature,
            maxTokens: config.maxTokens,
        };

        const validation = provider.validateConfig(providerConfig);
        if (!validation.valid) {
            logger.warn(`Provider ${name} configuration invalid: ${validation.errors.join(", ")}`);
            this.activeProvider = provider;
            return;
        }

        try {
            provider.initialize(providerConfig);
            this.activeProvider = provider;
            logger.info(`Active provider set to: ${name} (${providerConfig.model})`);
        } catch (error) {
            logger.error(`Failed to initialize provider ${name}:`, error);
            this.activeProvider = provider;
        }
    }

    getActiveProvider(): IProvider | null {
        return this.activeProvider;
    }

    getAvailableProviders(): ProviderName[] {
        return Array.from(this.providers.keys());
    }

    async sendMessage(
        messages: ProviderMessage[],
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse> {
        if (!this.activeProvider) {
            throw new Error("No active provider. Configure a provider in SHEN AI settings.");
        }

        this.abortController = new AbortController();
        const signal = abortSignal || this.abortController.signal;

        const providerName = this.activeProvider.name;
        let attemptNumber = 0;

        try {
            const response = await withRetry(
                async () => {
                    attemptNumber++;
                    if (attemptNumber > 1) {
                        logger.info(`Retrying ${providerName} sendMessage (attempt ${attemptNumber})...`);
                    }
                    return await this.activeProvider!.sendMessage(
                        messages,
                        this.activeProvider!.supportsTools ? tools : undefined,
                        signal
                    );
                },
                {
                    maxRetries: 3,
                    initialDelayMs: 1000,
                    maxDelayMs: 10000,
                    backoffFactor: 2,
                }
            );
            return response;
        } catch (error) {
            logger.error(`Provider ${providerName} sendMessage failed after ${attemptNumber} attempt(s):`, error);
            throw error;
        }
    }

    async sendMessageStreaming(
        messages: ProviderMessage[],
        onChunk: StreamingCallback,
        tools?: ToolDefinition[],
        abortSignal?: AbortSignal
    ): Promise<ProviderResponse> {
        if (!this.activeProvider) {
            throw new Error("No active provider. Configure a provider in SHEN AI settings.");
        }

        this.abortController = new AbortController();
        const signal = abortSignal || this.abortController.signal;

        const providerName = this.activeProvider.name;
        let attemptNumber = 0;

        try {
            const response = await withRetry(
                async () => {
                    attemptNumber++;
                    if (attemptNumber > 1) {
                        logger.info(`Retrying ${providerName} streaming (attempt ${attemptNumber})...`);
                    }
                    return await this.activeProvider!.sendMessageStreaming(
                        messages,
                        onChunk,
                        this.activeProvider!.supportsTools ? tools : undefined,
                        signal
                    );
                },
                {
                    maxRetries: 2,
                    initialDelayMs: 500,
                    maxDelayMs: 5000,
                    backoffFactor: 2,
                }
            );
            return response;
        } catch (error) {
            logger.error(`Provider ${providerName} sendMessageStreaming failed after ${attemptNumber} attempt(s):`, error);
            throw error;
        }
    }

    cancel(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
            logger.info("Provider request cancelled.");
        }
    }

    updateConfig(config: ConfigManager): void {
        this.config = config;
        const currentProvider = config.getFullConfig().provider;
        this.setActiveProvider(currentProvider);
    }
}