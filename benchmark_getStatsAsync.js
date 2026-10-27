const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const storageDir = path.join(__dirname, 'test_storage2');

// Create test files
if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir);
}

const files = ["entries.json", "conversations.json", "lessons.json", "projects.json", "preferences.json"];
for (const file of files) {
    fs.writeFileSync(path.join(storageDir, file), "test".repeat(1000));
}

function getStatsSync() {
    let totalSize = 0;
    for (const file of files) {
        const filePath = path.join(storageDir, file);
        if (fs.existsSync(filePath)) {
            totalSize += fs.statSync(filePath).size;
        }
    }
    return totalSize;
}

async function getStatsAsync() {
    let totalSize = 0;
    const promises = files.map(file => {
        const filePath = path.join(storageDir, file);
        return fs.promises.stat(filePath).then(stats => stats.size).catch(() => 0);
    });
    const sizes = await Promise.all(promises);
    totalSize = sizes.reduce((a, b) => a + b, 0);
    return totalSize;
}

async function runBenchmark() {
    const iters = 10000;

    // Warmup
    for (let i = 0; i < 100; i++) {
        getStatsSync();
        await getStatsAsync();
    }

    const startSync = performance.now();
    for (let i = 0; i < iters; i++) {
        getStatsSync();
    }
    const endSync = performance.now();

    const startAsync = performance.now();
    for (let i = 0; i < iters; i++) {
        await getStatsAsync();
    }
    const endAsync = performance.now();

    console.log(`Sync time: ${(endSync - startSync).toFixed(2)}ms`);
    console.log(`Async time: ${(endAsync - startAsync).toFixed(2)}ms`);

    // Cleanup
    for (const file of files) {
        fs.unlinkSync(path.join(storageDir, file));
    }
    fs.rmdirSync(storageDir);
}

runBenchmark().catch(console.error);
