import { calculateScore } from './scoring.js';

import { findDartPoint, frameChange } from './dart.js';

export function nearWire(x,y) {
    const radius=Math.hypot(x,y);
    if([6.35,15.9,99,107,162,170].some(r=>Math.abs(radius-r)<2)) return true;
    if(radius<15.9 || radius>172) return false;
    const angle=(Math.atan2(x,-y)*180/Math.PI+360)%360;
    const degrees=Math.abs(((angle+9)%18)-9);
    return radius*Math.sin((9-degrees)*Math.PI/180)<2;
}

export function initDartTracking(video, calibration) {
    const button=document.getElementById('track-pointer');
    const panel=document.getElementById('pointer-score');
    const value=document.getElementById('score-value');
    const detail=document.getElementById('score-detail');
    const overlay=document.getElementById('pointer-overlay');
    const sample=document.createElement('canvas');
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    const referenceButton=document.getElementById('capture-reference');
    let timer, stable=null, reference=null, previous=null, captureAt=null, quietSince=null;
    referenceButton.addEventListener('click',()=>{reference=null;stable=null;captureAt=performance.now()+2000;quietSince=null;show('—','Haal je hand weg. Leeg bord vastleggen over 2 seconden…');});
    const show=(score,message)=>{value.textContent=score;detail.textContent=message;};
    function stop() {
        clearInterval(timer);timer=null;stable=null;reference=null;previous=null;captureAt=null;quietSince=null;
        referenceButton.hidden=true;
        overlay.hidden=true;panel.hidden=true;
        document.body.classList.remove('tracking');
        button.textContent='Test dart herkennen';
    }
    document.addEventListener('calibration-change',()=>{
        stop();button.disabled=!calibration.ready;
    });
    button.addEventListener('click',()=>{
        if(timer) return stop();
        if(!calibration.ready) return;
        document.body.classList.add('tracking');
        panel.hidden=false;overlay.hidden=false;
        button.textContent='Stop darttest';
        referenceButton.hidden=false;
        reference=null;previous=null;captureAt=null;quietSince=null;
        show('—','Maak het bord leeg en kies Leeg bord vastleggen.');
        timer=setInterval(()=>{
            try {
                if(!calibration.ready) {stop();button.disabled=true;return;}
                if(video.readyState<2) {stable=null;show('—','Wachten op camerabeeld…');return;}
                const scale=640/Math.max(video.videoWidth,video.videoHeight);
                sample.width=Math.round(video.videoWidth*scale);sample.height=Math.round(video.videoHeight*scale);
                ctx.drawImage(video,0,0,sample.width,sample.height);
                overlay.width=sample.width;overlay.height=sample.height;
                const image=ctx.getImageData(0,0,sample.width,sample.height);
                const moving=frameChange(previous,image)>.008;
                previous=image;
                const now=performance.now();
                if(moving)quietSince=null;
                else if(quietSince===null)quietSince=now;
                if(captureAt!==null) {
                    if(now<captureAt || quietSince===null || now-quietSince<600) {show('—','Leeg bord vastleggen: houd camera stil en haal je hand weg.');return;}
                    reference=image;captureAt=null;stable=null;
                    show('—','Referentie vastgelegd. Prik nu één dart in het bord.');return;
                }
                if(!reference){show('—','Maak het bord leeg en kies Leeg bord vastleggen.');return;}
                if(moving||quietSince===null||now-quietSince<600){stable=null;show('…','Beweging zichtbaar — wacht en haal je hand weg.');return;}
                const detection=findDartPoint(reference,image);
                const point=detection.point;
                if(!point){stable=null;show('—',detection.reason);return;}
                const cross=overlay.getContext('2d'),px=point.x*overlay.width,py=point.y*overlay.height;
                cross.strokeStyle='#38bdf8';cross.lineWidth=2;
                cross.beginPath();cross.arc(px,py,7,0,Math.PI*2);cross.moveTo(px-12,py);cross.lineTo(px+12,py);cross.moveTo(px,py-12);cross.lineTo(px,py+12);cross.stroke();
                const board=calibration.toBoard(point.x,point.y);
                if(!board || !Number.isFinite(board.x+board.y)) {stable=null;show('—','Kalibreer opnieuw.');return;}
                if(nearWire(board.x,board.y)) {stable=null;show('—','Punt dicht bij een draad — controleer het bord handmatig.');return;}
                const score=calculateScore(board.x,board.y);
                if(!stable || stable.label!==score.label || Math.hypot(board.x-stable.x,board.y-stable.y)>3) {
                    stable={...board,label:score.label,since:now};
                }
                if(now-stable.since<500) show('…','Mogelijke dartpunt gevonden — controleren…');
                else show(String(score.score),`Schatting: ${score.label} · ${score.score} punten`);
            } catch {stable=null;overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);show('—','Dartmeting mislukt. Stop en probeer opnieuw.');}
        },100);
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
}
