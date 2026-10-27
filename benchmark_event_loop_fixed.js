const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

function collectFiles(dir) {
    let results = [];
    try {
        const list = fs.readdirSync(dir);
        for (const file of list) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat && stat.isDirectory()) {
                results = results.concat(collectFiles(fullPath));
            } else {
                results.push(fullPath);
            }
        }
    } catch(e) {}
    return results;
}

const files = collectFiles(path.join(__dirname, 'node_modules')).slice(0, 1000);

async function measureLag(name, fn) {
    return new Promise(resolve => {
        let maxLag = 0;
        let running = true;
        let lastCheck = performance.now();

        // This simulates background event loop tasks (e.g., UI updates, network requests)
        const checkLag = () => {
            if (!running) return;
            const now = performance.now();
            const lag = now - lastCheck - 10;
            if (lag > maxLag) maxLag = lag;
            lastCheck = now;
            setTimeout(checkLag, 10);
        };

        setTimeout(checkLag, 10);

        // Wait a bit to ensure the interval is running
        setTimeout(() => {
            const start = performance.now();
            // Important: we reset lastCheck right before starting the synchronous blocking operation!
            lastCheck = performance.now();
            Promise.resolve(fn()).then(() => {
                running = false;
                const end = performance.now();

                // Final lag check
                const finalLag = performance.now() - lastCheck - 10;
                if (finalLag > maxLag) maxLag = finalLag;

                resolve({
                    name,
                    wallTime: end - start,
                    maxEventLoopLag: maxLag
                });
            });
        }, 50);
    });
}

function benchFullSync() {
    for (const file of files) {
        try {
            const stat = fs.statSync(file);
            const content = fs.readFileSync(file, "utf-8");
        } catch(e) {}
    }
}

async function benchFullAsync() {
    for (const file of files) {
        try {
            const stat = await fs.promises.stat(file);
            const content = await fs.promises.readFile(file, "utf-8");
        } catch(e) {}
    }
}

async function run() {
    console.log(`Found ${files.length} files to benchmark.`);
    console.log("Measuring event loop lag (which causes UI freezes in VS Code extensions)...");

    // Warmup
    benchFullSync();

    const syncResult = await measureLag('fs.statSync/readFileSync', () => { benchFullSync(); });
    console.log(`[Baseline - Sync] Wall time: ${syncResult.wallTime.toFixed(2)}ms, Max UI Freeze (Event Loop Lag): ${Math.max(0, syncResult.maxEventLoopLag).toFixed(2)}ms`);

    const asyncResult = await measureLag('fs.promises.stat/readFile', async () => { await benchFullAsync(); });
    console.log(`[Optimized - Async] Wall time: ${asyncResult.wallTime.toFixed(2)}ms, Max UI Freeze (Event Loop Lag): ${Math.max(0, asyncResult.maxEventLoopLag).toFixed(2)}ms`);
}

run().catch(console.error);
