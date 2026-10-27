import { VitalMonitor } from "./src/core/health/vital-monitor";

class MockGraphStore {
    getStats() {
        return { totalNodes: 0, mostConnected: [] };
    }
}

async function run() {
    const fs = require('fs');
    if (!fs.existsSync('dummy')) fs.mkdirSync('dummy');
    for (let i = 0; i < 2000; i++) {
        fs.writeFileSync(`dummy/file${i}.ts`, `const a = ${i}; console.log(a);`);
    }

    const monitor = new VitalMonitor(new MockGraphStore() as any, "/tmp/vital");
    monitor['collectSourceFiles'] = async () => {
        const files = [];
        for (let i = 0; i < 2000; i++) {
            files.push(`dummy/file${i}.ts`);
        }
        return files;
    };

    let total = 0;
    for (let j = 0; j < 3; j++) {
        const start = Date.now();
        await monitor.scanHealth();
        total += Date.now() - start;
    }
    console.log(`Average scan completed in ${total / 3} ms`);

    fs.rmSync('dummy', { recursive: true, force: true });
}
run();
