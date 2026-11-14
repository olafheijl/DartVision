import { getOpenCV } from './opencv-runtime.js';

// Minimal capture harness. Add future recognition experiments here, using the
// untouched reference and throw frames; no dart or motion detection runs yet.
export function initDartTest(video, calibration) {
    const startButton = document.getElementById('test-dart');
    const captureReferenceButton = document.getElementById('capture-empty-board');
    const captureThrowButton = document.getElementById('capture-thrown-dart');
    const panel = document.getElementById('dart-test-panel');
    const status = document.getElementById('dart-test-status');
    const referenceCanvas = document.getElementById('empty-board-frame');
    const throwCanvas = document.getElementById('thrown-dart-frame');
    const testCanvas = document.getElementById('difference-canvas');
    const viewport = document.querySelector('.camera-viewport');
    let active = false, reference = null, afterThrow = null;

    new ResizeObserver(entries => viewport.style.setProperty('--camera-available', `${Math.max(1, entries[0].contentRect.height)}px`)).observe(viewport);

    function reset() {
        reference = null; afterThrow = null;
        for (const canvas of [referenceCanvas, throwCanvas, testCanvas]) {
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            canvas.hidden = true;
        }
        captureThrowButton.disabled = true;
    }
    function stop() {
        active = false; reset();
        document.body.classList.remove('dart-testing');
        panel.hidden = captureReferenceButton.hidden = captureThrowButton.hidden = true;
        startButton.textContent = 'Test dart herkennen';
    }
    function capture(canvas) {
        if (!calibration.ready) throw new Error('Kalibreer het bord opnieuw.');
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error('Wacht op camerabeeld en probeer opnieuw.');
        const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        canvas.hidden = false;
        return image;
    }
    startButton.addEventListener('click', () => {
        if (active) return stop();
        if (!calibration.ready) return;
        reset(); active = true;
        document.body.classList.add('dart-testing');
        panel.hidden = captureReferenceButton.hidden = captureThrowButton.hidden = false;
        startButton.textContent = 'Stop darttest';
        status.textContent = 'Maak het bord leeg en leg het referentiebeeld vast.';
    });
    captureReferenceButton.addEventListener('click', () => {
        try {
            reference = capture(referenceCanvas);
            afterThrow = null; throwCanvas.hidden = true;
            testCanvas.hidden = true;
            testCanvas.getContext('2d').clearRect(0, 0, testCanvas.width, testCanvas.height);
            throwCanvas.getContext('2d').clearRect(0, 0, throwCanvas.width, throwCanvas.height);
            captureThrowButton.disabled = false;
            status.textContent = `Leeg bord vastgelegd (${reference.width}×${reference.height}). Gooi een pijl, haal je hand weg en druk op Ik heb een pijl gegooid.`;
        } catch (error) { status.textContent = error.message; }
    });
    captureThrowButton.addEventListener('click', async () => {
        if (!reference) return;

        captureThrowButton.disabled = true;
        const mats = [];

        try {
            const { cv } = await getOpenCV();

            if (!active || !reference || !calibration.ready) {
                status.textContent = 'Niet klaar voor het verschil';
                return;
            }

            afterThrow = capture(throwCanvas);
            if (
                reference.width !== afterThrow.width ||
                reference.height !== afterThrow.height
            ) {
                throw new Error(
                    'De beeldafmetingen zijn veranderd. Leg het lege bord opnieuw vast.'
                );
            }

            status.textContent = 'Beeld na de worp vastgelegd. Beide beelden staan klaar voor een volgende herkenningstechniek.';
            const referenceMat = cv.matFromImageData(reference);
            mats.push(referenceMat);

            const afterThrowMat = cv.matFromImageData(afterThrow);
            mats.push(afterThrowMat);

            const differenceMat = new cv.Mat();
            mats.push(differenceMat);

            testCanvas.hidden = false;
            cv.absdiff(referenceMat, afterThrowMat, differenceMat);
            // Alpha also becomes zero in absdiff; display RGB to keep the result visible.
            cv.cvtColor(differenceMat, differenceMat, cv.COLOR_RGBA2RGB);
            cv.imshow('difference-canvas', differenceMat);
            
            status.textContent = 'Verschilbeeld gereed: lichte pixels geven veranderingen aan.';

        } catch (error) { 
            status.textContent = error.message; 
        } finally {
            for (const mat of mats) {
                mat.delete();
            }

            captureThrowButton.disabled = !active || !reference || !calibration.ready;
        }
    });
    function calibrationChanged() {
        stop(); startButton.disabled = !calibration.ready;
    }
    document.addEventListener('calibration-change', calibrationChanged);
    video.addEventListener('resize', () => { if (!calibration.ready) calibrationChanged(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    return { getFrames: () => ({ reference, afterThrow }) };
}
