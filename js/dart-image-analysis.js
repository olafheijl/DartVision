// Experimental analysis for image-test.html only. These functions do not change
// the live camera test or the board calibration.
export function chooseShaftLines(lines, flight, contourEnd, scale = 1) {
    const radius = Math.max(6 * scale, flight.radius * 2.2);
    const rx = contourEnd.x - flight.x, ry = contourEnd.y - flight.y;
    const reach = Math.hypot(rx, ry);
    // A detached flight has no useful contour direction. In that case look for
    // a nearby straight fragment, rather than rejecting the whole experiment.
    const hasDirection = reach >= radius * 1.2;
    const candidates = lines.filter(line => {
        const dx = line.x2 - line.x1, dy = line.y2 - line.y1;
        const length = Math.hypot(dx, dy);
        if (length < 12 * scale) return false;
        const distance = Math.abs((flight.x - line.x1) * dy - (flight.y - line.y1) * dx) / length;
        if (distance > Math.max(5 * scale, flight.radius * 1.5)) return false;
        const mx = (line.x1 + line.x2) / 2, my = (line.y1 + line.y2) / 2;
        if (Math.hypot(mx - flight.x, my - flight.y) <= radius) return false;
        if (!hasDirection) {
            const nearest = Math.min(Math.hypot(line.x1 - flight.x, line.y1 - flight.y), Math.hypot(line.x2 - flight.x, line.y2 - flight.y));
            return nearest <= Math.max(35 * scale, flight.radius * 4);
        }
        if (Math.abs((dx * rx + dy * ry) / length / reach) < Math.cos(Math.PI / 7)) return false;
        return ((mx - flight.x) * rx + (my - flight.y) * ry) / reach > radius;
    }).map(line => ({ ...line, length: Math.hypot(line.x2 - line.x1, line.y2 - line.y1) }));
    candidates.sort((a, b) => b.length - a.length);
    if (!candidates.length) return [];
    const lead = candidates[0], ux = (lead.x2 - lead.x1) / lead.length, uy = (lead.y2 - lead.y1) / lead.length;
    const leadX = (lead.x1 + lead.x2) / 2 - flight.x, leadY = (lead.y1 + lead.y2) / 2 - flight.y;
    return candidates.filter(line => {
        const parallel = Math.abs(((line.x2 - line.x1) * ux + (line.y2 - line.y1) * uy) / line.length);
        const offset = Math.abs(((line.x1 + line.x2 - lead.x1 - lead.x2) / 2) * uy - ((line.y1 + line.y2 - lead.y1 - lead.y2) / 2) * ux);
        const sameSide = ((line.x1 + line.x2) / 2 - flight.x) * leadX + ((line.y1 + line.y2) / 2 - flight.y) * leadY > 0;
        return sameSide && parallel > Math.cos(Math.PI / 18) && offset < Math.max(5 * scale, flight.radius * .5);
    });
}

export function findTipAlongAxis(data, width, height, flight, axis, maxReach, scale = 1, supportRange = null) {
    const { x, y, ux, uy } = axis;
    const originT = (flight.x - x) * ux + (flight.y - y) * uy;
    const step = Math.max(1, scale), corridor = Math.max(2, 2 * scale);
    const runs = [];
    let run = [], gap = 0;
    for (let t = Math.max(5 * scale, flight.radius * 1.4); t <= maxReach; t += step) {
        const px = x + (originT + t) * ux, py = y + (originT + t) * uy;
        let best = null;
        for (let offset = -corridor; offset <= corridor; offset += 1) {
            const xx = Math.round(px - uy * offset), yy = Math.round(py + ux * offset);
            if (xx < 1 || yy < 1 || xx >= width - 1 || yy >= height - 1) continue;
            const value = data[yy * width + xx];
            // Local evidence is required; an infinitely extended shaft is not a tip.
            if (value < 8) continue;
            if (!best || value > best.value) best = { x: xx, y: yy, t, value };
        }
        if (best) { run.push(best); gap = 0; }
        else if (++gap >= 3) { if (run.length) runs.push(run); run = []; gap = 0; }
    }
    if (run.length) runs.push(run);
    const supported = runs.filter(r => r.length >= 4);
    if (!supported.length) return null;
    // Start near the flight and join only small, collinear interruptions.
    let chain = null;
    for (const candidate of supported) {
        if (!chain) {
            if (!candidate.some(p => p.value >= 20)) continue;
            if (supportRange) {
                if (candidate.at(-1).t < supportRange[0] - 3 * scale || candidate[0].t > supportRange[1] + 3 * scale) continue;
            } else if (candidate[0].t > Math.max(25 * scale, flight.radius * 3)) continue;
            chain = candidate;
        } else {
            if (candidate[0].t - chain.at(-1).t > Math.max(12 * scale, flight.radius * .5)) break;
            chain = chain.concat(candidate);
        }
    }
    if (!chain) return null;
    // Evidence must actually stop; the search boundary is never a dart tip.
    if (chain.at(-1).t >= maxReach - 2 * step) return null;
    const terminal = chain.at(-1);
    if (terminal.x <= 2 || terminal.y <= 2 || terminal.x >= width - 3 || terminal.y >= height - 3) return null;
    const end = chain.slice(-2);
    return { x: end.reduce((s, p) => s + p.x, 0) / end.length, y: end.reduce((s, p) => s + p.y, 0) / end.length };
}

export function analyseImageDart(cv, difference, flight, contourPoints, bounds) {
    const width = difference.cols, height = difference.rows, scale = Math.max(width, height) / 640;
    let contourEnd = flight;
    for (let i = 0; i < contourPoints.length; i += 2) {
        const p = { x: contourPoints[i], y: contourPoints[i + 1] };
        if (Math.hypot(p.x - flight.x, p.y - flight.y) > Math.hypot(contourEnd.x - flight.x, contourEnd.y - flight.y)) contourEnd = p;
    }
    let reach = Math.hypot(contourEnd.x - flight.x, contourEnd.y - flight.y);
    const detachedFlight = reach < Math.max(6 * scale, flight.radius * 2.2) * 1.2;
    const mats = [], keep = mat => { mats.push(mat); return mat; };
    try {
        const region = keep(cv.Mat.zeros(height, width, cv.CV_8UC1));
        const margin = Math.round(detachedFlight ? Math.max(100 * scale, flight.radius * 10) : Math.max(12 * scale, reach * .25));
        cv.rectangle(region, new cv.Point(Math.max(0, bounds.x - margin), Math.max(0, bounds.y - margin)),
            new cv.Point(Math.min(width - 1, bounds.x + bounds.width + margin), Math.min(height - 1, bounds.y + bounds.height + margin)), new cv.Scalar(255), -1);
        const edges = keep(new cv.Mat()), lines = keep(new cv.Mat());
        cv.Canny(difference, edges, 15, 45);
        cv.bitwise_and(edges, region, edges);
        cv.HoughLinesP(edges, lines, 1, Math.PI / 180, 12, Math.max(15, 15 * scale), Math.max(4, 6 * scale));
        const rawLines = [];
        for (let i = 0; i < lines.rows; i++) {
            const [x1, y1, x2, y2] = lines.data32S.slice(i * 4, i * 4 + 4);
            rawLines.push({ x1, y1, x2, y2 });
        }
        const selected = chooseShaftLines(rawLines, flight, contourEnd, scale);
        if (!selected.length) return { lines: [], reason: 'Flight gemarkeerd, maar geen duidelijke schachtranden gevonden.' };
        if (detachedFlight) {
            const lead = selected[0];
            contourEnd = { x: (lead.x1 + lead.x2) / 2, y: (lead.y1 + lead.y2) / 2 };
        }
        reach = Math.max(reach, ...selected.flatMap(l => [Math.hypot(l.x1 - flight.x, l.y1 - flight.y), Math.hypot(l.x2 - flight.x, l.y2 - flight.y)]));
        const points = keep(cv.matFromArray(selected.length * 2, 1, cv.CV_32FC2, selected.flatMap(l => [l.x1, l.y1, l.x2, l.y2])));
        const fitted = keep(new cv.Mat());
        cv.fitLine(points, fitted, cv.DIST_HUBER, 0, .01, .01);
        let [ux, uy, x, y] = fitted.data32F;
        if (ux * (contourEnd.x - flight.x) + uy * (contourEnd.y - flight.y) < 0) { ux = -ux; uy = -uy; }
        const axis = { x, y, ux, uy };
        const support = selected.flatMap(l => [[l.x1, l.y1], [l.x2, l.y2]])
            .map(([px, py]) => (px - flight.x) * ux + (py - flight.y) * uy);
        const supportRange = [Math.max(flight.radius * 1.4, Math.min(...support)), Math.max(...support)];
        const tip = findTipAlongAxis(difference.data, width, height, flight, axis, reach * 1.35, scale, supportRange);
        return { lines: selected, axis, tip, reach, reason: tip ? 'Geschatte punt gevonden. Controleer het gele kruisje.' : 'Schachtlijn gevonden, maar geen ondersteund uiteinde.' };
    } finally { for (const mat of mats.reverse()) mat.delete(); }
}

export function drawImageDart(cv, canvasMat, flight, result, showTip) {
    const thickness = Math.max(2, Math.round(Math.max(canvasMat.cols, canvasMat.rows) / 640));
    for (const line of result.lines) cv.line(canvasMat, new cv.Point(line.x1, line.y1), new cv.Point(line.x2, line.y2), new cv.Scalar(0, 160, 255), thickness);
    if (result.axis) {
        const a = result.axis, originT = (flight.x - a.x) * a.ux + (flight.y - a.y) * a.uy;
        const start = new cv.Point(a.x + originT * a.ux, a.y + originT * a.uy);
        const end = new cv.Point(start.x + a.ux * result.reach * 1.2, start.y + a.uy * result.reach * 1.2);
        cv.line(canvasMat, start, end, new cv.Scalar(0, 255, 100), thickness);
    }
    cv.circle(canvasMat, new cv.Point(flight.x, flight.y), 5, new cv.Scalar(255, 0, 0), -1);
    if (showTip && result.tip) {
        const p = result.tip, r = 8 * thickness;
        cv.circle(canvasMat, new cv.Point(p.x, p.y), r / 2, new cv.Scalar(255, 230, 0), thickness);
        cv.line(canvasMat, new cv.Point(p.x - r, p.y), new cv.Point(p.x + r, p.y), new cv.Scalar(255, 230, 0), thickness);
        cv.line(canvasMat, new cv.Point(p.x, p.y - r), new cv.Point(p.x, p.y + r), new cv.Scalar(255, 230, 0), thickness);
    }
}
