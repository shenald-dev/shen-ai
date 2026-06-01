import * as fs from "fs";
import * as path from "path";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Vector Store (Local Embedding Storage & Search)
// Lightweight in-memory vector store with cosine similarity
// for semantic search and RAG (Retrieval Augmented Generation).
// ============================================================

export interface VectorDocument {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    filePath?: string;
    lineStart?: number;
    lineEnd?: number;
    type?: "code" | "comment" | "doc" | "text";
}

export interface SearchResult {
    document: VectorDocument;
    score: number;
}

export class VectorStore {
    private documents: Map<string, VectorDocument>;
    private storagePath: string;
    private dimension: number;

    constructor(storagePath: string, dimension: number = 384) {
        this.documents = new Map();
        this.storagePath = storagePath;
        this.dimension = dimension;
        this.loadFromDisk();
    }

    /**
     * Add a document with its embedding to the store.
     */
    addDocument(doc: VectorDocument): void {
        if (doc.embedding.length !== this.dimension) {
            throw new Error(
                `Embedding dimension mismatch: expected ${this.dimension}, got ${doc.embedding.length}`
            );
        }
        this.documents.set(doc.id, doc);
    }

    /**
     * Add multiple documents at once.
     */
    addDocuments(docs: VectorDocument[]): void {
        for (const doc of docs) {
            this.addDocument(doc);
        }
        logger.info(`Added ${docs.length} documents to vector store. Total: ${this.documents.size}`);
    }

    /**
     * Remove a document by ID.
     */
    removeDocument(id: string): boolean {
        return this.documents.delete(id);
    }

    /**
     * Remove all documents matching a file path.
     */
    removeByFilePath(filePath: string): number {
        let removed = 0;
        for (const [id, doc] of this.documents) {
            if (doc.filePath === filePath) {
                this.documents.delete(id);
                removed++;
            }
        }
        return removed;
    }

    /**
     * Search for similar documents using cosine similarity.
     */
    search(queryEmbedding: number[], topK: number = 5, threshold: number = 0.0): SearchResult[] {
        if (queryEmbedding.length !== this.dimension) {
            throw new Error(
                `Query embedding dimension mismatch: expected ${this.dimension}, got ${queryEmbedding.length}`
            );
        }

        const results: SearchResult[] = [];

        for (const doc of this.documents.values()) {
            const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
            if (score >= threshold) {
                results.push({ document: doc, score });
            }
        }

        // Sort by score descending and return top K
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    /**
     * Search with metadata filtering.
     */
    searchWithFilter(
        queryEmbedding: number[],
        filter: Record<string, unknown>,
        topK: number = 5,
        threshold: number = 0.0
    ): SearchResult[] {
        const results: SearchResult[] = [];

        for (const doc of this.documents.values()) {
            // Check if document matches filter
            const matchesFilter = Object.entries(filter).every(
                ([key, value]) => doc.metadata[key] === value
            );

            if (!matchesFilter) continue;

            const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
            if (score >= threshold) {
                results.push({ document: doc, score });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    /**
     * Get all documents.
     */
    getAllDocuments(): VectorDocument[] {
        return Array.from(this.documents.values());
    }

    /**
     * Get document count.
     */
    get size(): number {
        return this.documents.size;
    }

    /**
     * Get store statistics.
     */
    getStats(): {
        totalDocuments: number;
        dimension: number;
        documentsByType: Record<string, number>;
        documentsByFile: Record<string, number>;
    } {
        const byType: Record<string, number> = {};
        const byFile: Record<string, number> = {};

        for (const doc of this.documents.values()) {
            const type = doc.type || "unknown";
            byType[type] = (byType[type] || 0) + 1;

            if (doc.filePath) {
                byFile[doc.filePath] = (byFile[doc.filePath] || 0) + 1;
            }
        }

        return {
            totalDocuments: this.documents.size,
            dimension: this.dimension,
            documentsByType: byType,
            documentsByFile: byFile,
        };
    }

    /**
     * Clear all documents.
     */
    clear(): void {
        this.documents.clear();
        logger.info("Vector store cleared.");
    }

    /**
     * Save to disk using atomic write (temp file + rename) to prevent corruption.
     */
    saveToDisk(): void {
        try {
            const dir = path.dirname(this.storagePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const data = {
                dimension: this.dimension,
                documents: Array.from(this.documents.values()),
            };

            // Atomic write: write to temp file first, then rename
            const tempPath = this.storagePath + ".tmp";
            fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
            fs.renameSync(tempPath, this.storagePath);

            // Keep a backup of the previous version
            const backupPath = this.storagePath + ".bak";
            if (fs.existsSync(this.storagePath)) {
                try {
                    fs.copyFileSync(this.storagePath, backupPath);
                } catch {
                    // Backup is best-effort, ignore failures
                }
            }

            logger.info(`Vector store saved: ${this.documents.size} documents`);
        } catch (error) {
            logger.error("Failed to save vector store:", error);
            // Clean up temp file if it exists
            try {
                const tempPath = this.storagePath + ".tmp";
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                }
            } catch {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Load from disk with fallback to backup on corruption.
     */
    private loadFromDisk(): void {
        const loadFile = (filePath: string): boolean => {
            try {
                if (!fs.existsSync(filePath)) return false;
                const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                this.dimension = data.dimension || this.dimension;
                if (data.documents && Array.isArray(data.documents)) {
                    for (const doc of data.documents) {
                        this.documents.set(doc.id, doc as VectorDocument);
                    }
                    return true;
                }
                return false;
            } catch {
                return false;
            }
        };

        // Try primary file first
        if (loadFile(this.storagePath)) {
            logger.info(`Vector store loaded: ${this.documents.size} documents`);
            return;
        }

        // Fallback to backup
        const backupPath = this.storagePath + ".bak";
        if (loadFile(backupPath)) {
            logger.info(`Vector store loaded from backup: ${this.documents.size} documents`);
            return;
        }

        logger.info("No valid vector store file found. Starting fresh.");
    }

    /**
     * Compute cosine similarity between two vectors.
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        if (magnitude === 0) return 0;

        return dotProduct / magnitude;
    }
}