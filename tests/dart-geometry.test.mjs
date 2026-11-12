import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureShaft, extractFragments, fragmentGroups, medianFrame, consistentMeasurements } from '../js/dart-geometry.js';

function shape(scale=1,angle=0) {
    const points=[];
    for(let x=30;x<=150;x++){
        const width=x<90?2+(x-30)/30:8+(x-90)*.35;
        const offset=x<90?0:-Math.min(12,(x-90)/2);
        for(let y=Math.ceil(80+offset-width);y<=80+offset+width;y++){
            points.push([(x*Math.cos(angle)-y*Math.sin(angle))*scale,(x*Math.sin(angle)+y*Math.cos(angle))*scale,100]);
        }
    }
    return points;
}
test('fits narrow shaft sections while excluding a large off-centre flight',()=>{
    for(const angle of [0,.6,1.55])for(const scale of [1,2]){
        const result=measureShaft(shape(scale,angle),scale,[[Math.cos(angle),Math.sin(angle)]]);
        assert.ok(result,`angle ${angle} scale ${scale}`);
        assert.ok(Math.abs(result.fit.axis[0]*Math.cos(angle)+result.fit.axis[1]*Math.sin(angle))>.995);
        assert.ok(result.sections.some(s=>!s.used));
        assert.ok(result.sections.filter(s=>s.used).length>=5);
        assert.equal(result.directionClear,true);
    }
});
test('separate collinear pieces are retained and merged, including a faint unseeded tip',()=>{
    const width=240,height=180,field=new Uint8Array(width*height);
    for(let x=25;x<140;x++)for(let y=78;y<=82;y++){
        if(x>=50&&x<62)continue;
        field[y*width+x]=x<50?12:90;
    }
    const {fragments}=extractFragments(field,width,height,1);
    assert.equal(fragments.length,2);
    assert.ok(fragments.some(f=>f.seeded===false));
    const groups=fragmentGroups(fragments,1);
    assert.ok(groups.some(g=>g.fragments===2));
});
test('parallel neighbouring objects do not merge',()=>{
    const a=[],b=[];
    for(let x=20;x<100;x++)for(let y=0;y<4;y++){a.push([x,40+y,90]);b.push([x,75+y,90]);}
    assert.ok(fragmentGroups([a,b],1).every(g=>g.fragments===1));
});
test('a broad hand and a compact flight do not provide a shaft measurement',()=>{
    const points=[];
    for(let x=20;x<90;x++)for(let y=20;y<80;y++)points.push([x,y,100]);
    assert.equal(measureShaft(points,1),null);
});
test('median capture removes transient pixels and rejects incompatible images',()=>{
    const frames=[10,250,12].map(v=>({width:1,height:1,data:new Uint8ClampedArray([v,v,v,255])}));
    assert.equal(medianFrame(frames).data[0],12);
    assert.throws(()=>medianFrame(frames.slice(0,2)));
});
test('score requires three independently consistent tip locations in board coordinates',()=>{
    const transform=(x,y)=>({x:x*340,y:y*340});
    const results=[.4,.401,.402].map(x=>({point:{x,y:.5},reason:'ok'}));
    assert.equal(consistentMeasurements(results,transform).agreement,3);
    assert.ok(consistentMeasurements(results,transform).point);
    assert.equal(consistentMeasurements([results[0],results[1],{reason:'missing'}],transform).point,undefined);
    assert.equal(consistentMeasurements([results[0],results[1],{point:{x:.6,y:.5}}],transform).point,undefined);
});

test('small movements across a scoring boundary are not accepted as consensus',()=>{
    const results=[15.2,16.2,15.8].map(x=>({point:{x,y:0}}));
    assert.equal(consistentMeasurements(results,(x,y)=>({x,y})).point,undefined);
});
