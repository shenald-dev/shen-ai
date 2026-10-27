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

const files = collectFiles(path.join(__dirname, 'node_modules')).slice(0, 1000); // 1000 files to simulate real workspace
console.log(`Found ${files.length} files to benchmark.`);

async function measureLag(name, fn) {
    return new Promise(resolve => {
        let maxLag = 0;
        let running = true;
        let lastCheck = performance.now();

        const checkLag = () => {
            if (!running) return;
            const now = performance.now();
            const lag = now - lastCheck - 10;
            if (lag > maxLag) maxLag = lag;
            lastCheck = now;
            setTimeout(checkLag, 10);
        };

        setTimeout(checkLag, 10);

        const start = performance.now();

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

// 1. Benchmark full sync (current)
function benchFullSync() {
    for (const file of files) {
        try {
            const stat = fs.statSync(file);
            const content = fs.readFileSync(file, "utf-8");
            // mock chunking and embedding logic
            const chunks = content.length / 1000;
        } catch(e) {}
    }
}

// 2. Benchmark full async
async function benchFullAsync() {
    for (const file of files) {
        try {
            const stat = await fs.promises.stat(file);
            const content = await fs.promises.readFile(file, "utf-8");
            const chunks = content.length / 1000;
        } catch(e) {}
    }
}

async function run() {
    const syncResult = await measureLag('fs.statSync/readFileSync', () => { benchFullSync(); });
    console.log(`[Baseline] ${syncResult.name}: Wall time: ${syncResult.wallTime.toFixed(2)}ms, Max Event Loop Lag: ${Math.max(0, syncResult.maxEventLoopLag).toFixed(2)}ms`);

    const asyncResult = await measureLag('fs.promises.stat/readFile', async () => { await benchFullAsync(); });
    console.log(`[Optimized] ${asyncResult.name}: Wall time: ${asyncResult.wallTime.toFixed(2)}ms, Max Event Loop Lag: ${Math.max(0, asyncResult.maxEventLoopLag).toFixed(2)}ms`);
}

run().catch(console.error);
