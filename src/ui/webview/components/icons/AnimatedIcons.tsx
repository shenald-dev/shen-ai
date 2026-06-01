import React from "react";

// ============================================================
// SHEN AI — Animated SVG Icon System
// Every tool operation gets a unique, animated icon
// ============================================================

interface IconProps {
    size?: number;
    color?: string;
    animated?: boolean;
}

const defaultProps = { size: 16, animated: true };

// --- Read File: Scanning document ---
export function ReadFileIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="2" width="16" height="20" rx="2" stroke={c} strokeWidth="1.5" fill="none" />
            <line x1="8" y1="7" x2="16" y2="7" stroke={c} strokeWidth="1.2" opacity="0.5" />
            <line x1="8" y1="10" x2="14" y2="10" stroke={c} strokeWidth="1.2" opacity="0.5" />
            <line x1="8" y1="13" x2="15" y2="13" stroke={c} strokeWidth="1.2" opacity="0.5" />
            <line x1="8" y1="16" x2="12" y2="16" stroke={c} strokeWidth="1.2" opacity="0.5" />
            {animated && (
                <rect x="4" y="2" width="16" height="2" rx="0" fill={c} opacity="0.3">
                    <animate attributeName="y" values="2;20;2" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.4;0.15;0.4" dur="2s" repeatCount="indefinite" />
                </rect>
            )}
        </svg>
    );
}

// --- Write File: Pen writing with ink ---
export function WriteFileIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 20H4C3.45 20 3 19.55 3 19V5C3 4.45 3.45 4 4 4H11L13 6H20C20.55 6 21 6.45 21 7V19C21 19.55 20.55 20 20 20H12Z" stroke={c} strokeWidth="1.5" fill="none" />
            {animated ? (
                <g>
                    <line x1="7" y1="10" x2="7" y2="10" stroke={c} strokeWidth="1.2" strokeLinecap="round">
                        <animate attributeName="x2" values="7;17;7" dur="2.5s" repeatCount="indefinite" />
                    </line>
                    <line x1="7" y1="13" x2="7" y2="13" stroke={c} strokeWidth="1.2" strokeLinecap="round">
                        <animate attributeName="x2" values="7;15;7" dur="2.5s" begin="0.4s" repeatCount="indefinite" />
                    </line>
                    <line x1="7" y1="16" x2="7" y2="16" stroke={c} strokeWidth="1.2" strokeLinecap="round">
                        <animate attributeName="x2" values="7;13;7" dur="2.5s" begin="0.8s" repeatCount="indefinite" />
                    </line>
                </g>
            ) : (
                <>
                    <line x1="7" y1="10" x2="17" y2="10" stroke={c} strokeWidth="1.2" />
                    <line x1="7" y1="13" x2="15" y2="13" stroke={c} strokeWidth="1.2" />
                    <line x1="7" y1="16" x2="13" y2="16" stroke={c} strokeWidth="1.2" />
                </>
            )}
        </svg>
    );
}

// --- Replace/Edit File: Search-replace sweep ---
export function ReplaceFileIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke={c} strokeWidth="1.5" fill="none" />
            <path d="M9 8L15 8" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
            <path d="M9 12L15 12" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
            <path d="M9 16L13 16" stroke={c} strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
            {animated && (
                <rect x="3" y="7" width="18" height="3" rx="1" fill={c} opacity="0.15">
                    <animate attributeName="y" values="7;11;15;7" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.2;0.15;0.2;0.2" dur="2s" repeatCount="indefinite" />
                </rect>
            )}
            <path d="M16 14L19 17L16 20" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {animated && <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />}
            </path>
        </svg>
    );
}

// --- Search Files: Magnifying glass with scan beam ---
export function SearchFilesIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="6" stroke={c} strokeWidth="1.5" fill="none" />
            <line x1="14.5" y1="14.5" x2="20" y2="20" stroke={c} strokeWidth="2" strokeLinecap="round" />
            {animated && (
                <line x1="7" y1="10" x2="13" y2="10" stroke={c} strokeWidth="1" opacity="0.5">
                    <animate attributeName="y1" values="7;13;7" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="y2" values="7;13;7" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.2;0.6" dur="1.5s" repeatCount="indefinite" />
                </line>
            )}
        </svg>
    );
}

// --- List Files: Folder opening ---
export function ListFilesIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6C3 5.45 3.45 5 4 5H9L11 7H20C20.55 7 21 7.45 21 8V18C21 18.55 20.55 19 20 19H4C3.45 19 3 18.55 3 18V6Z" stroke={c} strokeWidth="1.5" fill="none" />
            {animated && (
                <path d="M3 8H21V18C21 18.55 20.55 19 20 19H4C3.45 19 3 18.55 3 18V8Z" fill={c} opacity="0.08">
                    <animate attributeName="opacity" values="0.08;0.15;0.08" dur="2s" repeatCount="indefinite" />
                </path>
            )}
            {animated && (
                <>
                    <rect x="7" y="11" width="4" height="1.5" rx="0.5" fill={c} opacity="0.4">
                        <animate attributeName="opacity" values="0;0.5;0.5" dur="1.5s" repeatCount="indefinite" />
                    </rect>
                    <rect x="7" y="14" width="6" height="1.5" rx="0.5" fill={c} opacity="0.4">
                        <animate attributeName="opacity" values="0;0.5;0.5" dur="1.5s" begin="0.3s" repeatCount="indefinite" />
                    </rect>
                </>
            )}
        </svg>
    );
}

// --- Execute Command: Terminal with typing cursor ---
export function ExecuteCommandIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke={c} strokeWidth="1.5" fill="none" />
            <path d="M7 9L10 12L7 15" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            {animated ? (
                <line x1="12" y1="15" x2="16" y2="15" stroke={c} strokeWidth="1.5" strokeLinecap="round">
                    <animate attributeName="opacity" values="1;0;1" dur="0.8s" repeatCount="indefinite" />
                </line>
            ) : (
                <line x1="12" y1="15" x2="16" y2="15" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
            )}
        </svg>
    );
}

// --- Apply Diff: Green/red diff highlights ---
export function ApplyDiffIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke={c} strokeWidth="1.5" fill="none" />
            <line x1="12" y1="3" x2="12" y2="21" stroke={c} strokeWidth="0.5" opacity="0.3" />
            <rect x="4" y="7" width="7" height="2" rx="0.5" fill="#ef4444" opacity="0.4" />
            <rect x="13" y="7" width="7" height="2" rx="0.5" fill="#22c55e" opacity="0.4" />
            {animated ? (
                <>
                    <rect x="4" y="11" width="7" height="2" rx="0.5" fill="#ef4444" opacity="0">
                        <animate attributeName="opacity" values="0;0.4;0.4" dur="1.5s" begin="0.3s" repeatCount="indefinite" />
                    </rect>
                    <rect x="13" y="11" width="7" height="2" rx="0.5" fill="#22c55e" opacity="0">
                        <animate attributeName="opacity" values="0;0.4;0.4" dur="1.5s" begin="0.3s" repeatCount="indefinite" />
                    </rect>
                    <rect x="4" y="15" width="7" height="2" rx="0.5" fill="#ef4444" opacity="0">
                        <animate attributeName="opacity" values="0;0.4;0.4" dur="1.5s" begin="0.6s" repeatCount="indefinite" />
                    </rect>
                    <rect x="13" y="15" width="7" height="2" rx="0.5" fill="#22c55e" opacity="0">
                        <animate attributeName="opacity" values="0;0.4;0.4" dur="1.5s" begin="0.6s" repeatCount="indefinite" />
                    </rect>
                </>
            ) : (
                <>
                    <rect x="4" y="11" width="7" height="2" rx="0.5" fill="#ef4444" opacity="0.4" />
                    <rect x="13" y="11" width="7" height="2" rx="0.5" fill="#22c55e" opacity="0.4" />
                </>
            )}
        </svg>
    );
}

// --- Multi-File Read: Stacked documents ---
export function MultiFileIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="2" width="14" height="16" rx="2" stroke={c} strokeWidth="1.2" fill="none" opacity="0.3" />
            <rect x="5" y="4" width="14" height="16" rx="2" stroke={c} strokeWidth="1.2" fill="none" opacity="0.5" />
            <rect x="4" y="6" width="14" height="16" rx="2" stroke={c} strokeWidth="1.5" fill="none" />
            {animated && (
                <rect x="4" y="6" width="14" height="3" rx="0" fill={c} opacity="0.2">
                    <animate attributeName="y" values="6;19;6" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.25;0.1;0.25" dur="2s" repeatCount="indefinite" />
                </rect>
            )}
        </svg>
    );
}

// --- Thinking: Brain with pulse ---
export function ThinkingIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8 2 5 5 5 8.5C5 10.5 5.8 12.2 7 13.5V17C7 17.55 7.45 18 8 18H16C16.55 18 17 17.55 17 17V13.5C18.2 12.2 19 10.5 19 8.5C19 5 16 2 12 2Z" stroke={c} strokeWidth="1.5" fill="none" />
            <path d="M9 21H15" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M10 18V21" stroke={c} strokeWidth="1" opacity="0.5" />
            <path d="M14 18V21" stroke={c} strokeWidth="1" opacity="0.5" />
            {animated && (
                <circle cx="12" cy="9" r="3" fill={c} opacity="0.15">
                    <animate attributeName="r" values="2;4;2" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.2;0.08;0.2" dur="2s" repeatCount="indefinite" />
                </circle>
            )}
        </svg>
    );
}

// --- Checkmark: Animated completion ---
export function CheckIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "#22c55e";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
            <path d="M8 12L11 15L16 9" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={animated ? "20" : "0"}
                strokeDashoffset={animated ? "0" : "0"}
            >
                {animated && (
                    <animate attributeName="stroke-dashoffset" values="20;0" dur="0.5s" fill="freeze" />
                )}
            </path>
        </svg>
    );
}

// --- Error: X mark ---
export function ErrorIcon({ size = 16, color }: IconProps): JSX.Element {
    const c = color || "#ef4444";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
            <path d="M9 9L15 15M15 9L9 15" stroke={c} strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

// --- Undo: Curved arrow ---
export function UndoIcon({ size = 16, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 10C4 10 7 5 13 5C17.97 5 22 9.03 22 14C22 18.97 17.97 23 13 23H8" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M7 7L3 10L7 13" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    );
}

// --- Restore: Clock with arrow ---
export function RestoreIcon({ size = 16, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
            <path d="M12 7V12L15 15" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 12C3 7.03 7.03 3 12 3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
        </svg>
    );
}

// --- Spinner: Loading spinner ---
export function SpinnerIcon({ size = 16, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ animation: "spin 0.8s linear infinite" }}>
            <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="2" opacity="0.2" fill="none" />
            <path d="M12 3C16.97 3 21 7.03 21 12" stroke={c} strokeWidth="2" strokeLinecap="round" fill="none" />
        </svg>
    );
}

// --- Ask Question: Speech bubble with ? ---
export function AskQuestionIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 12C21 16.42 16.97 20 12 20C10.83 20 9.71 19.8 8.67 19.42L3 21L4.58 15.33C4.2 14.29 4 13.17 4 12C4 7.58 8.03 4 13 4C17.97 4 21 7.58 21 12Z" stroke={c} strokeWidth="1.5" fill="none" />
            <text x="12" y="15" textAnchor="middle" fill={c} fontSize="10" fontWeight="bold">?</text>
            {animated && (
                <circle cx="12" cy="12" r="10" stroke={c} strokeWidth="0.5" fill="none" opacity="0">
                    <animate attributeName="r" values="10;13;10" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                </circle>
            )}
        </svg>
    );
}

// --- Completion: Trophy/flag ---
export function CompletionIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "#22c55e";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 3V21" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M5 3L19 8L5 13" stroke={c} strokeWidth="1.5" strokeLinejoin="round" fill={animated ? "none" : c} fillOpacity="0.1">
                {animated && (
                    <animate attributeName="fill-opacity" values="0.05;0.15;0.05" dur="2s" repeatCount="indefinite" />
                )}
            </path>
        </svg>
    );
}

// --- Web Search: Globe with scan ---
export function WebSearchIcon({ size = 16, animated = true, color }: IconProps): JSX.Element {
    const c = color || "currentColor";
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5" fill="none" />
            <ellipse cx="12" cy="12" rx="4" ry="9" stroke={c} strokeWidth="1" fill="none" opacity="0.5" />
            <line x1="3" y1="12" x2="21" y2="12" stroke={c} strokeWidth="1" opacity="0.5" />
            {animated && (
                <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="0.8" fill="none" strokeDasharray="4 4">
                    <animateTransform attributeName="transform" type="rotate" values="0 12 12;360 12 12" dur="8s" repeatCount="indefinite" />
                </circle>
            )}
        </svg>
    );
}

// --- Map of tool names to animated icon components ---
export const TOOL_ICON_MAP: Record<string, React.FC<IconProps>> = {
    read_file: ReadFileIcon,
    view_file: ReadFileIcon,
    write_to_file: WriteFileIcon,
    replace_in_file: ReplaceFileIcon,
    replace_file_content: ReplaceFileIcon,
    multi_replace_file_content: ReplaceFileIcon,
    apply_diff: ApplyDiffIcon,
    list_files: ListFilesIcon,
    list_dir: ListFilesIcon,
    search_files: SearchFilesIcon,
    grep_search: SearchFilesIcon,
    execute_command: ExecuteCommandIcon,
    run_command: ExecuteCommandIcon,
    ask_followup_question: AskQuestionIcon,
    attempt_completion: CompletionIcon,
    search_web: WebSearchIcon,
    read_multiple_files: MultiFileIcon,
};

// Get icon component for a tool name, with fallback
export function getToolIcon(toolName: string, animated: boolean = true): JSX.Element {
    const IconComponent = TOOL_ICON_MAP[toolName];
    if (IconComponent) {
        return <IconComponent size={14} animated={animated} />;
    }
    // Fallback: generic gear
    return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M12 1V4M12 20V23M4.22 4.22L6.34 6.34M17.66 17.66L19.78 19.78M1 12H4M20 12H23M4.22 19.78L6.34 17.66M17.66 6.34L19.78 4.22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}