import { getOpenCV, captureFrame } from './opencv-runtime.js';

// Cardinal positions on the scoring boundary, not the number ring or surround.
const names = ['boven (midden dubbel 20)', 'rechts (midden dubbel 6)', 'onder (midden dubbel 3)', 'links (midden dubbel 11)'];
const target = [240, 20, 460, 240, 240, 460, 20, 240];

export function initCalibration(video, canvas, onActive) {
    const button = document.getElementById('calibrate');
    const cancel = document.getElementById('cancel-calibration');
    const status = document.getElementById('calibration-status');
    const preview = document.getElementById('toggle-overlay');
    const stage = document.getElementById('camera-stage');
    let inverse = null;
    let frameSize;
    let overlayVisible = true;
    preview.addEventListener('click', () => {
        overlayVisible = !overlayVisible;
        canvas.hidden = !overlayVisible;
        preview.textContent = overlayVisible ? 'Verberg uitlijning' : 'Toon uitlijning';
    });
    let points = [];
    let active = false;
    const finish = () => {
        active = false;
        cancel.hidden = true;
        canvas.style.touchAction = '';
        canvas.style.pointerEvents = 'none';
        onActive(false);
    };
    button.addEventListener('click', async () => {
        clearOverlay();
        button.disabled = true;
        try {
            await getOpenCV();
            captureFrame(video, canvas);
            canvas.hidden = false;
            canvas.style.pointerEvents = 'auto';
            stage.classList.add('frozen');
            points = [];
            active = true;
            preview.hidden = true;
            cancel.hidden = false;
            canvas.style.touchAction = 'none';
            onActive(true);
            status.textContent = `Tik op de buitenrand van de dubbelring: ${names[0]}.`;
            canvas.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (error) {
            status.textContent = error.message;
            button.disabled = false;
        }
    });
    cancel.addEventListener('click', () => {
        finish();
        stage.classList.remove('frozen');
        canvas.hidden = true;
        status.textContent = 'Kalibratie geannuleerd. Start opnieuw om punten te markeren.';
    });
    canvas.addEventListener('pointerdown', async event => {
        if (!active) return;
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        points.push([(event.clientX - rect.left) * canvas.width / rect.width,
            (event.clientY - rect.top) * canvas.height / rect.height]);
        const ctx = canvas.getContext('2d');
        const [x, y] = points.at(-1);
        ctx.fillStyle = '#00ff00';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill();
        if (points.length < 4) {
            status.textContent = `Tik op de buitenrand van de dubbelring: ${names[points.length]}.`;
            return;
        }
        active = false;
        const mats = [];
        try {
            // Require a consistently clockwise convex quadrilateral with useful area.
            for (let i = 0; i < 4; i++) {
                const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
                if ((b[0]-a[0])*(c[1]-b[1]) - (b[1]-a[1])*(c[0]-b[0]) < 25) {
                    throw new Error('De punten vormen geen geldig bord. Probeer opnieuw in de volgorde boven, rechts, onder, links.');
                }
            }
            const { cv } = await getOpenCV();
            const keep = mat => { mats.push(mat); return mat; };
            const from = keep(cv.matFromArray(4, 1, cv.CV_32FC2, target));
            const to = keep(cv.matFromArray(4, 1, cv.CV_32FC2, points.flat()));
            const transform = keep(cv.getPerspectiveTransform(from, to));
            showOverlay(Array.from(transform.data64F));
            status.textContent = 'Controleer de gekleurde bull en D20 / D6 / D3 / D11 op het livebeeld. Camera verplaatst? Kalibreer opnieuw.';
        } catch (error) { status.textContent = error.message; stage.classList.remove('frozen'); canvas.hidden = true; }
        finally { for (const mat of mats.reverse()) mat.delete(); finish(); }
    });
    function clearOverlay() {
        inverse = null;
        document.dispatchEvent(new Event("calibration-change"));
        preview.hidden = true;
        canvas.hidden = true;
        canvas.style.pointerEvents = 'none';
        stage.classList.remove('frozen');
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    function showOverlay(matrix) {
        inverse = invertMatrix(matrix);
        frameSize = [video.videoWidth, video.videoHeight];
        document.dispatchEvent(new Event('calibration-change'));
        drawOverlay(canvas.getContext('2d'), matrix);
        stage.classList.remove('frozen');
        canvas.style.pointerEvents = 'none';
        overlayVisible = true;
        canvas.hidden = false;
        preview.textContent = 'Verberg uitlijning';
        preview.hidden = false;
    }
    return {
        clear: clearOverlay,
        get ready() { return !!inverse && frameSize[0] === video.videoWidth && frameSize[1] === video.videoHeight; },
        toBoard(x, y) {
            if (!this.ready) return null;
            const [bx, by] = projectPoint(inverse, x * canvas.width, y * canvas.height);
            return { x: (bx - 240) * 170 / 220, y: (by - 240) * 170 / 220 };
        },
        showAutomatic(board) {
            showOverlay(board.matrix);
            status.textContent = 'Ellipsuitlijning: controleer bull, dubbels en T20. De richting van 20 wordt bovenaan aangenomen. Bij afwijking: kalibreer handmatig.';
        }
    };

}

export function projectPoint(matrix, x, y) {
    const w = matrix[6] * x + matrix[7] * y + matrix[8];
    return [(matrix[0] * x + matrix[1] * y + matrix[2]) / w,
        (matrix[3] * x + matrix[4] * y + matrix[5]) / w];
}

function drawOverlay(ctx, matrix) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const scale = 220 / 170;
    const point = (radius, angle) => projectPoint(matrix,
        240 + Math.cos(angle) * radius * scale, 240 + Math.sin(angle) * radius * scale);
    function region(inner, outer, start, end, color) {
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
            const [x, y] = point(outer, start + (end - start) * i / 60);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let i = 60; i >= 0; i--) ctx.lineTo(...point(inner, start + (end - start) * i / 60));
        ctx.closePath(); ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    region(0, 15.9, 0, Math.PI * 2, 'rgba(255, 200, 0, .4)');
    region(0, 6.35, 0, Math.PI * 2, 'rgba(255, 80, 0, .6)');
    for (const [number, degrees, color] of [
        [20, -90, 'rgba(0, 220, 255, .5)'], [6, 0, 'rgba(255, 180, 0, .5)'],
        [3, 90, 'rgba(255, 80, 200, .5)'], [11, 180, 'rgba(100, 255, 100, .5)']
    ]) {
        region(162, 170, (degrees - 9) * Math.PI / 180, (degrees + 9) * Math.PI / 180, color);
        const [x, y] = point(145, degrees * Math.PI / 180);
        ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = '#111827'; ctx.strokeText(`D${number}`, x, y);
        ctx.fillStyle = 'white'; ctx.fillText(`D${number}`, x, y);
    }
    ctx.strokeStyle = 'rgba(0, 255, 180, .85)'; ctx.lineWidth = 1;
    for (const radius of [99, 107, 170]) {
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
            const p = point(radius, i / 120 * Math.PI * 2);
            if (i === 0) ctx.moveTo(...p); else ctx.lineTo(...p);
        }
        ctx.stroke();
    }
}

export function invertMatrix(m) {
    const [a,b,c,d,e,f,g,h,i] = m;
    const cof = [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
    const determinant = a*cof[0]+b*cof[3]+c*cof[6];
    if (!Number.isFinite(determinant) || Math.abs(determinant)<1e-12) throw new Error('Ongeldige kalibratie. Kalibreer opnieuw.');
    return cof.map(value => value/determinant);
}
