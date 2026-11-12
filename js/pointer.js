import { calculateScore } from './scoring.js';
import { frameChange } from './dart.js';
import { getOpenCV } from './opencv.js';
import { medianFrame, consistentMeasurements } from './dart-geometry.js';
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
    const diagnostics=document.getElementById('dart-diagnostics');
    const save=document.getElementById('save-measurement');
    let timer,reference,previous,captureAt,quietSince,requestAt,cv;
    let referenceFrames=[],captureFrames=[],results=[],analysing=false,record=null,lastVideoTime=-1;
    const viewport=document.querySelector('.camera-viewport');
    new ResizeObserver(entries=>viewport.style.setProperty('--camera-available', `${Math.max(1,entries[0].contentRect.height)}px`)).observe(viewport);
    save.addEventListener('click',()=>{
        if(!record)return;
        const encode=image=>{
            const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
            const rgba=new ImageData(new Uint8ClampedArray(image.data),image.width,image.height);
            canvas.getContext('2d').putImageData(rgba,0,0);return canvas.toDataURL('image/png');
        };
        const data={format:'dartvision-measurement-v1',engine:'thin-sections-v2',createdAt:new Date().toISOString(),
            width:record.reference.width,height:record.reference.height,camera:{width:video.videoWidth,height:video.videoHeight},
            reference:encode(record.reference),frames:record.frames.map(encode),
            results:record.results,result:record.result,
            boardCorners:[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>({image:{x,y},board:calibration.toBoard(x,y)}))};
        const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
        const link=document.createElement('a');link.href=url;link.download=`dartvision-meting-${Date.now()}.json`;link.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    function resetMeasurements(){captureFrames=[];results=[];analysing=false;record=null;save.hidden=true;diagnostics.textContent='';}
    function presentResult(result,image){
        requestAt=null;recognise.disabled=false;
        frame.width=overlay.width=image.width;frame.height=overlay.height=image.height;
        frame.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),0,0);frame.hidden=false;
        stage.classList.add('dart-result');drawDartAlignment(overlay,result);
        const d=result.diagnostics;
        diagnostics.textContent=d?`${image.width}×${image.height} · ${d.fragments} fragment(en) · ${d.usedSections||0} smalle doorsneden · ${result.agreement||0}/3 beelden eens`:`${result.agreement||0}/3 beelden eens`;
        record={reference,frames:captureFrames,results,result};save.hidden=false;
        if(!result.point){show('—',result.reason);return;}
        const calibrated=result.boardPoint||result.point;
        const board=calibration.toBoard(calibrated.x,calibrated.y);
        if(!board||!Number.isFinite(board.x+board.y)){show('—','Kalibreer opnieuw.');return;}
        if(nearWire(board.x,board.y)){show('—','Punt dicht bij een draad. Controleer het roze kruisje handmatig.');return;}
        const score=calculateScore(board.x,board.y);
        show(String(score.score),`Schatting: ${score.label} · blauw: meetdoorsneden, groen: schacht, roze: punt.`);
    }
    const show=(score,message)=>{value.textContent=score;detail.textContent=message;};
    function live() {
        stage.classList.remove('dart-result');frame.hidden=true;
        overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);
    }
    function stop() {
        clearInterval(timer);timer=null;reference=null;previous=null;captureAt=null;quietSince=null;requestAt=null;
        referenceButton.hidden=true;recognise.hidden=true;recognise.disabled=true;
        resetMeasurements();referenceFrames=[];
        live();overlay.hidden=true;panel.hidden=true;
        document.body.classList.remove('tracking');
        button.textContent='Test dart herkennen';
    }
    referenceButton.addEventListener('click',()=>{
        live();resetMeasurements();referenceFrames=[];reference=null;recognise.disabled=true;requestAt=null;
        captureAt=performance.now()+2000;quietSince=null;
        show('—','Haal je hand weg. Leeg bord vastleggen over 2 seconden…');
    });
    recognise.addEventListener('click',()=>{
        if(!reference)return;
        live();resetMeasurements();recognise.disabled=true;requestAt=performance.now();quietSince=null;
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
        reference=null;previous=null;captureAt=null;quietSince=null;requestAt=null;lastVideoTime=-1;referenceFrames=[];resetMeasurements();
        show('—','Maak het bord leeg en kies Leeg bord vastleggen.');
        timer=setInterval(()=>{
            try {
                if(!calibration.ready){stop();button.disabled=true;return;}
                if(analysing){
                    const result=analyseDart(cv,reference,captureFrames[results.length]);results.push(result);
                    show('…',`Schacht en punt meten: ${results.length}/3 beelden.`);
                    if(results.length===3){
                        analysing=false;
                        const combined=consistentMeasurements(results,(x,y)=>calibration.toBoard(x,y));
                        presentResult(combined,captureFrames[1]);
                    }
                    return;
                }
                // A result is deliberately frozen for inspection until a new request.
                if(reference&&captureAt===null&&requestAt===null)return;
                if(requestAt!==null&&performance.now()-requestAt>15000){requestAt=null;recognise.disabled=false;show('—','Geen drie rustige camerabeelden ontvangen. Controleer de camera en probeer opnieuw.');return;}
                if(video.readyState<2){show('—','Wachten op camerabeeld…');return;}
                if(video.currentTime===lastVideoTime)return;
                lastVideoTime=video.currentTime;
                const scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));
                sample.width=Math.round(video.videoWidth*scale);sample.height=Math.round(video.videoHeight*scale);
                ctx.drawImage(video,0,0,sample.width,sample.height);
                const image=ctx.getImageData(0,0,sample.width,sample.height);
                const correctedPrevious=previous?compensateExposure(previous,image):image;
                const moving=frameChange(previous,correctedPrevious)>.008;
                previous=image;
                const now=performance.now();
                if(moving){quietSince=null;captureFrames=[];referenceFrames=[];}else if(quietSince===null)quietSince=now;
                const quiet=quietSince!==null&&now-quietSince>=700;
                if(captureAt!==null){
                    if(now<captureAt||!quiet){show('—','Leeg bord vastleggen: houd camera stil en haal je hand weg.');return;}
                    referenceFrames.push(image);
                    if(referenceFrames.length<3){show('—',`Leeg bord vastleggen: ${referenceFrames.length}/3 beelden.`);return;}
                    reference=medianFrame(referenceFrames);captureAt=null;recognise.disabled=false;
                    show('—','Referentie gereed. Prik één dart in het bord en kies Herken dart.');return;
                }
                if(!reference)return;
                if(requestAt===null)return;
                if(now-requestAt>10000){requestAt=null;recognise.disabled=false;show('—','Beeld blijft bewegen. Zet de camera vast en probeer opnieuw.');return;}
                if(!quiet)return;
                captureFrames.push(image);
                show('…',`Rustige beelden verzamelen: ${captureFrames.length}/3.`);
                if(captureFrames.length===3)analysing=true;

            } catch(error){requestAt=null;analysing=false;recognise.disabled=!reference;live();show('—','Herkenning mislukt: '+error.message);}
        },150);
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
}
