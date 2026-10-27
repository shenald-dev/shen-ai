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

const files = collectFiles(path.join(__dirname, 'src'));
console.log(`Found ${files.length} files to benchmark.`);

// 1. Benchmark statSync (current approach)
function benchStatSync(iterations) {
    let totalTime = 0;

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        let totalMs = 0;

        for (const file of files) {
            try {
                const stat = fs.statSync(file);
                totalMs += stat.mtimeMs; // Just doing something with it
            } catch(e) {}
        }

        const end = performance.now();
        totalTime += (end - start);
    }

    return totalTime / iterations;
}

// 2. Benchmark promises.stat (proposed approach)
async function benchStatPromises(iterations) {
    let totalTime = 0;

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        let totalMs = 0;

        // This is sequential like the current loop but using async/await
        for (const file of files) {
            try {
                const stat = await fs.promises.stat(file);
                totalMs += stat.mtimeMs;
            } catch(e) {}
        }

        const end = performance.now();
        totalTime += (end - start);
    }

    return totalTime / iterations;
}

// 3. Benchmark concurrent promises.stat (fully optimized approach)
async function benchStatConcurrent(iterations) {
    let totalTime = 0;

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        // Concurrent stats
        const statPromises = files.map(file =>
            fs.promises.stat(file)
              .then(stat => stat.mtimeMs)
              .catch(() => 0)
        );

        const results = await Promise.all(statPromises);
        let totalMs = results.reduce((acc, val) => acc + val, 0);

        const end = performance.now();
        totalTime += (end - start);
    }

    return totalTime / iterations;
}

async function run() {
    const iters = 100; // Increased iterations for more stable results
    console.log(`Running benchmarks with ${iters} iterations...`);

    const syncTime = benchStatSync(iters);
    console.log(`[Baseline] fs.statSync (sequential): ${syncTime.toFixed(4)} ms`);

    const asyncSeqTime = await benchStatPromises(iters);
    console.log(`[Alternative] fs.promises.stat (sequential): ${asyncSeqTime.toFixed(4)} ms`);

    const asyncConcurrentTime = await benchStatConcurrent(iters);
    console.log(`[Optimized] fs.promises.stat (Promise.all): ${asyncConcurrentTime.toFixed(4)} ms`);

    const improvement = syncTime - asyncSeqTime;
    const improvementPct = (improvement / syncTime) * 100;

    const maxImprovement = syncTime - asyncConcurrentTime;
    const maxImprovementPct = (maxImprovement / syncTime) * 100;

    console.log(`\nComparison:`);
    console.log(`Sync vs Async (sequential): Async is ${improvementPct > 0 ? 'faster' : 'slower'} by ${Math.abs(improvementPct).toFixed(2)}%`);
    console.log(`Sync vs Async (concurrent): Async concurrent is ${maxImprovementPct > 0 ? 'faster' : 'slower'} by ${Math.abs(maxImprovementPct).toFixed(2)}%`);

    // While Promise.all is great, for RAG indexing we usually still process files sequentially
    // or batch them to avoid OOM or hitting API limits. But we can at least make the file stat async.
}

run().catch(console.error);
