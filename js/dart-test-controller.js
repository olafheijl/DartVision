// Minimal capture harness. Add future recognition experiments here, using the
// untouched reference and throw frames; no dart or motion detection runs yet.
export function initDartTest(video, calibration) {
    const start = document.getElementById('test-dart');
    const captureReference = document.getElementById('capture-empty-board');
    const captureThrow = document.getElementById('capture-thrown-dart');
    const panel = document.getElementById('dart-test-panel');
    const status = document.getElementById('dart-test-status');
    const referenceCanvas = document.getElementById('empty-board-frame');
    const throwCanvas = document.getElementById('thrown-dart-frame');
    const viewport = document.querySelector('.camera-viewport');
    let active = false, reference = null, afterThrow = null;

    new ResizeObserver(entries => viewport.style.setProperty('--camera-available', `${Math.max(1, entries[0].contentRect.height)}px`)).observe(viewport);

    function reset() {
        reference = null; afterThrow = null;
        for (const canvas of [referenceCanvas, throwCanvas]) {
            canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            canvas.hidden = true;
        }
        captureThrow.disabled = true;
    }
    function stop() {
        active = false; reset();
        document.body.classList.remove('dart-testing');
        panel.hidden = captureReference.hidden = captureThrow.hidden = true;
        start.textContent = 'Test dart herkennen';
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
    start.addEventListener('click', () => {
        if (active) return stop();
        if (!calibration.ready) return;
        reset(); active = true;
        document.body.classList.add('dart-testing');
        panel.hidden = captureReference.hidden = captureThrow.hidden = false;
        start.textContent = 'Stop darttest';
        status.textContent = 'Maak het bord leeg en leg het referentiebeeld vast.';
    });
    captureReference.addEventListener('click', () => {
        try {
            reference = capture(referenceCanvas);
            afterThrow = null; throwCanvas.hidden = true;
            throwCanvas.getContext('2d').clearRect(0, 0, throwCanvas.width, throwCanvas.height);
            captureThrow.disabled = false;
            status.textContent = `Leeg bord vastgelegd (${reference.width}×${reference.height}). Gooi een pijl, haal je hand weg en druk op Ik heb een pijl gegooid.`;
        } catch (error) { status.textContent = error.message; }
    });
    captureThrow.addEventListener('click', () => {
        if (!reference) return;
        try {
            afterThrow = capture(throwCanvas);
            status.textContent = 'Beeld na de worp vastgelegd. Beide beelden staan klaar voor een volgende herkenningstechniek.';
        } catch (error) { status.textContent = error.message; }
    });
    function calibrationChanged() {
        stop(); start.disabled = !calibration.ready;
    }
    document.addEventListener('calibration-change', calibrationChanged);
    video.addEventListener('resize', () => { if (!calibration.ready) calibrationChanged(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    return { getFrames: () => ({ reference, afterThrow }) };
}
