const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

// Simulate what collectFiles does - just getting a list of files
function collectFiles(dir) {
    let results = [];
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
    return results;
}

const files = collectFiles(path.join(__dirname, 'node_modules')); // Use node_modules to get thousands of files
console.log(`Found ${files.length} files to benchmark.`);

// Measure event loop lag
function measureLag(name, fn) {
    return new Promise(resolve => {
        let maxLag = 0;
        let running = true;
        let lastCheck = performance.now();

        const checkLag = () => {
            if (!running) return;
            const now = performance.now();
            const lag = now - lastCheck - 10; // we use a 10ms interval
            if (lag > maxLag) maxLag = lag;
            lastCheck = now;
            setTimeout(checkLag, 10);
        };

        setTimeout(checkLag, 10);

        const start = performance.now();

        // Execute the function
        Promise.resolve(fn()).then(() => {
            running = false;
            const end = performance.now();
            resolve({
                name,
                wallTime: end - start,
                maxEventLoopLag: maxLag
            });
        });
    });
}

// 1. Benchmark statSync (current approach)
function benchStatSync() {
    let totalMs = 0;
    for (const file of files) {
        try {
            const stat = fs.statSync(file);
            totalMs += stat.mtimeMs;
        } catch(e) {}
    }
    return totalMs;
}

// 2. Benchmark promises.stat (proposed approach)
async function benchStatPromises() {
    let totalMs = 0;
    for (const file of files) {
        try {
            const stat = await fs.promises.stat(file);
            totalMs += stat.mtimeMs;
        } catch(e) {}
    }
    return totalMs;
}

async function run() {
    console.log(`Running event loop benchmarks...`);

    // Warmup
    benchStatSync();

    const syncResult = await measureLag('fs.statSync', () => { benchStatSync(); });
    console.log(`[Baseline] ${syncResult.name}: Wall time: ${syncResult.wallTime.toFixed(2)}ms, Max Event Loop Lag: ${syncResult.maxEventLoopLag.toFixed(2)}ms`);

    const asyncResult = await measureLag('fs.promises.stat', async () => { await benchStatPromises(); });
    console.log(`[Optimized] ${asyncResult.name}: Wall time: ${asyncResult.wallTime.toFixed(2)}ms, Max Event Loop Lag: ${asyncResult.maxEventLoopLag.toFixed(2)}ms`);

}

run().catch(console.error);
