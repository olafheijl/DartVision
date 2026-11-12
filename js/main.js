
import { startCamera } from "./camera.js";

const startButton = document.getElementById("start");
const video = document.getElementById("camera");
const statusElement = document.getElementById("status");

startButton.addEventListener("click", async () => {
  try {
    await startCamera(video);

    statusElement.textContent = "Camera connected!";
    startButton.disabled = true;
  } catch (error) {
    statusElement.textContent =
      "Camera error: " + error.message;
  }
});
