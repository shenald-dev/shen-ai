import { logger } from "../../utils/logger";
import * as fs from "fs";
import * as path from "path";

// ============================================================
// SHEN AI — Graph Store (Local Knowledge Graph Database)
// ============================================================

export interface GraphNode {
    id: string;
    type: NodeType;
    name: string;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    content: string;
    summary: string;
    metadata: Record<string, unknown>;
}

export interface GraphEdge {
    id: string;
    source: string; // node id
    target: string; // node id
    type: EdgeType;
    weight: number;
    metadata: Record<string, unknown>;
}

export type NodeType =
    | "file"
    | "function"
    | "class"
    | "interface"
    | "type"
    | "variable"
    | "import"
    | "export"
    | "module"
    | "test"
    | "route"
    | "component"
    | "hook"
    | "constant";

export type EdgeType =
    | "imports"
    | "exports"
    | "calls"
    | "extends"
    | "implements"
    | "uses"
    | "contains"
    | "depends_on"
    | "tests"
    | "references"
    | "modifies";

export class GraphStore {
    private nodes: Map<string, GraphNode>;
    private edges: Map<string, GraphEdge>;
    private adjacencyList: Map<string, Set<string>>; // nodeId -> connected nodeIds
    private reverseAdjacencyList: Map<string, Set<string>>; // nodeId -> nodes that connect to it
    private storagePath: string;

    constructor(storagePath: string) {
        this.nodes = new Map();
        this.edges = new Map();
        this.adjacencyList = new Map();
        this.reverseAdjacencyList = new Map();
        this.storagePath = storagePath;
        this.loadFromDisk();
    }

    /**
     * Add a node to the graph.
     */
    addNode(node: GraphNode): void {
        this.nodes.set(node.id, node);
        if (!this.adjacencyList.has(node.id)) {
            this.adjacencyList.set(node.id, new Set());
        }
        if (!this.reverseAdjacencyList.has(node.id)) {
            this.reverseAdjacencyList.set(node.id, new Set());
        }
    }

    /**
     * Add an edge to the graph.
     */
    addEdge(edge: GraphEdge): void {
        this.edges.set(edge.id, edge);

        if (!this.adjacencyList.has(edge.source)) {
            this.adjacencyList.set(edge.source, new Set());
        }
        this.adjacencyList.get(edge.source)!.add(edge.target);

        if (!this.reverseAdjacencyList.has(edge.target)) {
            this.reverseAdjacencyList.set(edge.target, new Set());
        }
        this.reverseAdjacencyList.get(edge.target)!.add(edge.source);
    }

    /**
     * Get a node by ID.
     */
    getNode(id: string): GraphNode | undefined {
        return this.nodes.get(id);
    }

    /**
     * Get all nodes.
     */
    getAllNodes(): GraphNode[] {
        return Array.from(this.nodes.values());
    }

    /**
     * Get all edges.
     */
    getAllEdges(): GraphEdge[] {
        return Array.from(this.edges.values());
    }

    /**
     * Get nodes by type.
     */
    getNodesByType(type: NodeType): GraphNode[] {
        return Array.from(this.nodes.values()).filter((n) => n.type === type);
    }

    /**
     * Get nodes by file path.
     */
    getNodesByFile(filePath: string): GraphNode[] {
        return Array.from(this.nodes.values()).filter((n) => n.filePath === filePath);
    }

    /**
     * Get neighbors of a node (outgoing edges).
     */
    getNeighbors(nodeId: string): GraphNode[] {
        const neighborIds = this.adjacencyList.get(nodeId);
        if (!neighborIds) return [];
        return Array.from(neighborIds)
            .map((id) => this.nodes.get(id))
            .filter((n): n is GraphNode => n !== undefined);
    }

    /**
     * Get reverse neighbors (incoming edges — who depends on this node).
     */
    getReverseNeighbors(nodeId: string): GraphNode[] {
        const neighborIds = this.reverseAdjacencyList.get(nodeId);
        if (!neighborIds) return [];
        return Array.from(neighborIds)
            .map((id) => this.nodes.get(id))
            .filter((n): n is GraphNode => n !== undefined);
    }

    /**
     * Get edges connected to a node.
     */
    getEdgesForNode(nodeId: string): GraphEdge[] {
        return Array.from(this.edges.values()).filter(
            (e) => e.source === nodeId || e.target === nodeId
        );
    }

    /**
     * Get all connections (edges) for a node — both incoming and outgoing.
     */
    getNodeConnections(nodeId: string): GraphEdge[] {
        return Array.from(this.edges.values()).filter(
            (e) => e.source === nodeId || e.target === nodeId
        );
    }

    /**
     * Search nodes by name (partial match).
     */
    searchNodes(query: string): GraphNode[] {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.nodes.values()).filter(
            (n) => n.name.toLowerCase().includes(lowerQuery) ||
                n.summary.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Find the shortest path between two nodes (BFS).
     */
    findPath(sourceId: string, targetId: string): GraphNode[] | null {
        if (sourceId === targetId) return [this.nodes.get(sourceId)!];

        const visited = new Set<string>();
        const queue: Array<{ nodeId: string; path: GraphNode[] }> = [
            { nodeId: sourceId, path: [this.nodes.get(sourceId)!] },
        ];
        visited.add(sourceId);

        while (queue.length > 0) {
            const { nodeId, path } = queue.shift()!;
            const neighbors = this.adjacencyList.get(nodeId);

            if (neighbors) {
                for (const neighborId of neighbors) {
                    if (neighborId === targetId) {
                        return [...path, this.nodes.get(neighborId)!];
                    }
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push({
                            nodeId: neighborId,
                            path: [...path, this.nodes.get(neighborId)!],
                        });
                    }
                }
            }
        }

        return null; // No path found
    }

    /**
     * Detect cycles in the directed graph using DFS with explicit recursion path tracking.
     * Returns an array of cycles, where each cycle is an ordered list of node IDs.
     * Uses inCurrentPath (recursion stack) instead of a simple visited Set to avoid
     * false positives from cross-edges in DAGs.
     */
    detectCycles(): string[][] {
        const visited = new Set<string>();
        const inCurrentPath = new Set<string>();
        const cycles: string[][] = [];
        const pathStack: string[] = [];

        const dfs = (nodeId: string): void => {
            visited.add(nodeId);
            inCurrentPath.add(nodeId);
            pathStack.push(nodeId);

            const neighbors = this.adjacencyList.get(nodeId);
            if (neighbors) {
                for (const neighborId of neighbors) {
                    if (inCurrentPath.has(neighborId)) {
                        // Found a cycle — extract the cycle from the path stack
                        const cycleStart = pathStack.indexOf(neighborId);
                        if (cycleStart >= 0) {
                            const cycle = pathStack.slice(cycleStart);
                            cycle.push(neighborId); // Close the cycle
                            cycles.push(cycle);
                        }
                    } else if (!visited.has(neighborId)) {
                        dfs(neighborId);
                    }
                }
            }

            pathStack.pop();
            inCurrentPath.delete(nodeId);
        };

        // Run DFS from every unvisited node to catch disconnected components
        for (const nodeId of this.nodes.keys()) {
            if (!visited.has(nodeId)) {
                dfs(nodeId);
            }
        }

        return cycles;
    }

    /**
     * Get impact analysis — what would break if this node changed?
     */
    getImpactAnalysis(nodeId: string, depth: number = 3): { affected: GraphNode[]; depth: number }[] {
        const affected: { affected: GraphNode[]; depth: number }[] = [];
        const visited = new Set<string>();

        const traverse = (currentId: string, currentDepth: number) => {
            if (currentDepth > depth) return;
            if (visited.has(currentId)) return;
            visited.add(currentId);

            const reverseNeighbors = this.getReverseNeighbors(currentId);
            if (reverseNeighbors.length > 0) {
                affected.push({
                    affected: reverseNeighbors,
                    depth: currentDepth,
                });
                for (const neighbor of reverseNeighbors) {
                    traverse(neighbor.id, currentDepth + 1);
                }
            }
        };

        traverse(nodeId, 1);
        return affected;
    }

    /**
     * Get graph statistics.
     */
    getStats(): {
        totalNodes: number;
        totalEdges: number;
        nodesByType: Record<string, number>;
        mostConnected: { node: GraphNode; connections: number }[];
    } {
        const nodesByType: Record<string, number> = {};
        for (const node of this.nodes.values()) {
            nodesByType[node.type] = (nodesByType[node.type] || 0) + 1;
        }

        // Find most connected nodes
        const connectionCounts: Array<{ node: GraphNode; connections: number }> = [];
        for (const [nodeId, neighbors] of this.adjacencyList) {
            const node = this.nodes.get(nodeId);
            if (node) {
                connectionCounts.push({
                    node,
                    connections: neighbors.size + (this.reverseAdjacencyList.get(nodeId)?.size || 0),
                });
            }
        }
        connectionCounts.sort((a, b) => b.connections - a.connections);

        return {
            totalNodes: this.nodes.size,
            totalEdges: this.edges.size,
            nodesByType,
            mostConnected: connectionCounts.slice(0, 10),
        };
    }

    /**
     * Clear the entire graph.
     */
    clear(): void {
        this.nodes.clear();
        this.edges.clear();
        this.adjacencyList.clear();
        this.reverseAdjacencyList.clear();
    }

    /**
     * Remove nodes for a specific file (for re-indexing).
     */
    removeFileNodes(filePath: string): void {
        const fileNodes = this.getNodesByFile(filePath);
        for (const node of fileNodes) {
            // Remove connected edges
            const connectedEdges = this.getEdgesForNode(node.id);
            for (const edge of connectedEdges) {
                this.edges.delete(edge.id);
                this.adjacencyList.get(edge.source)?.delete(edge.target);
                this.reverseAdjacencyList.get(edge.target)?.delete(edge.source);
            }
            this.nodes.delete(node.id);
            this.adjacencyList.delete(node.id);
            this.reverseAdjacencyList.delete(node.id);
        }
    }

    /**
     * Export graph as JSON for visualization.
     */
    exportJson(): string {
        return JSON.stringify({
            nodes: Array.from(this.nodes.values()),
            edges: Array.from(this.edges.values()),
        }, null, 2);
    }

    private loadFromDisk(): void {
        try {
            const filePath = path.join(this.storagePath, "genome-graph.json");
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                for (const node of (data.nodes || [])) {
                    this.addNode(node);
                }
                for (const edge of (data.edges || [])) {
                    this.addEdge(edge);
                }
                logger.info(`Graph store loaded: ${this.nodes.size} nodes, ${this.edges.size} edges`);
            }
        } catch (error) {
            logger.warn("Failed to load graph store from disk:", error);
        }
    }

    saveToDisk(): void {
        try {
            const filePath = path.join(this.storagePath, "genome-graph.json");
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Atomic write: temp file + rename to prevent corruption
            const tempPath = filePath + ".tmp";
            fs.writeFileSync(tempPath, this.exportJson(), "utf-8");
            fs.renameSync(tempPath, filePath);
            logger.info(`Graph store saved: ${this.nodes.size} nodes, ${this.edges.size} edges`);
        } catch (error) {
            logger.warn("Failed to save graph store to disk:", error);
            // Clean up temp file
            try {
                const tempPath = path.join(this.storagePath, "genome-graph.json.tmp");
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch { /* ignore */ }
        }
    }
}
