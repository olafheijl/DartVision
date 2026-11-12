import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDartPoint, frameChange } from '../js/dart.js';
function frame(shape) {
    const width=240,height=180,data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const changed=shape?.(x,y);
        data.set(changed?[210,210,210,255]:[40,40,40,255],(y*width+x)*4);
    }
    return {width,height,data};
}
const dart=(x,y)=>x>=70&&x<=150&&Math.abs(y-80)<=(x<120?1+(x-70)*.04:3+(x-120)*.4);
test('new tapered dart locates narrow endpoint rather than flight',()=>{
    const result=findDartPoint(frame(),frame(dart));
    assert.ok(result.point,result.reason);
    assert.ok(Math.abs(result.point.x*240-70)<3);
    assert.ok(Math.abs(result.point.y*180-80)<2);
});
test('no dart, broad hand, symmetric shaft and multiple darts are rejected',()=>{
    for(const shape of [undefined,()=>true,(x,y)=>x>70&&x<150&&Math.abs(y-80)<3,(x,y)=>dart(x,y)||dart(x,y-50)]){
        assert.equal(findDartPoint(frame(),frame(shape)).point,undefined);
    }
});
test('frame motion measurement and incompatible references',()=>{
    assert.equal(frameChange(frame(),frame()),0);
    assert.equal(frameChange(frame(),frame(()=>true)),1);
    assert.ok(findDartPoint(null,frame()).reason);
});
