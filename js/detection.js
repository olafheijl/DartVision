import { getOpenCV, captureFrame } from "./opencv.js";

export async function detectBoard(video, canvas) {
    const { cv } = await getOpenCV();
    captureFrame(video, canvas);
    const { width, height } = canvas;

    // Convert image to OpenCV matrices
    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    const circles = new cv.Mat();

    try {
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        // Reduce noise
        cv.GaussianBlur(
            gray, gray, new cv.Size(9, 9), 2, 2
        );

        // Detect circular shapes
        const minSize = Math.min(width, height);

        cv.HoughCircles(
            gray,
            circles,
            cv.HOUGH_GRADIENT,
            1.5,
            height / 4,
            100,
            35,
            Math.round(minSize * 0.20),
            Math.round(minSize * 0.49)
        );

        if (circles.cols === 0) {
            return null;
        }

        // Hough supplies possible centres only. A board rim is not a scoring ring.
        const candidates = [];
        for (let i = 0; i < circles.cols; i++) {
            candidates.push({ x: circles.data32F[i * 3], y: circles.data32F[i * 3 + 1] });
        }
        const best = findScoringRing(canvas.getContext('2d').getImageData(0, 0, width, height), candidates);

        return best;

    } finally {
        src.delete();
        gray.delete();
        circles.delete();
    }
}

// Recognise the coloured double AND triple rings at their regulation ratio.
// Returning null is preferable to mapping the numbers/surround onto the doubles.
export function findScoringRing(image, candidates) {
    const { width, height, data } = image;
    let best = null;
    let bestScore = 0;
    for (const { x, y } of candidates) {
        const maxRadius = Math.floor(Math.min(x, y, width - 1 - x, height - 1 - y));
        const profile = new Float64Array(maxRadius + 1);
        for (let r = 1; r <= maxRadius; r++) {
            let coloured = 0;
            for (let i = 0; i < 120; i++) {
                const angle = i / 120 * Math.PI * 2;
                const px = Math.round(x + r * Math.cos(angle));
                const py = Math.round(y + r * Math.sin(angle));
                const offset = (py * width + px) * 4;
                const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
                if ((red > 45 && red > green * 1.3 && red > blue * 1.3) ||
                    (green > 35 && green > red * 1.2 && green > blue * 1.15)) coloured++;
            }
            profile[r] = coloured / 120;
        }
        const sample = radius => {
            const r = Math.round(radius);
            return ((profile[r - 1] || 0) + (profile[r] || 0) + (profile[r + 1] || 0)) / 3;
        };
        for (let radius = Math.ceil(Math.min(width, height) * .12); radius <= maxRadius; radius++) {
            const double = sample(radius * 166 / 170);
            const triple = sample(radius * 103 / 170);
            const background = (sample(radius * .8) + sample(radius * 1.045)) / 2;
            const score = Math.min(double, triple) - background * .7;
            if (double < .22 || triple < .22 || score < .18 || score <= bestScore) continue;
            bestScore = score;
            best = { x, y, radius };
        }
    }
    return best;
}
