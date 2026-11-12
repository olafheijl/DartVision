export async function startCamera(videoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" }
    },
    audio: false
  });

  videoElement.srcObject = stream;
  await videoElement.play();

  return stream;
}