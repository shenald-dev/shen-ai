import type { ProviderRegistry } from "../providers/provider-registry";
import type { ProviderMessage } from "../../types";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Embedding Generator
// Generates vector embeddings for text using AI provider APIs.
// Supports OpenAI, Ollama, and custom embedding endpoints.
// ============================================================

export type EmbeddingProvider = "openai" | "ollama" | "custom";

export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    dimension: number;
}

export class EmbeddingGenerator {
    private config: EmbeddingConfig;
    private providerRegistry: ProviderRegistry | null;
    private cache: Map<string, number[]>;

    constructor(config: EmbeddingConfig, providerRegistry?: ProviderRegistry) {
        this.config = config;
        this.providerRegistry = providerRegistry || null;
        this.cache = new Map();
    }

    /**
     * Generate an embedding for a single text.
     */
    async generateEmbedding(text: string): Promise<number[]> {
        // Check cache first
        const cacheKey = this.getCacheKey(text);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }

        try {
            let embedding: number[];

            switch (this.config.provider) {
                case "openai":
                    embedding = await this.generateOpenAIEmbedding(text);
                    break;
                case "ollama":
                    embedding = await this.generateOllamaEmbedding(text);
                    break;
                case "custom":
                    embedding = await this.generateCustomEmbedding(text);
                    break;
                default:
                    throw new Error(`Unsupported embedding provider: ${this.config.provider}`);
            }

            // Cache the result
            this.cache.set(cacheKey, embedding);

            return embedding;
        } catch (error) {
            logger.error("Failed to generate embedding:", error);
            // Return zero vector as fallback
            return new Array(this.config.dimension).fill(0);
        }
    }

    /**
     * Generate embeddings for multiple texts in batch.
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];

        // Process in batches of 10 to avoid rate limits
        const batchSize = 10;
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map((text) => this.generateEmbedding(text))
            );
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Generate embedding using OpenAI API.
     */
    private async generateOpenAIEmbedding(text: string): Promise<number[]> {
        const apiKey = this.config.apiKey;
        if (!apiKey) {
            throw new Error("OpenAI API key required for embeddings");
        }

        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: this.config.model || "text-embedding-3-small",
                input: text.substring(0, 8192), // OpenAI has input limits
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenAI embedding API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    }

    /**
     * Generate embedding using Ollama API.
     */
    private async generateOllamaEmbedding(text: string): Promise<number[]> {
        const baseUrl = this.config.baseUrl || "http://localhost:11434";

        const response = await fetch(`${baseUrl}/api/embeddings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: this.config.model || "nomic-embed-text",
                prompt: text,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Ollama embedding API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.embedding;
    }

    /**
     * Generate embedding using custom OpenAI-compatible API.
     */
    private async generateCustomEmbedding(text: string): Promise<number[]> {
        const baseUrl = this.config.baseUrl;
        if (!baseUrl) {
            throw new Error("Base URL required for custom embeddings");
        }

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (this.config.apiKey) {
            headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }

        const response = await fetch(`${baseUrl}/embeddings`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: this.config.model,
                input: text.substring(0, 8192),
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Custom embedding API error: ${response.status} - ${error}`);
        }

        const data = await response.json();

        // Handle different response formats
        if (data.data && data.data[0] && data.data[0].embedding) {
            return data.data[0].embedding;
        }
        if (data.embedding) {
            return data.embedding;
        }
        if (Array.isArray(data)) {
            return data;
        }

        throw new Error("Unexpected embedding response format");
    }

    /**
     * Generate a simple hash-based embedding (fallback, not semantic).
     * Only use when no API is available.
     */
    generateFallbackEmbedding(text: string): number[] {
        const embedding: number[] = new Array(this.config.dimension).fill(0);

        // Simple character n-gram hashing into vector space
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            const idx = (charCode * 31 + i) % this.config.dimension;
            embedding[idx] += 1;
        }

        // Normalize
        const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        if (magnitude > 0) {
            for (let i = 0; i < embedding.length; i++) {
                embedding[i] /= magnitude;
            }
        }

        return embedding;
    }

    /**
     * Clear the embedding cache.
     */
    clearCache(): void {
        this.cache.clear();
        logger.info("Embedding cache cleared.");
    }

    /**
     * Get cache size.
     */
    get cacheSize(): number {
        return this.cache.size;
    }

    /**
     * Update configuration.
     */
    updateConfig(config: Partial<EmbeddingConfig>): void {
        this.config = { ...this.config, ...config };
        this.cache.clear(); // Clear cache when config changes
    }

    private getCacheKey(text: string): string {
        // Simple hash for cache key
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash | 0; // Convert to 32-bit signed integer
        }
        return `${this.config.provider}:${this.config.model}:${hash}`;
    }
}