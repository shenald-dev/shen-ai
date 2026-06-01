import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { logger } from "../../utils/logger";
import { generateId } from "../../utils/helpers";

// ============================================================
// SHEN AI — Memory Manager
// Persistent memory system that stores conversations, lessons,
// project context, and user preferences across sessions.
// Uses JSON file storage with structured organization.
// ============================================================

export interface MemoryEntry {
    id: string;
    type: "conversation" | "lesson" | "project_context" | "user_preference" | "code_pattern" | "fact";
    content: string;
    metadata: Record<string, unknown>;
    tags: string[];
    createdAt: number;
    updatedAt: number;
    accessCount: number;
    importance: number; // 0-10
}

export interface ConversationMemory {
    id: string;
    title: string;
    messages: Array<{ role: string; content: string; timestamp: number }>;
    summary?: string;
    keyDecisions?: string[];
    filesModified?: string[];
    tokensUsed: number;
    createdAt: number;
    updatedAt: number;
}

export interface LessonMemory {
    id: string;
    pattern: string;
    rule: string;
    examples: string[];
    source: "correction" | "observation" | "explicit";
    appliedCount: number;
    createdAt: number;
}

export interface ProjectContext {
    id: string;
    workspacePath: string;
    description?: string;
    techStack: string[];
    architecture?: string;
    conventions: string[];
    keyFiles: string[];
    dependencies: string[];
    lastIndexed: number;
}

export interface UserPreference {
    id: string;
    category: string;
    key: string;
    value: unknown;
    source: "explicit" | "inferred";
    confidence: number;
    createdAt: number;
    updatedAt: number;
}

export class MemoryManager {
    private storageDir: string;
    private entries: Map<string, MemoryEntry>;
    private conversations: Map<string, ConversationMemory>;
    private lessons: Map<string, LessonMemory>;
    private projectContexts: Map<string, ProjectContext>;
    private userPreferences: Map<string, UserPreference>;
    private maxEntries: number;
    // Write queue to prevent concurrent file writes (last-write-wins data loss)
    private writeQueue: Promise<void>;

    constructor(storageDir?: string, maxEntries: number = 10000) {
        this.storageDir = storageDir || path.join(os.homedir(), ".shen-ai", "memory");
        this.maxEntries = maxEntries;
        this.entries = new Map();
        this.conversations = new Map();
        this.lessons = new Map();
        this.projectContexts = new Map();
        this.userPreferences = new Map();
        this.writeQueue = Promise.resolve();

        this.ensureStorageDir();
        this.loadAll();
    }

    // --- Entry Management ---

    addEntry(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt" | "accessCount">): MemoryEntry {
        const id = generateId();
        const now = Date.now();

        const fullEntry: MemoryEntry = {
            ...entry,
            id,
            createdAt: now,
            updatedAt: now,
            accessCount: 0,
        };

        this.entries.set(id, fullEntry);
        this.saveEntries();

        // Auto-cleanup if exceeding max
        if (this.entries.size > this.maxEntries) {
            this.cleanup();
        }

        return fullEntry;
    }

    getEntry(id: string): MemoryEntry | undefined {
        const entry = this.entries.get(id);
        if (entry) {
            entry.accessCount++;
            entry.updatedAt = Date.now();
        }
        return entry;
    }

    searchEntries(query: string, type?: MemoryEntry["type"], limit: number = 10): MemoryEntry[] {
        const queryLower = query.toLowerCase();
        const results: MemoryEntry[] = [];

        for (const entry of this.entries.values()) {
            if (type && entry.type !== type) continue;

            const matchesContent = entry.content.toLowerCase().includes(queryLower);
            const matchesTags = entry.tags.some((t) => t.toLowerCase().includes(queryLower));
            const matchesMetadata = JSON.stringify(entry.metadata).toLowerCase().includes(queryLower);

            if (matchesContent || matchesTags || matchesMetadata) {
                results.push(entry);
            }
        }

        // Sort by importance and recency
        results.sort((a, b) => {
            const scoreA = a.importance * 0.6 + (a.accessCount * 0.2) + (a.updatedAt / 1e12 * 0.2);
            const scoreB = b.importance * 0.6 + (b.accessCount * 0.2) + (b.updatedAt / 1e12 * 0.2);
            return scoreB - scoreA;
        });

        return results.slice(0, limit);
    }

    updateEntry(id: string, updates: Partial<MemoryEntry>): boolean {
        const entry = this.entries.get(id);
        if (!entry) return false;

        Object.assign(entry, updates, { updatedAt: Date.now() });
        this.saveEntries();
        return true;
    }

    deleteEntry(id: string): boolean {
        const deleted = this.entries.delete(id);
        if (deleted) this.saveEntries();
        return deleted;
    }

    // --- Conversation Memory ---

    saveConversation(conversation: Omit<ConversationMemory, "id" | "createdAt" | "updatedAt">): ConversationMemory {
        const id = generateId();
        const now = Date.now();

        const full: ConversationMemory = {
            ...conversation,
            id,
            createdAt: now,
            updatedAt: now,
        };

        this.conversations.set(id, full);
        this.saveConversations();
        return full;
    }

    getConversation(id: string): ConversationMemory | undefined {
        return this.conversations.get(id);
    }

    getRecentConversations(limit: number = 10): ConversationMemory[] {
        return Array.from(this.conversations.values())
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limit);
    }

    updateConversationSummary(id: string, summary: string, keyDecisions?: string[]): void {
        const conv = this.conversations.get(id);
        if (conv) {
            conv.summary = summary;
            if (keyDecisions) conv.keyDecisions = keyDecisions;
            conv.updatedAt = Date.now();
            this.saveConversations();
        }
    }

    // --- Lessons ---

    addLesson(lesson: Omit<LessonMemory, "id" | "createdAt">): LessonMemory {
        const id = generateId();
        const full: LessonMemory = {
            ...lesson,
            id,
            createdAt: Date.now(),
        };

        this.lessons.set(id, full);
        this.saveLessons();
        logger.info(`Lesson added: ${lesson.pattern}`);
        return full;
    }

    getLessons(): LessonMemory[] {
        return Array.from(this.lessons.values());
    }

    getLessonsForPattern(pattern: string): LessonMemory[] {
        const patternLower = pattern.toLowerCase();
        return Array.from(this.lessons.values()).filter(
            (l) => l.pattern.toLowerCase().includes(patternLower)
        );
    }

    applyLesson(id: string): void {
        const lesson = this.lessons.get(id);
        if (lesson) {
            lesson.appliedCount++;
            this.saveLessons();
        }
    }

    // --- Project Context ---

    setProjectContext(context: Omit<ProjectContext, "id" | "lastIndexed">): ProjectContext {
        const existing = Array.from(this.projectContexts.values()).find(
            (p) => p.workspacePath === context.workspacePath
        );

        if (existing) {
            Object.assign(existing, context, { lastIndexed: Date.now() });
            this.saveProjectContexts();
            return existing;
        }

        const full: ProjectContext = {
            ...context,
            id: generateId(),
            lastIndexed: Date.now(),
        };

        this.projectContexts.set(full.id, full);
        this.saveProjectContexts();
        return full;
    }

    getProjectContext(workspacePath: string): ProjectContext | undefined {
        return Array.from(this.projectContexts.values()).find(
            (p) => p.workspacePath === workspacePath
        );
    }

    // --- User Preferences ---

    setPreference(category: string, key: string, value: unknown, source: "explicit" | "inferred" = "explicit"): UserPreference {
        const existingKey = `${category}:${key}`;
        const existing = Array.from(this.userPreferences.values()).find(
            (p) => p.category === category && p.key === key
        );

        if (existing) {
            existing.value = value;
            existing.source = source;
            existing.updatedAt = Date.now();
            if (source === "explicit") existing.confidence = 1.0;
            this.saveUserPreferences();
            return existing;
        }

        const pref: UserPreference = {
            id: generateId(),
            category,
            key,
            value,
            source,
            confidence: source === "explicit" ? 1.0 : 0.5,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };

        this.userPreferences.set(pref.id, pref);
        this.saveUserPreferences();
        return pref;
    }

    getPreference<T>(category: string, key: string): T | undefined {
        const pref = Array.from(this.userPreferences.values()).find(
            (p) => p.category === category && p.key === key
        );
        return pref?.value as T | undefined;
    }

    getAllPreferences(category?: string): UserPreference[] {
        const prefs = Array.from(this.userPreferences.values());
        if (category) {
            return prefs.filter((p) => p.category === category);
        }
        return prefs;
    }

    // --- Context Building ---

    /**
     * Build a memory context string to inject into the AI prompt.
     */
    buildMemoryContext(workspacePath?: string, query?: string): string {
        const sections: string[] = [];

        // Project context
        if (workspacePath) {
            const projectCtx = this.getProjectContext(workspacePath);
            if (projectCtx) {
                sections.push("## Project Context");
                if (projectCtx.description) sections.push(`Description: ${projectCtx.description}`);
                if (projectCtx.techStack.length > 0) sections.push(`Tech Stack: ${projectCtx.techStack.join(", ")}`);
                if (projectCtx.conventions.length > 0) sections.push(`Conventions:\n${projectCtx.conventions.map((c) => `- ${c}`).join("\n")}`);
                sections.push("");
            }
        }

        // Relevant lessons
        const lessons = this.getLessons().filter((l) => l.appliedCount > 0 || l.source === "explicit");
        if (lessons.length > 0) {
            sections.push("## Learned Preferences & Patterns");
            for (const lesson of lessons.slice(0, 10)) {
                sections.push(`- ${lesson.rule}`);
            }
            sections.push("");
        }

        // User preferences
        const codingPrefs = this.getAllPreferences("coding");
        if (codingPrefs.length > 0) {
            sections.push("## User Coding Preferences");
            for (const pref of codingPrefs) {
                sections.push(`- ${pref.key}: ${JSON.stringify(pref.value)}`);
            }
            sections.push("");
        }

        // Relevant memories from search
        if (query) {
            const relevant = this.searchEntries(query, undefined, 3);
            if (relevant.length > 0) {
                sections.push("## Relevant Past Context");
                for (const entry of relevant) {
                    sections.push(`- ${entry.content.substring(0, 200)}`);
                }
                sections.push("");
            }
        }

        return sections.join("\n");
    }

    // --- Stats ---

    getStats(): {
        totalEntries: number;
        conversations: number;
        lessons: number;
        projectContexts: number;
        userPreferences: number;
        storageSize: string;
    } {
        let totalSize = 0;
        for (const file of ["entries.json", "conversations.json", "lessons.json", "projects.json", "preferences.json"]) {
            const filePath = path.join(this.storageDir, file);
            if (fs.existsSync(filePath)) {
                totalSize += fs.statSync(filePath).size;
            }
        }

        return {
            totalEntries: this.entries.size,
            conversations: this.conversations.size,
            lessons: this.lessons.size,
            projectContexts: this.projectContexts.size,
            userPreferences: this.userPreferences.size,
            storageSize: this.formatBytes(totalSize),
        };
    }

    // --- Cleanup ---

    clearAll(): void {
        this.entries.clear();
        this.conversations.clear();
        this.lessons.clear();
        this.projectContexts.clear();
        this.userPreferences.clear();
        this.saveAll();
        logger.info("All memory cleared.");
    }

    // --- Private Methods ---

    private ensureStorageDir(): void {
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    private loadAll(): void {
        this.loadJson("entries.json", (data) => {
            if (Array.isArray(data)) {
                for (const entry of data) {
                    this.entries.set(entry.id, entry as MemoryEntry);
                }
            }
        });
        this.loadJson("conversations.json", (data) => {
            if (Array.isArray(data)) {
                for (const conv of data) {
                    this.conversations.set(conv.id, conv as ConversationMemory);
                }
            }
        });
        this.loadJson("lessons.json", (data) => {
            if (Array.isArray(data)) {
                for (const lesson of data) {
                    this.lessons.set(lesson.id, lesson as LessonMemory);
                }
            }
        });
        this.loadJson("projects.json", (data) => {
            if (Array.isArray(data)) {
                for (const project of data) {
                    this.projectContexts.set(project.id, project as ProjectContext);
                }
            }
        });
        this.loadJson("preferences.json", (data) => {
            if (Array.isArray(data)) {
                for (const pref of data) {
                    this.userPreferences.set(pref.id, pref as UserPreference);
                }
            }
        });

        logger.info(`Memory loaded: ${this.entries.size} entries, ${this.conversations.size} conversations, ${this.lessons.size} lessons`);
    }

    private saveAll(): void {
        this.saveEntries();
        this.saveConversations();
        this.saveLessons();
        this.saveProjectContexts();
        this.saveUserPreferences();
    }

    private saveEntries(): void {
        this.saveJson("entries.json", Array.from(this.entries.values()));
    }

    private saveConversations(): void {
        this.saveJson("conversations.json", Array.from(this.conversations.values()));
    }

    private saveLessons(): void {
        this.saveJson("lessons.json", Array.from(this.lessons.values()));
    }

    private saveProjectContexts(): void {
        this.saveJson("projects.json", Array.from(this.projectContexts.values()));
    }

    private saveUserPreferences(): void {
        this.saveJson("preferences.json", Array.from(this.userPreferences.values()));
    }

    /**
     * Queued file write — ensures writes are serialized to prevent
     * concurrent write interleaving (last-write-wins data loss).
     */
    private saveJson(filename: string, data: unknown): void {
        // Chain onto the write queue so writes happen sequentially
        this.writeQueue = this.writeQueue.then(async () => {
            try {
                const filePath = path.join(this.storageDir, filename);
                // Atomic write: temp file + rename
                const tempPath = filePath + ".tmp";
                fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
                fs.renameSync(tempPath, filePath);
            } catch (error) {
                logger.error(`Failed to save ${filename}:`, error);
                // Clean up temp file on failure
                try {
                    const tempPath = path.join(this.storageDir, filename + ".tmp");
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch { /* ignore */ }
            }
        }).catch((err) => {
            // Prevent queue from dying on error
            logger.error(`Write queue error for ${filename}:`, err);
        });
    }

    private loadJson(filename: string, callback: (data: unknown) => void): void {
        try {
            const filePath = path.join(this.storageDir, filename);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, "utf-8");
                callback(JSON.parse(content));
            }
        } catch (error) {
            logger.error(`Failed to load ${filename}:`, error);
        }
    }

    private cleanup(): void {
        // Remove least important/oldest entries
        const sorted = Array.from(this.entries.values()).sort((a, b) => {
            const scoreA = a.importance * 0.5 + (a.accessCount * 0.3) + (a.updatedAt / 1e12 * 0.2);
            const scoreB = b.importance * 0.5 + (b.accessCount * 0.3) + (b.updatedAt / 1e12 * 0.2);
            return scoreA - scoreB;
        });

        const toRemove = sorted.slice(0, Math.floor(this.maxEntries * 0.1));
        for (const entry of toRemove) {
            this.entries.delete(entry.id);
        }

        this.saveEntries();
        logger.info(`Memory cleanup: removed ${toRemove.length} entries`);
    }

    private formatBytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    }
}