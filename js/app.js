
import { startCamera } from "./camera-stream.js";
import { detectBoard } from "./board-detection.js";
import { initDartTest } from "./dart-test-controller.js";
import { initCalibration } from "./board-calibration.js";

const startButton = document.getElementById("start");
const detectButton = document.getElementById("detect");
const video = document.getElementById("camera");
const canvas = document.getElementById("output");
const status = document.getElementById("status");

// Initialize calibration settings
const calibrateButton = document.getElementById("calibrate");
const calibration = initCalibration(video, canvas, active => {
    detectButton.disabled = active;
    calibrateButton.disabled = active;
});

initDartTest(video, calibration);

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
        calibration.clear();
        const found = await detectBoard(video, canvas);
        if (found) calibration.showAutomatic(found);
        else {
            calibration.clear();
            document.getElementById('calibration-status').textContent = 'Geen bord gevonden. Probeer opnieuw of kalibreer handmatig.';
        }

        status.textContent = found
            ? "Bordellips gevonden — controleer de uitlijning."
            : "Geen betrouwbare dubbel- en triple-ring gevonden. Verbeter de belichting of kalibreer handmatig.";

    } catch (error) {
        calibration.clear();
        document.getElementById("calibration-status").textContent = "Detectie mislukt. Probeer opnieuw of kalibreer handmatig.";
        status.textContent = error.message;
    } finally {
        detectButton.disabled = false;
        calibrateButton.disabled = false;
    }
});
