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
