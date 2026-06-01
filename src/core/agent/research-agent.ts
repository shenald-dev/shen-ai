import type { ProviderRegistry } from "../providers/provider-registry";
import type { ToolRegistry } from "../tools/tool-registry";
import { BaseAgent, type AgentTask, type AgentResult, type AgentConfig } from "./base-agent";
import type { AgentRole } from "../../types";

// ============================================================
// SHEN AI — Research Agent
// Specializes in documentation lookup, API research, best
// practice investigation, and technology evaluation. Gathers
// information to inform development decisions.
// ============================================================

const RESEARCH_SYSTEM_PROMPT = `You are SHEN AI's Research Agent — an expert at finding, synthesizing, and applying technical information.

## Your Role
- Research APIs, libraries, frameworks, and tools
- Find documentation and examples for specific technologies
- Evaluate technology choices and compare alternatives
- Investigate best practices and industry standards
- Summarize complex technical topics clearly
- Find solutions to specific technical problems

## Your Approach
1. **Search Thoroughly**: Use search tools to find relevant information in the codebase
2. **Synthesize**: Combine information from multiple sources into coherent answers
3. **Verify**: Cross-reference information when possible
4. **Cite Sources**: Always reference where information came from
5. **Be Practical**: Focus on actionable, applicable information
6. **Stay Current**: Prefer recent information and modern approaches

## Research Categories
- **API Documentation**: How to use specific libraries and services
- **Best Practices**: Industry-standard approaches and patterns
- **Technology Comparison**: Evaluating alternatives (e.g., React vs Vue, PostgreSQL vs MongoDB)
- **Problem Solving**: Finding solutions to specific technical challenges
- **Learning Resources**: Tutorials, guides, and educational content
- **Version/Compatibility**: Checking version requirements and compatibility

## Output Format
Structure research findings as:
1. **Summary**: Direct answer to the question
2. **Key Findings**: Important discoveries with sources
3. **Code Examples**: Practical, working examples
4. **Alternatives**: Other approaches with pros/cons
5. **Recommendations**: What to use and why
6. **References**: Links and sources for further reading

## Research Principles
- Prefer official documentation over blog posts
- Check version compatibility before recommending
- Include working code examples, not just theory
- Note caveats, limitations, and gotchas
- Distinguish between facts and opinions
- When uncertain, say so and suggest how to verify`;

export class ResearchAgent extends BaseAgent {
    constructor(providerRegistry: ProviderRegistry, toolRegistry: ToolRegistry) {
        const config: AgentConfig = {
            role: "researcher" as AgentRole,
            systemPrompt: RESEARCH_SYSTEM_PROMPT,
            maxIterations: 10,
            temperature: 0.4,
            maxTokens: 8192,
            availableTools: ["read_file", "search_files", "list_files", "execute_command"],
        };
        super(providerRegistry, toolRegistry, config);
    }

    protected buildSystemPrompt(task: AgentTask): string {
        return `${RESEARCH_SYSTEM_PROMPT}

## Current Research Task
${task.description}

${task.context ? `## Research Context\n${task.context}` : ""}
${task.files ? `## Relevant Files\n${task.files.join("\n")}` : ""}

Be thorough, cite sources, and provide practical examples.`;
    }

    protected buildUserMessage(task: AgentTask): string {
        return `Research this topic:

**Question**: ${task.description}
${task.context ? `\n**Context**: ${task.context}` : ""}
${task.files ? `\n**Codebase Files**: ${task.files.join(", ")}` : ""}

Please:
1. Search the codebase for relevant code and patterns
2. Provide a comprehensive answer with examples
3. Cite sources and references
4. Suggest best practices and alternatives`;
    }

    /**
     * Research a specific technology or API.
     */
    async researchTechnology(technology: string, question?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `research_tech_${Date.now()}`,
            description: `Research ${technology}${question ? `: ${question}` : ". Provide an overview, key features, common patterns, and best practices."}`,
            priority: "medium",
        });
    }

    /**
     * Find how something is implemented in the codebase.
     */
    async findImplementation(concept: string, files?: string[]): Promise<AgentResult> {
        return this.executeTask({
            id: `research_impl_${Date.now()}`,
            description: `Find and explain how "${concept}" is implemented in this codebase. Search for relevant code, trace the implementation, and provide a clear explanation.`,
            files,
            priority: "medium",
        });
    }

    /**
     * Compare technology alternatives.
     */
    async compareTechnologies(options: string[], criteria?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `research_compare_${Date.now()}`,
            description: `Compare these technologies: ${options.join(" vs ")}. Evaluate based on: ${criteria || "performance, developer experience, ecosystem, learning curve, and suitability for typical web applications"}. Provide a recommendation.`,
            priority: "medium",
        });
    }

    /**
     * Investigate a specific error or problem.
     */
    async investigateProblem(problem: string, context?: string): Promise<AgentResult> {
        return this.executeTask({
            id: `research_problem_${Date.now()}`,
            description: `Investigate this problem: ${problem}. Find the cause, possible solutions, and recommended fix.`,
            context,
            priority: "high",
        });
    }
}