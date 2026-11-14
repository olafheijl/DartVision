import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectPoint } from '../js/board-calibration.js';

test('overlay projects board coordinates through perspective division', () => {
    assert.deepEqual(projectPoint([1,0,0,0,1,0,0,0,1],240,240),[240,240]);
    assert.deepEqual(projectPoint([2,0,10,0,3,20,0,0,1],5,10),[20,50]);
    assert.deepEqual(projectPoint([1,0,0,0,1,0,0.01,0,1],100,50),[50,25]);
});
