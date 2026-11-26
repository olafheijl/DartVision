import { getOpenCV } from './opencv-runtime.js';

// Foto's uit public/assets: eerst het lege bord, daarna het bord met dart.
const EMPTY_BOARD_PHOTO = '/assets/S4L.jpeg';
const BOARD_WITH_DART_PHOTO = '/assets/S4.jpeg';

async function loadImageData(url) {
    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Schat de hoofdrichting van de contour en richt die van de flight af.
function findShaftDirection(cv, contour, flightPoint) {
    if (contour.rows < 2) return null;

    const line = new cv.Mat();
    try {
        cv.fitLine(contour, line, cv.DIST_L2, 0, 0.01, 0.01);
        let [dx, dy] = line.data32F;

        // De projectie geeft de afstand langs de lijn, gemeten vanaf de flight.
        let min = 0;
        let max = 0;
        const points = contour.data32S;
        for (let i = 0; i < points.length; i += 2) {
            const x = points[i] - flightPoint.x;
            const y = points[i + 1] - flightPoint.y;
            const distanceAlongLine = x * dx + y * dy;
            min = Math.min(min, distanceAlongLine);
            max = Math.max(max, distanceAlongLine);
        }

        // De langste kant van de contour is de vermoedelijke schachtkant.
        if (-min > max) {
            dx = -dx;
            dy = -dy;
        }

        return { dx, dy };
    } finally {
        line.delete();
    }
}

document.getElementById('run').addEventListener('click', async () => {
    const button = document.getElementById('run');
    const status = document.getElementById('status');
    const mats = [];

    button.disabled = true;

    try {
        const { cv } = await getOpenCV();

        const emptyBoard = await loadImageData(EMPTY_BOARD_PHOTO);
        const boardWithDart = await loadImageData(BOARD_WITH_DART_PHOTO);

        if (emptyBoard.width !== boardWithDart.width || emptyBoard.height !== boardWithDart.height) {
            throw new Error('De foto’s moeten dezelfde afmetingen hebben.');
        }

        const emptyBoardMat = cv.matFromImageData(emptyBoard);
        mats.push(emptyBoardMat);

        const boardWithDartMat = cv.matFromImageData(boardWithDart);
        mats.push(boardWithDartMat);

        const differenceMat = new cv.Mat();
        mats.push(differenceMat);

        const resultMat = new cv.Mat();
        mats.push(resultMat);

        cv.absdiff(emptyBoardMat, boardWithDartMat, differenceMat);

        // Verwijder het transparantiekanaal voor de weergave.
        cv.cvtColor(differenceMat, resultMat, cv.COLOR_RGBA2GRAY);

        const maskMat = new cv.Mat();
        mats.push(maskMat);

        cv.threshold(resultMat, maskMat, 20, 255, cv.THRESH_BINARY);

        // Stap 2
        const flightMaskMat = new cv.Mat();
        mats.push(flightMaskMat);

        const kernel = cv.getStructuringElement(
            cv.MORPH_ELLIPSE,
            new cv.Size(5, 5)
        );
        mats.push(kernel);

        cv.morphologyEx(
            maskMat,
            flightMaskMat,
            cv.MORPH_CLOSE,
            kernel
        );

        // Stap 3
        const contours = new cv.MatVector();
        mats.push(contours);

        const hierarchy = new cv.Mat();
        mats.push(hierarchy);

        // Werk op een kopie, zodat flightMaskMat behouden blijft.
        const contourInput = flightMaskMat.clone();
        mats.push(contourInput);

        cv.findContours(
            contourInput,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
        );

        // Teken kaders op een kleurenkopie van de oorspronkelijke foto.
        const contourResult = new cv.Mat();
        mats.push(contourResult);

        cv.cvtColor(boardWithDartMat, contourResult, cv.COLOR_RGBA2RGB);

        const candidates = [];

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);

            try {
                const area = cv.contourArea(contour);

                // Startwaarde om kleine ruisvlekken over te slaan.
                if (area < 30) continue;

                const rect = cv.boundingRect(contour);

                candidates.push({
                    contourIndex: i,
                    area,
                    rect
                });

                cv.rectangle(
                    contourResult,
                    new cv.Point(rect.x, rect.y),
                    new cv.Point(rect.x + rect.width, rect.y + rect.height),
                    new cv.Scalar(0, 255, 0),
                    2
                );
            } finally {
                contour.delete();
            }
        }

        // Stap 4: dikste deel van de vorm als mogelijke flight markeren.
        const objectMask = cv.Mat.zeros(flightMaskMat.rows, flightMaskMat.cols, cv.CV_8UC1);
        mats.push(objectMask);

        const distanceMat = new cv.Mat();
        mats.push(distanceMat);

        let flightPoint = null;
        let largestThickness = 0;
        let bestContourIndex = null;

        for (const candidate of candidates) {
            objectMask.setTo(new cv.Scalar(0));
            cv.drawContours(objectMask, contours, candidate.contourIndex, new cv.Scalar(255), -1);
            cv.distanceTransform(objectMask, distanceMat, cv.DIST_L2, 5);

            const measurement = cv.minMaxLoc(distanceMat);
            if (measurement.maxVal > largestThickness) {
                largestThickness = measurement.maxVal;
                bestContourIndex = candidate.contourIndex;
                flightPoint = { x: measurement.maxLoc.x, y: measurement.maxLoc.y };
            }
        }

        if (flightPoint) {
            // Stap 5: teken de geschatte schachtrichting vanaf de flight.
            const contour = contours.get(bestContourIndex);
            try {
                const direction = findShaftDirection(cv, contour, flightPoint);
                if (direction) {
                    const lineLength = 100;
                    const start = new cv.Point(flightPoint.x, flightPoint.y);
                    const end = new cv.Point(
                        Math.round(flightPoint.x + lineLength * direction.dx),
                        Math.round(flightPoint.y + lineLength * direction.dy)
                    );
                    cv.line(contourResult, start, end, new cv.Scalar(0, 160, 255), 3);
                }
            } finally {
                contour.delete();
            }

            cv.circle(contourResult, new cv.Point(flightPoint.x, flightPoint.y), 5, new cv.Scalar(255, 0, 0), -1);
            console.log('Mogelijke flight:', flightPoint);
            status.textContent = `Mogelijke flight: rode stip op (${flightPoint.x}, ${flightPoint.y}). Controleer of deze op de flight ligt.`;
        } else {
            status.textContent = 'Geen geschikt object gevonden om een mogelijke flight te markeren.';
        }

        cv.imshow('contour-result', contourResult);
        console.table(candidates);
    } catch (error) {
        status.textContent = error.message;
    } finally {
        for (const mat of mats) {
            mat.delete();
        }

        button.disabled = false;
    }
});
