export async function startCamera(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 15, max: 30 }
    },
    audio: false
  });

  videoElement.srcObject = stream;
  await videoElement.play();

  return stream;
}