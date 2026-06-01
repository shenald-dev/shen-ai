import * as fs from "fs";
import * as path from "path";
import { logger } from "../../utils/logger";
import type { BlastRadius, DependencyInfo } from "../../types";

// ============================================================
// SHEN AI — Blast Radius Analyzer
// Analyzes file dependencies to determine impact of changes.
// When you modify a file, shows what other files might break.
// ============================================================

export class BlastRadiusAnalyzer {
    private dependencyMap: Map<string, Set<string>> = new Map(); // file -> files that import it
    private importMap: Map<string, DependencyInfo[]> = new Map(); // file -> what it imports
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Analyze a file and extract its imports.
     */
    analyzeFile(filePath: string): void {
        try {
            const fullPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(this.workspaceRoot, filePath);

            if (!fs.existsSync(fullPath)) {
                logger.warn(`File not found for blast radius analysis: ${filePath}`);
                return;
            }

            const content = fs.readFileSync(fullPath, "utf-8");
            const imports = this.extractImports(content, filePath);
            
            this.importMap.set(filePath, imports);

            // Update reverse dependency map
            for (const imp of imports) {
                if (!this.dependencyMap.has(imp.file)) {
                    this.dependencyMap.set(imp.file, new Set());
                }
                this.dependencyMap.get(imp.file)!.add(filePath);
            }

            logger.debug(`Analyzed imports for ${filePath}: ${imports.length} dependencies`);
        } catch (error) {
            logger.error(`Failed to analyze file ${filePath}:`, error);
        }
    }

    /**
     * Extract import statements from file content.
     */
    private extractImports(content: string, sourceFile: string): DependencyInfo[] {
        const imports: DependencyInfo[] = [];
        const lines = content.split("\n");

        for (const line of lines) {
            // Match: import { X, Y } from './file'
            const namedMatch = line.match(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
            if (namedMatch) {
                const symbols = namedMatch[1].split(",").map(s => s.trim().split(" as ")[0].trim());
                const importPath = this.resolveImportPath(namedMatch[2], sourceFile);
                if (importPath) {
                    imports.push({
                        file: importPath,
                        importedSymbols: symbols,
                        importType: "named"
                    });
                }
            }

            // Match: import X from './file'
            const defaultMatch = line.match(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
            if (defaultMatch && !namedMatch) {
                const importPath = this.resolveImportPath(defaultMatch[2], sourceFile);
                if (importPath) {
                    imports.push({
                        file: importPath,
                        importedSymbols: [defaultMatch[1]],
                        importType: "default"
                    });
                }
            }

            // Match: import * as X from './file'
            const namespaceMatch = line.match(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
            if (namespaceMatch) {
                const importPath = this.resolveImportPath(namespaceMatch[2], sourceFile);
                if (importPath) {
                    imports.push({
                        file: importPath,
                        importedSymbols: [namespaceMatch[1]],
                        importType: "namespace"
                    });
                }
            }
        }

        return imports;
    }

    /**
     * Resolve relative import path to absolute workspace path.
     */
    private resolveImportPath(importPath: string, sourceFile: string): string | null {
        // Skip node_modules and external packages
        if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
            return null;
        }

        const sourceDir = path.dirname(sourceFile);
        let resolved = path.join(sourceDir, importPath);

        // Try common extensions
        const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];
        
        for (const ext of extensions) {
            const fullPath = path.join(this.workspaceRoot, resolved + ext);
            if (fs.existsSync(fullPath)) {
                return resolved + ext;
            }
        }

        // Try index files
        for (const ext of extensions) {
            const indexPath = path.join(this.workspaceRoot, resolved, `index${ext}`);
            if (fs.existsSync(indexPath)) {
                return path.join(resolved, `index${ext}`);
            }
        }

        // Return as-is if we can't resolve
        return resolved;
    }

    /**
     * Get the blast radius for a file - what files depend on it.
     */
    getBlastRadius(filePath: string): BlastRadius {
        const directDependents = this.getDirectDependents(filePath);
        const indirectDependents = this.getIndirectDependents(filePath, new Set([filePath]));

        const totalDependents = directDependents.length + indirectDependents.length;
        
        let riskLevel: "low" | "medium" | "high" | "critical";
        if (totalDependents === 0) {
            riskLevel = "low";
        } else if (totalDependents <= 2) {
            riskLevel = "low";
        } else if (totalDependents <= 5) {
            riskLevel = "medium";
        } else if (totalDependents <= 10) {
            riskLevel = "high";
        } else {
            riskLevel = "critical";
        }

        return {
            filePath,
            directDependents,
            indirectDependents,
            riskLevel,
            totalDependents
        };
    }

    /**
     * Get files that directly import this file.
     */
    private getDirectDependents(filePath: string): DependencyInfo[] {
        const dependents = this.dependencyMap.get(filePath);
        if (!dependents) return [];

        const result: DependencyInfo[] = [];
        for (const depFile of dependents) {
            const imports = this.importMap.get(depFile) || [];
            const relevantImports = imports.filter(imp => imp.file === filePath);
            
            if (relevantImports.length > 0) {
                result.push({
                    file: depFile,
                    importedSymbols: relevantImports.flatMap(imp => imp.importedSymbols),
                    importType: relevantImports[0].importType
                });
            }
        }

        return result;
    }

    /**
     * Get files that indirectly depend on this file (through transitive imports).
     */
    private getIndirectDependents(filePath: string, visited: Set<string>): DependencyInfo[] {
        const directDeps = this.getDirectDependents(filePath);
        const indirect: DependencyInfo[] = [];

        for (const dep of directDeps) {
            if (visited.has(dep.file)) continue;
            visited.add(dep.file);

            const transitiveDeps = this.getDirectDependents(dep.file);
            for (const transDep of transitiveDeps) {
                if (!visited.has(transDep.file)) {
                    indirect.push(transDep);
                    // Recursively get deeper dependencies
                    const deeper = this.getIndirectDependents(transDep.file, visited);
                    indirect.push(...deeper);
                }
            }
        }

        return indirect;
    }

    /**
     * Analyze all files in workspace.
     */
    async analyzeWorkspace(): Promise<void> {
        const files = this.getAllSourceFiles(this.workspaceRoot);
        
        for (const file of files) {
            const relativePath = path.relative(this.workspaceRoot, file);
            this.analyzeFile(relativePath);
        }

        logger.info(`Blast radius analyzer: analyzed ${files.length} files, found ${this.dependencyMap.size} dependencies`);
    }

    /**
     * Get all source files recursively.
     */
    private getAllSourceFiles(dir: string): string[] {
        const files: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            // Skip node_modules and hidden directories
            if (entry.name === "node_modules" || entry.name.startsWith(".")) {
                continue;
            }

            if (entry.isDirectory()) {
                files.push(...this.getAllSourceFiles(fullPath));
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
                    files.push(fullPath);
                }
            }
        }

        return files;
    }

    /**
     * Get statistics.
     */
    getStats(): { filesAnalyzed: number; totalDependencies: number } {
        return {
            filesAnalyzed: this.importMap.size,
            totalDependencies: this.dependencyMap.size
        };
    }

    /**
     * Clear all cached data.
     */
    clear(): void {
        this.dependencyMap.clear();
        this.importMap.clear();
    }
}