import { getOpenCV } from './opencv-runtime.js';

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

document.getElementById('run').addEventListener('click', async () => {
    const button = document.getElementById('run');
    const status = document.getElementById('status');
    const mats = [];

    button.disabled = true;

    try {
        const { cv } = await getOpenCV();

        const dartbord0 = await loadImageData('/assets/dartbord0.jpeg');
        const dartbord1 = await loadImageData('/assets/dartbord1.jpeg');
        const dartbord2 = await loadImageData('/assets/dartbord2.jpeg');

        if (
            dartbord0.width !== dartbord1.width ||
            dartbord0.height !== dartbord1.height || 
            dartbord0.width !== dartbord2.width ||
            dartbord0.height !== dartbord2.height
        ) {
            throw new Error('De foto’s moeten dezelfde afmetingen hebben.');
        }

        const dartbord0Mat = cv.matFromImageData(dartbord0);
        mats.push(dartbord0Mat);
        
        const dartbord1Mat = cv.matFromImageData(dartbord1);
        mats.push(dartbord1Mat);
        
        const dartbord2Mat = cv.matFromImageData(dartbord2);
        mats.push(dartbord2Mat);

        const differenceMat = new cv.Mat();
        mats.push(differenceMat);

        const resultMat = new cv.Mat();
        mats.push(resultMat);

        cv.imshow('empty-bord', dartbord0Mat);
        cv.imshow('bord-1', dartbord1Mat);
        cv.imshow('bord-2', dartbord2Mat);

        // Hier kun je experimenteren met tussenstappen.
        cv.absdiff(dartbord0Mat, dartbord1Mat, differenceMat);

        // Verwijder het transparantiekanaal voor de weergave.
        cv.cvtColor(differenceMat, resultMat, cv.COLOR_RGBA2GRAY);

        const maskMat = new cv.Mat();
        mats.push(maskMat);

        cv.threshold(resultMat, maskMat, 20, 255, cv.THRESH_BINARY);
        cv.imshow('result', maskMat);


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

        cv.imshow('flight-mask', flightMaskMat);

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

        cv.cvtColor(dartbord1Mat, contourResult, cv.COLOR_RGBA2RGB);

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

        cv.imshow('contour-result', contourResult);
        console.table(candidates);
        status.textContent = 'Verschilbeeld gereed.';
    } catch (error) {
        status.textContent = error.message;
    } finally {
        for (const mat of mats) {
            mat.delete();
        }

        button.disabled = false;
    }
});