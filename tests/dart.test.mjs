import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameChange } from '../js/dart.js';
function frame(value=40) { return {width:2,height:2,data:new Uint8ClampedArray(16).fill(value)}; }
test('frame motion measurement and incompatible references',()=>{
    assert.equal(frameChange(frame(),frame()),0);
    assert.equal(frameChange(frame(),frame(210)),1);
    assert.equal(frameChange(null,frame()),1);
    assert.equal(frameChange(frame(40),frame(50)),0);
});
