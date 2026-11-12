import { getOpenCV, captureFrame } from './opencv.js';

// Cardinal positions on the scoring boundary, not the number ring or surround.
const names = ['boven (midden dubbel 20)', 'rechts (midden dubbel 6)', 'onder (midden dubbel 3)', 'links (midden dubbel 11)'];
const target = [240, 20, 460, 240, 240, 460, 20, 240];

export function initCalibration(video, canvas, onActive) {
    const button = document.getElementById('calibrate');
    const cancel = document.getElementById('cancel-calibration');
    const status = document.getElementById('calibration-status');
    const preview = document.getElementById('calibration-preview');
    let points = [];
    let frame;
    let active = false;
    const finish = () => {
        active = false;
        cancel.hidden = true;
        canvas.style.touchAction = '';
        onActive(false);
    };
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            await getOpenCV();
            captureFrame(video, canvas);
            frame = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
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
            ctx.putImageData(frame, 0, 0);
            const src = keep(cv.imread(canvas));
            const from = keep(cv.matFromArray(4, 1, cv.CV_32FC2, points.flat()));
            const to = keep(cv.matFromArray(4, 1, cv.CV_32FC2, target));
            const transform = keep(cv.getPerspectiveTransform(from, to));
            const result = keep(new cv.Mat());
            cv.warpPerspective(src, result, transform, new cv.Size(480, 480));
            cv.imshow(preview, result);
            const out = preview.getContext('2d');
            out.strokeStyle = '#00ff00'; out.lineWidth = 1;
            for (const radius of [6.35, 15.9, 99, 107, 162, 170]) {
                out.beginPath(); out.arc(240, 240, radius / 170 * 220, 0, 2 * Math.PI); out.stroke();
            }
            for (let i = 0; i < 20; i++) {
                const angle = (i * 18 - 99) * Math.PI / 180;
                out.beginPath(); out.moveTo(240 + Math.cos(angle)*15.9/170*220, 240 + Math.sin(angle)*15.9/170*220);
                out.lineTo(240 + Math.cos(angle)*220, 240 + Math.sin(angle)*220); out.stroke();
            }
            preview.hidden = false;
            status.textContent = 'Kalibratievoorbeeld gereed. Controleer of bull, ringen en sectoren op de groene lijnen liggen. Zo niet: kalibreer opnieuw. Deze kalibratie geldt voor dit stilstaande beeld; houd de camera op dezelfde plek.';
        } catch (error) { status.textContent = error.message; }
        finally { for (const mat of mats.reverse()) mat.delete(); finish(); }
    });
}
