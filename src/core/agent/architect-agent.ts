import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import { BaseAgent, type AgentTask, type AgentResult, type AgentConfig } from "./base-agent";
import type { AgentRole } from "../../types";

// ============================================================
// SHEN AI — Architect Agent
// Specializes in planning, architecture design, and high-level
// system design. Breaks down complex problems into structured
// solutions before coding begins.
// ============================================================

const ARCHITECT_SYSTEM_PROMPT = `You are SHEN AI's Architect Agent — a senior software architect with deep expertise in system design, clean architecture, and scalable patterns.

## Your Role
- Analyze requirements and design system architecture
- Create detailed implementation plans with step-by-step breakdowns
- Identify potential pitfalls and edge cases before they become problems
- Recommend design patterns, architectural styles, and best practices
- Consider scalability, maintainability, security, and performance

## Your Approach
1. **Understand First**: Ask clarifying questions if requirements are ambiguous
2. **Think Holistically**: Consider the entire system, not just the immediate feature
3. **Plan Thoroughly**: Break down complex tasks into clear, actionable steps
4. **Anticipate Problems**: Identify risks, edge cases, and potential bottlenecks
5. **Recommend Patterns**: Suggest appropriate design patterns and architectural styles

## Output Format
When planning, structure your response as:
1. **Analysis**: Understanding of the requirements and constraints
2. **Architecture**: High-level design with components and their relationships
3. **Implementation Plan**: Step-by-step breakdown with file structure
4. **Risks & Mitigations**: Potential issues and how to address them
5. **Recommendations**: Best practices and improvements

## Principles
- Favor simplicity over complexity
- Design for change — systems evolve
- Separate concerns cleanly
- Dependencies should flow inward (clean architecture)
- Testability is a first-class concern
- Document decisions and their rationale`;

export class ArchitectAgent extends BaseAgent {
    constructor(providerRegistry: ProviderRegistry, toolRegistry: ToolRegistry) {
        const config: AgentConfig = {
            role: "architect" as AgentRole,
            systemPrompt: ARCHITECT_SYSTEM_PROMPT,
            maxIterations: 10,
            temperature: 0.3,
            maxTokens: 8192,
            availableTools: ["read_file", "list_files", "search_files"],
        };
        super(providerRegistry, toolRegistry, config);
    }

    protected buildSystemPrompt(task: AgentTask): string {
        return `${ARCHITECT_SYSTEM_PROMPT}

## Current Task
${task.description}

${task.context ? `## Additional Context\n${task.context}` : ""}
${task.files ? `## Relevant Files\n${task.files.join("\n")}` : ""}

Focus on creating a clear, actionable plan. Be thorough but practical.`;
    }

    protected buildUserMessage(task: AgentTask): string {
        return `Please analyze this task and create a detailed architecture plan:

**Task**: ${task.description}
${task.context ? `\n**Context**: ${task.context}` : ""}
${task.files ? `\n**Files**: ${task.files.join(", ")}` : ""}

Provide:
1. Analysis of requirements
2. Proposed architecture/design
3. Step-by-step implementation plan
4. File structure
5. Risks and mitigations`;
    }

    /**
     * Create an implementation plan from a user request.
     */
    async createPlan(userRequest: string, context?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `architect_plan_${Date.now()}`,
            description: userRequest,
            context,
            priority: "high",
        });
    }

    /**
     * Review an existing architecture or code structure.
     */
    async reviewArchitecture(files: string[], context?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `architect_review_${Date.now()}`,
            description: "Review the architecture and code structure of these files. Identify design issues, suggest improvements, and evaluate against best practices.",
            context,
            files,
            priority: "medium",
        });
    }
}