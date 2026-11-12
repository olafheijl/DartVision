// Experimental single-dart detector: isolate a new elongated object and select
// its narrower end. A hidden point cannot be recovered reliably from one camera.
export function frameChange(a, b, threshold = 35) {
    if (!a || a.width !== b.width || a.height !== b.height) return 1;
    let changed = 0;
    for (let i = 0; i < a.data.length; i += 4) {
        if (Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2])) > threshold) changed++;
    }
    return changed / (a.width * a.height);
}

export function findDartPoint(reference, image) {
    const { width, height, data } = image;
    if (!reference || reference.width !== width || reference.height !== height) return { reason: 'Leg eerst het lege bord vast.' };
    const mask = new Uint8Array(width * height);
    let changed = 0;
    for (let i=0;i<mask.length;i++) {
        const offset=i*4;
        const difference=Math.max(Math.abs(data[offset]-reference.data[offset]),Math.abs(data[offset+1]-reference.data[offset+1]),Math.abs(data[offset+2]-reference.data[offset+2]));
        if(difference>45) {mask[i]=1;changed++;}
    }
    if(changed>width*height*.08) return {reason:'Te veel beeldverandering. Haal je hand weg; controleer camera en belichting.'};
    const objects=[];
    for(let i=0;i<mask.length;i++) {
        if(!mask[i])continue;
        const pixels=[i];mask[i]=0;
        for(let j=0;j<pixels.length;j++) {
            const index=pixels[j],x=index%width,y=Math.floor(index/width);
            for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
                const px=x+dx,py=y+dy,next=py*width+px;
                if(px>=0&&px<width&&py>=0&&py<height&&mask[next]){mask[next]=0;pixels.push(next);}
            }
        }
        if(pixels.length>=12)objects.push(pixels);
    }
    objects.sort((a,b)=>b.length-a.length);
    if(!objects.length)return {reason:'Nog geen dart zichtbaar. Prik één dart in het bord en haal je hand weg.'};
    if(objects[1]&&objects[1].length>objects[0].length*.4)return {reason:'Meerdere veranderingen zichtbaar. Verwijder darts en leg het lege bord opnieuw vast.'};
    const pixels=objects[0];
    if(pixels.length>width*height*.04)return {reason:'Object te groot. Haal je hand uit beeld.'};
    const coordinates=pixels.map(i=>[i%width,Math.floor(i/width)]);
    const cx=coordinates.reduce((s,p)=>s+p[0],0)/pixels.length,cy=coordinates.reduce((s,p)=>s+p[1],0)/pixels.length;
    let xx=0,yy=0,xy=0;
    for(const [x,y]of coordinates){xx+=(x-cx)**2;yy+=(y-cy)**2;xy+=(x-cx)*(y-cy);}
    const angle=.5*Math.atan2(2*xy,xx-yy),ux=Math.cos(angle),uy=Math.sin(angle);
    const longitudinal=coordinates.map(([x,y])=>({x,y,t:(x-cx)*ux+(y-cy)*uy,s:-(x-cx)*uy+(y-cy)*ux}));
    const min=Math.min(...longitudinal.map(p=>p.t)),max=Math.max(...longitudinal.map(p=>p.t)),length=max-min;
    const varianceAlong=xx*ux*ux+2*xy*ux*uy+yy*uy*uy;
    const varianceAcross=xx*uy*uy-2*xy*ux*uy+yy*ux*ux;
    if(length<18||varianceAlong<varianceAcross*4)return {reason:'Geen duidelijke dartvorm. Zorg dat schacht en punt zichtbaar zijn.'};
    const low=longitudinal.filter(p=>p.t<min+length*.22),high=longitudinal.filter(p=>p.t>max-length*.22);
    const spread=points=>Math.max(...points.map(p=>p.s))-Math.min(...points.map(p=>p.s))+1;
    const lowWidth=spread(low),highWidth=spread(high);
    const geometry={coordinates,axis:{x:cx,y:cy,ux,uy,min,max},width,height};
    if(Math.min(lowWidth,highWidth)>Math.max(lowWidth,highWidth)*.65)return {geometry,reason:'Punt en flight niet te onderscheiden. Zorg dat de flight en punt zichtbaar zijn.'};
    const narrowLow=lowWidth<highWidth;
    const end=longitudinal.filter(p=>narrowLow?p.t<=min+1.5:p.t>=max-1.5);
    const x=end.reduce((s,p)=>s+p.x,0)/end.length,y=end.reduce((s,p)=>s+p.y,0)/end.length;
    return {geometry,point:{x:(x+.5)/width,y:(y+.5)/height}};
}
