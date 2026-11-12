import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ellipseMatrix, selectBoardEllipse, project } from '../js/detection.js';
import { invertMatrix } from '../js/calibration.js';

function board(ellipse,{triple=true,coloured=true,bull=null}={}) {
    const width=500,height=500,data=new Uint8ClampedArray(width*height*4);
    const matrix=ellipseMatrix(ellipse,bull),inverse=invertMatrix(matrix);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const [u,v]=project(inverse,x,y),r=Math.hypot(u-240,v-240)*170/220;
        const ring=coloured&&((r>=162&&r<=170)||(triple&&r>=99&&r<=107)||r<15.9);
        const shade=r>215&&r<225?240:35;
        data.set(ring?[190,20,20,255]:[shade,shade,shade,255],(y*width+x)*4);
    }
    return {width,height,data};
}

test('recognises double and triple ellipses from frontal and side camera views',()=>{
    for(const [a,b,angle]of [[170,170,0],[80,170,0],[65,165,.35]]) {
        const ellipse={x:250,y:250,a,b,angle};
        const result=selectBoardEllipse(board(ellipse),[ellipse]);
        assert.ok(result,`axes ${a}/${b}`);
        const top=project(result.matrix,240,20),expected=project(ellipseMatrix(ellipse),240,20);
        assert.ok(Math.hypot(top[0]-expected[0],top[1]-expected[1])<5);
    }
});
test('rejects rim-only and single-ring ellipses',()=>{
    const ellipse={x:250,y:250,a:90,b:170,angle:0};
    assert.equal(selectBoardEllipse(board(ellipse,{coloured:false}),[ellipse]),null);
    assert.equal(selectBoardEllipse(board(ellipse,{triple:false}),[ellipse]),null);
});
test('uses visible bull to correct perspective within an ellipse',()=>{
    const ellipse={x:250,y:250,a:90,b:170,angle:.1};
    const bull={x:260,y:255,a:7,b:14,angle:0};
    const result=selectBoardEllipse(board(ellipse,{bull}),[ellipse,bull]);
    assert.ok(result);
    const centre=project(result.matrix,240,240);
    assert.ok(Math.hypot(centre[0]-bull.x,centre[1]-bull.y)<1);
    const edge=project(ellipseMatrix(ellipse,bull),240,20);
    const inverse=invertMatrix(ellipseMatrix(ellipse));
    const [x,y]=project(inverse,...edge);
    assert.ok(Math.abs(Math.hypot(x-240,y-240)-220)<1e-7);
});
