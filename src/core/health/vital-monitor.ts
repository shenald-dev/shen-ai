import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { EventEmitter } from "events";
import type { GraphStore } from "../genome/graph-store";
import { logger } from "../../utils/logger";

// ============================================================
// SHEN AI — Vital Monitor (Code Health Dashboard)
// Real-time metrics and AI-powered prescriptions for
// codebase health: complexity, debt, coverage, security.
// ============================================================

export interface HealthMetric {
    name: string;
    value: number;
    max: number;
    unit: string;
    status: "healthy" | "warning" | "critical";
    trend: "improving" | "stable" | "degrading";
    description: string;
}

export interface HealthPrescription {
    id: string;
    severity: "low" | "medium" | "high" | "critical";
    category: "complexity" | "debt" | "security" | "coverage" | "maintainability" | "performance";
    title: string;
    description: string;
    affectedFiles: string[];
    suggestedAction: string;
    estimatedEffort: "minutes" | "hours" | "days";
    createdAt: number;
}

export interface CodeHealthReport {
    overallScore: number; // 0-100
    overallStatus: "excellent" | "good" | "fair" | "poor" | "critical";
    metrics: HealthMetric[];
    prescriptions: HealthPrescription[];
    fileHealth: Map<string, FileHealthScore>;
    generatedAt: number;
}

export interface FileHealthScore {
    filePath: string;
    score: number; // 0-100
    complexity: number;
    maintainability: number;
    issues: string[];
    lastModified: number;
}

export interface HealthTrend {
    timestamp: number;
    overallScore: number;
    metricScores: Record<string, number>;
}

export class VitalMonitor extends EventEmitter {
    private graphStore: GraphStore;
    private healthHistory: HealthTrend[];
    private prescriptions: HealthPrescription[];
    private fileHealthCache: Map<string, FileHealthScore>;
    private isMonitoring: boolean;
    private monitorInterval: NodeJS.Timeout | null;
    private storagePath: string;

    constructor(graphStore: GraphStore, storagePath: string) {
        super();
        this.graphStore = graphStore;
        this.healthHistory = [];
        this.prescriptions = [];
        this.fileHealthCache = new Map();
        this.isMonitoring = false;
        this.monitorInterval = null;
        this.storagePath = storagePath;
        this.loadHistory();
    }

    /**
     * Start continuous health monitoring.
     */
    startMonitoring(intervalMs: number = 60000): void {
        if (this.isMonitoring) return;
        this.isMonitoring = true;

        // Initial scan
        this.scanHealth();

        // Periodic scans
        this.monitorInterval = setInterval(() => {
            this.scanHealth();
        }, intervalMs);

        logger.info(`Vital monitor started (interval: ${intervalMs}ms)`);
    }

    /**
     * Stop continuous monitoring.
     */
    stopMonitoring(): void {
        this.isMonitoring = false;
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        logger.info("Vital monitor stopped.");
    }

    /**
     * Perform a full health scan.
     */
    async scanHealth(): Promise<CodeHealthReport> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            throw new Error("No workspace folder open.");
        }

        const metrics: HealthMetric[] = [];
        const fileHealth = new Map<string, FileHealthScore>();

        // Scan all source files
        const sourceFiles = await this.collectSourceFiles(workspaceRoot);

        for (const file of sourceFiles) {
            const health = await this.analyzeFileHealth(file, workspaceRoot);
            fileHealth.set(file, health);
            this.fileHealthCache.set(file, health);
        }

        // Calculate aggregate metrics
        const scores = Array.from(fileHealth.values()).map((f) => f.score);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 100;

        // Complexity metric
        const avgComplexity = scores.length > 0
            ? Array.from(fileHealth.values()).reduce((sum, f) => sum + f.complexity, 0) / scores.length
            : 0;
        metrics.push({
            name: "Average Complexity",
            value: avgComplexity,
            max: 50,
            unit: "cognitive complexity",
            status: avgComplexity < 10 ? "healthy" : avgComplexity < 20 ? "warning" : "critical",
            trend: this.getTrend("complexity", avgComplexity),
            description: avgComplexity < 10 ? "Code is easy to understand" : avgComplexity < 20 ? "Some functions are complex" : "High complexity makes code hard to maintain",
        });

        // Maintainability metric
        const avgMaintainability = scores.length > 0
            ? Array.from(fileHealth.values()).reduce((sum, f) => sum + f.maintainability, 0) / scores.length
            : 100;
        metrics.push({
            name: "Maintainability Index",
            value: avgMaintainability,
            max: 100,
            unit: "index",
            status: avgMaintainability > 70 ? "healthy" : avgMaintainability > 40 ? "warning" : "critical",
            trend: this.getTrend("maintainability", avgMaintainability),
            description: avgMaintainability > 70 ? "Code is easy to maintain" : avgMaintainability > 40 ? "Maintenance may be challenging" : "Code is difficult to maintain",
        });

        // Technical debt metric
        const totalIssues = Array.from(fileHealth.values()).reduce((sum, f) => sum + f.issues.length, 0);
        const debtScore = Math.min(totalIssues * 2, 100);
        metrics.push({
            name: "Technical Debt",
            value: debtScore,
            max: 100,
            unit: "debt points",
            status: debtScore < 20 ? "healthy" : debtScore < 50 ? "warning" : "critical",
            trend: this.getTrend("debt", debtScore),
            description: `${totalIssues} issues detected across ${sourceFiles.length} files`,
        });

        // File size distribution
        const largeFiles = sourceFiles.filter(async (f) => {
            try {
                const stat = await fs.promises.stat(f);
                return stat.size > 10000; // > 10KB
            } catch {
                return false;
            }
        });
        // We'll approximate since we can't await in filter
        let largeFileCount = 0;
        for (const f of sourceFiles) {
            try {
                const stat = await fs.promises.stat(f);
                if (stat.size > 10000) largeFileCount++;
            } catch { /* skip */ }
        }
        metrics.push({
            name: "Large Files",
            value: largeFileCount,
            max: sourceFiles.length,
            unit: "files > 10KB",
            status: largeFileCount < 3 ? "healthy" : largeFileCount < 10 ? "warning" : "critical",
            trend: "stable",
            description: `${largeFileCount} of ${sourceFiles.length} files exceed 10KB`,
        });

        // Graph-based metrics
        const graphStats = this.graphStore.getStats();
        const highlyConnected = graphStats.mostConnected.filter((n) => n.connections > 10).length;
        metrics.push({
            name: "Coupling",
            value: highlyConnected,
            max: graphStats.totalNodes,
            unit: "highly connected modules",
            status: highlyConnected < 3 ? "healthy" : highlyConnected < 8 ? "warning" : "critical",
            trend: "stable",
            description: `${highlyConnected} modules have >10 dependencies`,
        });

        // Calculate overall score
        const overallScore = this.calculateOverallScore(metrics);
        const overallStatus = this.scoreToStatus(overallScore);

        // Generate prescriptions
        const newPrescriptions = this.generatePrescriptions(fileHealth, metrics);
        this.prescriptions.push(...newPrescriptions);

        const report: CodeHealthReport = {
            overallScore,
            overallStatus,
            metrics,
            prescriptions: this.prescriptions,
            fileHealth,
            generatedAt: Date.now(),
        };

        // Record trend
        const trend: HealthTrend = {
            timestamp: Date.now(),
            overallScore,
            metricScores: {},
        };
        for (const m of metrics) {
            trend.metricScores[m.name] = m.value;
        }
        this.healthHistory.push(trend);

        // Keep last 1000 data points
        if (this.healthHistory.length > 1000) {
            this.healthHistory = this.healthHistory.slice(-1000);
        }

        this.emit("healthUpdate", report);
        this.saveHistory();

        return report;
    }

    /**
     * Get the latest health report.
     */
    getLatestReport(): CodeHealthReport | null {
        if (this.healthHistory.length === 0) return null;

        const latest = this.healthHistory[this.healthHistory.length - 1];
        return {
            overallScore: latest.overallScore,
            overallStatus: this.scoreToStatus(latest.overallScore),
            metrics: [],
            prescriptions: this.prescriptions,
            fileHealth: this.fileHealthCache,
            generatedAt: latest.timestamp,
        };
    }

    /**
     * Get health trends over time.
     */
    getTrends(days: number = 7): HealthTrend[] {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        return this.healthHistory
            .filter((t) => t.timestamp >= cutoff)
            .sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * Get health for a specific file.
     */
    getFileHealth(filePath: string): FileHealthScore | undefined {
        return this.fileHealthCache.get(filePath);
    }

    /**
     * Get all prescriptions.
     */
    getPrescriptions(filter?: { severity?: string; category?: string }): HealthPrescription[] {
        let prescriptions = [...this.prescriptions];
        if (filter?.severity) {
            prescriptions = prescriptions.filter((p) => p.severity === filter.severity);
        }
        if (filter?.category) {
            prescriptions = prescriptions.filter((p) => p.category === filter.category);
        }
        return prescriptions.sort((a, b) => {
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
    }

    /**
     * Get health statistics summary.
     */
    getStats(): {
        isMonitoring: boolean;
        totalScans: number;
        currentScore: number;
        currentStatus: string;
        totalPrescriptions: number;
        criticalPrescriptions: number;
        filesMonitored: number;
    } {
        const latest = this.healthHistory[this.healthHistory.length - 1];
        return {
            isMonitoring: this.isMonitoring,
            totalScans: this.healthHistory.length,
            currentScore: latest?.overallScore || 0,
            currentStatus: latest ? this.scoreToStatus(latest.overallScore) : "unknown",
            totalPrescriptions: this.prescriptions.length,
            criticalPrescriptions: this.prescriptions.filter((p) => p.severity === "critical").length,
            filesMonitored: this.fileHealthCache.size,
        };
    }

    // --- Private Methods ---

    private async collectSourceFiles(workspaceRoot: string): Promise<string[]> {
        const files: string[] = [];
        const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];
        const ignored = ["node_modules", ".git", "dist", "out", ".vscode", "build", "vendor"];
        // Track visited real paths to prevent infinite loops from circular symlinks
        const visitedRealPaths = new Set<string>();

        const walk = async (dir: string): Promise<void> => {
            try {
                // Resolve the real path to detect symlink cycles
                const realDir = await fs.promises.realpath(dir);
                if (visitedRealPaths.has(realDir)) {
                    // Circular symlink detected, skip this directory
                    return;
                }
                visitedRealPaths.add(realDir);

                const items = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const item of items) {
                    if (item.name.startsWith(".")) continue;
                    if (ignored.includes(item.name)) continue;

                    const fullPath = path.join(dir, item.name);
                    if (item.isDirectory()) {
                        await walk(fullPath);
                    } else if (item.isFile()) {
                        const ext = path.extname(item.name);
                        if (extensions.includes(ext)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch { /* skip inaccessible directories */ }
        };

        await walk(workspaceRoot);
        return files;
    }

    private async analyzeFileHealth(filePath: string, workspaceRoot: string): Promise<FileHealthScore> {
        try {
            const content = await fs.promises.readFile(filePath, "utf-8");
            const lines = content.split("\n");
            const relPath = path.relative(workspaceRoot, filePath);

            const issues: string[] = [];

            // Complexity analysis
            const complexity = this.calculateComplexity(content);
            if (complexity > 20) issues.push(`High complexity: ${complexity}`);
            if (complexity > 40) issues.push(`Very high complexity: consider refactoring`);

            // File length
            if (lines.length > 300) issues.push(`Long file: ${lines.length} lines`);
            if (lines.length > 500) issues.push(`Very long file: consider splitting`);

            // Function length
            const longFunctions = this.findLongFunctions(content);
            if (longFunctions > 0) issues.push(`${longFunctions} long function(s) (>50 lines)`);

            // Deep nesting
            const maxNesting = this.calculateMaxNesting(content);
            if (maxNesting > 4) issues.push(`Deep nesting: ${maxNesting} levels`);

            // TODO/FIXME comments
            const todos = (content.match(/TODO|FIXME|HACK|XXX|BUG/gi) || []).length;
            if (todos > 0) issues.push(`${todos} TODO/FIXME comment(s)`);

            // Error handling
            const hasTryCatch = content.includes("try {") || content.includes("try{");
            const hasErrorHandling = content.includes("catch") || content.includes(".catch(");
            if (!hasErrorHandling && content.includes("async")) {
                issues.push("Async code without error handling");
            }

            // Duplicate code patterns (simple heuristic)
            const duplicateLines = this.findDuplicatePatterns(content);
            if (duplicateLines > 3) issues.push(`Possible code duplication: ${duplicateLines} repeated patterns`);

            // Calculate scores
            const complexityScore = Math.max(0, 100 - complexity * 2);
            const lengthScore = Math.max(0, 100 - (lines.length / 10));
            const issueScore = Math.max(0, 100 - issues.length * 10);
            const maintainability = Math.round((complexityScore + lengthScore + issueScore) / 3);

            const overallScore = Math.round((complexityScore * 0.4 + maintainability * 0.4 + issueScore * 0.2));

            let stat: fs.Stats;
            try {
                stat = await fs.promises.stat(filePath);
            } catch {
                stat = { mtimeMs: Date.now() } as fs.Stats;
            }

            return {
                filePath: relPath,
                score: Math.max(0, Math.min(100, overallScore)),
                complexity,
                maintainability: Math.max(0, Math.min(100, maintainability)),
                issues,
                lastModified: stat.mtimeMs,
            };
        } catch (error) {
            return {
                filePath,
                score: 0,
                complexity: 0,
                maintainability: 0,
                issues: [`Failed to analyze: ${(error as Error).message}`],
                lastModified: Date.now(),
            };
        }
    }

    private calculateComplexity(code: string): number {
        let complexity = 0;

        // Control flow statements add complexity
        const controlFlow = code.match(/\b(if|else if|else|for|while|do|switch|case|catch|finally|\?\?|\?\.|&&|\|\|)\b/g);
        if (controlFlow) complexity += controlFlow.length;

        // Nested functions add complexity
        const nestedFunctions = code.match(/function\s+\w+|=>/g);
        if (nestedFunctions) complexity += nestedFunctions.length * 2;

        // Ternary operators
        const ternaries = code.match(/\?.*:/g);
        if (ternaries) complexity += ternaries.length;

        // Callback chains
        const callbacks = code.match(/\.then\(|\.catch\(|\.finally\(/g);
        if (callbacks) complexity += callbacks.length;

        return complexity;
    }

    private findLongFunctions(code: string): number {
        const functionRegex = /function\s+\w+|const\s+\w+\s*=\s*\(|=>/g;
        let count = 0;
        let match;

        while ((match = functionRegex.exec(code)) !== null) {
            const startLine = code.substring(0, match.index).split("\n").length;
            const remaining = code.substring(match.index);
            const braceCount = (remaining.match(/\{/g) || []).length;
            const estimatedLength = Math.min(braceCount * 5, 200);
            if (estimatedLength > 50) count++;
        }

        return count;
    }

    private calculateMaxNesting(code: string): number {
        let maxDepth = 0;
        let currentDepth = 0;

        for (const ch of code) {
            if (ch === "{") {
                currentDepth++;
                maxDepth = Math.max(maxDepth, currentDepth);
            }
            if (ch === "}") {
                currentDepth--;
            }
        }

        return maxDepth;
    }

    private findDuplicatePatterns(code: string): number {
        const lines = code.split("\n").map((l) => l.trim()).filter((l) => l.length > 20);
        const seen = new Map<string, number>();
        let duplicates = 0;

        for (const line of lines) {
            const count = seen.get(line) || 0;
            if (count === 1) duplicates++;
            seen.set(line, count + 1);
        }

        return duplicates;
    }

    private calculateOverallScore(metrics: HealthMetric[]): number {
        if (metrics.length === 0) return 100;

        const weights: Record<string, number> = {
            "Average Complexity": 0.3,
            "Maintainability Index": 0.3,
            "Technical Debt": 0.2,
            "Large Files": 0.1,
            "Coupling": 0.1,
        };

        let score = 0;
        let totalWeight = 0;

        for (const metric of metrics) {
            const weight = weights[metric.name] || 0.1;
            const normalizedScore = metric.status === "healthy" ? 100 : metric.status === "warning" ? 50 : 20;
            score += normalizedScore * weight;
            totalWeight += weight;
        }

        return Math.round(score / totalWeight);
    }

    private scoreToStatus(score: number): CodeHealthReport["overallStatus"] {
        if (score >= 90) return "excellent";
        if (score >= 70) return "good";
        if (score >= 50) return "fair";
        if (score >= 30) return "poor";
        return "critical";
    }

    private getTrend(metricName: string, currentValue: number): HealthMetric["trend"] {
        if (this.healthHistory.length < 2) return "stable";

        const recent = this.healthHistory.slice(-5);
        const values = recent.map((t) => t.metricScores[metricName] || 0);

        if (values.length < 2) return "stable";

        const first = values[0];
        const last = values[values.length - 1];
        const diff = last - first;

        // For metrics where lower is better (complexity, debt)
        const lowerIsBetter = ["complexity", "debt"].some((k) => metricName.toLowerCase().includes(k));

        if (lowerIsBetter) {
            if (diff < -2) return "improving";
            if (diff > 2) return "degrading";
        } else {
            if (diff > 2) return "improving";
            if (diff < -2) return "degrading";
        }

        return "stable";
    }

    private generatePrescriptions(
        fileHealth: Map<string, FileHealthScore>,
        metrics: HealthMetric[]
    ): HealthPrescription[] {
        const prescriptions: HealthPrescription[] = [];

        // Find files with critical health
        const criticalFiles = Array.from(fileHealth.values()).filter((f) => f.score < 30);
        for (const file of criticalFiles) {
            prescriptions.push({
                id: `rx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
                severity: "high",
                category: "maintainability",
                title: `Critical file health: ${path.basename(file.filePath)}`,
                description: `File ${file.filePath} has a health score of ${file.score}/100. Issues: ${file.issues.join(", ")}`,
                affectedFiles: [file.filePath],
                suggestedAction: "Refactor this file: extract functions, reduce complexity, split into modules",
                estimatedEffort: "hours",
                createdAt: Date.now(),
            });
        }

        // High complexity prescription
        const complexFiles = Array.from(fileHealth.values()).filter((f) => f.complexity > 30);
        if (complexFiles.length > 0) {
            prescriptions.push({
                id: `rx_${Date.now()}_complexity`,
                severity: "medium",
                category: "complexity",
                title: `${complexFiles.length} file(s) with high complexity`,
                description: "These files have cognitive complexity > 30, making them hard to understand and maintain.",
                affectedFiles: complexFiles.map((f) => f.filePath),
                suggestedAction: "Break down complex functions into smaller, focused helpers. Use early returns to reduce nesting.",
                estimatedEffort: "hours",
                createdAt: Date.now(),
            });
        }

        // TODO accumulation
        const todoFiles = Array.from(fileHealth.values()).filter((f) =>
            f.issues.some((i) => i.includes("TODO"))
        );
        if (todoFiles.length > 3) {
            prescriptions.push({
                id: `rx_${Date.now()}_todos`,
                severity: "low",
                category: "debt",
                title: "Accumulating TODO comments",
                description: `${todoFiles.length} files contain TODO/FIXME comments. This indicates growing technical debt.`,
                affectedFiles: todoFiles.map((f) => f.filePath),
                suggestedAction: "Schedule a debt reduction sprint to address TODO items.",
                estimatedEffort: "days",
                createdAt: Date.now(),
            });
        }

        return prescriptions;
    }

    private loadHistory(): void {
        try {
            const filePath = path.join(this.storagePath, "health-history.json");
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                this.healthHistory = data.history || [];
                this.prescriptions = data.prescriptions || [];
                logger.info(`Health history loaded: ${this.healthHistory.length} data points`);
            }
        } catch (error) {
            logger.warn("Failed to load health history:", error);
        }
    }

    private saveHistory(): void {
        try {
            const filePath = path.join(this.storagePath, "health-history.json");
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(
                filePath,
                JSON.stringify({
                    history: this.healthHistory,
                    prescriptions: this.prescriptions,
                }, null, 2),
                "utf-8"
            );
        } catch (error) {
            logger.warn("Failed to save health history:", error);
        }
    }

    dispose(): void {
        this.stopMonitoring();
        this.removeAllListeners();
    }
}