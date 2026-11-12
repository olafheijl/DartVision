import { findDartPoint } from './dart.js';

// Estimate global exposure shifts from sparse samples. This avoids treating a
// uniform brightness change as a dart; local shadows remain a separate issue.
export function compensateExposure(reference,image) {
    const offsets=[];
    for(let c=0;c<3;c++) {
        const samples=[];
        for(let i=c;i<image.data.length;i+=64)samples.push(image.data[i]-reference.data[i]);
        samples.sort((a,b)=>a-b);offsets.push(samples[Math.floor(samples.length/2)]||0);
    }
    const data=new Uint8ClampedArray(image.data);
    for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)data[i+c]-=offsets[c];
    return {width:image.width,height:image.height,data};
}

// Small camera translations are estimated from clipped background differences.
// A clipped loss reduces the influence of the new dart on frame registration.
export function alignReference(reference,image) {
    const {width,height,data}=image;
    const range=Math.max(2,Math.round(Math.max(width,height)/160));
    const stride=Math.max(4,Math.round(Math.max(width,height)/100));
    const adjusted=compensateExposure(reference,image);
    const loss=(dx,dy)=>{
        let sum=0,count=0;
        for(let y=range;y<height-range;y+=stride)for(let x=range;x<width-range;x+=stride){
            const a=(y*width+x)*4,b=((y+dy)*width+x+dx)*4;
            sum+=Math.min(30,(Math.abs(adjusted.data[a]-reference.data[b])+Math.abs(adjusted.data[a+1]-reference.data[b+1])+Math.abs(adjusted.data[a+2]-reference.data[b+2]))/3);count++;
        }
        return sum/Math.max(1,count);
    };
    const original=loss(0,0);let best=original,dx=0,dy=0;
    for(let y=-range;y<=range;y++)for(let x=-range;x<=range;x++){
        const score=loss(x,y);
        if(score<best){best=score;dx=x;dy=y;}
    }
    if(best>original*.85)return reference;
    const shifted=new Uint8ClampedArray(data.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const o=(y*width+x)*4,rx=x+dx,ry=y+dy;
        const source=rx>=0&&ry>=0&&rx<width&&ry<height?reference.data:data;
        const index=source===data?o:(ry*width+rx)*4;
        for(let c=0;c<4;c++)shifted[o+c]=source[index+c];
    }
    return {width,height,data:shifted};
}

// Follow low-contrast evidence only in a narrow corridor along a known shaft.
// Stop at a sustained gap; never infer a hidden contact point by extrapolation.
export function followDarkTip(reference,image,start,direction,maxLength) {
    const {width,height,data}=image;
    const unit=Math.max(1,Math.max(width,height)/640);
    let last={...start},gap=0;
    const difference=(x,y)=>{
        const px=Math.round(x),py=Math.round(y);
        if(px<1||py<1||px>=width-1||py>=height-1)return 0;
        const i=(py*width+px)*4;
        return Math.max(Math.abs(data[i]-reference.data[i]),Math.abs(data[i+1]-reference.data[i+1]),Math.abs(data[i+2]-reference.data[i+2]));
    };
    for(let distance=unit;distance<=maxLength;distance+=unit){
        const x=start.x+direction.x*distance,y=start.y+direction.y*distance;
        let evidence=0;
        for(const offset of [-unit,0,unit]){
            const px=x-direction.y*offset,py=y+direction.x*offset;
            const centre=difference(px,py);
            const side=(difference(px-direction.y*5*unit,py+direction.x*5*unit)+difference(px+direction.y*5*unit,py-direction.x*5*unit))/2;
            if(centre>=10&&centre>side+5)evidence++;
        }
        if(evidence){last={x,y};gap=0;}
        else if(++gap>=3)break;
    }
    return last;
}

export function analyseDart(cv,reference,image) {
    if(!reference||reference.width!==image.width||reference.height!==image.height)return {reason:'Leg eerst het lege bord vast.'};
    reference=alignReference(reference,image);
    const corrected=compensateExposure(reference,image);
    const detection=findDartPoint(reference,corrected,22);
    if(!detection.geometry)return detection;
    const {coordinates,axis,width,height}=detection.geometry;
    const bounds={left:Math.min(...coordinates.map(p=>p[0])),right:Math.max(...coordinates.map(p=>p[0])),top:Math.min(...coordinates.map(p=>p[1])),bottom:Math.max(...coordinates.map(p=>p[1]))};
    const result={bounds,lines:[],reason:detection.reason};
    const mats=[];const keep=m=>{mats.push(m);return m;};
    try {
        const mask=keep(cv.Mat.zeros(height,width,cv.CV_8UC1));
        for(const [x,y]of coordinates)mask.data[y*width+x]=255;
        const edges=keep(new cv.Mat()),lines=keep(new cv.Mat());
        cv.Canny(mask,edges,50,150);
        cv.HoughLinesP(edges,lines,1,Math.PI/180,12,Math.max(15,(axis.max-axis.min)*.2),7);
        const candidates=[];
        for(let i=0;i<lines.rows;i++) {
            const [x1,y1,x2,y2]=lines.data32S.slice(i*4,i*4+4),dx=x2-x1,dy=y2-y1,length=Math.hypot(dx,dy);
            if(!length)continue;
            const line={x1,y1,x2,y2,length};
            if(Math.abs((dx*axis.ux+dy*axis.uy)/length)<Math.cos(20*Math.PI/180))continue;
            candidates.push(line);
        }
        candidates.sort((a,b)=>b.length-a.length);
        result.lines=candidates.slice(0,8);
        if(!candidates.length){result.reason='Geen duidelijke rechte schachtlijn gevonden.';return result;}
        if(!detection.point)return result;
        const tip={x:detection.point.x*width-.5,y:detection.point.y*height-.5};
        // Prefer shaft edges close to the narrow endpoint, rather than flight edges.
        const distance=line=>Math.abs((tip.x-line.x1)*(line.y2-line.y1)-(tip.y-line.y1)*(line.x2-line.x1))/line.length;
        const shaft=candidates.filter(line=>distance(line)<5);
        if(!shaft.length){result.reason='Lijnen gevonden, maar geen schacht tot bij de vermoedelijke punt.';return result;}
        const lead=shaft[0],dx=(lead.x2-lead.x1)/lead.length,dy=(lead.y2-lead.y1)/lead.length;
        const supporting=shaft.filter(line=>Math.abs(((line.x2-line.x1)*dx+(line.y2-line.y1)*dy)/line.length)>.985);
        const endpoints=supporting.flatMap(line=>[line.x1,line.y1,line.x2,line.y2]);
        const points=keep(cv.matFromArray(endpoints.length/2,1,cv.CV_32FC2,endpoints)),fit=keep(new cv.Mat());
        cv.fitLine(points,fit,cv.DIST_L2,0,.01,.01);
        let [ux,uy,cx,cy]=fit.data32F;
        // Orient the fitted line towards the previously identified narrow end.
        if((tip.x-cx)*ux+(tip.y-cy)*uy<0){ux=-ux;uy=-uy;}
        const nearLine=coordinates.filter(([x,y])=>Math.abs((x-cx)*uy-(y-cy)*ux)<3);
        if(!nearLine.length){result.reason='Schacht zichtbaar, uiteinde niet duidelijk.';return result;}
        const projected=nearLine.map(([x,y])=>({x,y,t:(x-cx)*ux+(y-cy)*uy}));
        const end=Math.max(...projected.map(p=>p.t));
        const endPixels=projected.filter(p=>p.t>end-1.5);
        const averageT=endPixels.reduce((sum,p)=>sum+p.t,0)/endPixels.length;
        let x=cx+averageT*ux,y=cy+averageT*uy;
        if(Math.hypot(x-tip.x,y-tip.y)>8){result.reason='Schachtlijn en puntvorm spreken elkaar tegen. Kies een duidelijker camerahoek.';return result;}
        const extension=followDarkTip(reference,corrected,{x,y},{x:ux,y:uy},Math.min((axis.max-axis.min)*.7,Math.max(width,height)*.12));
        result.extension={from:[x,y],to:[extension.x,extension.y]};
        x=extension.x;y=extension.y;
        const back=Math.min(...coordinates.map(([px,py])=>(px-cx)*ux+(py-cy)*uy));
        result.shaft={from:[cx+back*ux,cy+back*uy],to:[x,y]};
        result.point={x:(x+.5)/width,y:(y+.5)/height};
        result.reason='Schacht en vermoedelijke punt gevonden. Controleer het kruisje op het bord.';
        return result;
    } finally {for(const mat of mats.reverse())mat.delete();}
}

export function drawDartAlignment(canvas,result) {
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth=1.5;
    if(result.bounds){const b=result.bounds;ctx.strokeStyle='#fbbf24';ctx.strokeRect(b.left-4,b.top-4,b.right-b.left+8,b.bottom-b.top+8);}
    ctx.strokeStyle='rgba(56,189,248,.8)';
    for(const line of result.lines||[]){ctx.beginPath();ctx.moveTo(line.x1,line.y1);ctx.lineTo(line.x2,line.y2);ctx.stroke();}
    if(result.shaft){ctx.strokeStyle='#22ff99';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(...result.shaft.from);ctx.lineTo(...result.shaft.to);ctx.stroke();}
    if(result.extension){ctx.strokeStyle='#ffad42';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...result.extension.from);ctx.lineTo(...result.extension.to);ctx.stroke();}
    if(result.point){const x=result.point.x*canvas.width,y=result.point.y*canvas.height;ctx.strokeStyle='#ff4fca';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.moveTo(x-13,y);ctx.lineTo(x+13,y);ctx.moveTo(x,y-13);ctx.lineTo(x,y+13);ctx.stroke();}
}
