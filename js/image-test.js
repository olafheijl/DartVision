import { getOpenCV } from './opencv-runtime.js';
import { analyseImageDart, drawImageDart } from './dart-image-analysis.js';

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

// Both the detailed comparison and the photo pairs use the same detection steps.
function compareImages(cv, before, after, showSteps = false) {
    if (before.width !== after.width || before.height !== after.height) {
        throw new Error('De foto’s moeten dezelfde afmetingen hebben.');
    }

    const mats = [];
    const keep = mat => {
        mats.push(mat);
        return mat;
    };
    const show = (id, mat) => {
        if (showSteps) cv.imshow(id, mat);
    };

    try {
        const beforeMat = keep(cv.matFromImageData(before));
        const afterMat = keep(cv.matFromImageData(after));
        const differenceMat = keep(new cv.Mat());
        const resultMat = keep(new cv.Mat());

        // Hier kun je experimenteren met tussenstappen.
        cv.absdiff(beforeMat, afterMat, differenceMat);

        // Verwijder het transparantiekanaal voor de weergave.
        cv.cvtColor(differenceMat, resultMat, cv.COLOR_RGBA2GRAY);

        const maskMat = keep(new cv.Mat());

        cv.threshold(resultMat, maskMat, 20, 255, cv.THRESH_BINARY);
        show('result', maskMat);


        // Stap 2
        const flightMaskMat = keep(new cv.Mat());

        const kernel = keep(cv.getStructuringElement(
            cv.MORPH_ELLIPSE,
            new cv.Size(5, 5)
        ));

        cv.morphologyEx(
            maskMat,
            flightMaskMat,
            cv.MORPH_CLOSE,
            kernel
        );

        show('flight-mask', flightMaskMat);

        // Stap 3
        const contours = keep(new cv.MatVector());

        const hierarchy = keep(new cv.Mat());

        // Werk op een kopie, zodat flightMaskMat behouden blijft.
        const contourInput = keep(flightMaskMat.clone());

        cv.findContours(
            contourInput,
            contours,
            hierarchy,
            cv.RETR_EXTERNAL,
            cv.CHAIN_APPROX_SIMPLE
        );

        const contourResult = showSteps ? keep(new cv.Mat()) : null;
        if (contourResult) cv.cvtColor(afterMat, contourResult, cv.COLOR_RGBA2RGB);

        // Start the debug views with an unmarked photo and an empty mask.
        show('shaft-result', afterMat);
        show('tip-result', afterMat);
        if (showSteps) show('dart-mask', keep(cv.Mat.zeros(resultMat.rows, resultMat.cols, cv.CV_8UC1)));

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

                if (contourResult) cv.rectangle(
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
        const objectMask = keep(cv.Mat.zeros(flightMaskMat.rows, flightMaskMat.cols, cv.CV_8UC1));

        const distanceMat = keep(new cv.Mat());

        let flightPoint = null;
        let largestThickness = 0;
        let flightCandidate = null;

        for (const candidate of candidates) {
            objectMask.setTo(new cv.Scalar(0));
            cv.drawContours(objectMask, contours, candidate.contourIndex, new cv.Scalar(255), -1);
            cv.distanceTransform(objectMask, distanceMat, cv.DIST_L2, 5);

            const measurement = cv.minMaxLoc(distanceMat);
            if (measurement.maxVal > largestThickness) {
                largestThickness = measurement.maxVal;
                flightPoint = { x: measurement.maxLoc.x, y: measurement.maxLoc.y };
                flightCandidate = candidate;
            }
        }

        let result = { tip: null, message: 'Geen geschikt object gevonden om een mogelijke flight te markeren.' };
        if (flightPoint) {
            if (contourResult) cv.circle(contourResult, new cv.Point(flightPoint.x, flightPoint.y), 5, new cv.Scalar(255, 0, 0), -1);
            // Stap 5: rechte schachtranden en de geschatte schachtrichting.
            objectMask.setTo(new cv.Scalar(0));
            cv.drawContours(objectMask, contours, flightCandidate.contourIndex, new cv.Scalar(255), -1);
            const flightContour = contours.get(flightCandidate.contourIndex);
            let analysis;
            try {
                analysis = analyseImageDart(cv, resultMat,
                    { ...flightPoint, radius: largestThickness },
                    flightContour.data32S, flightCandidate.rect, maskMat, objectMask);
            } finally {
                flightContour.delete();
            }
            if (showSteps) {
                const shaftResult = keep(new cv.Mat());
                cv.cvtColor(afterMat, shaftResult, cv.COLOR_RGBA2RGB);
                drawImageDart(cv, shaftResult, flightPoint, analysis, false);
                show('shaft-result', shaftResult);

                const selectedMask = keep(new cv.Mat(resultMat.rows, resultMat.cols, cv.CV_8UC1));
                selectedMask.data.set(analysis.dartMask);
                const maskResult = keep(new cv.Mat());
                cv.cvtColor(selectedMask, maskResult, cv.COLOR_GRAY2RGB);
                drawImageDart(cv, maskResult, flightPoint, { lines: [], tip: analysis.tip }, true);
                show('dart-mask', maskResult);

                drawImageDart(cv, shaftResult, flightPoint, analysis, true);
                show('tip-result', shaftResult);
            }
            result = {
                tip: analysis.tip,
                message: `${analysis.lines.length} mogelijke schachtrand(en). ${analysis.reason}`
            };
        }

        show('contour-result', contourResult);
        return result;
    } finally {
        for (const mat of mats.reverse()) mat.delete();
    }
}

function showSource(cv, id, image) {
    const mat = cv.matFromImageData(image);
    try {
        cv.imshow(id, mat);
    } finally {
        mat.delete();
    }
}

function drawTip(canvas, image, tip) {
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.putImageData(image, 0, 0);
    if (!tip) return;

    const radius = Math.max(4, Math.max(image.width, image.height) / 150);
    context.beginPath();
    context.arc(tip.x + 0.5, tip.y + 0.5, radius, 0, 2 * Math.PI);
    context.fillStyle = '#ffe600';
    context.fill();
    context.lineWidth = radius / 3;
    context.strokeStyle = '#111827';
    context.stroke();
}

const assetUrl = filename => `${import.meta.env.BASE_URL}assets/${filename}.jpeg`;

async function runPhotoPair(cv, figure) {
    const id = encodeURIComponent(figure.id);
    const canvas = figure.querySelector('canvas') ?? figure.appendChild(document.createElement('canvas'));
    const status = figure.querySelector('[data-pair-status]') ?? figure.appendChild(document.createElement('p'));
    status.setAttribute('data-pair-status', '');
    status.setAttribute('role', 'status');
    status.textContent = 'Fotopaar laden…';
    canvas.hidden = true;

    try {
        const after = await loadImageData(assetUrl(id));
        drawTip(canvas, after, null);
        canvas.hidden = false;
        const before = await loadImageData(assetUrl(`${id}L`));
        const { tip, message } = compareImages(cv, before, after);
        if (tip) drawTip(canvas, after, tip);
        status.textContent = tip ? 'Gele stip: geschatte dartpunt.' : message;
    } catch (error) {
        status.textContent = `${figure.id}.jpeg / ${figure.id}L.jpeg: ${error.message}`;
    }
}

document.getElementById('run').addEventListener('click', async () => {
    const button = document.getElementById('run');
    const status = document.getElementById('status');
    const comparisonSelect = document.getElementById('comparison');
    button.disabled = true;
    comparisonSelect.disabled = true;
    status.textContent = 'Beelden laden en rechte randen zoeken…';

    try {
        const { cv } = await getOpenCV();
        // Process one pair at a time so large images don't accumulate in memory.
        for (const figure of document.querySelectorAll('figure[id]')) {
            await runPhotoPair(cv, figure);
        }

        const images = await Promise.all([0, 1, 2].map(index => loadImageData(assetUrl(`dartbord${index}`))));
        const sourceIds = ['empty-bord', 'bord-1', 'bord-2'];
        images.forEach((image, index) => showSource(cv, sourceIds[index], image));

        const [before, after] = comparisonSelect.value.split('-').map(Number);
        const { message } = compareImages(cv, images[before], images[after], true);
        status.textContent = message;
    } catch (error) {
        status.textContent = error.message;
    } finally {
        button.disabled = false;
        comparisonSelect.disabled = false;
    }
});
