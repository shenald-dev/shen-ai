import * as fs from "fs";
import * as path from "path";
import { VectorStore, type VectorDocument, type SearchResult } from "./vector-store";
import { EmbeddingGenerator, type EmbeddingConfig } from "./embedding-generator";
import { logger } from "../../utils/logger";
import { generateId, getWorkspaceRoot } from "../../utils/helpers";

// ============================================================
// SHEN AI — RAG Engine (Retrieval Augmented Generation)
// Indexes codebase files into vector embeddings and performs
// semantic search to retrieve relevant context for AI queries.
// ============================================================

export interface RAGConfig {
    embedding: EmbeddingConfig;
    chunkSize: number; // characters per chunk
    chunkOverlap: number; // overlap between chunks
    topK: number; // number of results to return
    similarityThreshold: number; // minimum similarity score
    maxTokensPerResult: number; // max tokens per retrieved chunk
    fileExtensions: string[]; // file types to index
    excludePatterns: string[]; // glob patterns to exclude
}

export interface IndexingResult {
    totalFiles: number;
    totalChunks: number;
    totalTokens: number;
    duration: number;
    errors: string[];
}

export interface RAGResult {
    query: string;
    results: SearchResult[];
    contextText: string;
    totalTokens: number;
}

const DEFAULT_CONFIG: RAGConfig = {
    embedding: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimension: 1536,
    },
    chunkSize: 1500,
    chunkOverlap: 200,
    topK: 5,
    similarityThreshold: 0.3,
    maxTokensPerResult: 2000,
    fileExtensions: [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".cpp", ".c", ".h", ".cs", ".rb", ".php", ".swift", ".kt", ".html", ".css", ".json", ".yaml", ".yml", ".md", ".sql", ".sh"],
    excludePatterns: ["node_modules", ".git", "dist", "out", "build", "vendor", "__pycache__", ".next", ".nuxt"],
};

export class RAGEngine {
    private vectorStore: VectorStore;
    private embeddingGenerator: EmbeddingGenerator;
    private config: RAGConfig;
    private isIndexing: boolean;
    private indexedFiles: Map<string, number>; // filePath -> lastModified

    constructor(storagePath: string, config?: Partial<RAGConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.vectorStore = new VectorStore(storagePath, this.config.embedding.dimension);
        this.embeddingGenerator = new EmbeddingGenerator(this.config.embedding);
        this.isIndexing = false;
        this.indexedFiles = new Map();
    }

    /**
     * Index the entire workspace into the vector store.
     */
    async indexWorkspace(workspacePath?: string): Promise<IndexingResult> {
        if (this.isIndexing) {
            throw new Error("Indexing already in progress.");
        }

        this.isIndexing = true;
        const startTime = Date.now();
        const errors: string[] = [];
        let totalFiles = 0;
        let totalChunks = 0;
        let totalTokens = 0;

        const root = workspacePath || getWorkspaceRoot();
        if (!root) {
            this.isIndexing = false;
            throw new Error("No workspace folder found.");
        }

        logger.info(`Starting workspace indexing: ${root}`);

        try {
            const files = await this.collectFiles(root);
            totalFiles = files.length;
            logger.info(`Found ${files.length} files to index.`);

            for (const file of files) {
                try {
                    const stat = fs.statSync(file);
                    const lastModified = stat.mtimeMs;

                    // Skip if already indexed and not modified
                    const prevModified = this.indexedFiles.get(file);
                    if (prevModified && prevModified === lastModified) {
                        continue;
                    }

                    // Remove old chunks for this file
                    this.vectorStore.removeByFilePath(file);

                    // Read and chunk the file
                    const content = fs.readFileSync(file, "utf-8");
                    const chunks = this.chunkText(content);
                    const relPath = path.relative(root, file);

                    // Generate embeddings for all chunks
                    const chunkTexts = chunks.map((c) => `File: ${relPath}\n\n${c.text}`);
                    const embeddings = await this.embeddingGenerator.generateEmbeddings(chunkTexts);

                    // Add to vector store
                    const documents: VectorDocument[] = chunks.map((chunk, i) => ({
                        id: `${generateId()}_${i}`,
                        content: chunk.text,
                        embedding: embeddings[i],
                        metadata: {
                            file: relPath,
                            chunkIndex: i,
                            totalChunks: chunks.length,
                        },
                        filePath: relPath,
                        lineStart: chunk.lineStart,
                        lineEnd: chunk.lineEnd,
                        type: this.detectContentType(chunk.text),
                    }));

                    this.vectorStore.addDocuments(documents);
                    this.indexedFiles.set(file, lastModified);

                    totalChunks += chunks.length;
                    totalTokens += this.estimateTokens(content);

                } catch (error) {
                    errors.push(`Failed to index ${file}: ${(error as Error).message}`);
                }
            }

            // Save to disk
            this.vectorStore.saveToDisk();

            const duration = Date.now() - startTime;
            logger.info(`Indexing complete: ${totalFiles} files, ${totalChunks} chunks in ${duration}ms`);

            return { totalFiles, totalChunks, totalTokens, duration, errors };
        } finally {
            this.isIndexing = false;
        }
    }

    /**
     * Index a single file.
     */
    async indexFile(filePath: string, workspacePath?: string): Promise<void> {
        const root = workspacePath || getWorkspaceRoot();
        if (!root) throw new Error("No workspace folder found.");

        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
        const relPath = path.relative(root, fullPath);

        try {
            const content = fs.readFileSync(fullPath, "utf-8");
            const chunks = this.chunkText(content);

            // Remove old chunks
            this.vectorStore.removeByFilePath(relPath);

            // Generate embeddings
            const chunkTexts = chunks.map((c) => `File: ${relPath}\n\n${c.text}`);
            const embeddings = await this.embeddingGenerator.generateEmbeddings(chunkTexts);

            // Add documents
            const documents: VectorDocument[] = chunks.map((chunk, i) => ({
                id: `${generateId()}_${i}`,
                content: chunk.text,
                embedding: embeddings[i],
                metadata: { file: relPath, chunkIndex: i },
                filePath: relPath,
                lineStart: chunk.lineStart,
                lineEnd: chunk.lineEnd,
                type: this.detectContentType(chunk.text),
            }));

            this.vectorStore.addDocuments(documents);
            this.vectorStore.saveToDisk();

            logger.info(`Indexed file: ${relPath} (${chunks.length} chunks)`);
        } catch (error) {
            logger.error(`Failed to index file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Perform semantic search and return relevant context.
     */
    async search(query: string, topK?: number, filter?: Record<string, unknown>): Promise<RAGResult> {
        // Generate embedding for the query
        const queryEmbedding = await this.embeddingGenerator.generateEmbedding(query);

        // Search vector store
        const k = topK || this.config.topK;
        let results: SearchResult[];

        if (filter) {
            results = this.vectorStore.searchWithFilter(
                queryEmbedding,
                filter,
                k,
                this.config.similarityThreshold
            );
        } else {
            results = this.vectorStore.search(
                queryEmbedding,
                k,
                this.config.similarityThreshold
            );
        }

        // Build context text from results
        let contextText = "";
        let totalTokens = 0;

        for (const result of results) {
            const chunk = this.formatChunkForResult(result);
            const chunkTokens = this.estimateTokens(chunk);

            if (totalTokens + chunkTokens > this.config.maxTokensPerResult * k) {
                break;
            }

            contextText += chunk + "\n\n";
            totalTokens += chunkTokens;
        }

        return {
            query,
            results,
            contextText: contextText.trim(),
            totalTokens,
        };
    }

    /**
     * Search for code specifically.
     */
    async searchCode(query: string, topK?: number): Promise<RAGResult> {
        return this.search(query, topK, { type: "code" });
    }

    /**
     * Search within a specific file.
     */
    async searchInFile(query: string, filePath: string, topK?: number): Promise<RAGResult> {
        return this.search(query, topK, { file: filePath });
    }

    /**
     * Get RAG context for a user query (main entry point).
     */
    async getContextForQuery(query: string, activeFile?: string): Promise<string> {
        const results: SearchResult[] = [];

        // Search globally
        const globalResults = await this.search(query, 3);
        results.push(...globalResults.results);

        // Search in active file if provided
        if (activeFile) {
            const fileResults = await this.searchInFile(query, activeFile, 2);
            results.push(...fileResults.results);
        }

        // Deduplicate by file path
        const seen = new Set<string>();
        const unique = results.filter((r) => {
            const key = r.document.filePath || r.document.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Build context
        let context = "";
        for (const result of unique.slice(0, 5)) {
            context += this.formatChunkForResult(result) + "\n\n";
        }

        return context.trim();
    }

    /**
     * Remove a file from the index.
     */
    removeFile(filePath: string): number {
        const removed = this.vectorStore.removeByFilePath(filePath);
        this.vectorStore.saveToDisk();
        return removed;
    }

    /**
     * Get indexing statistics.
     */
    getStats(): {
        totalDocuments: number;
        totalFiles: number;
        embeddingCacheSize: number;
        isIndexing: boolean;
        vectorStoreStats: ReturnType<VectorStore["getStats"]>;
    } {
        return {
            totalDocuments: this.vectorStore.size,
            totalFiles: this.indexedFiles.size,
            embeddingCacheSize: this.embeddingGenerator.cacheSize,
            isIndexing: this.isIndexing,
            vectorStoreStats: this.vectorStore.getStats(),
        };
    }

    /**
     * Clear the entire index.
     */
    clearIndex(): void {
        this.vectorStore.clear();
        this.indexedFiles.clear();
        this.embeddingGenerator.clearCache();
        logger.info("RAG index cleared.");
    }

    /**
     * Update embedding configuration.
     */
    updateEmbeddingConfig(config: Partial<EmbeddingConfig>): void {
        this.config.embedding = { ...this.config.embedding, ...config };
        this.embeddingGenerator.updateConfig(config);
        // Need to re-index when embedding config changes
        this.clearIndex();
    }

    // --- Private Methods ---

    private async collectFiles(dir: string): Promise<string[]> {
        const files: string[] = [];

        async function walk(currentDir: string): Promise<void> {
            try {
                const items = fs.readdirSync(currentDir, { withFileTypes: true });
                for (const item of items) {
                    if (item.name.startsWith(".")) continue;
                    if (DEFAULT_CONFIG.excludePatterns.some((p) => item.name.includes(p))) continue;

                    const fullPath = path.join(currentDir, item.name);

                    if (item.isDirectory()) {
                        await walk(fullPath);
                    } else {
                        const ext = path.extname(item.name);
                        if (DEFAULT_CONFIG.fileExtensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch {
                // Skip inaccessible directories
            }
        }

        await walk(dir);
        return files;
    }

    private chunkText(text: string): Array<{ text: string; lineStart: number; lineEnd: number }> {
        const chunks: Array<{ text: string; lineStart: number; lineEnd: number }> = [];
        const lines = text.split("\n");

        let currentChunk = "";
        let lineStart = 1;
        let currentLine = 1;

        for (const line of lines) {
            const lineWithNewline = line + "\n";

            if (currentChunk.length + lineWithNewline.length > this.config.chunkSize && currentChunk.length > 0) {
                chunks.push({
                    text: currentChunk.trim(),
                    lineStart,
                    lineEnd: currentLine - 1,
                });

                // Start new chunk with overlap
                const overlapLines = currentChunk.split("\n").slice(-Math.floor(this.config.chunkOverlap / 50));
                currentChunk = overlapLines.join("\n") + "\n" + lineWithNewline;
                lineStart = currentLine - overlapLines.length;
            } else {
                currentChunk += lineWithNewline;
            }

            currentLine++;
        }

        // Add remaining chunk
        if (currentChunk.trim().length > 0) {
            chunks.push({
                text: currentChunk.trim(),
                lineStart,
                lineEnd: currentLine - 1,
            });
        }

        return chunks;
    }

    private detectContentType(text: string): "code" | "comment" | "doc" | "text" {
        const codePatterns = [
            /function\s+\w+/,
            /class\s+\w+/,
            /const\s+\w+\s*=/,
            /import\s+/,
            /export\s+/,
            /def\s+\w+/,
            /public\s+/,
            /private\s+/,
            /interface\s+\w+/,
            /type\s+\w+\s*=/,
        ];

        const commentDensity = (text.match(/\/\//g) || []).length + (text.match(/\/\*/g) || []).length;
        const codeDensity = codePatterns.reduce((count, pattern) => count + (text.match(pattern) || []).length, 0);

        if (codeDensity > 2) return "code";
        if (commentDensity > 5) return "comment";
        if (text.includes("# ") || text.includes("## ")) return "doc";
        return "text";
    }

    private formatChunkForResult(result: SearchResult): string {
        const doc = result.document;
        const score = Math.round(result.score * 100);
        let formatted = "";

        if (doc.filePath) {
            formatted += `📄 ${doc.filePath}`;
            if (doc.lineStart && doc.lineEnd) {
                formatted += ` (lines ${doc.lineStart}-${doc.lineEnd})`;
            }
            formatted += ` [relevance: ${score}%]\n`;
        }

        formatted += "---\n";
        formatted += doc.content;
        formatted += "\n---";

        return formatted;
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }
}