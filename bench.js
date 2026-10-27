const { performance } = require('perf_hooks');

const numAgents = 100;
const numTasks = 20;
const iterations = 100000;

const agents = new Map();
for (let i=0; i<numAgents; i++) {
    agents.set(i, { id: i, status: i % 2 === 0 ? "idle" : "working" });
}

const readyTasks = Array.from({length: numTasks}).map((_, i) => ({ id: i }));

function baseline() {
    let assigned = 0;
    for (let j=0; j<iterations; j++) {
        const idleAgents = Array.from(agents.values()).filter(a => a.status === "idle");
        const assignments = Math.min(readyTasks.length, idleAgents.length);

        for (let i=0; i<assignments; i++) {
            const agent = idleAgents[i];
            const task = readyTasks[i];
            // simulate work
            assigned++;
        }
    }
    return assigned;
}

function optimized() {
    let assigned = 0;
    for (let j=0; j<iterations; j++) {
        let assignments = 0;
        const maxAssignments = readyTasks.length;

        if (maxAssignments > 0) {
            for (const agent of agents.values()) {
                if (agent.status === "idle") {
                    const task = readyTasks[assignments];
                    // simulate work
                    assigned++;

                    assignments++;
                    if (assignments >= maxAssignments) {
                        break;
                    }
                }
            }
        }
    }
    return assigned;
}

const startBase = performance.now();
baseline();
const endBase = performance.now();

const startOpt = performance.now();
optimized();
const endOpt = performance.now();

console.log(`Baseline: ${endBase - startBase} ms`);
console.log(`Optimized: ${endOpt - startOpt} ms`);
