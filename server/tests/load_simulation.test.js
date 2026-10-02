const test = require('node:test');
const assert = require('node:assert/strict');
const { runLoadTest } = require('../load_test/simulate_load');

test('Load Simulation: High concurrency test (15 rooms, 60 players, 75 sockets)', async () => {
    const report = await runLoadTest({
        roomsCount: 15,
        playersPerRoom: 4,
        port: 8199
    });

    assert.equal(report.success, true, 'Load test completed successfully without errors');
    assert.equal(report.roomsCount, 15);
    assert.equal(report.totalPlayersCount, 60);
    assert.equal(report.totalSockets, 75);
    assert.equal(report.errorsCount, 0, 'Zero network errors');

    // Performance invariants
    assert.ok(report.durationMs < 10000, `Execution time must be under 10s (got ${report.durationMs}ms)`);
    assert.ok(report.latency.avgMs < 100, `Average buzzer latency must be under 100ms (got ${report.latency.avgMs}ms)`);
    assert.ok(report.throughputMsgsPerSec > 100, `Throughput must exceed 100 msgs/sec (got ${report.throughputMsgsPerSec})`);
    assert.ok(report.memory.heapDiffMb < 50, `Heap memory delta must be under 50MB (got ${report.memory.heapDiffMb}MB)`);
});
