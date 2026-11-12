import { calculateScore } from './scoring.js';

// Connected components keep separate blue objects from averaging to a false tip.
export function findBluePoint({ width, height, data }) {
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) {
        const offset=i*4, r=data[offset], g=data[offset+1], b=data[offset+2];
        mask[i] = b > 70 && b > r * 1.45 && b > g * 1.15 && b-Math.min(r,g)>45 ? 1 : 0;
    }
    const components = [];
    for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        const queue = [i]; mask[i]=0;
        let x=0,y=0;
        for (let j=0;j<queue.length;j++) {
            const index=queue[j], px=index%width, py=Math.floor(index/width);
            x+=px; y+=py;
            for (const next of [px>0?index-1:-1,px<width-1?index+1:-1,py>0?index-width:-1,py<height-1?index+width:-1]) {
                if(next>=0 && mask[next]) { mask[next]=0; queue.push(next); }
            }
        }
        if(queue.length>=3) components.push({x:x/queue.length,y:y/queue.length,size:queue.length});
    }
    components.sort((a,b)=>b.size-a.size);
    const best=components[0];
    if(!best || best.size>width*height*.015 || (components[1] && components[1].size>best.size*.4)) return null;
    return {x:(best.x+.5)/width,y:(best.y+.5)/height};
}

export function nearWire(x,y) {
    const radius=Math.hypot(x,y);
    if([6.35,15.9,99,107,162,170].some(r=>Math.abs(radius-r)<2)) return true;
    if(radius<15.9 || radius>172) return false;
    const angle=(Math.atan2(x,-y)*180/Math.PI+360)%360;
    const degrees=Math.abs(((angle+9)%18)-9);
    return radius*Math.sin((9-degrees)*Math.PI/180)<2;
}

export function initPointerTracking(video, calibration) {
    const button=document.getElementById('track-pointer');
    const panel=document.getElementById('pointer-score');
    const value=document.getElementById('score-value');
    const detail=document.getElementById('score-detail');
    const overlay=document.getElementById('pointer-overlay');
    const sample=document.createElement('canvas');
    const ctx=sample.getContext('2d',{willReadFrequently:true});
    let timer, stable=null;
    const show=(score,message)=>{value.textContent=score;detail.textContent=message;};
    function stop() {
        clearInterval(timer);timer=null;stable=null;
        overlay.hidden=true;panel.hidden=true;
        document.body.classList.remove('tracking');
        button.textContent='Test blauwe penpunt';
    }
    document.addEventListener('calibration-change',()=>{
        stop();button.disabled=!calibration.ready;
    });
    button.addEventListener('click',()=>{
        if(timer) return stop();
        if(!calibration.ready) return;
        document.body.classList.add('tracking');
        panel.hidden=false;overlay.hidden=false;
        button.textContent='Stop penpunttest';
        show('—','Gebruik een kleine felblauwe punt, vlak tegen het bord.');
        timer=setInterval(()=>{
            try {
                if(!calibration.ready) {stop();button.disabled=true;return;}
                if(video.readyState<2) {stable=null;show('—','Wachten op camerabeeld…');return;}
                sample.width=320;sample.height=Math.round(video.videoHeight/video.videoWidth*320);
                ctx.drawImage(video,0,0,sample.width,sample.height);
                overlay.width=sample.width;overlay.height=sample.height;
                const point=findBluePoint(ctx.getImageData(0,0,sample.width,sample.height));
                if(!point) {stable=null;show('—','Geen eenduidige blauwe punt. Houd één kleine blauwe markering in beeld.');return;}
                const cross=overlay.getContext('2d'),px=point.x*overlay.width,py=point.y*overlay.height;
                cross.strokeStyle='#38bdf8';cross.lineWidth=2;
                cross.beginPath();cross.arc(px,py,7,0,Math.PI*2);cross.moveTo(px-12,py);cross.lineTo(px+12,py);cross.moveTo(px,py-12);cross.lineTo(px,py+12);cross.stroke();
                const board=calibration.toBoard(point.x,point.y);
                if(!board || !Number.isFinite(board.x+board.y)) {stable=null;show('—','Kalibreer opnieuw.');return;}
                if(nearWire(board.x,board.y)) {stable=null;show('—','Dicht bij een draad — verplaats de punt iets.');return;}
                const score=calculateScore(board.x,board.y),now=performance.now();
                if(!stable || stable.label!==score.label || Math.hypot(board.x-stable.x,board.y-stable.y)>3) {
                    stable={...board,label:score.label,since:now};
                }
                if(now-stable.since<500) show('…','Punt gevonden — houd even stil.');
                else show(String(score.score),`${score.label} · ${score.score} punten`);
            } catch {stable=null;overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height);show('—','Puntmeting mislukt. Stop en probeer opnieuw.');}
        },100);
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
}
