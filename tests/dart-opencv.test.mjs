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

test('follows a weak dark point beyond a bright shaft and stops at the board', async()=>{
    const { followDarkTip }=await import('../js/dart-opencv.js');
    const width=160,height=100;
    const reference={width,height,data:new Uint8ClampedArray(width*height*4).fill(80)};
    const image={width,height,data:new Uint8ClampedArray(reference.data)};
    for(let x=40;x<=75;x++)for(let y=49;y<=51;y++)image.data.set([65,65,65,255],(y*width+x)*4);
    const tip=followDarkTip(reference,image,{x:40,y:50},{x:1,y:0},70);
    assert.ok(tip.x>=74&&tip.x<=76,JSON.stringify(tip));
    assert.equal(tip.y,50);
});

test('does not extend a shaft into an unchanged or uniformly shadowed board',async()=>{
    const { followDarkTip }=await import('../js/dart-opencv.js');
    const width=160,height=100;
    const reference={width,height,data:new Uint8ClampedArray(width*height*4).fill(80)};
    for(const shade of [80,60]){
        const image={width,height,data:new Uint8ClampedArray(width*height*4).fill(shade)};
        assert.deepEqual(followDarkTip(reference,image,{x:40,y:50},{x:1,y:0},70),{x:40,y:50});
    }
});

test('aligns small background translations before calculating differences',async()=>{
    const {alignReference}=await import('../js/dart-opencv.js');
    const width=100,height=100,data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const v=((Math.floor(x/7)+Math.floor(y/9))%2)*120+40;
        data.set([v,v,v,255],(y*width+x)*4);
    }
    const reference={width,height,data};
    const image={width,height,data:new Uint8ClampedArray(data)};
    for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++)image.data.set(data.subarray(((y-1)*width+x+2)*4,((y-1)*width+x+2)*4+4),(y*width+x)*4);
    const aligned=alignReference(reference,image);
    let bad=0;
    for(let y=5;y<95;y++)for(let x=5;x<95;x++)if(aligned.data[(y*width+x)*4]!==image.data[(y*width+x)*4])bad++;
    assert.equal(bad,0);
});

test('needle refinement stops at a sharp point before a broad cast shadow',async()=>{
    const {refineNeedleTip}=await import('../js/dart-opencv.js');
    const width=180,height=100,reference={width,height,data:new Uint8ClampedArray(width*height*4)};
    for(let i=0;i<reference.data.length;i+=4)reference.data.set([180,180,180,255],i);
    const image={width,height,data:new Uint8ClampedArray(reference.data)};
    for(let x=30;x<=105;x++)for(let y=49;y<=51;y++)image.data.set([35,35,35,255],(y*width+x)*4);
    for(let x=106;x<=135;x++)for(let y=42;y<=58;y++)image.data.set([150,150,150,255],(y*width+x)*4);
    const tip=refineNeedleTip(reference,image,[30,50],[135,50]);
    assert.ok(tip);
    assert.ok(tip.x>100&&tip.x<108,JSON.stringify(tip));
});

test('a soft uniform shadow does not supply needle evidence',async()=>{
    const {refineNeedleTip}=await import('../js/dart-opencv.js');
    const width=180,height=100;
    const reference={width,height,data:new Uint8ClampedArray(width*height*4).fill(180)};
    const image={width,height,data:new Uint8ClampedArray(width*height*4).fill(150)};
    assert.equal(refineNeedleTip(reference,image,[30,50],[135,50]),null);
});

test('registration is inverted for scoring while display coordinates stay unchanged',async()=>{
    const {pointInReference}=await import('../js/dart-opencv.js');
    const point={x:.4,y:.6};
    const reference=pointInReference(point,{matrix:[1.01,.001,2,-.002,.99,-3]},640,480);
    const x=reference.x*640-.5,y=reference.y*480-.5;
    assert.ok(Math.abs((1.01*x+.001*y+2+.5)/640-point.x)<1e-9);
    assert.ok(Math.abs((-.002*x+.99*y-3+.5)/480-point.y)<1e-9);
    assert.deepEqual(point,{x:.4,y:.6});
});
