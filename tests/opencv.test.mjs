import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOpenCV, captureFrame } from '../js/opencv.js';

test('OpenCV self-resolving thenable does not hang the loader', async () => {
    const module = { Mat() {}, then(callback) { callback(module); } };
    globalThis.window = { cv: module };
    const { cv } = await getOpenCV();
    assert.equal(cv, module);
    delete globalThis.window;
});

test('portrait capture preserves aspect ratio and bounds both dimensions', () => {
    const calls = [];
    const canvas = { getContext: () => ({ drawImage: (...args) => calls.push(args) }) };
    const video = { videoWidth: 1080, videoHeight: 1920, readyState: 2 };
    captureFrame(video, canvas);
    assert.equal(canvas.width, 360);
    assert.equal(canvas.height, 640);
    assert.equal(calls.length, 1);
});

test('capture rejects a camera without a ready frame', () => {
    assert.throws(() => captureFrame({ videoWidth: 0, videoHeight: 0, readyState: 0 }, {}), /Nog geen camerabeeld/);
});
