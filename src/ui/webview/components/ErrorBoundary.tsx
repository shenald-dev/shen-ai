import React, { Component, type ErrorInfo, type ReactNode } from "react";

// ============================================================
// SHEN AI — Error Boundary Component
// Catches React errors in the webview and displays a friendly
// error message instead of crashing the entire UI.
// ============================================================

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): State {
        return {
            hasError: true,
            error,
            errorInfo: null,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        this.setState({ errorInfo });

        // Notify parent
        this.props.onError?.(error, errorInfo);

        // Send error to extension
        const vscode = (window as any).acquireVsCodeApi?.();
        if (vscode) {
            vscode.postMessage({
                action: "error/webview",
                payload: {
                    message: error.message,
                    stack: error.stack,
                    componentStack: errorInfo.componentStack,
                },
            });
        }
    }

    handleReset = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div style={{
                    padding: "20px",
                    margin: "10px",
                    borderRadius: "8px",
                    backgroundColor: "var(--vscode-inputValidation-errorBackground, #5a1d1d)",
                    border: "1px solid var(--vscode-inputValidation-errorBorder, #be1100)",
                    color: "var(--vscode-errorForeground, #f48771)",
                    fontFamily: "var(--vscode-font-family, sans-serif)",
                    fontSize: "var(--vscode-font-size, 13px)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                        <span style={{ fontSize: "20px" }}>⚠️</span>
                        <strong>Something went wrong in SHEN AI</strong>
                    </div>
                    <div style={{
                        padding: "12px",
                        borderRadius: "4px",
                        backgroundColor: "rgba(0,0,0,0.2)",
                        fontFamily: "var(--vscode-editor-font-family, monospace)",
                        fontSize: "12px",
                        overflow: "auto",
                        maxHeight: "200px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                    }}>
                        {this.state.error?.message || "Unknown error"}
                    </div>
                    <button
                        onClick={this.handleReset}
                        style={{
                            marginTop: "12px",
                            padding: "6px 16px",
                            borderRadius: "4px",
                            border: "none",
                            backgroundColor: "var(--vscode-button-background, #0e639c)",
                            color: "var(--vscode-button-foreground, #ffffff)",
                            cursor: "pointer",
                            fontSize: "12px",
                        }}
                    >
                        Try Again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}