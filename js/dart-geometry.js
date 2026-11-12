import { calculateScore } from './scoring.js';

// Geometric measurements only; no camera- or dart-specific pixel locations.
// The axis is fitted to narrow cross-sections, not the flight's full silhouette.
const quantile = (values, q) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] ?? 0;
};
const minimum = values => values.reduce((a,b)=>Math.min(a,b), Infinity);
const maximum = values => values.reduce((a,b)=>Math.max(a,b), -Infinity);
const dot = (p, a) => p[0] * a[0] + p[1] * a[1];

export function fitAxis(points, weights = points.map(() => 1)) {
    const sum = weights.reduce((a, b) => a + b, 0);
    const centre = [0, 0];
    points.forEach((p, i) => { centre[0] += p[0] * weights[i] / sum; centre[1] += p[1] * weights[i] / sum; });
    let xx = 0, yy = 0, xy = 0;
    points.forEach((p, i) => {
        const x = p[0] - centre[0], y = p[1] - centre[1];
        xx += x * x * weights[i]; yy += y * y * weights[i]; xy += x * y * weights[i];
    });
    const angle = .5 * Math.atan2(2 * xy, xx - yy);
    return { centre, axis: [Math.cos(angle), Math.sin(angle)] };
}

export function robustAxis(points) {
    let fit = fitAxis(points);
    for (let iteration = 0; iteration < 4; iteration++) {
        const residuals = points.map(p => Math.abs((p[0] - fit.centre[0]) * fit.axis[1] - (p[1] - fit.centre[1]) * fit.axis[0]));
        const huber = Math.max(1, quantile(residuals, .5) * 1.5);
        fit = fitAxis(points, residuals.map(r => Math.min(1, huber / Math.max(r, .001))));
    }
    return fit;
}

export function crossSections(points, fit, scale) {
    const step = Math.max(2, 3 * scale), bins = new Map();
    for (const [x, y, strength = 1] of points) {
        const dx = x - fit.centre[0], dy = y - fit.centre[1];
        const t = dx * fit.axis[0] + dy * fit.axis[1];
        const s = -dx * fit.axis[1] + dy * fit.axis[0];
        const index = Math.floor(t / step);
        if (!bins.has(index)) bins.set(index, []);
        bins.get(index).push({ x, y, t, s, strength });
    }
    const sections = [];
    for (const pixels of bins.values()) {
        pixels.sort((a, b) => a.s - b.s);
        const runs = [[]];
        for (const p of pixels) {
            const run = runs.at(-1);
            if (run.length && p.s - run.at(-1).s > Math.max(1.6, 1.6 * scale)) runs.push([]);
            runs.at(-1).push(p);
        }
        runs.sort((a, b) => b.length - a.length);
        const run = runs[0];
        if (run.length < 2) continue;
        // Equal pixel weights prevent a glossy edge pulling the centre off-axis.
        const x = run.reduce((s, p) => s + p.x, 0) / run.length;
        const y = run.reduce((s, p) => s + p.y, 0) / run.length;
        sections.push({ x, y, t: (x - fit.centre[0]) * fit.axis[0] + (y - fit.centre[1]) * fit.axis[1], width: run.at(-1).s - run[0].s + 1 });
    }
    return sections.sort((a, b) => a.t - b.t);
}

export function measureShaft(points, scale = 1, hints = [], refit = robustAxis) {
    if (points.length < 12) return null;
    const initial = fitAxis(points);
    let best = null;
    // Hough directions are hypotheses; all fits must survive width/length checks.
    const directions = [initial.axis, ...hints.slice(0, 6)];
    for (const direction of directions) {
        let fit = { centre: initial.centre, axis: direction }, sections, used;
        let rejected = false;
        for (let iteration = 0; iteration < 4; iteration++) {
            sections = crossSections(points, fit, scale);
            if (sections.length < 7) { rejected = true; break; }
            const referenceWidth = quantile(sections.map(s => s.width), .25);
            const maxWidth = Math.min(16 * scale, Math.max(referenceWidth * 1.8, referenceWidth + 2 * scale));
            const narrow = sections.filter(s => s.width <= maxWidth);
            const runs = [];
            for (const section of narrow) {
                if (!runs.length || section.t - runs.at(-1).at(-1).t > 18 * scale) runs.push([]);
                runs.at(-1).push(section);
            }
            runs.sort((a, b) => (b.at(-1).t - b[0].t) - (a.at(-1).t - a[0].t));
            used = runs[0];
            if (!used || used.length < 5 || used.at(-1).t - used[0].t < 18 * scale) { rejected = true; break; }
            const updated = refit(used.map(s => [s.x, s.y]));
            if (!updated || ![...updated.centre, ...updated.axis].every(Number.isFinite)) { rejected = true; break; }
            if (dot(updated.axis, fit.axis) < 0) updated.axis = updated.axis.map(v => -v);
            fit = updated;
        }
        if (rejected) continue;
        // Recompute sections in the final coordinate system for diagnostics and taper.
        sections = crossSections(points, fit, scale);
        const residual = used.map(s => Math.abs((s.x - fit.centre[0]) * fit.axis[1] - (s.y - fit.centre[1]) * fit.axis[0]));
        const rms = Math.sqrt(residual.reduce((s, r) => s + r * r, 0) / residual.length);
        if (rms > 2.5 * scale) continue;
        const sorted = [...used].sort((a, b) => dot([a.x, a.y], fit.axis) - dot([b.x, b.y], fit.axis));
        const span = Math.hypot(sorted.at(-1).x - sorted[0].x, sorted.at(-1).y - sorted[0].y);
        const startWidth = quantile(sections.slice(0, 3).map(s => s.width), .5);
        const endWidth = quantile(sections.slice(-3).map(s => s.width), .5);
        const width = quantile(used.map(s => s.width), .5);
        if (span < Math.max(18 * scale, width * 4)) continue;
        const score = span / (1 + rms / scale);
        if (best && best.score >= score) continue;
        // Matching by position avoids relying on object identity after recomputation.
        const diagnostic = sections.map(s => ({ ...s, used: used.some(u => Math.hypot(u.x - s.x, u.y - s.y) < 2 * scale) }));
        const directionClear = Math.min(startWidth, endWidth) < Math.max(startWidth, endWidth) * .8;
        best = { fit, score, span, width, rms, sections: diagnostic, directionClear, tipSign: startWidth < endWidth ? -1 : 1 };
    }
    return best;
}

export function extractFragments(field, width, height, scale) {
    const sample = [];
    for (let i = 0; i < field.length; i += 37) sample.push(field[i]);
    const noise = quantile(sample, .5), deviation = quantile(sample.map(v => Math.abs(v - noise)), .5);
    const weak = Math.max(8, Math.min(28, noise + deviation * 3 + 4));
    const strong = Math.max(18, weak + 8);
    const visited = new Uint8Array(field.length), fragments = [];
    for (let i = 0; i < field.length; i++) {
        if (visited[i] || field[i] < weak) continue;
        const queue = [i]; visited[i] = 1;
        let seeded = false;
        for (let j = 0; j < queue.length; j++) {
            const index = queue[j], x = index % width, y = Math.floor(index / width);
            seeded ||= field[index] >= strong;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const px = x + dx, py = y + dy, next = py * width + px;
                if (px < 0 || py < 0 || px >= width || py >= height || visited[next] || field[next] < weak) continue;
                visited[next] = 1; queue.push(next);
            }
        }
        if (queue.length < Math.max(4, 3 * scale * scale) || queue.length > width * height * .08) continue;
        const points=queue.map(index => [index % width, Math.floor(index / width), field[index]]);
        points.seeded=seeded;fragments.push(points);
    }
    fragments.sort((a, b) => b.length - a.length);
    return { fragments: fragments.slice(0, 16), weak, strong };
}

function canLink(a, b, scale) {
    const fits = [fitAxis(a), fitAxis(b)];
    const delta = fits[1].centre.map((v, i) => v - fits[0].centre[i]);
    const distance = Math.hypot(...delta);
    if (distance < .001) return false;
    // Use the long fragment's own axis, so the flight's broad pixels cannot
    // steer the proposed shared line before the fragments have been joined.
    const extent = (points, fit) => {
        const t = points.map(p => dot(p, fit.axis));
        return maximum(t) - minimum(t);
    };
    const pieces=[a,b];
    const lengths = [extent(a, fits[0]), extent(b, fits[1])];
    const widths=pieces.map((points,i)=>{
        const transverse=points.map(p=>-p[0]*fits[i].axis[1]+p[1]*fits[i].axis[0]);
        return maximum(transverse)-minimum(transverse)+1;
    });
    const elongated=lengths.map((length,i)=>length>widths[i]*3);
    const lead=elongated[0]!==elongated[1]?(elongated[0]?0:1):(lengths[0]>=lengths[1]?0:1);
    const axis = fits[lead].axis,other=1-lead;
    const allowance=elongated[other]?9*scale:Math.max(9*scale,Math.min(20*scale,widths[other]/2)+3*scale);
    if (Math.abs(delta[0] * axis[1] - delta[1] * axis[0]) > allowance) return false;
    const spans = [a, b].map(points => {
        const values = points.map(p => dot(p, axis)); return [minimum(values), maximum(values)];
    });
    const gap = Math.max(spans[0][0], spans[1][0]) - Math.min(spans[0][1], spans[1][1]);
    if (gap > 35 * scale) return false;
    for (let i = 0; i < 2; i++) {
        const transverse = [a, b][i].map(p => -p[0] * fits[i].axis[1] + p[1] * fits[i].axis[0]);
        const width = maximum(transverse) - minimum(transverse) + 1;
        if (lengths[i] > width * 3 && Math.abs(dot(fits[i].axis, axis)) < Math.cos(Math.PI / 9)) return false;
    }
    return true;
}

export function fragmentGroups(fragments, scale) {
    const groups = fragments.filter(points=>points.seeded!==false).map(points => ({ points, fragments: 1 }));
    const seen = new Set();
    for (let i = 0; i < fragments.length; i++) {
        const members = [i];
        for (let j = 0; j < fragments.length; j++) {
            if (j === i || !members.some(k => canLink(fragments[k], fragments[j], scale))) continue;
            const combined = members.flatMap(k => fragments[k]);
            // A grown group must still line up as a whole (no chain of neighbours).
            if (canLink(combined, fragments[j], scale)) members.push(j);
        }
        if (members.length < 2) continue;
        const key = [...members].sort((a, b) => a - b).join(',');
        if (!seen.has(key) && members.some(k=>fragments[k].seeded!==false)) {
            groups.push({ points: members.flatMap(k => fragments[k]), fragments: members.length }); seen.add(key);
        }
    }
    return groups;
}

export function medianFrame(frames) {
    if (frames.length !== 3 || frames.some(f => f.width !== frames[0].width || f.height !== frames[0].height)) throw new Error('Drie beelden met dezelfde afmetingen nodig.');
    const data = new Uint8ClampedArray(frames[0].data.length);
    for (let i = 0; i < data.length; i++) {
        const a = frames[0].data[i], b = frames[1].data[i], c = frames[2].data[i];
        data[i] = a + b + c - Math.min(a, b, c) - Math.max(a, b, c);
    }
    return { width: frames[0].width, height: frames[0].height, data };
}

export function consistentMeasurements(results, toBoard) {
    const visible = results.filter(r => r.point);
    const debug = results[1] || results[0] || {};
    if (visible.length !== 3) return { ...debug, point: undefined, reason: `Punt in ${visible.length}/3 beelden gevonden. ${results.find(r => !r.point)?.reason || ''}`, agreement: visible.length };
    const positions = visible.map(r => {const p=r.boardPoint||r.point;return toBoard(p.x,p.y);});
    if (positions.some(p => !p || !Number.isFinite(p.x + p.y))) return { ...debug, point: undefined, reason: 'Kalibreer opnieuw.', agreement: 0 };
    const spread = Math.max(...positions.flatMap(a => positions.map(b => Math.hypot(a.x - b.x, a.y - b.y))));
    const labels=positions.map(p=>calculateScore(p.x,p.y).label);
    if (labels.some(label=>label!==labels[0])) return { ...debug, point: undefined, candidates: visible.map(r => r.point), reason: 'De beelden geven verschillende scorevakken. Controleer de punt bij de draad.', agreement: 0, spread };
    if (spread > 3) return { ...debug, point: undefined, candidates: visible.map(r => r.point), reason: 'De puntpositie verschilt tussen de beelden. Geen betrouwbare score.', agreement: 0, spread };
    return { ...debug, agreement: 3, spread };
}
