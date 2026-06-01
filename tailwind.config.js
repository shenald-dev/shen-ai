/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/ui/webview/**/*.{ts,tsx,html}"],
    theme: {
        extend: {
            colors: {
                vscode: {
                    bg: "var(--vscode-editor-background)",
                    fg: "var(--vscode-editor-foreground)",
                    sidebar: "var(--vscode-sideBar-background)",
                    inputBg: "var(--vscode-input-background)",
                    inputFg: "var(--vscode-input-foreground)",
                    inputBorder: "var(--vscode-input-border)",
                    buttonBg: "var(--vscode-button-background)",
                    buttonHoverBg: "var(--vscode-button-hoverBackground)",
                    buttonFg: "var(--vscode-button-foreground)",
                    accent: "var(--vscode-focusBorder)",
                    border: "var(--vscode-panel-border)",
                    success: "var(--vscode-terminal-ansiGreen)",
                    error: "var(--vscode-errorForeground)",
                    warning: "var(--vscode-editorWarning-foreground)",
                    info: "var(--vscode-editorInfo-foreground)",
                    selection: "var(--vscode-editor-selectionBackground)",
                    lineHighlight: "var(--vscode-editor-lineHighlightBackground)",
                },
            },
            fontFamily: {
                vscode: ["var(--vscode-font-family)", "sans-serif"],
                code: ["var(--vscode-editor-font-family)", "monospace"],
            },
            fontSize: {
                vscode: "var(--vscode-font-size)",
            },
            animation: {
                "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                "fade-in": "fadeIn 0.3s ease-in-out",
                "slide-up": "slideUp 0.3s ease-out",
                "slide-down": "slideDown 0.3s ease-out",
                "typing": "typing 1.5s infinite",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0" },
                    "100%": { opacity: "1" },
                },
                slideUp: {
                    "0%": { transform: "translateY(10px)", opacity: "0" },
                    "100%": { transform: "translateY(0)", opacity: "1" },
                },
                slideDown: {
                    "0%": { transform: "translateY(-10px)", opacity: "0" },
                    "100%": { transform: "translateY(0)", opacity: "1" },
                },
                typing: {
                    "0%, 60%, 100%": { opacity: "0.3" },
                    "30%": { opacity: "1" },
                },
            },
        },
    },
    plugins: [],
    important: true,
    corePlugins: {
        preflight: false,
    },
};