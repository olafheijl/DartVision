import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startCamera} from '../js/camera-stream.js';

test('requests native HD detail as preferences without requiring an exact resolution',async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
    const stream={};let requested,played=false;
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async constraints=>{requested=constraints;return stream;}}}});
    try{
        const video={play:async()=>{played=true;}};
        assert.equal(await startCamera(video),stream);
        assert.equal(video.srcObject,stream);assert.equal(played,true);
        assert.equal(requested.video.width.ideal,1920);
        assert.equal(requested.video.height.ideal,1080);
        assert.equal(requested.video.facingMode.ideal,'environment');
        assert.equal(requested.video.width.exact,undefined);
        assert.equal(requested.audio,false);
    }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
