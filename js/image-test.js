import { getOpenCV } from './opencv-runtime.js';

// Foto's uit public/assets: eerst het lege bord, daarna het bord met dart.
const THROW_NAME = 'D11'
const BOARD_BEFORE_PHOTO = '/assets/' + THROW_NAME + 'L.jpeg';
const BOARD_AFTER_PHOTO = '/assets/' + THROW_NAME + '.jpeg';

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

function imageSameSize(image1, image2) {
    if (image1.width !== image2.width) {
        return false;
    }
    if (image1.height !== image2.height) {
        return false;
    }
    return true;
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

// Begin in de gekozen contour en volg daarna witte pixels in de schachtstrook.
function findFurthestWhitePixel(maskMat, objectMask, flightPoint, direction, halfWidth, maxGap) {
    const { dx, dy } = direction;
    const { cols, rows, data } = maskMat;
    const objectPixels = objectMask.data;
    let tip = null;
    let furthest = 0;
    let closestToAxis = Infinity;
    const continuation = [];

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const index = y * cols + x;
            if (data[index] !== 255) continue;

            const offsetX = x - flightPoint.x;
            const offsetY = y - flightPoint.y;
            // De projectie bepaalt hoever de pixel langs de schacht ligt.
            const distance = offsetX * dx + offsetY * dy;
            const distanceToAxis = Math.abs(offsetX * dy - offsetY * dx);
            if (distance <= 0 || distanceToAxis > halfWidth) continue;

            if (!objectPixels[index]) {
                continuation.push({ x, y, distance, distanceToAxis });
                continue;
            }

            if (distance > furthest || (distance === furthest && distanceToAxis < closestToAxis)) {
                tip = { x, y };
                furthest = distance;
                closestToAxis = distanceToAxis;
            }
        }
    }

    if (!tip) return null;

    // Werk van dichtbij naar veraf. Na een te grote onderbreking stopt de zoeklijn.
    continuation.sort((a, b) => a.distance - b.distance || b.distanceToAxis - a.distanceToAxis);
    for (const pixel of continuation) {
        if (pixel.distance - furthest > maxGap) break;
        if (pixel.distance > furthest ||
            (pixel.distance === furthest && pixel.distanceToAxis < closestToAxis)) {
            tip = { x: pixel.x, y: pixel.y };
            furthest = pixel.distance;
            closestToAxis = pixel.distanceToAxis;
        }
    }

    return tip;
}

document.getElementById('run').addEventListener('click', async () => {
    const run_button = document.getElementById('run');
    const status = document.getElementById('status');
    const mats = [];

    run_button.disabled = true;

    try {
        const { cv } = await getOpenCV();

        const boardBefore = await loadImageData(BOARD_BEFORE_PHOTO);
        const boardAfter = await loadImageData(BOARD_AFTER_PHOTO);

        if (!imageSameSize(boardBefore, boardAfter)) {
            throw new Error('De foto’s moeten dezelfde afmetingen hebben.');
        }

        const boardBeforeMat = cv.matFromImageData(boardBefore);
        mats.push(boardBeforeMat);
        cv.imshow('board-before', boardBeforeMat);

        const boardAfterMat = cv.matFromImageData(boardAfter);
        mats.push(boardAfterMat);
        cv.imshow('board-after', boardAfterMat);

        const differenceMat = new cv.Mat();
        mats.push(differenceMat);

        const resultMat = new cv.Mat();
        mats.push(resultMat);

        cv.absdiff(boardBeforeMat, boardAfterMat, differenceMat);

        // Verwijder het transparantiekanaal voor de weergave.
        cv.cvtColor(differenceMat, resultMat, cv.COLOR_RGBA2GRAY);
        cv.imshow('board-difference', resultMat);
        cv.GaussianBlur(resultMat, resultMat, new cv.Size(9,9), 2, 2);
        cv.imshow('board-blur', resultMat);

        const maskMat = new cv.Mat();
        mats.push(maskMat);

        cv.threshold(resultMat, maskMat, 30, 255, cv.THRESH_BINARY);
        cv.imshow('mask', maskMat);

        // Stap 2
        const flightMaskMat = new cv.Mat();
        mats.push(flightMaskMat);

        const kernel = cv.getStructuringElement(
            cv.MORPH_ELLIPSE,
            new cv.Size(9, 9)
        );
        mats.push(kernel);

        cv.morphologyEx(
            maskMat,
            flightMaskMat,
            cv.MORPH_CLOSE,
            kernel
        );
        cv.imshow('flightmask', flightMaskMat);

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

        cv.cvtColor(boardAfterMat, contourResult, cv.COLOR_RGBA2RGB);

        const candidates = [];

        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);

            try {
                const area = cv.contourArea(contour);

                // Startwaarde om kleine ruisvlekken over te slaan.
                if (area < 50) continue;

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
            let tip = null;
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

                    // Stap 6: begin in de winnende contour en zoek verder langs de schacht.
                    objectMask.setTo(new cv.Scalar(0));
                    cv.drawContours(objectMask, contours, bestContourIndex, new cv.Scalar(255), -1);
                    const scale = Math.max(maskMat.cols, maskMat.rows) / 640;
                    const halfWidth = Math.max(3, 6 * scale);
                    const maxGap = Math.max(2, 12 * scale);
                    tip = findFurthestWhitePixel(maskMat, objectMask, flightPoint, direction, halfWidth, maxGap);
                }
            } finally {
                contour.delete();
            }

            cv.circle(contourResult, new cv.Point(flightPoint.x, flightPoint.y), 5, new cv.Scalar(255, 0, 0), -1);
            if (tip) {
                cv.circle(contourResult, new cv.Point(tip.x, tip.y), 5, new cv.Scalar(255, 230, 0), -1);
            }
            console.log('Mogelijke flight:', flightPoint);
            status.textContent = `Mogelijke flight: rode stip op (${flightPoint.x}, ${flightPoint.y}). ` +
                (tip ? ` Gele stip: verste witte pixel op (${tip.x}, ${tip.y}).` : ' Geen witte pixel gevonden in de schachtrichting.');
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

        run_button.disabled = false;
    }
});
