import { performance } from "perf_hooks";

interface FileHealthScore {
    score: number;
    complexity: number;
    maintainability: number;
    issues: string[];
}

const fileHealth = new Map<string, FileHealthScore>();
for (let i = 0; i < 100000; i++) {
    fileHealth.set(`file${i}.ts`, {
        score: Math.random() * 100,
        complexity: Math.random() * 50,
        maintainability: Math.random() * 100,
        issues: i % 10 === 0 ? ["issue1"] : []
    });
}

function runUnoptimized() {
    const scores = Array.from(fileHealth.values()).map((f) => f.score);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 100;

    const avgComplexity = scores.length > 0
        ? Array.from(fileHealth.values()).reduce((sum, f) => sum + f.complexity, 0) / scores.length
        : 0;

    const avgMaintainability = scores.length > 0
        ? Array.from(fileHealth.values()).reduce((sum, f) => sum + f.maintainability, 0) / scores.length
        : 100;

    const totalIssues = Array.from(fileHealth.values()).reduce((sum, f) => sum + f.issues.length, 0);
    const debtScore = Math.min(totalIssues * 2, 100);

    return { avgScore, avgComplexity, avgMaintainability, debtScore };
}

function runOptimized() {
    const fileHealthValues = Array.from(fileHealth.values());
    const length = fileHealthValues.length;

    const avgScore = length > 0 ? fileHealthValues.reduce((sum, f) => sum + f.score, 0) / length : 100;

    const avgComplexity = length > 0
        ? fileHealthValues.reduce((sum, f) => sum + f.complexity, 0) / length
        : 0;

    const avgMaintainability = length > 0
        ? fileHealthValues.reduce((sum, f) => sum + f.maintainability, 0) / length
        : 100;

    const totalIssues = fileHealthValues.reduce((sum, f) => sum + f.issues.length, 0);
    const debtScore = Math.min(totalIssues * 2, 100);

    return { avgScore, avgComplexity, avgMaintainability, debtScore };
}

function runUltraOptimized() {
    const fileHealthValues = Array.from(fileHealth.values());
    const length = fileHealthValues.length;

    if (length === 0) {
        return { avgScore: 100, avgComplexity: 0, avgMaintainability: 100, debtScore: 0 };
    }

    let sumScore = 0;
    let sumComplexity = 0;
    let sumMaintainability = 0;
    let totalIssues = 0;

    for (let i = 0; i < length; i++) {
        const f = fileHealthValues[i];
        sumScore += f.score;
        sumComplexity += f.complexity;
        sumMaintainability += f.maintainability;
        totalIssues += f.issues.length;
    }

    const avgScore = sumScore / length;
    const avgComplexity = sumComplexity / length;
    const avgMaintainability = sumMaintainability / length;
    const debtScore = Math.min(totalIssues * 2, 100);

    return { avgScore, avgComplexity, avgMaintainability, debtScore };
}

function measure(name: string, fn: () => any) {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        fn();
    }
    const end = performance.now();
    console.log(`${name}: ${end - start}ms`);
}

measure("Unoptimized", runUnoptimized);
measure("Optimized", runOptimized);
measure("UltraOptimized", runUltraOptimized);
