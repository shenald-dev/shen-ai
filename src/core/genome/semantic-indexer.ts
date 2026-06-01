import type { GraphNode, GraphStore } from "./graph-store";
import type { ProviderRegistry } from "../providers/provider-registry";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Semantic Indexer (LLM-Powered Semantic Tagging)
// Uses the AI provider to generate meaningful summaries and
// semantic tags for each node in the knowledge graph.
// ============================================================

export interface SemanticTag {
    label: string;
    confidence: number;
    category: "purpose" | "domain" | "pattern" | "risk" | "dependency";
}

export interface SemanticEnrichment {
    nodeId: string;
    summary: string;
    tags: SemanticTag[];
    purpose: string;
    risks: string[];
    relatedConcepts: string[];
}

export class SemanticIndexer {
    private graphStore: GraphStore;
    private providerRegistry: ProviderRegistry;
    private isIndexing: boolean;
    private cache: Map<string, SemanticEnrichment>;

    constructor(graphStore: GraphStore, providerRegistry: ProviderRegistry) {
        this.graphStore = graphStore;
        this.providerRegistry = providerRegistry;
        this.isIndexing = false;
        this.cache = new Map();
    }

    /**
     * Enrich all nodes in the graph with semantic information.
     */
    async enrichGraph(): Promise<{ enriched: number; failed: number }> {
        if (this.isIndexing) {
            logger.warn("Semantic indexing already in progress.");
            return { enriched: 0, failed: 0 };
        }

        this.isIndexing = true;
        const nodes = this.graphStore.getAllNodes();
        let enriched = 0;
        let failed = 0;

        // Only enrich function, class, and component nodes (not file/import nodes)
        const enrichableNodes = nodes.filter(
            (n) => ["function", "class", "component", "interface", "module"].includes(n.type)
        );

        logger.info(`Starting semantic enrichment for ${enrichableNodes.length} nodes...`);

        // Process in batches of 5 to avoid rate limits
        const batchSize = 5;
        for (let i = 0; i < enrichableNodes.length; i += batchSize) {
            const batch = enrichableNodes.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map((node) => this.enrichNode(node))
            );

            for (const result of results) {
                if (result.status === "fulfilled" && result.value) {
                    enriched++;
                } else {
                    failed++;
                }
            }

            // Small delay between batches
            if (i + batchSize < enrichableNodes.length) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        this.isIndexing = false;
        logger.info(`Semantic enrichment complete: ${enriched} enriched, ${failed} failed`);
        return { enriched, failed };
    }

    /**
     * Enrich a single node with semantic information.
     */
    async enrichNode(node: GraphNode): Promise<SemanticEnrichment | null> {
        // Check cache
        if (this.cache.has(node.id)) {
            return this.cache.get(node.id)!;
        }

        const provider = this.providerRegistry.getActiveProvider();
        if (!provider) {
            logger.warn("No active provider for semantic indexing.");
            return null;
        }

        try {
            const prompt = this.buildEnrichmentPrompt(node);

            const response = await this.providerRegistry.sendMessage([
                {
                    role: "system",
                    content: "You are a code analysis assistant. Analyze code snippets and provide structured semantic information. Respond ONLY with valid JSON.",
                },
                { role: "user", content: prompt },
            ]);

            const enrichment = this.parseEnrichmentResponse(response.content, node.id);
            if (enrichment) {
                this.cache.set(node.id, enrichment);

                // Update node summary in the graph
                const existingNode = this.graphStore.getNode(node.id);
                if (existingNode) {
                    existingNode.summary = enrichment.summary;
                    existingNode.metadata.semanticTags = enrichment.tags;
                    existingNode.metadata.purpose = enrichment.purpose;
                }
            }

            return enrichment;
        } catch (error) {
            logger.warn(`Failed to enrich node ${node.name}: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Get semantic summary for a file.
     */
    async getFileSummary(filePath: string): Promise<string> {
        const fileNodes = this.graphStore.getNodesByFile(filePath);
        if (fileNodes.length === 0) return "No semantic data available for this file.";

        const fileNode = fileNodes.find((n) => n.type === "file");
        const childNodes = fileNodes.filter((n) => n.type !== "file");

        let summary = `## ${fileNode?.name || filePath}\n\n`;

        if (fileNode?.metadata.purpose) {
            summary += `**Purpose:** ${fileNode.metadata.purpose}\n\n`;
        }

        if (childNodes.length > 0) {
            summary += `**Contains:** ${childNodes.length} elements\n\n`;
            for (const child of childNodes.slice(0, 10)) {
                summary += `- **${child.name}** (${child.type}): ${child.summary}\n`;
            }
            if (childNodes.length > 10) {
                summary += `\n... and ${childNodes.length - 10} more`;
            }
        }

        return summary;
    }

    /**
     * Search the graph semantically.
     */
    semanticSearch(query: string): GraphNode[] {
        const lowerQuery = query.toLowerCase();
        const allNodes = this.graphStore.getAllNodes();

        // Score each node based on semantic relevance
        const scored = allNodes.map((node) => {
            let score = 0;

            // Name match
            if (node.name.toLowerCase().includes(lowerQuery)) score += 10;

            // Summary match
            if (node.summary.toLowerCase().includes(lowerQuery)) score += 5;

            // Tag match
            const tags = node.metadata.semanticTags as SemanticTag[] | undefined;
            if (tags) {
                for (const tag of tags) {
                    if (tag.label.toLowerCase().includes(lowerQuery)) score += 8;
                }
            }

            // Purpose match
            const purpose = node.metadata.purpose as string | undefined;
            if (purpose && purpose.toLowerCase().includes(lowerQuery)) score += 7;

            // Content match
            if (node.content.toLowerCase().includes(lowerQuery)) score += 2;

            return { node, score };
        });

        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((s) => s.node)
            .slice(0, 20);
    }

    /**
     * Get the "blast radius" — what would be affected by changing a node.
     */
    getBlastRadius(nodeId: string): {
        direct: GraphNode[];
        indirect: GraphNode[];
        risk: "low" | "medium" | "high" | "critical";
    } {
        const impact = this.graphStore.getImpactAnalysis(nodeId, 3);

        const direct: GraphNode[] = [];
        const indirect: GraphNode[] = [];

        for (const level of impact) {
            if (level.depth === 1) {
                direct.push(...level.affected);
            } else {
                indirect.push(...level.affected);
            }
        }

        const totalAffected = direct.length + indirect.length;
        let risk: "low" | "medium" | "high" | "critical" = "low";
        if (totalAffected > 20) risk = "critical";
        else if (totalAffected > 10) risk = "high";
        else if (totalAffected > 3) risk = "medium";

        return { direct, indirect, risk };
    }

    private buildEnrichmentPrompt(node: GraphNode): string {
        return `Analyze this ${node.type} and provide structured semantic information.

Code:
\`\`\`
${node.content.substring(0, 800)}
\`\`\`

Respond with ONLY valid JSON in this format:
{
  "summary": "One sentence describing what this does",
  "tags": [
    {"label": "authentication", "confidence": 0.9, "category": "domain"},
    {"label": "error-handling", "confidence": 0.8, "category": "pattern"}
  ],
  "purpose": "What business/domain purpose does this serve?",
  "risks": ["potential issue 1", "potential issue 2"],
  "relatedConcepts": ["concept1", "concept2"]
}

Categories: purpose, domain, pattern, risk, dependency`;
    }

    private parseEnrichmentResponse(content: string, nodeId: string): SemanticEnrichment | null {
        try {
            // Extract JSON from response (may be wrapped in code blocks)
            let jsonStr = content;
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            const parsed = JSON.parse(jsonStr.trim());

            return {
                nodeId,
                summary: parsed.summary || "No summary available",
                tags: (parsed.tags || []).map((t: Record<string, unknown>) => ({
                    label: String(t.label || ""),
                    confidence: Number(t.confidence || 0),
                    category: (t.category as SemanticTag["category"]) || "purpose",
                })),
                purpose: parsed.purpose || "",
                risks: parsed.risks || [],
                relatedConcepts: parsed.relatedConcepts || [],
            };
        } catch (error) {
            logger.warn(`Failed to parse enrichment response: ${(error as Error).message}`);
            return null;
        }
    }

    getCacheSize(): number {
        return this.cache.size;
    }

    clearCache(): void {
        this.cache.clear();
    }
}