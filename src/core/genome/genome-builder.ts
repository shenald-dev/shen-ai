import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GraphStore, type GraphNode, type GraphEdge, type NodeType, type EdgeType } from "./graph-store";
import { generateId } from "../../utils/helpers";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Genome Builder (Codebase Knowledge Graph)
// Parses source files and builds a living knowledge graph
// ============================================================

export interface ParseResult {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export class GenomeBuilder {
    private graphStore: GraphStore;
    private supportedExtensions: Set<string>;
    private isIndexing: boolean;

    constructor(graphStore: GraphStore) {
        this.graphStore = graphStore;
        this.supportedExtensions = new Set([
            ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs",
            ".java", ".kt", ".swift", ".rb", ".php", ".cs",
            ".vue", ".svelte", ".html", ".css", ".scss",
        ]);
        this.isIndexing = false;
    }

    /**
     * Index the entire workspace.
     */
    async indexWorkspace(): Promise<{ nodes: number; edges: number; files: number }> {
        if (this.isIndexing) {
            logger.warn("Indexing already in progress.");
            return { nodes: 0, edges: 0, files: 0 };
        }

        this.isIndexing = true;
        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            this.isIndexing = false;
            return { nodes: 0, edges: 0, files: 0 };
        }

        logger.info("Starting workspace genome indexing...");

        const files = await this.collectFiles(workspaceRoot);
        let totalNodes = 0;
        let totalEdges = 0;

        for (const file of files) {
            try {
                const result = await this.parseFile(file);
                totalNodes += result.nodes.length;
                totalEdges += result.edges.length;
            } catch (error) {
                logger.warn(`Failed to parse ${file}: ${(error as Error).message}`);
            }
        }

        this.graphStore.saveToDisk();
        this.isIndexing = false;

        logger.info(`Genome indexing complete: ${totalNodes} nodes, ${totalEdges} edges from ${files.length} files`);
        return { nodes: totalNodes, edges: totalEdges, files: files.length };
    }

    /**
     * Index a single file (for incremental updates).
     */
    async indexFile(filePath: string): Promise<ParseResult> {
        // Remove old nodes for this file
        this.graphStore.removeFileNodes(filePath);

        const result = await this.parseFile(filePath);

        for (const node of result.nodes) {
            this.graphStore.addNode(node);
        }
        for (const edge of result.edges) {
            this.graphStore.addEdge(edge);
        }

        this.graphStore.saveToDisk();
        return result;
    }

    /**
     * Parse a file and extract nodes and edges.
     */
    private async parseFile(filePath: string): Promise<ParseResult> {
        const content = await fs.promises.readFile(filePath, "utf-8");
        const ext = path.extname(filePath).toLowerCase();
        const relativePath = this.getRelativePath(filePath);

        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        // Create file node
        const fileNode: GraphNode = {
            id: generateId(),
            type: "file",
            name: path.basename(filePath),
            filePath: relativePath,
            lineStart: 1,
            lineEnd: content.split("\n").length,
            content: content.substring(0, 500),
            summary: `File: ${path.basename(filePath)}`,
            metadata: { size: content.length, extension: ext },
        };
        nodes.push(fileNode);

        // Parse based on language
        if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
            const result = this.parseJavaScript(content, relativePath, fileNode.id);
            nodes.push(...result.nodes);
            edges.push(...result.edges);
        } else if (ext === ".py") {
            const result = this.parsePython(content, relativePath, fileNode.id);
            nodes.push(...result.nodes);
            edges.push(...result.edges);
        } else if ([".vue", ".svelte"].includes(ext)) {
            const result = this.parseComponent(content, relativePath, fileNode.id);
            nodes.push(...result.nodes);
            edges.push(...result.edges);
        }

        // Extract imports (cross-file edges)
        const importEdges = this.extractImports(content, relativePath, fileNode.id, ext);
        edges.push(...importEdges);

        return { nodes, edges };
    }

    /**
     * Parse JavaScript/TypeScript files.
     */
    private parseJavaScript(content: string, filePath: string, fileId: string): ParseResult {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const lines = content.split("\n");

        // Extract functions
        const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(|(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?function/g;
        let match;
        while ((match = functionRegex.exec(content)) !== null) {
            const name = match[1] || match[2] || match[3];
            const lineNum = content.substring(0, match.index).split("\n").length;

            const node: GraphNode = {
                id: generateId(),
                type: "function",
                name,
                filePath,
                lineStart: lineNum,
                lineEnd: lineNum + this.findBlockEnd(lines, lineNum - 1),
                content: this.extractBlock(lines, lineNum - 1),
                summary: `Function: ${name}`,
                metadata: { async: content.substring(match.index, match.index + 50).includes("async") },
            };
            nodes.push(node);

            // Edge: file contains function
            edges.push({
                id: generateId(),
                source: fileId,
                target: node.id,
                type: "contains",
                weight: 1,
                metadata: {},
            });
        }

        // Extract classes
        const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g;
        while ((match = classRegex.exec(content)) !== null) {
            const name = match[1];
            const extendsClass = match[2];
            const implementsInterfaces = match[3];
            const lineNum = content.substring(0, match.index).split("\n").length;

            const node: GraphNode = {
                id: generateId(),
                type: "class",
                name,
                filePath,
                lineStart: lineNum,
                lineEnd: lineNum + this.findBlockEnd(lines, lineNum - 1),
                content: this.extractBlock(lines, lineNum - 1),
                summary: `Class: ${name}${extendsClass ? ` (extends ${extendsClass})` : ""}`,
                metadata: { extends: extendsClass || null, implements: implementsInterfaces || null },
            };
            nodes.push(node);

            edges.push({
                id: generateId(),
                source: fileId,
                target: node.id,
                type: "contains",
                weight: 1,
                metadata: {},
            });

            if (extendsClass) {
                edges.push({
                    id: generateId(),
                    source: node.id,
                    target: `ref:${extendsClass}`,
                    type: "extends",
                    weight: 1,
                    metadata: {},
                });
            }
        }

        // Extract interfaces/types
        const interfaceRegex = /(?:export\s+)?(?:interface|type)\s+(\w+)/g;
        while ((match = interfaceRegex.exec(content)) !== null) {
            const name = match[1];
            const lineNum = content.substring(0, match.index).split("\n").length;

            const node: GraphNode = {
                id: generateId(),
                type: "interface",
                name,
                filePath,
                lineStart: lineNum,
                lineEnd: lineNum + this.findBlockEnd(lines, lineNum - 1),
                content: this.extractBlock(lines, lineNum - 1),
                summary: `Type: ${name}`,
                metadata: {},
            };
            nodes.push(node);

            edges.push({
                id: generateId(),
                source: fileId,
                target: node.id,
                type: "contains",
                weight: 1,
                metadata: {},
            });
        }

        // Extract constants
        const constRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?![\(\{])/g;
        while ((match = constRegex.exec(content)) !== null) {
            const name = match[1];
            const lineNum = content.substring(0, match.index).split("\n").length;

            const node: GraphNode = {
                id: generateId(),
                type: "constant",
                name,
                filePath,
                lineStart: lineNum,
                lineEnd: lineNum,
                content: lines[lineNum - 1]?.trim() || "",
                summary: `Constant: ${name}`,
                metadata: {},
            };
            nodes.push(node);

            edges.push({
                id: generateId(),
                source: fileId,
                target: node.id,
                type: "contains",
                weight: 1,
                metadata: {},
            });
        }

        // Detect React components
        const componentRegex = /(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)|const\s+([A-Z]\w+)\s*=\s*\(/g;
        while ((match = componentRegex.exec(content)) !== null) {
            const name = match[1] || match[2];
            if (name && name[0] === name[0].toUpperCase()) {
                const existingFunc = nodes.find((n) => n.name === name && n.type === "function");
                if (existingFunc) {
                    existingFunc.type = "component";
                    existingFunc.summary = `Component: ${name}`;
                }
            }
        }

        // Detect test files
        if (filePath.includes("test") || filePath.includes("spec")) {
            const testRegex = /(?:it|test|describe)\s*\(\s*["'`]([^"'`]+)["'`]/g;
            while ((match = testRegex.exec(content)) !== null) {
                const testName = match[1];
                const lineNum = content.substring(0, match.index).split("\n").length;

                const node: GraphNode = {
                    id: generateId(),
                    type: "test",
                    name: testName,
                    filePath,
                    lineStart: lineNum,
                    lineEnd: lineNum + this.findBlockEnd(lines, lineNum - 1),
                    content: this.extractBlock(lines, lineNum - 1),
                    summary: `Test: ${testName}`,
                    metadata: {},
                };
                nodes.push(node);

                edges.push({
                    id: generateId(),
                    source: fileId,
                    target: node.id,
                    type: "contains",
                    weight: 1,
                    metadata: {},
                });
            }
        }

        return { nodes, edges };
    }

    /**
     * Parse Python files.
     */
    private parsePython(content: string, filePath: string, fileId: string): ParseResult {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const lines = content.split("\n");

        // Extract functions
        const funcRegex = /(?:def)\s+(\w+)\s*\(/g;
        let match;
        while ((match = funcRegex.exec(content)) !== null) {
            const name = match[1];
            const lineNum = content.substring(0, match.index).split("\n").length;

            const node: GraphNode = {
                id: generateId(),
                type: "function",
                name,
                filePath,
                lineStart: lineNum,
                lineEnd: lineNum + this.findPythonBlockEnd(lines, lineNum - 1),
                content: this.extractPythonBlock(lines, lineNum - 1),
                summary: `Function: ${name}`,
                metadata: {},
            };
            nodes.push(node);

            edges.push({
                id: generateId(),
                source: fileId,
                target: node.id,
                type: "contains",
                weight: 1,
                metadata: {},
            });
        }

        // Extract classes
        const classRegex = /class\s+(\w+)(?:\(([^)]*)\))?/g;
        while ((match = classRegex.exec(content)) !== null) {
            const name = match[1];
            const parent = match[2];
            const lineNum = content.substring(0, match.index).split("\n").length;

            const node: GraphNode = {
                id: generateId(),
                type: "class",
                name,
                filePath,
                lineStart: lineNum,
                lineEnd: lineNum + this.findPythonBlockEnd(lines, lineNum - 1),
                content: this.extractPythonBlock(lines, lineNum - 1),
                summary: `Class: ${name}${parent ? ` (${parent})` : ""}`,
                metadata: { extends: parent || null },
            };
            nodes.push(node);

            edges.push({
                id: generateId(),
                source: fileId,
                target: node.id,
                type: "contains",
                weight: 1,
                metadata: {},
            });
        }

        return { nodes, edges };
    }

    /**
     * Parse Vue/Svelte components.
     */
    private parseComponent(content: string, filePath: string, fileId: string): ParseResult {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];

        // Create component node
        const name = path.basename(filePath, path.extname(filePath));
        const node: GraphNode = {
            id: generateId(),
            type: "component",
            name,
            filePath,
            lineStart: 1,
            lineEnd: content.split("\n").length,
            content: content.substring(0, 500),
            summary: `Component: ${name}`,
            metadata: { framework: filePath.endsWith(".vue") ? "vue" : "svelte" },
        };
        nodes.push(node);

        edges.push({
            id: generateId(),
            source: fileId,
            target: node.id,
            type: "contains",
            weight: 1,
            metadata: {},
        });

        return { nodes, edges };
    }

    /**
     * Extract import statements as cross-file edges.
     */
    private extractImports(content: string, filePath: string, fileId: string, ext: string): GraphEdge[] {
        const edges: GraphEdge[] = [];

        // JavaScript/TypeScript imports
        if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
            const importRegex = /import\s+(?:{([^}]+)}|(\w+))(?:\s*,\s*{\s*([^}]+)\s*})?\s+from\s+["']([^"']+)["']/g;
            let match;
            while ((match = importRegex.exec(content)) !== null) {
                const imported = match[1] || match[2] || match[3] || "";
                const source = match[4];

                const names = imported.split(",").map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);

                for (const name of names) {
                    edges.push({
                        id: generateId(),
                        source: fileId,
                        target: `import:${source}:${name}`,
                        type: "imports",
                        weight: 1,
                        metadata: { sourceModule: source, importedName: name },
                    });
                }
            }

            // require() calls
            const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
            while ((match = requireRegex.exec(content)) !== null) {
                edges.push({
                    id: generateId(),
                    source: fileId,
                    target: `import:${match[1]}`,
                    type: "imports",
                    weight: 1,
                    metadata: { sourceModule: match[1] },
                });
            }
        }

        // Python imports
        if (ext === ".py") {
            const importRegex = /(?:from\s+(\S+)\s+)?import\s+(.+)/g;
            let pyMatch;
            while ((pyMatch = importRegex.exec(content)) !== null) {
                const source = pyMatch[1] || "builtins";
                const names = pyMatch[2].split(",").map((n: string) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean);

                for (const name of names) {
                    edges.push({
                        id: generateId(),
                        source: fileId,
                        target: `import:${source}:${name}`,
                        type: "imports",
                        weight: 1,
                        metadata: { sourceModule: source, importedName: name },
                    });
                }
            }
        }

        return edges;
    }

    /**
     * Find the end of a code block (brace-based languages).
     */
    private findBlockEnd(lines: string[], startLine: number): number {
        let depth = 0;
        let foundOpen = false;

        for (let i = startLine; i < Math.min(startLine + 200, lines.length); i++) {
            const line = lines[i];
            for (const ch of line) {
                if (ch === "{") { depth++; foundOpen = true; }
                if (ch === "}") { depth--; }
            }
            if (foundOpen && depth <= 0) return i - startLine + 1;
        }
        return 10; // Fallback
    }

    /**
     * Extract a code block.
     */
    private extractBlock(lines: string[], startLine: number): string {
        const end = this.findBlockEnd(lines, startLine);
        return lines.slice(startLine, startLine + end).join("\n").substring(0, 1000);
    }

    /**
     * Find the end of a Python block (indentation-based).
     */
    private findPythonBlockEnd(lines: string[], startLine: number): number {
        if (startLine >= lines.length) return 1;
        const baseIndent = lines[startLine].search(/\S/);

        for (let i = startLine + 1; i < Math.min(startLine + 200, lines.length); i++) {
            const line = lines[i];
            if (line.trim().length === 0) continue;
            const indent = line.search(/\S/);
            if (indent <= baseIndent) return i - startLine;
        }
        return 10;
    }

    private extractPythonBlock(lines: string[], startLine: number): string {
        const end = this.findPythonBlockEnd(lines, startLine);
        return lines.slice(startLine, startLine + end).join("\n").substring(0, 1000);
    }

    /**
     * Collect all supported files in the workspace.
     */
    private async collectFiles(root: string): Promise<string[]> {
        const files: string[] = [];
        const IGNORED = ["node_modules", ".git", "dist", "out", ".vscode", "build", "vendor"];
        const supportedExts = this.supportedExtensions;

        const walk = async (dir: string): Promise<void> => {
            try {
                const items = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const item of items) {
                    if (item.name.startsWith(".")) continue;
                    if (IGNORED.includes(item.name)) continue;

                    const fullPath = path.join(dir, item.name);
                    if (item.isDirectory()) {
                        await walk(fullPath);
                    } else {
                        const ext = path.extname(item.name).toLowerCase();
                        if (supportedExts.has(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch {
                // Skip inaccessible directories
            }
        };

        await walk(root);
        return files;
    }

    private getWorkspaceRoot(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return undefined;
    }

    private getRelativePath(filePath: string): string {
        const root = this.getWorkspaceRoot();
        if (!root) return filePath;
        return path.relative(root, filePath);
    }

    getGraphStore(): GraphStore {
        return this.graphStore;
    }
}