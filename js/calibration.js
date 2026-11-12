
const STORAGE_KEY = "dartvision-calibration-method";

const METHODS = ["geometry", "wire", "hybrid"];

let currentMethod = "hybrid";

export function initCalibration() {
    const select = document.getElementById("calibration-method");

    // Restore previously selected method
    const savedMethod = localStorage.getItem(STORAGE_KEY);

    if (METHODS.includes(savedMethod)) {
        currentMethod = savedMethod;
    }

    select.value = currentMethod;

    select.addEventListener("change", () => {
        currentMethod = select.value;
        localStorage.setItem(STORAGE_KEY, currentMethod);

        console.log("Calibration method:", currentMethod);
    });
}

export function getCalibrationMethod() {
    return currentMethod;
}
