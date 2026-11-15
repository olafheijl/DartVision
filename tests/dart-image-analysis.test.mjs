import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseShaftLines, findTipInMask } from '../js/dart-image-analysis.js';

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
test('mask endpoint includes a nearby thin fragment but excludes distant noise', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    const seed = new Uint8Array(data.length);
    for (let x = 45; x <= 90; x++) data[60 * width + x] = seed[60 * width + x] = 255;
    for (let x = 94; x <= 105; x++) data[60 * width + x] = 255;
    for (let x = 140; x <= 160; x++) data[60 * width + x] = 255;
    const result = findTipInMask(data, seed, width, height, flight, { x: 30, y: 60, ux: 1, uy: 0 }, 1, [15, 60]);
    assert.deepEqual(result.tip, { x: 105, y: 60 });
    assert.equal(result.dartMask[60 * width + 105], 255);
    assert.equal(result.dartMask[60 * width + 140], 0);
});
test('an empty mask or distant pixels without the selected dart give no tip', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    const seed = new Uint8Array(data.length);
    const axis = { x: 30, y: 60, ux: 1, uy: 0 };
    assert.equal(findTipInMask(data, seed, width, height, flight, axis, 1, [15, 60]).tip, null);
    for (let x = 140; x <= 160; x++) data[60 * width + x] = 255;
    assert.equal(findTipInMask(data, seed, width, height, flight, axis, 1, [15, 60]).tip, null);
});

test('the endpoint is a real pixel even when averaging or snapping would leave the mask', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    for (let x = 45; x < 90; x++) data[60 * width + x] = 255;
    data[62 * width + 90] = 255;
    const result = findTipInMask(data, data, width, height, flight, { x: 30, y: 60, ux: 1, uy: 0 });
    assert.deepEqual(result.tip, { x: 90, y: 62 });
    assert.equal(data[result.tip.y * width + result.tip.x], 255);
    assert.equal(data[60 * width + 90], 0);
});

test('filled contour pixels and off-axis or backward objects cannot extend the tip', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    const seed = new Uint8Array(data.length).fill(255);
    for (let x = 45; x <= 90; x++) data[60 * width + x] = 255;
    for (let x = 100; x <= 150; x++) data[40 * width + x] = 255;
    for (let x = 0; x <= 20; x++) data[60 * width + x] = 255;
    const result = findTipInMask(data, seed, width, height, flight, { x: 30, y: 60, ux: 1, uy: 0 });
    assert.deepEqual(result.tip, { x: 90, y: 60 });
    assert.equal(result.dartMask[60 * width + 91], 0);
});

test('a detached isolated speck cannot extend the mask endpoint', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    const seed = new Uint8Array(data.length);
    for (let x = 45; x <= 90; x++) data[60 * width + x] = seed[60 * width + x] = 255;
    data[60 * width + 95] = 255;
    const result = findTipInMask(data, seed, width, height, flight, { x: 30, y: 60, ux: 1, uy: 0 });
    assert.deepEqual(result.tip, { x: 90, y: 60 });
    assert.equal(result.dartMask[60 * width + 95], 0);
});

test('a separate parallel object cannot join solely through overlapping projections', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    const seed = new Uint8Array(data.length);
    for (let x = 45; x <= 90; x++) data[55 * width + x] = seed[55 * width + x] = 255;
    for (let x = 85; x <= 115; x++) data[65 * width + x] = 255;
    const result = findTipInMask(data, seed, width, height, flight, { x: 30, y: 60, ux: 1, uy: 0 }, 1, [15, 60], 6);
    assert.deepEqual(result.tip, { x: 90, y: 55 });
    assert.equal(result.dartMask[65 * width + 115], 0);
});

test('the shaft can point left and a clipped dart has no endpoint', () => {
    const width = 180, height = 120, data = new Uint8Array(width * height);
    const leftFlight = { x: 150, y: 60, radius: 5 }, axis = { x: 150, y: 60, ux: -1, uy: 0 };
    for (let x = 45; x <= 130; x++) data[60 * width + x] = 255;
    assert.deepEqual(findTipInMask(data, data, width, height, leftFlight, axis).tip, { x: 45, y: 60 });
    for (let x = 0; x <= 45; x++) data[60 * width + x] = 255;
    assert.equal(findTipInMask(data, data, width, height, leftFlight, axis).tip, null);
});
