let pending;
export function getOpenCV() {
    // Some OpenCV builds are self-resolving thenables. Never await/resolve the
    // module itself: wrap it to avoid an infinite Promise assimilation loop.
    if (!pending) pending = new Promise((resolve, reject) => {
        const deadline = Date.now() + 30000;
        let subscribed = false;
        let loaded;
        let settled = false;
        const check = () => {
            if (settled) return;
            try {
                const cv = loaded || window.cv;
                if (cv && typeof cv.Mat === 'function') {
                    settled = true;
                    resolve({ cv });
                    return;
                }
                if (cv && typeof cv.then === 'function' && !subscribed) {
                    subscribed = true;
                    cv.then(module => { loaded = module; }, error => {
                        settled = true;
                        reject(error);
                    });
                }
                if (Date.now() >= deadline) throw new Error('OpenCV laden duurt te lang. Controleer je internet en herlaad de pagina.');
                setTimeout(check, 100);
            } catch (error) { settled = true; reject(error); }
        };
        check();
    }).catch(error => { pending = undefined; throw error; });
    return pending;
}

export function captureFrame(video, canvas) {
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
        throw new Error('Nog geen camerabeeld. Wacht even en probeer opnieuw.');
    }
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
}
