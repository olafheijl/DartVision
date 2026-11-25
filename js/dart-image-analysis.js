// Experimental analysis for image-test.html only. These functions do not change
// the live camera test or the board calibration.
/** Select nearby Hough segments that can describe the same shaft. */
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

/**
 * Return the selected dart mask and, when supported, its furthest shaft pixel.
 * binaryMask comes from thresholding the difference image. objectMask is the
 * filled contour of the selected flight candidate and anchors the search.
 * supportRange describes how far the detected shaft edges extend from the flight.
 */
export function findTipInMask(binaryMask, objectMask, width, height, flight, axis, scale = 1, supportRange = null, corridor = 2 * scale) {
    // Keep only real white pixels. A filled contour or a morphological close may
    // bridge a gap, but those invented pixels must never become the endpoint.
    const dartMask = new Uint8Array(binaryMask.length);
    const pixels = [];
    const minDistanceFromFlight = Math.max(5 * scale, flight.radius * 1.4);
    const corridorHalfWidth = Math.max(2, corridor);
    for (let i = 0; i < binaryMask.length; i++) {
        if (!binaryMask[i]) continue;
        if (objectMask[i]) dartMask[i] = 255;
        if (!axis) continue;
        const x = i % width, y = Math.floor(i / width);
        // Project onto the unit direction: t increases from the flight towards
        // the tip. The perpendicular offset keeps candidates inside the shaft strip.
        const t = (x - flight.x) * axis.ux + (y - flight.y) * axis.uy;
        const offset = Math.abs((x - axis.x) * axis.uy - (y - axis.y) * axis.ux);
        if (t > minDistanceFromFlight && offset <= corridorHalfWidth) {
            pixels.push({ x, y, t, offset, index: i });
        }
    }
    // Keep spatially separate shapes separate, even when their projections
    // overlap. Otherwise a parallel dart or noise stripe could join this dart.
    // Flood fill through the eight neighbouring pixels, including diagonals.
    // Removing each pixel when queued ensures it belongs to only one component.
    const remaining = new Map(pixels.map(pixel => [pixel.index, pixel]));
    const components = [];
    for (const pixel of pixels) {
        if (!remaining.delete(pixel.index)) continue;
        const component = { pixels: [pixel], startT: pixel.t, endT: pixel.t, overlapsContour: false };
        for (let head = 0; head < component.pixels.length; head++) {
            const p = component.pixels[head];
            component.startT = Math.min(component.startT, p.t);
            component.endT = Math.max(component.endT, p.t);
            component.overlapsContour ||= !!dartMask[p.index];
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const xx = p.x + dx, yy = p.y + dy;
                if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
                const index = yy * width + xx, neighbour = remaining.get(index);
                if (neighbour) { remaining.delete(index); component.pixels.push(neighbour); }
            }
        }
        components.push(component);
    }
    // Anchor the search to the chosen flight object, not to arbitrary white
    // pixels elsewhere in the photo. A short detached tip may join this chain.
    let anchors = components.filter(c => c.overlapsContour);
    // A detached flight can leave the strip empty near its contour. In that
    // case, start with a nearby component that overlaps the detected shaft range.
    if (!anchors.length && supportRange) {
        const nearbyShaft = components.find(c => c.startT <= Math.max(35 * scale, flight.radius * 4)
            && c.endT >= supportRange[0] && c.startT <= supportRange[1]);
        if (nearbyShaft) anchors = [nearbyShaft];
    }
    if (!anchors.length) return { dartMask, tip: null };
    const chain = anchors.flatMap(c => c.pixels);
    let terminalT = Math.max(...anchors.map(c => c.endT));
    const maxGap = 6 * scale;
    const fragments = components
        .filter(component => !anchors.includes(component))
        .sort((a, b) => a.endT - b.endT);
    for (const fragment of fragments) {
        if (fragment.endT <= terminalT || fragment.startT > terminalT + maxGap) continue;
        // Isolated specks cannot extend the dart. Thin, elongated fragments can.
        if (fragment.endT - fragment.startT < 3 * scale) continue;
        const tail = chain.filter(p => p.t >= terminalT - maxGap);
        const nearby = fragment.pixels.filter(p => p.t >= terminalT - maxGap && p.t <= terminalT + maxGap);
        // A small gap along the axis is only sufficient if pixels also come
        // close in the image. This prevents a parallel stripe from joining.
        const isNearTail = nearby.some(pixel => tail.some(tailPixel =>
            (pixel.x - tailPixel.x) ** 2 + (pixel.y - tailPixel.y) ** 2 <= maxGap ** 2));
        if (!isNearTail) continue;
        chain.push(...fragment.pixels);
        terminalT = fragment.endT;
    }
    for (const pixel of chain) dartMask[pixel.index] = 255;
    if (supportRange && !chain.some(p => p.t >= supportRange[0] - 3 * scale && p.t <= supportRange[1] + 3 * scale)) return { dartMask, tip: null };
    // If pixels share the furthest projection, choose the one closest to the
    // fitted axis. Returning its original coordinates keeps it on a white pixel.
    const terminal = chain.filter(p => Math.abs(p.t - terminalT) < 1e-6).sort((a, b) => a.offset - b.offset)[0];
    // A pixel near the image edge may belong to a dart cut off by the frame.
    const clipped = terminal.x <= 2 || terminal.y <= 2 || terminal.x >= width - 3 || terminal.y >= height - 3;
    return { dartMask, tip: clipped ? null : { x: terminal.x, y: terminal.y } };
}

/** Fit a shaft axis from the difference image, then locate its tip in the binary mask. */
export function analyseImageDart(cv, difference, flight, contourPoints, bounds, mask, objectMask) {
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
        if (!selected.length) return { ...findTipInMask(mask.data, objectMask.data, width, height, flight, null), lines: [], reason: 'Flight gemarkeerd, maar geen duidelijke schachtranden gevonden.' };
        if (detachedFlight) {
            const lead = selected[0];
            contourEnd = { x: (lead.x1 + lead.x2) / 2, y: (lead.y1 + lead.y2) / 2 };
        }
        reach = Math.max(reach, ...selected.flatMap(l => [Math.hypot(l.x1 - flight.x, l.y1 - flight.y), Math.hypot(l.x2 - flight.x, l.y2 - flight.y)]));
        const points = keep(cv.matFromArray(selected.length * 2, 1, cv.CV_32FC2, selected.flatMap(l => [l.x1, l.y1, l.x2, l.y2])));
        const fitted = keep(new cv.Mat());
        cv.fitLine(points, fitted, cv.DIST_HUBER, 0, .01, .01);
        // fitLine can point either way. Orient the axis from flight to shaft.
        let [ux, uy, x, y] = fitted.data32F;
        if (ux * (contourEnd.x - flight.x) + uy * (contourEnd.y - flight.y) < 0) { ux = -ux; uy = -uy; }
        const axis = { x, y, ux, uy };
        const shaftEndpoints = selected.flatMap(line => [[line.x1, line.y1], [line.x2, line.y2]]);
        const support = shaftEndpoints.map(([px, py]) => (px - flight.x) * ux + (py - flight.y) * uy);
        const supportRange = [Math.max(flight.radius * 1.4, Math.min(...support)), Math.max(...support)];
        // Make the strip wide enough for both detected shaft edges plus a margin.
        const corridor = Math.max(2 * scale, ...shaftEndpoints.map(([px, py]) => Math.abs((px - x) * uy - (py - y) * ux) + 2 * scale));
        const endpoint = findTipInMask(mask.data, objectMask.data, width, height, flight, axis, scale, supportRange, corridor);
        return { ...endpoint, lines: selected, axis, reach, reason: endpoint.tip ? 'Uiterste maskerpixel gevonden. Controleer het gele kruisje.' : 'Schachtlijn gevonden, maar geen bijbehorend uiteinde in het masker.' };
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
