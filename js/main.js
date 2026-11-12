
import { startCamera } from "./camera.js";
import { detectBoard } from "./detection.js";
import { initCalibration } from "./calibration.js";

const startButton = document.getElementById("start");
const detectButton = document.getElementById("detect");
const video = document.getElementById("camera");
const canvas = document.getElementById("output");
const status = document.getElementById("status");

// Initialize calibration settings
const calibrateButton = document.getElementById("calibrate");
initCalibration(video, canvas, active => {
    detectButton.disabled = active;
    calibrateButton.disabled = active;
});

startButton.addEventListener("click", async () => {
    try {
        await startCamera(video);

        status.textContent = "Camera connected!";
        startButton.disabled = true;
        detectButton.disabled = false;
        calibrateButton.disabled = false;

    } catch (error) {
        status.textContent = error.message;
    }
});

detectButton.addEventListener("click", async () => {
    detectButton.disabled = true;
    calibrateButton.disabled = true;
    status.textContent = "Detecting dartboard...";

    try {
        document.getElementById('toggle-overlay').hidden = true;
        document.getElementById('camera-stage').classList.add('frozen');
        canvas.hidden = false;
        const found = await detectBoard(video, canvas);

        status.textContent = found
            ? "Circle detected!"
            : "No circle found. Move closer or adjust lighting.";

    } catch (error) {
        status.textContent = error.message;
    } finally {
        detectButton.disabled = false;
        calibrateButton.disabled = false;
    }
});
