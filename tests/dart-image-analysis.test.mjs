import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseShaftLines, findTipAlongAxis } from '../js/dart-image-analysis.js';

const flight = { x: 30, y: 60, radius: 5 };
test('shaft lines must point away from the flight towards the dart body', () => {
    const lines = [
        { x1: 45, y1: 58, x2: 95, y2: 58 },
        { x1: 45, y1: 62, x2: 95, y2: 62 },
        { x1: -80, y1: 60, x2: 0, y2: 60 },
        { x1: 50, y1: 30, x2: 90, y2: 30 },
        { x1: 55, y1: 40, x2: 55, y2: 90 }
    ];
    const selected = chooseShaftLines(lines, flight, { x: 100, y: 60 });
    assert.equal(selected.length, 2);
    assert.ok(selected.every(l => l.y1 === 58 || l.y1 === 62));
});
test('a detached flight can use nearby shaft fragments without accepting a distant line', () => {
    const detachedFlight = { x: 0, y: 0, radius: 10 };
    const selected = chooseShaftLines([
        { x1: 35, y1: 0, x2: 90, y2: 0 },
        { x1: 35, y1: 4, x2: 80, y2: 4 },
        { x1: 120, y1: 0, x2: 230, y2: 0 },
        { x1: -35, y1: 0, x2: -60, y2: 0 }
    ], detachedFlight, { x: 12, y: 0 });
    assert.equal(selected.length, 2);
    assert.ok(selected.every(l => l.x1 === 35));
});
test('tip search preserves a short weak continuation but rejects distant unrelated pixels', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    for (let x = 45; x <= 90; x++) data[60 * width + x] = 100;
    for (let x = 94; x <= 105; x++) data[60 * width + x] = 12;
    for (let x = 140; x <= 160; x++) data[60 * width + x] = 100;
    const point = findTipAlongAxis(data, width, height, flight, { x: 30, y: 60, ux: 1, uy: 0 }, 140, 1, [15, 60]);
    assert.ok(point);
    assert.ok(point.x >= 103 && point.x <= 106);
    assert.equal(point.y, 60);
});
test('a distant run without shaft support and an empty image give no tip', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    const axis = { x: 30, y: 60, ux: 1, uy: 0 };
    assert.equal(findTipAlongAxis(data, width, height, flight, axis, 140, 1, [15, 60]), null);
    for (let x = 140; x <= 160; x++) data[60 * width + x] = 100;
    assert.equal(findTipAlongAxis(data, width, height, flight, axis, 140, 1, [15, 60]), null);
});

test('a line continuing through the search boundary is not a tip', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    for (let x = 45; x <= 150; x++) data[60 * width + x] = 100;
    assert.equal(findTipAlongAxis(data, width, height, flight, { x: 30, y: 60, ux: 1, uy: 0 }, 80, 1, [15, 60]), null);
});
