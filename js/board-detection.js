import { getOpenCV, captureFrame } from './opencv-runtime.js';

export function isRingColour(red, green, blue) {
    return (red > 45 && red > green * 1.3 && red > blue * 1.3) ||
        (green > 35 && green > red * 1.2 && green > blue * 1.15);
}

export async function detectBoard(video, canvas) {
    const { cv } = await getOpenCV();
    captureFrame(video, canvas);
    const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const mats=[];
    const keep=mat=>{mats.push(mat);return mat;};
    try {
        const mask=keep(cv.Mat.zeros(image.height,image.width,cv.CV_8UC1));
        for(let i=0;i<mask.data.length;i++) {
            const o=i*4;
            mask.data[i]=isRingColour(image.data[o],image.data[o+1],image.data[o+2])?255:0;
        }
        // Join the narrow wire gaps between adjacent red and green segments.
        const kernel=keep(cv.getStructuringElement(cv.MORPH_ELLIPSE,new cv.Size(5,5)));
        cv.morphologyEx(mask,mask,cv.MORPH_CLOSE,kernel);
        const contours=keep(new cv.MatVector()),hierarchy=keep(new cv.Mat());
        cv.findContours(mask,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_NONE);
        const ellipses=[];
        for(let i=0;i<contours.size();i++) {
            const contour=contours.get(i);
            try {
                if(contour.rows<20)continue;
                const fit=cv.fitEllipse(contour);
                if(Number.isFinite(fit.size.width+fit.size.height+fit.center.x+fit.center.y)) {
                    ellipses.push({x:fit.center.x,y:fit.center.y,a:fit.size.width/2,b:fit.size.height/2,angle:fit.angle*Math.PI/180});
                }
            } finally {contour.delete();}
        }
        return selectBoardEllipse(image,ellipses);
    } finally {for(const mat of mats.reverse())mat.delete();}
}

export function project(matrix,x,y) {
    const z=matrix[6]*x+matrix[7]*y+matrix[8];
    return [(matrix[0]*x+matrix[1]*y+matrix[2])/z,(matrix[3]*x+matrix[4]*y+matrix[5])/z];
}
function multiply(a,b) {
    return Array.from({length:9},(_,index)=>{
        const row=Math.floor(index/3),column=index%3;
        return a[row*3]*b[column]+a[row*3+1]*b[column+3]+a[row*3+2]*b[column+6];
    });
}
// A conic plus the projected bull provides perspective correction up to board
// rotation. The symmetric ellipse basis keeps image-up as the default 20 direction.
export function ellipseMatrix(ellipse,bull=null,scale=1) {
    const {x,y,angle}=ellipse,a=ellipse.a*scale,b=ellipse.b*scale;
    const c=Math.cos(angle),s=Math.sin(angle);
    const u=a*c*c+b*s*s,v=(a-b)*c*s,w=a*s*s+b*c*c;
    const shape=[u,v,x,v,w,y,0,0,1];
    let boost=[1,0,0,0,1,0,0,0,1];
    if(bull) {
        const det=u*w-v*v,dx=bull.x-x,dy=bull.y-y;
        const bx=(w*dx-v*dy)/det,by=(u*dy-v*dx)/det,q=bx*bx+by*by;
        if(q>=.16)return null;
        if(q>1e-10) {
            const gamma=1/Math.sqrt(1-q),k=(gamma-1)/q;
            boost=[1+k*bx*bx,k*bx*by,gamma*bx,k*bx*by,1+k*by*by,gamma*by,gamma*bx,gamma*by,gamma];
        }
    }
    return multiply(multiply(shape,boost),[1/220,0,-240/220,0,1/220,-240/220,0,0,1]);
}

export function selectBoardEllipse(image,ellipses) {
    const {width,height,data}=image;
    const colourAt=(x,y)=>{
        const px=Math.round(x),py=Math.round(y);
        if(px<0||py<0||px>=width||py>=height)return 0;
        const i=(py*width+px)*4;
        return isRingColour(data[i],data[i+1],data[i+2])?1:0;
    };
    function coverage(matrix,radius) {
        const quarters=[0,0,0,0];
        for(let i=0;i<120;i++) {
            const angle=i/120*Math.PI*2;
            let found=0;
            for(const offset of [-.004,0,.004]) {
                const [x,y]=project(matrix,240+220*(radius+offset)*Math.cos(angle),240+220*(radius+offset)*Math.sin(angle));
                found+=colourAt(x,y);
            }
            quarters[Math.floor(i/30)]+=found/3;
        }
        return {mean:quarters.reduce((a,b)=>a+b,0)/120,min:Math.min(...quarters)/30};
    }
    let best=null;
    const accepted=[];
    // Limit work on noisy backgrounds; geometric size is a prefilter, not confidence.
    const candidates=ellipses.filter(e=>Math.min(e.a,e.b)>18&&Math.max(e.a,e.b)>35&&Math.min(e.a,e.b)/Math.max(e.a,e.b)>.2)
        .sort((a,b)=>b.a*b.b-a.a*a.b).slice(0,60);
    for(const ellipse of candidates) {
        const bulls=ellipses.filter(e=>Math.max(e.a,e.b)<Math.max(ellipse.a,ellipse.b)*.16&&Math.max(e.a,e.b)>2&&Math.hypot(e.x-ellipse.x,e.y-ellipse.y)<Math.max(ellipse.a,ellipse.b)*.25);
        // No bull estimate still supports a weak-perspective ellipse, but ring
        // validation must succeed. Never assume every fitted ellipse is a board.
        for(const bull of [null,...bulls.slice(0,8)]) for(const scale of [.98,1,1.025,1.05]) {
            const matrix=ellipseMatrix(ellipse,bull,scale);
            if(!matrix)continue;
            const double=coverage(matrix,166/170),triple=coverage(matrix,103/170);
            if(double.mean<.38||triple.mean<.38||double.min<.18||triple.min<.18)continue;
            const background=(coverage(matrix,.8).mean+coverage(matrix,1.045).mean)/2;
            const score=Math.min(double.mean,triple.mean)-background*.65;
            if(score<.28)continue;
            const candidate={matrix,score,x:ellipse.x,y:ellipse.y,size:Math.max(ellipse.a,ellipse.b)};
            accepted.push(candidate);
            if(!best||score>best.score)best=candidate;
        }
    }
    if(!best)return null;
    // Similar fits of the same board are fine; two different boards are ambiguous.
    if(accepted.some(other=>other.score>best.score*.9&&Math.hypot(best.x-other.x,best.y-other.y)>best.size*.5))return null;
    return best;
}
