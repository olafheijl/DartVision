import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBluePoint, nearWire } from '../js/pointer.js';
import { invertMatrix, projectPoint } from '../js/calibration.js';
import { calculateScore } from '../js/scoring.js';
function image(blobs) {
    const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
    for(const [x,y] of blobs) for(let dy=0;dy<3;dy++)for(let dx=0;dx<3;dx++)data.set([15,65,240,255],((y+dy)*width+x+dx)*4);
    return {width,height,data};
}
test('finds a small blue marker but rejects missing or ambiguous points',()=>{
    assert.deepEqual(findBluePoint(image([[40,50]])),{x:.415,y:.515});
    assert.equal(findBluePoint(image([])),null);
    assert.equal(findBluePoint(image([[20,20],[70,70]])),null);
});
test('flags ring and sector wires without rejecting sector centres',()=>{
    assert.equal(nearWire(0,-103),false);
    assert.equal(nearWire(0,-99),true);
    assert.equal(nearWire(100*Math.sin(Math.PI/20),-100*Math.cos(Math.PI/20)),true);
    assert.equal(nearWire(0,0),false);
});
test('inverse perspective maps camera points back to scoring coordinates',()=>{
    const matrix=[.9,.1,20,.05,.8,30,.0001,.0002,1];
    const canonical=[240,240-103*220/170];
    const camera=projectPoint(matrix,...canonical);
    const back=projectPoint(invertMatrix(matrix),...camera);
    assert.ok(Math.abs(back[0]-canonical[0])<1e-8);
    assert.equal(calculateScore((back[0]-240)*170/220,(back[1]-240)*170/220).label,'T20');
});
