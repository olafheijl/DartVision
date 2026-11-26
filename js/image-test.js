import { getOpenCV } from './opencv-runtime.js';

// Foto's uit public/assets: eerst het lege bord, daarna het bord met dart.
const BOARD_BEFORE_PHOTO = '/assets/T2L.jpeg';
const BOARD_AFTER_PHOTE = '/assets/T2.jpeg';

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

document.getElementById('run').addEventListener('click', async () => {
    const run_button = document.getElementById('run');
    const status = document.getElementById('status');
    const mats = [];

    run_button.disabled = true;

    try {
        const { cv } = await getOpenCV();

        const boardBefore = await loadImageData(BOARD_BEFORE_PHOTO);
        const boardAfter = await loadImageData(BOARD_AFTER_PHOTE);

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

        for (const candidate of candidates) {
            objectMask.setTo(new cv.Scalar(0));
            cv.drawContours(objectMask, contours, candidate.contourIndex, new cv.Scalar(255), -1);
            cv.distanceTransform(objectMask, distanceMat, cv.DIST_L2, 5);

            const measurement = cv.minMaxLoc(distanceMat);
            if (measurement.maxVal > largestThickness) {
                largestThickness = measurement.maxVal;
                flightPoint = { x: measurement.maxLoc.x, y: measurement.maxLoc.y };
            }
        }

        if (flightPoint) {
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

        run_button.disabled = false;
    }
});
