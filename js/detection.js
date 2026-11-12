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

        // Select circle closest to image center
        let best = null;
        let bestDistance = Infinity;

        for (let i = 0; i < circles.cols; i++) {
            const x = circles.data32F[i * 3];
            const y = circles.data32F[i * 3 + 1];
            const radius = circles.data32F[i * 3 + 2];

            const distance = Math.hypot(
                x - width / 2,
                y - height / 2
            );

            if (distance < bestDistance) {
                bestDistance = distance;
                best = { x, y, radius };
            }
        }

        return best;

    } finally {
        src.delete();
        gray.delete();
        circles.delete();
    }
}
