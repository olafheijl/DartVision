import { calculateScore } from './scoring.js';
import { frameChange } from './dart.js';
import { getOpenCV } from './opencv.js';
import { analyseDart, drawDartAlignment, compensateExposure } from './dart-opencv.js';

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
    const frame=document.getElementById('dart-frame');
    const stage=document.getElementById('camera-stage');
    const referenceButton=document.getElementById('capture-reference');
    const recognise=document.getElementById('recognise-dart');
    const sample=document.createElement('canvas');
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    let timer,reference,previous,captureAt,quietSince,requestAt,cv;
    const show=(score,message)=>{value.textContent=score;detail.textContent=message;};
    function live() {
        stage.classList.remove('dart-result');frame.hidden=true;
        overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);
    }
    function stop() {
        clearInterval(timer);timer=null;reference=null;previous=null;captureAt=null;quietSince=null;requestAt=null;
        referenceButton.hidden=true;recognise.hidden=true;recognise.disabled=true;
        live();overlay.hidden=true;panel.hidden=true;
        document.body.classList.remove('tracking');
        button.textContent='Test dart herkennen';
    }
    referenceButton.addEventListener('click',()=>{
        live();reference=null;recognise.disabled=true;requestAt=null;
        captureAt=performance.now()+2000;quietSince=null;
        show('—','Haal je hand weg. Leeg bord vastleggen over 2 seconden…');
    });
    recognise.addEventListener('click',()=>{
        if(!reference)return;
        live();recognise.disabled=true;requestAt=performance.now();quietSince=null;
        show('…','Dart herkennen: haal je hand weg en houd de camera stil.');
    });
    document.addEventListener('calibration-change',()=>{stop();button.disabled=!calibration.ready;});
    button.addEventListener('click',async()=>{
        if(timer)return stop();
        if(!calibration.ready)return;
        button.disabled=true;
        try { ({cv}=await getOpenCV()); }
        catch(error){document.getElementById('status').textContent=error.message;return;}
        finally {button.disabled=!calibration.ready;}
        if(!calibration.ready)return;
        document.body.classList.add('tracking');
        panel.hidden=false;overlay.hidden=false;referenceButton.hidden=false;recognise.hidden=false;
        recognise.disabled=true;button.textContent='Stop darttest';
        reference=null;previous=null;captureAt=null;quietSince=null;requestAt=null;
        show('—','Maak het bord leeg en kies Leeg bord vastleggen.');
        timer=setInterval(()=>{
            try {
                if(!calibration.ready){stop();button.disabled=true;return;}
                if(video.readyState<2){show('—','Wachten op camerabeeld…');return;}
                // A result is deliberately frozen for inspection until a new request.
                if(reference&&captureAt===null&&requestAt===null)return;
                const scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));
                sample.width=Math.round(video.videoWidth*scale);sample.height=Math.round(video.videoHeight*scale);
                ctx.drawImage(video,0,0,sample.width,sample.height);
                const image=ctx.getImageData(0,0,sample.width,sample.height);
                const correctedPrevious=previous?compensateExposure(previous,image):image;
                const moving=frameChange(previous,correctedPrevious)>.008;
                previous=image;
                const now=performance.now();
                if(moving)quietSince=null;else if(quietSince===null)quietSince=now;
                const quiet=quietSince!==null&&now-quietSince>=700;
                if(captureAt!==null){
                    if(now<captureAt||!quiet){show('—','Leeg bord vastleggen: houd camera stil en haal je hand weg.');return;}
                    reference=image;captureAt=null;recognise.disabled=false;
                    show('—','Referentie gereed. Prik één dart in het bord en kies Herken dart.');return;
                }
                if(!reference)return;
                if(requestAt===null)return;
                if(now-requestAt>10000){requestAt=null;recognise.disabled=false;show('—','Beeld blijft bewegen. Zet de camera vast en probeer opnieuw.');return;}
                if(!quiet)return;
                requestAt=null;recognise.disabled=false;
                const result=analyseDart(cv,reference,image);
                frame.width=overlay.width=image.width;frame.height=overlay.height=image.height;
                frame.getContext('2d').putImageData(image,0,0);frame.hidden=false;
                stage.classList.add('dart-result');
                drawDartAlignment(overlay,result);
                if(!result.point){show('—',result.reason+' Bekijk de lijnen of probeer opnieuw.');return;}
                const board=calibration.toBoard(result.point.x,result.point.y);
                if(!board||!Number.isFinite(board.x+board.y)){show('—','Kalibreer opnieuw.');return;}
                if(nearWire(board.x,board.y)){show('—','Punt dicht bij een draad. Controleer het roze kruisje handmatig.');return;}
                const score=calculateScore(board.x,board.y);
                show(String(score.score),`Schatting: ${score.label} · groen: schacht, roze: punt. Beeld stilgezet.`);
            } catch(error){requestAt=null;recognise.disabled=!reference;live();show('—','Herkenning mislukt: '+error.message);}
        },150);
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
}
