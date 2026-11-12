
import { startCamera } from "./camera.js";
import { detectBoard } from "./detection.js";

const startButton = document.getElementById("start");
const detectButton = document.getElementById("detect");
const video = document.getElementById("camera");
const canvas = document.getElementById("output");
const status = document.getElementById("status");

startButton.addEventListener("click", async () => {
    try {
        await startCamera(video);

        status.textContent = "Camera connected!";
        startButton.disabled = true;
        detectButton.disabled = false;

    } catch (error) {
        status.textContent = error.message;
    }
});

detectButton.addEventListener("click", async () => {
    detectButton.disabled = true;
    status.textContent = "Detecting dartboard...";

    try {
        const found = await detectBoard(video, canvas);

        status.textContent = found
            ? "Circle detected!"
            : "No circle found. Move closer or adjust lighting.";

    } catch (error) {
        status.textContent = error.message;
    } finally {
        detectButton.disabled = false;
    }
});
