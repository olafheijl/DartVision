import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compensateExposure } from '../js/dart-opencv.js';
import { frameChange } from '../js/dart.js';

test('global exposure change is compensated while a local new dart remains',()=>{
    const width=100,height=100;
    const reference={width,height,data:new Uint8ClampedArray(width*height*4)};
    for(let i=0;i<reference.data.length;i+=4)reference.data.set([80,100,120,255],i);
    const image={width,height,data:new Uint8ClampedArray(reference.data)};
    for(let i=0;i<image.data.length;i+=4)image.data.set([110,120,130,255],i);
    for(let x=30;x<70;x++)image.data.set([230,230,230,255],(50*width+x)*4);
    const corrected=compensateExposure(reference,image);
    assert.deepEqual([...corrected.data.slice(0,4)],[80,100,120,255]);
    assert.ok(frameChange(reference,corrected)>0);
    assert.ok(frameChange(reference,corrected)<.01);
    assert.deepEqual([...reference.data.slice(0,4)],[80,100,120,255]);
});
