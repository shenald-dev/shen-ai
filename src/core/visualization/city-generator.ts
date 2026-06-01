import type { GraphStore, GraphNode } from "../genome/graph-store";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — City Generator (Architecture City Visualization)
// Transforms the codebase knowledge graph into a 2D/3D city
// metaphor: buildings = modules, height = complexity,
// color = health, roads = dependencies.
// ============================================================

export interface CityBuilding {
    id: string;
    name: string;
    type: "file" | "function" | "class" | "component" | "module" | "interface" | "test";
    x: number;
    y: number;
    width: number;
    depth: number;
    height: number;
    color: string;
    opacity: number;
    filePath: string;
    lineStart: number;
    lineEnd: number;
    complexity: number;
    healthScore: number;
    connections: number;
    summary: string;
    metadata: Record<string, unknown>;
}

export interface CityRoad {
    id: string;
    from: string; // building id
    to: string; // building id
    type: "imports" | "calls" | "extends" | "depends_on" | "contains";
    weight: number;
    color: string;
    width: number;
}

export interface CityDistrict {
    id: string;
    name: string;
    buildings: string[]; // building ids
    x: number;
    y: number;
    radius: number;
    color: string;
    avgHealth: number;
    avgComplexity: number;
}

export interface CityData {
    buildings: CityBuilding[];
    roads: CityRoad[];
    districts: CityDistrict[];
    metadata: {
        totalBuildings: number;
        totalRoads: number;
        totalDistricts: number;
        avgHealth: number;
        avgComplexity: number;
        generatedAt: number;
    };
}

export interface LayoutOptions {
    gridSize?: number;
    buildingSpacing?: number;
    maxHeight?: number;
    districtRadius?: number;
}

export class CityGenerator {
    private graphStore: GraphStore;
    private healthScores: Map<string, number>;
    private complexityScores: Map<string, number>;

    constructor(graphStore: GraphStore) {
        this.graphStore = graphStore;
        this.healthScores = new Map();
        this.complexityScores = new Map();
    }

    /**
     * Update health scores from the vital monitor.
     */
    updateHealthScores(scores: Map<string, number>): void {
        this.healthScores = scores;
    }

    /**
     * Update complexity scores.
     */
    updateComplexityScores(scores: Map<string, number>): void {
        this.complexityScores = scores;
    }

    /**
     * Generate the complete city data from the graph.
     */
    generateCity(options: LayoutOptions = {}): CityData {
        const {
            gridSize = 100,
            buildingSpacing = 2,
            maxHeight = 50,
            districtRadius = 30,
        } = options;

        const nodes = this.graphStore.getAllNodes();
        const edges = this.graphStore.getAllEdges();

        // Group nodes by file (districts)
        const fileGroups = this.groupByFile(nodes);

        // Generate districts
        const districts: CityDistrict[] = [];
        const districtPositions = new Map<string, { x: number; y: number }>();

        let districtIndex = 0;
        for (const [filePath, fileNodes] of fileGroups) {
            const angle = (districtIndex / fileGroups.size) * Math.PI * 2;
            const dist = Math.sqrt(fileGroups.size) * districtRadius * 0.5;
            const x = Math.cos(angle) * dist;
            const y = Math.sin(angle) * dist;

            const avgHealth = this.getAvgHealth(fileNodes);
            const avgComplexity = this.getAvgComplexity(fileNodes);

            const district: CityDistrict = {
                id: `district_${districtIndex}`,
                name: filePath,
                buildings: [],
                x,
                y,
                radius: districtRadius,
                color: this.healthToColor(avgHealth),
                avgHealth,
                avgComplexity,
            };
            districts.push(district);
            districtPositions.set(filePath, { x, y });
            districtIndex++;
        }

        // Generate buildings
        const buildings: CityBuilding[] = [];
        const buildingPositions = new Map<string, { x: number; y: number }>();

        for (const node of nodes) {
            if (node.type === "file") continue; // Files are districts, not buildings

            const districtPos = districtPositions.get(node.filePath) || { x: 0, y: 0 };
            const health = this.healthScores.get(node.filePath) ?? 70;
            const complexity = this.complexityScores.get(node.filePath) ?? 10;
            const connections = this.graphStore.getNodeConnections(node.id).length;

            // Position within district
            const nodeIndex = nodes.filter((n) => n.filePath === node.filePath && n.type !== "file").indexOf(node);
            const cols = Math.ceil(Math.sqrt(fileGroups.get(node.filePath)?.length || 1));
            const bx = (nodeIndex % cols) * buildingSpacing;
            const by = Math.floor(nodeIndex / cols) * buildingSpacing;

            const building: CityBuilding = {
                id: node.id,
                name: node.name,
                type: node.type as CityBuilding["type"],
                x: districtPos.x + bx,
                y: districtPos.y + by,
                width: this.typeToWidth(node.type),
                depth: this.typeToDepth(node.type),
                height: Math.min(complexity * 2 + connections, maxHeight),
                color: this.healthToColor(health),
                opacity: 0.8 + (health / 100) * 0.2,
                filePath: node.filePath,
                lineStart: node.lineStart,
                lineEnd: node.lineEnd,
                complexity,
                healthScore: health,
                connections,
                summary: node.summary,
                metadata: node.metadata,
            };
            buildings.push(building);
            buildingPositions.set(node.id, { x: building.x, y: building.y });

            // Add to district
            const district = districts.find((d) => d.name === node.filePath);
            if (district) {
                district.buildings.push(node.id);
            }
        }

        // Generate roads from edges
        const roads: CityRoad[] = [];
        for (const edge of edges) {
            const fromPos = buildingPositions.get(edge.source);
            const toPos = buildingPositions.get(edge.target);

            if (!fromPos || !toPos) continue; // Skip edges to non-building nodes

            const road: CityRoad = {
                id: edge.id,
                from: edge.source,
                to: edge.target,
                type: edge.type as CityRoad["type"],
                weight: edge.weight,
                color: this.edgeTypeToColor(edge.type),
                width: Math.min(edge.weight * 0.5, 3),
            };
            roads.push(road);
        }

        // Calculate metadata
        const avgHealth = buildings.length > 0
            ? buildings.reduce((sum, b) => sum + b.healthScore, 0) / buildings.length
            : 100;
        const avgComplexity = buildings.length > 0
            ? buildings.reduce((sum, b) => sum + b.complexity, 0) / buildings.length
            : 0;

        const cityData: CityData = {
            buildings,
            roads,
            districts,
            metadata: {
                totalBuildings: buildings.length,
                totalRoads: roads.length,
                totalDistricts: districts.length,
                avgHealth,
                avgComplexity,
                generatedAt: Date.now(),
            },
        };

        logger.info(`City generated: ${buildings.length} buildings, ${roads.length} roads, ${districts.length} districts`);
        return cityData;
    }

    /**
     * Generate a simplified 2D map for quick overview.
     */
    generate2DMap(): {
        nodes: Array<{ id: string; name: string; x: number; y: number; size: number; color: string; type: string }>;
        links: Array<{ source: string; target: string; width: number; color: string }>;
    } {
        const nodes = this.graphStore.getAllNodes();
        const edges = this.graphStore.getAllEdges();

        // Simple force-directed layout approximation
        const positions = new Map<string, { x: number; y: number }>();
        const fileGroups = this.groupByFile(nodes);

        // Position files in a circle
        let fileIndex = 0;
        for (const [filePath, fileNodes] of fileGroups) {
            const angle = (fileIndex / fileGroups.size) * Math.PI * 2;
            const radius = Math.sqrt(fileGroups.size) * 20;
            const fx = Math.cos(angle) * radius;
            const fy = Math.sin(angle) * radius;

            // Position nodes within file
            fileNodes.forEach((node, i) => {
                const cols = Math.ceil(Math.sqrt(fileNodes.length));
                positions.set(node.id, {
                    x: fx + (i % cols) * 3,
                    y: fy + Math.floor(i / cols) * 3,
                });
            });
            fileIndex++;
        }

        const mapNodes = nodes.map((node) => {
            const pos = positions.get(node.id) || { x: 0, y: 0 };
            const health = this.healthScores.get(node.filePath) ?? 70;
            const connections = this.graphStore.getNodeConnections(node.id).length;

            return {
                id: node.id,
                name: node.name,
                x: pos.x,
                y: pos.y,
                size: Math.max(2, Math.min(connections + 2, 15)),
                color: this.healthToColor(health),
                type: node.type,
            };
        });

        const mapLinks = edges
            .filter((e) => positions.has(e.source) && positions.has(e.target))
            .map((edge) => ({
                source: edge.source,
                target: edge.target,
                width: Math.min(edge.weight, 3),
                color: this.edgeTypeToColor(edge.type),
            }));

        return { nodes: mapNodes, links: mapLinks };
    }

    /**
     * Get a summary of the city for display.
     */
    getCitySummary(city: CityData): string {
        const healthStatus = city.metadata.avgHealth > 80 ? "🟢 Excellent"
            : city.metadata.avgHealth > 60 ? "🟡 Good"
                : city.metadata.avgHealth > 40 ? "🟠 Fair"
                    : "🔴 Poor";

        const complexityStatus = city.metadata.avgComplexity < 10 ? "🟢 Low"
            : city.metadata.avgComplexity < 20 ? "🟡 Medium"
                : city.metadata.avgComplexity < 30 ? "🟠 High"
                    : "🔴 Very High";

        return `🏙️ Architecture City Summary

📊 Overall Health: ${Math.round(city.metadata.avgHealth)}/100 ${healthStatus}
🧠 Avg Complexity: ${Math.round(city.metadata.avgComplexity)} ${complexityStatus}
🏗️ Buildings: ${city.metadata.totalBuildings}
🛤️ Roads (Dependencies): ${city.metadata.totalRoads}
🏘️ Districts (Files): ${city.metadata.totalDistricts}

🔴 Red buildings = unhealthy code
🟢 Green buildings = healthy code
📏 Taller buildings = more complex
🛤️ More roads = more coupled`;
    }

    // --- Private Methods ---

    private groupByFile(nodes: GraphNode[]): Map<string, GraphNode[]> {
        const groups = new Map<string, GraphNode[]>();
        for (const node of nodes) {
            if (!groups.has(node.filePath)) {
                groups.set(node.filePath, []);
            }
            groups.get(node.filePath)!.push(node);
        }
        return groups;
    }

    private getAvgHealth(nodes: GraphNode[]): number {
        const scores = nodes.map((n) => this.healthScores.get(n.filePath) ?? 70);
        return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 70;
    }

    private getAvgComplexity(nodes: GraphNode[]): number {
        const scores = nodes.map((n) => this.complexityScores.get(n.filePath) ?? 10);
        return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 10;
    }

    private healthToColor(health: number): string {
        if (health >= 80) return "#22c55e"; // green
        if (health >= 60) return "#eab308"; // yellow
        if (health >= 40) return "#f97316"; // orange
        return "#ef4444"; // red
    }

    private edgeTypeToColor(type: string): string {
        switch (type) {
            case "imports": return "#3b82f6"; // blue
            case "calls": return "#8b5cf6"; // purple
            case "extends": return "#ec4899"; // pink
            case "depends_on": return "#f59e0b"; // amber
            case "contains": return "#6b7280"; // gray
            default: return "#9ca3af";
        }
    }

    private typeToWidth(type: string): number {
        switch (type) {
            case "class": return 4;
            case "component": return 3.5;
            case "function": return 2;
            case "interface": return 2.5;
            case "test": return 2;
            case "constant": return 1;
            default: return 2;
        }
    }

    private typeToDepth(type: string): number {
        switch (type) {
            case "class": return 4;
            case "component": return 3.5;
            case "function": return 2;
            case "interface": return 2.5;
            case "test": return 2;
            case "constant": return 1;
            default: return 2;
        }
    }
}