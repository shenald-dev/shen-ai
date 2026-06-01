const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");

const isWatch = process.argv.includes("--watch");
const isProduction = !isWatch;

// Extension build (Node.js target)
const extensionConfig = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    outfile: "dist/extension.js",
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    target: "node18",
    sourcemap: isProduction ? "external" : true,
    treeShaking: true,
    minify: isProduction,
    define: {
        "process.env.NODE_ENV": JSON.stringify(isWatch ? "development" : "production"),
    },
    plugins: [
        {
            name: "copy-codicons",
            setup(build) {
                build.onEnd(() => {
                    const codiconsDir = path.join(
                        __dirname,
                        "node_modules",
                        "@vscode",
                        "codicons",
                        "dist"
                    );
                    const outDir = path.join(__dirname, "dist", "codicons");
                    if (fs.existsSync(codiconsDir)) {
                        if (!fs.existsSync(outDir)) {
                            fs.mkdirSync(outDir, { recursive: true });
                        }
                        fs.copyFileSync(
                            path.join(codiconsDir, "codicon.css"),
                            path.join(outDir, "codicon.css")
                        );
                        fs.copyFileSync(
                            path.join(codiconsDir, "codicon.ttf"),
                            path.join(outDir, "codicon.ttf")
                        );
                    }
                });
            },
        },
    ],
};

// Webview build (Browser target)
const webviewConfig = {
    entryPoints: ["src/ui/webview/index.tsx"],
    bundle: true,
    outfile: "dist/webview.js",
    format: "iife",
    platform: "browser",
    target: "chrome100",
    sourcemap: isWatch,
    treeShaking: true,
    minify: isProduction,
    jsx: "automatic",
    define: {
        "process.env.NODE_ENV": JSON.stringify(isWatch ? "development" : "production"),
    },
    loader: {
        ".css": "css",
        ".svg": "dataurl",
        ".png": "dataurl",
        ".woff": "dataurl",
        ".woff2": "dataurl",
        ".ttf": "dataurl",
    },
};

async function build() {
    try {
        if (isWatch) {
            console.log("[esbuild] Starting watch mode...");

            const extCtx = await esbuild.context(extensionConfig);
            const webCtx = await esbuild.context(webviewConfig);

            await Promise.all([extCtx.watch(), webCtx.watch()]);

            console.log("[esbuild] Watching for changes...");
        } else {
            console.log("[esbuild] Building extension...");
            await esbuild.build(extensionConfig);
            console.log("[esbuild] Extension built successfully.");

            console.log("[esbuild] Building webview...");
            await esbuild.build(webviewConfig);
            console.log("[esbuild] Webview built successfully.");
        }
    } catch (error) {
        console.error("[esbuild] Build failed:", error);
        process.exit(1);
    }
}

build();