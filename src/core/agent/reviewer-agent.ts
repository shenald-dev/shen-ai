import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import { BaseAgent, type AgentTask, type AgentResult, type AgentConfig } from "./base-agent";
import type { AgentRole } from "../../types";

// ============================================================
// SHEN AI — Reviewer Agent
// Specializes in code review, quality assessment, security
// auditing, and best practice enforcement. Provides thorough,
// actionable feedback on code quality.
// ============================================================

const REVIEWER_SYSTEM_PROMPT = `You are SHEN AI's Reviewer Agent — a meticulous code reviewer with expertise in software quality, security, and best practices.

## Your Role
- Perform thorough code reviews with actionable feedback
- Identify security vulnerabilities and suggest fixes
- Enforce coding standards and best practices
- Evaluate code for readability, maintainability, and performance
- Check for common anti-patterns and code smells
- Assess test coverage and quality

## Review Categories
1. **Correctness**: Does the code do what it's supposed to?
2. **Security**: Are there vulnerabilities (XSS, SQL injection, auth bypass, etc.)?
3. **Performance**: Are there bottlenecks, unnecessary computations, or N+1 queries?
4. **Readability**: Is the code clear, well-named, and easy to understand?
5. **Maintainability**: Is it modular, testable, and easy to change?
6. **Error Handling**: Are errors properly caught, logged, and handled?
7. **Testing**: Are there adequate tests? Do they cover edge cases?
8. **Dependencies**: Are dependencies appropriate and up-to-date?

## Severity Levels
- 🔴 **Critical**: Security vulnerability, data loss, or crash — must fix immediately
- 🟠 **High**: Significant bug or design flaw — should fix before merging
- 🟡 **Medium**: Code quality issue or potential problem — fix when convenient
- 🟢 **Low**: Style nitpick or minor improvement — optional

## Output Format
Structure your review as:
1. **Summary**: Overall assessment with a score (1-10)
2. **Critical Issues**: Must-fix items with code examples
3. **High Priority**: Important improvements
4. **Medium Priority**: Quality enhancements
5. **Low Priority**: Style and nitpicks
6. **Positive Notes**: What's done well (always include positives!)
7. **Recommendations**: Specific next steps

## Review Principles
- Be constructive, not destructive
- Explain WHY something is an issue, not just WHAT
- Provide concrete examples of better alternatives
- Acknowledge good code — positive reinforcement matters
- Focus on the code, not the coder
- Prioritize: security > correctness > performance > readability > style`;

export class ReviewerAgent extends BaseAgent {
    constructor(providerRegistry: ProviderRegistry, toolRegistry: ToolRegistry) {
        const config: AgentConfig = {
            role: "reviewer" as AgentRole,
            systemPrompt: REVIEWER_SYSTEM_PROMPT,
            maxIterations: 10,
            temperature: 0.2,
            maxTokens: 8192,
            availableTools: ["read_file", "search_files", "list_files"],
        };
        super(providerRegistry, toolRegistry, config);
    }

    protected buildSystemPrompt(task: AgentTask): string {
        return `${REVIEWER_SYSTEM_PROMPT}

## Current Review Task
${task.description}

${task.context ? `## Review Context\n${task.context}` : ""}
${task.files ? `## Files to Review\n${task.files.join("\n")}` : ""}

Be thorough but constructive. Always include positive feedback alongside issues.`;
    }

    protected buildUserMessage(task: AgentTask): string {
        return `Please review this code thoroughly:

**Review Focus**: ${task.description}
${task.context ? `\n**Context**: ${task.context}` : ""}
${task.files ? `\n**Files**: ${task.files.join(", ")}` : ""}

Please:
1. Read all relevant files
2. Categorize issues by severity (Critical, High, Medium, Low)
3. Provide specific code examples for each issue
4. Suggest concrete fixes
5. Note what's done well
6. Give an overall score (1-10)`;
    }

    /**
     * Perform a full code review on specified files.
     */
    async reviewCode(files: string[], focus?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `review_code_${Date.now()}`,
            description: `Perform a comprehensive code review${focus ? ` focusing on ${focus}` : ""}`,
            files,
            priority: "high",
        });
    }

    /**
     * Security-focused review.
     */
    async securityReview(files: string[]): Promise<AgentResult> {
        return this.executeTask({
            id: `review_security_${Date.now()}`,
            description: "Perform a security-focused code review. Look for: injection vulnerabilities, authentication/authorization issues, data exposure, insecure dependencies, hardcoded secrets, and other security anti-patterns.",
            files,
            priority: "critical",
        });
    }

    /**
     * Performance-focused review.
     */
    async performanceReview(files: string[]): Promise<AgentResult> {
        return this.executeTask({
            id: `review_performance_${Date.now()}`,
            description: "Perform a performance-focused code review. Look for: N+1 queries, unnecessary re-renders, memory leaks, inefficient algorithms, blocking I/O, and other performance bottlenecks.",
            files,
            priority: "high",
        });
    }

    /**
     * Review a pull request / diff.
     */
    async reviewPR(changedFiles: string[], diff?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `review_pr_${Date.now()}`,
            description: "Review this pull request. Evaluate the changes for correctness, quality, security, and adherence to best practices.",
            context: diff ? `Diff:\n${diff}` : undefined,
            files: changedFiles,
            priority: "high",
        });
    }
}