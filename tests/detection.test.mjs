import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findScoringRing } from '../js/detection.js';

function board({ coloured = true, triple = true, radius = 170 } = {}) {
    const width = 500, height = 500;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const r = Math.hypot(x - 250, y - 250) * 170 / radius;
        const ring = coloured && ((r >= 162 && r <= 170) || (triple && r >= 99 && r <= 107));
        const offset = (y * width + x) * 4;
        // Outer rim is conspicuous but not a scoring boundary.
        const shade = r > 215 && r < 225 ? 250 : 35;
        data.set(ring ? [190, 20, 20, 255] : [shade, shade, shade, 255], offset);
    }
    return { width, height, data };
}

test('selects double boundary rather than larger physical rim at multiple scales', () => {
    for (const radius of [110, 170]) {
        const found = findScoringRing(board({ radius }), [{ x: 250, y: 250 }]);
        assert.ok(found);
        assert.ok(Math.abs(found.radius - radius) <= 3, `${found.radius} vs ${radius}`);
    }
});
test('does not accept a plain outer circle as calibration', () => {
    assert.equal(findScoringRing(board({ coloured: false }), [{ x: 250, y: 250 }]), null);
});
test('requires matching triple ring rather than a single coloured circle', () => {
    assert.equal(findScoringRing(board({ triple: false }), [{ x: 250, y: 250 }]), null);
});
