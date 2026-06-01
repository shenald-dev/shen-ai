// ============================================================
// SHEN AI — VS Code API Singleton
// VS Code's acquireVsCodeApi() can only be called once per
// window context. This module ensures all components share
// the same instance.
// ============================================================

interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare global {
    interface Window {
        acquireVsCodeApi(): VsCodeApi;
    }
}

let vscodeInstance: VsCodeApi | null = null;

export function getVsCodeApi(): VsCodeApi | null {
    if (!vscodeInstance) {
        if (typeof window !== "undefined" && typeof window.acquireVsCodeApi === "function") {
            vscodeInstance = window.acquireVsCodeApi();
        }
    }
    return vscodeInstance;
}

export function postMessage(message: unknown): void {
    const api = getVsCodeApi();
    if (api) {
        api.postMessage(message);
    }
}