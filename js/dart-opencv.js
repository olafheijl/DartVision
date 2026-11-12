import { extractFragments, fragmentGroups, measureShaft } from './dart-geometry.js';

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
    if((dx===0&&dy===0)||best>original*.85)return reference;
    const shifted=new Uint8ClampedArray(data.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const o=(y*width+x)*4,rx=x+dx,ry=y+dy;
        const source=rx>=0&&ry>=0&&rx<width&&ry<height?reference.data:data;
        const index=source===data?o:(ry*width+rx)*4;
        for(let c=0;c<4;c++)shifted[o+c]=source[index+c];
    }
    return {width,height,data:shifted,registration:{matrix:[1,0,-dx,0,1,-dy],improvement:1-best/Math.max(1,original)}};
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
            if(centre>=6&&centre>side+3)evidence++;
        }
        if(evidence){last={x,y};gap=0;}
        else if(++gap>=3)break;
    }
    return last;
}

export function pointInReference(point,registration,width,height) {
    if(!registration)return point;
    const [a,b,tx,c,d,ty]=registration.matrix,det=a*d-b*c;
    if(!Number.isFinite(det)||Math.abs(det)<.5)return null;
    const x=point.x*width-.5-tx,y=point.y*height-.5-ty;
    return {x:((d*x-b*y)/det+.5)/width,y:((-c*x+a*y)/det+.5)/height};
}

// Resolve the endpoint from a narrow ridge, not from the furthest changed pixel.
// A soft, broad cast shadow has little contrast against both immediate flanks.
export function refineNeedleTip(reference,image,from,to,scale=1) {
    const {width,height}=image,dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy);
    if(length<12*scale)return null;
    const ux=dx/length,uy=dy/length;
    const luma=(frame,x,y)=>{
        const px=Math.round(x),py=Math.round(y);
        if(px<1||py<1||px>=width-1||py>=height-1)return null;
        const i=(py*width+px)*4;
        return .299*frame.data[i]+.587*frame.data[i+1]+.114*frame.data[i+2];
    };
    const delta=(x,y)=>{const a=luma(image,x,y),b=luma(reference,x,y);return a===null||b===null?null:a-b;};
    const start=Math.max(0,length-Math.max(40*scale,length*.5)),runs=[];
    let current=[],missing=0;
    for(let t=start;t<=length+6*scale;t+=Math.max(.75,scale)){
        const cx=from[0]+ux*t,cy=from[1]+uy*t;
        let best=null;
        for(let offset=-3*scale;offset<=3*scale;offset+=Math.max(.75,scale)){
            const x=cx-uy*offset,y=cy+ux*offset,centre=delta(x,y),background=luma(reference,x,y);
            if(centre===null||background===null)continue;
            const minimum=Math.max(4,Math.min(20,background*.1));
            for(const radius of [1.5,2,2.5]){
                const left=delta(x-uy*radius*scale,y+ux*radius*scale),right=delta(x+uy*radius*scale,y-ux*radius*scale);
                if(left===null||right===null)continue;
                const contrast=Math.abs(centre)-Math.max(Math.abs(left),Math.abs(right));
                if(contrast<minimum)continue;
                if(!best||contrast>best.contrast)best={x,y,t,contrast};
            }
        }
        if(best){current.push(best);missing=0;}
        else if(++missing>=3){if(current.length)runs.push(current);current=[];missing=0;}
    }
    if(current.length)runs.push(current);
    const valid=runs.filter(run=>run.length>=5&&run.at(-1).t-run[0].t>=5*scale);
    if(!valid.length)return null;
    valid.sort((a,b)=>{
        const score=run=>(run.at(-1).t-run[0].t)*Math.min(30,run.reduce((s,p)=>s+p.contrast,0)/run.length);
        return score(b)-score(a);
    });
    const run=valid[0],end=run.slice(-2);
    const x=end.reduce((s,p)=>s+p.x,0)/end.length,y=end.reduce((s,p)=>s+p.y,0)/end.length;
    const light=luma(reference,x,y),ahead=[3,6,9,12,16].map(t=>luma(reference,x+ux*t*scale,y+uy*t*scale)).filter(v=>v!==null);
    const lostInDark=length-run.at(-1).t>6*scale&&light>70&&ahead.some(v=>v<light*.45);
    return {x,y,lostInDark,contrast:end.reduce((s,p)=>s+p.contrast,0)/end.length,supportedLength:run.at(-1).t-run[0].t};
}

// Align the static scene, including small rotation/zoom changes. Only accept
// bounded transforms that reduce a robust background loss; the dart is an outlier.
export function registerReference(cv, reference, image) {
    if(typeof cv.findTransformECC!=='function')return alignReference(reference,image);
    const mats=[];const keep=m=>{mats.push(m);return m;};
    try {
        const {width,height}=image,scale=Math.min(1,640/Math.max(width,height));
        const size=new cv.Size(Math.round(width*scale),Math.round(height*scale));
        const before=keep(new cv.Mat(height,width,cv.CV_8UC4));before.data.set(reference.data);
        const adjusted=compensateExposure(reference,image);
        const after=keep(new cv.Mat(height,width,cv.CV_8UC4));after.data.set(adjusted.data);
        const greyBefore=keep(new cv.Mat()),greyAfter=keep(new cv.Mat()),smallBefore=keep(new cv.Mat()),smallAfter=keep(new cv.Mat());
        cv.cvtColor(before,greyBefore,cv.COLOR_RGBA2GRAY);cv.cvtColor(after,greyAfter,cv.COLOR_RGBA2GRAY);
        cv.resize(greyBefore,smallBefore,size,0,0,cv.INTER_AREA);cv.resize(greyAfter,smallAfter,size,0,0,cv.INTER_AREA);
        const warp=keep(cv.matFromArray(2,3,cv.CV_32F,[1,0,0,0,1,0]));
        const mask=keep(new cv.Mat());
        const correlation=cv.findTransformECC(smallBefore,smallAfter,warp,cv.MOTION_AFFINE,new cv.TermCriteria(cv.TermCriteria_COUNT|cv.TermCriteria_EPS,60,1e-5),mask,5);
        const [a,b,tx,c,d,ty]=Array.from(warp.data32F);
        if(!Number.isFinite(correlation)||correlation<.8||Math.abs(a-1)>.035||Math.abs(d-1)>.035||Math.abs(b)>.025||Math.abs(c)>.025||Math.hypot(tx,ty)>Math.max(size.width,size.height)*.025)return alignReference(reference,image);
        warp.data32F[2]=tx/scale;warp.data32F[5]=ty/scale;
        const aligned=keep(new cv.Mat());
        cv.warpAffine(before,aligned,warp,new cv.Size(width,height),cv.INTER_LINEAR,cv.BORDER_REFLECT_101);
        let oldLoss=0,newLoss=0;
        const alignedAdjusted=compensateExposure({width,height,data:aligned.data},image);
        for(let i=0;i<image.data.length;i+=64){
            oldLoss+=Math.min(25,Math.abs(reference.data[i]-adjusted.data[i]));
            newLoss+=Math.min(25,Math.abs(aligned.data[i]-alignedAdjusted.data[i]));
        }
        if(newLoss>=oldLoss*.98)return alignReference(reference,image);
        return {width,height,data:new Uint8ClampedArray(aligned.data),registration:{matrix:[a,b,tx/scale,c,d,ty/scale],correlation,improvement:1-newLoss/Math.max(1,oldLoss)}};
    } catch {return alignReference(reference,image);}
    finally {for(const mat of mats.reverse())mat.delete();}
}

export function analyseDart(cv,reference,image) {
    if(!reference||reference.width!==image.width||reference.height!==image.height)return {reason:'Leg eerst het lege bord vast.'};
    reference=registerReference(cv,reference,image);
    const corrected=compensateExposure(reference,image);
    const {width,height}=image,scale=Math.max(width,height)/640;
    const mats=[];const keep=m=>{mats.push(m);return m;};
    try {
        const before=keep(new cv.Mat(height,width,cv.CV_8UC4));before.data.set(reference.data);
        const after=keep(new cv.Mat(height,width,cv.CV_8UC4));after.data.set(corrected.data);
        const greyBefore=keep(new cv.Mat()),greyAfter=keep(new cv.Mat()),difference=keep(new cv.Mat());
        cv.cvtColor(before,greyBefore,cv.COLOR_RGBA2GRAY);cv.cvtColor(after,greyAfter,cv.COLOR_RGBA2GRAY);
        cv.GaussianBlur(greyBefore,greyBefore,new cv.Size(3,3),0);cv.GaussianBlur(greyAfter,greyAfter,new cv.Size(3,3),0);
        cv.absdiff(greyBefore,greyAfter,difference);
        const field=difference.data;
        const extracted=extractFragments(field,width,height,scale);
        if(!extracted.fragments.length)return {reason:'Geen nieuwe dart gevonden. Controleer het referentiebeeld en de belichting.'};
        const edges=keep(new cv.Mat()),lines=keep(new cv.Mat());
        // Edges of the actual grey difference retain weak detail that disappeared
        // when Canny was applied only to the old binary silhouette.
        cv.Canny(difference,edges,15,45);
        cv.HoughLinesP(edges,lines,1,Math.PI/180,12,Math.max(15,18*scale),Math.max(4,6*scale));
        const hints=[];
        for(let i=0;i<lines.rows;i++) {
            const [x1,y1,x2,y2]=lines.data32S.slice(i*4,i*4+4),length=Math.hypot(x2-x1,y2-y1);
            if(length)hints.push({x1,y1,x2,y2,length,axis:[(x2-x1)/length,(y2-y1)/length]});
        }
        hints.sort((a,b)=>b.length-a.length);
        const refit=centres=>{
            const points=cv.matFromArray(centres.length,1,cv.CV_32FC2,centres.flat()),fit=new cv.Mat();
            try {cv.fitLine(points,fit,cv.DIST_HUBER,0,.01,.01);return {axis:[fit.data32F[0],fit.data32F[1]],centre:[fit.data32F[2],fit.data32F[3]]};}
            finally {points.delete();fit.delete();}
        };
        const candidates=[];
        for(const group of fragmentGroups(extracted.fragments,scale)) {
            const bounds=group.points.reduce((b,p)=>({left:Math.min(b.left,p[0]),right:Math.max(b.right,p[0]),top:Math.min(b.top,p[1]),bottom:Math.max(b.bottom,p[1])}),{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity});
            const localHints=hints.filter(l=>Math.max(l.x1,l.x2)>=bounds.left-5*scale&&Math.min(l.x1,l.x2)<=bounds.right+5*scale&&Math.max(l.y1,l.y2)>=bounds.top-5*scale&&Math.min(l.y1,l.y2)<=bounds.bottom+5*scale).slice(0,6);
            const measurement=measureShaft(group.points,scale,localHints.map(l=>l.axis),refit);
            if(!measurement)continue;
            const {fit,tipSign}=measurement;
            const direction={x:fit.axis[0]*tipSign,y:fit.axis[1]*tipSign};
            // The wide rear end must contain substantial new foreground signal.
            // A shifted board wire or a soft shadow alone is not a dart flight.
            const projections=group.points.map(p=>(p[0]-fit.centre[0])*direction.x+(p[1]-fit.centre[1])*direction.y);
            const minProjection=projections.reduce((a,b)=>Math.min(a,b),Infinity),maxProjection=projections.reduce((a,b)=>Math.max(a,b),-Infinity);
            const rearLimit=minProjection+(maxProjection-minProjection)*.35;
            const flightPixels=group.points.filter((p,i)=>projections[i]<=rearLimit&&p[2]>=Math.max(35,extracted.strong+12)).length;
            if(flightPixels<Math.max(16,16*scale*scale))continue;
            const corridor=Math.max(2*scale,Math.min(4*scale,measurement.width/2));
            let endpoint=-Infinity,back=Infinity;
            const near=[];
            for(const p of group.points){
                const dx=p[0]-fit.centre[0],dy=p[1]-fit.centre[1];
                const t=dx*direction.x+dy*direction.y;
                back=Math.min(back,t);
                if(Math.abs(dx*direction.y-dy*direction.x)>corridor)continue;
                endpoint=Math.max(endpoint,t);near.push(t);
            }
            if(!near.length)continue;
            const terminal=near.filter(t=>t>=endpoint-1.5*scale);
            endpoint=terminal.reduce((a,b)=>a+b,0)/terminal.length;
            const start={x:fit.centre[0]+direction.x*endpoint,y:fit.centre[1]+direction.y*endpoint};
            const tip=followDarkTip(reference,corrected,start,direction,Math.min(measurement.span*.5,Math.max(width,height)*.1));
            const base=[fit.centre[0]+direction.x*back,fit.centre[1]+direction.y*back];
            const needle=refineNeedleTip(reference,corrected,base,[tip.x,tip.y],scale);
            const endpointTip=needle||tip;
            const candidate={bounds,lines:localHints,sections:measurement.sections,axis:fit.axis,
                shaft:{from:[fit.centre[0]+direction.x*back,fit.centre[1]+direction.y*back],to:[endpointTip.x,endpointTip.y]},
                extension:{from:[start.x,start.y],to:[endpointTip.x,endpointTip.y]},
                diagnostics:{registration:reference.registration,flightPixels,needle:needle?{contrast:needle.contrast,length:needle.supportedLength,lostInDark:needle.lostInDark}:null,fragments:group.fragments,usedSections:measurement.sections.filter(s=>s.used).length,rms:measurement.rms,weakThreshold:extracted.weak},
                score:measurement.score*(1+Math.min(3,group.fragments-1)*.08)};
            if(measurement.directionClear&&needle&&!needle.lostInDark){candidate.point={x:(needle.x+.5)/width,y:(needle.y+.5)/height};candidate.boardPoint=pointInReference(candidate.point,reference.registration,width,height);candidate.reason='Schacht en punt geschat uit smalle dwarsdoorsneden.';}
            else candidate.reason=needle?.lostInDark?'De punt verdwijnt tegen een donker vlak; de zichtbare schacht is niet de insteekpositie.':measurement.directionClear?'Schacht gevonden, maar geen voldoende scherpe, smalle punt. Controleer licht en camerahoek.':'Schachtlijn gevonden, maar punt en flight zijn niet duidelijk te onderscheiden.';
            candidate.rank=candidate.score*Math.sqrt(flightPixels);
            candidates.push(candidate);
        }
        candidates.sort((a,b)=>b.rank-a.rank);
        if(!candidates.length)return {reason:'Geen voldoende lange, smalle schacht gevonden. Zorg dat punt en schacht zichtbaar zijn.',diagnostics:{fragments:extracted.fragments.length}};
        const best=candidates[0];
        if(best.point&&candidates.some(other=>other.point&&other.rank>best.rank*.75&&Math.hypot((best.point.x-other.point.x)*width,(best.point.y-other.point.y)*height)>15*scale)){
            return {...best,point:undefined,reason:'Meerdere mogelijke darts of puntposities. Maak het bord leeg en meet één dart.'};
        }
        return best;
    } finally {for(const mat of mats.reverse())mat.delete();}
}

export function drawDartAlignment(canvas,result) {
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth=1.5;
    if(result.bounds){const b=result.bounds;ctx.strokeStyle='#fbbf24';ctx.strokeRect(b.left-4,b.top-4,b.right-b.left+8,b.bottom-b.top+8);}
    ctx.strokeStyle='rgba(56,189,248,.8)';
    for(const line of result.lines||[]){ctx.beginPath();ctx.moveTo(line.x1,line.y1);ctx.lineTo(line.x2,line.y2);ctx.stroke();}
    for(const section of result.sections||[]){const axis=result.axis||[1,0];const half=section.width/2;ctx.strokeStyle=section.used?'#38bdf8':'rgba(180,180,180,.6)';ctx.lineWidth=section.used?2:1;ctx.beginPath();ctx.moveTo(section.x-axis[1]*half,section.y+axis[0]*half);ctx.lineTo(section.x+axis[1]*half,section.y-axis[0]*half);ctx.stroke();}
    if(result.shaft){ctx.strokeStyle='#22ff99';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(...result.shaft.from);ctx.lineTo(...result.shaft.to);ctx.stroke();}
    if(result.extension){ctx.strokeStyle='#ffad42';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(...result.extension.from);ctx.lineTo(...result.extension.to);ctx.stroke();}
    for(const p of result.candidates||[]){ctx.strokeStyle='#fb923c';ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,6,0,Math.PI*2);ctx.stroke();}
    if(result.point){const x=result.point.x*canvas.width,y=result.point.y*canvas.height;ctx.strokeStyle='#ff4fca';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.moveTo(x-13,y);ctx.lineTo(x+13,y);ctx.moveTo(x,y-13);ctx.lineTo(x,y+13);ctx.stroke();}
}
