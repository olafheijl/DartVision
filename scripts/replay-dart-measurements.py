#!/usr/bin/env python3
"""Replay private measurement exports against the real OpenCV.js detector.

Requires Python Playwright and Chromium. No web server or network is used.
Keep exports outside the repository: they contain the camera's original pictures.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--opencv-js', required=True, type=Path, help='Local official OpenCV.js bundle, including embedded WASM')
    parser.add_argument('--chromium', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--expected', type=Path, help='Optional private JSON map: filename -> agreement, accepted, point_bounds')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parent.parent
    records = [json.loads(path.read_text()) for path in args.files]
    for record in records:
        assert record['format'] == 'dartvision-measurement-v1'
        assert 0 < record['width'] <= 2048 and 0 < record['height'] <= 2048
        assert len(record['frames']) == 3 and len(record['boardCorners']) == 4
        assert all(src.startswith('data:image/png;base64,') for src in [record['reference'], *record['frames']])
    bundle = args.opencv_js.read_bytes()
    with sync_playwright() as p:
        options = {'headless': True}
        if args.chromium:
            options['executable_path'] = str(args.chromium)
        browser = p.chromium.launch(**options)
        page = browser.new_page()

        def route(request):
            path = urlparse(request.request.url).path
            if path == '/':
                request.fulfill(body='<script src="/opencv.js"></script>', content_type='text/html')
            elif path == '/opencv.js':
                request.fulfill(body=bundle, content_type='application/javascript')
            elif path.startswith('/js/'):
                file = (repo / path[1:]).resolve()
                if file.parent != repo / 'js' or file.suffix != '.js':
                    request.fulfill(status=404)
                else:
                    request.fulfill(path=str(file), content_type='application/javascript')
            else:
                request.fulfill(status=404)

        page.route('**/*', route)
        page.goto('http://dartvision.test/', wait_until='domcontentloaded')
        page.wait_for_function('window.cv && typeof window.cv.Mat === "function"', timeout=30000)
        results = page.evaluate('''async records => {
            const {analyseDart} = await import('/js/dart-detection.js');
            const {consistentMeasurements} = await import('/js/dart-shaft-analysis.js');
            const {calculateScore} = await import('/js/board-scoring.js');
            const decode = async src => {
                const im = new Image(); im.src = src; await im.decode();
                if (im.width > 2048 || im.height > 2048) throw Error('Image too large');
                const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
                const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
                return ctx.getImageData(0, 0, c.width, c.height);
            };
            const output = [];
            for (const record of records) {
                const reference = await decode(record.reference);
                const frames = await Promise.all(record.frames.map(decode));
                if (frames.some(f => f.width !== reference.width || f.height !== reference.height)) throw Error('Frame sizes differ');
                const started = performance.now();
                const results = frames.map(image => analyseDart(cv, reference, image));
                const from = cv.matFromArray(4,1,cv.CV_32FC2,record.boardCorners.flatMap(p => [p.image.x,p.image.y]));
                const to = cv.matFromArray(4,1,cv.CV_32FC2,record.boardCorners.flatMap(p => [p.board.x,p.board.y]));
                let matrix;
                try {matrix = cv.getPerspectiveTransform(from,to);}
                finally {from.delete(); to.delete();}
                const h = Array.from(matrix.data64F); matrix.delete();
                const mapping = (x,y) => {
                    const w = h[6]*x+h[7]*y+h[8];
                    return {x:(h[0]*x+h[1]*y+h[2])/w, y:(h[3]*x+h[4]*y+h[5])/w};
                };
                const combined = consistentMeasurements(results,mapping);
                const point = combined.boardPoint || combined.point;
                const board = point ? mapping(point.x,point.y) : null;
                output.push({width:reference.width,height:reference.height,results,combined,
                    score:combined.point && board ? calculateScore(board.x,board.y) : null,
                    elapsedMs:performance.now()-started});
            }
            return output;
        }''', records)
        browser.close()
    expected = json.loads(args.expected.read_text()) if args.expected else {}
    report = {}
    for file, result in zip(args.files, results):
        report[file.name] = result
        combined = result['combined']
        print(json.dumps({'file': file.name, 'agreement': combined.get('agreement'),
            'accepted': bool(combined.get('point')), 'reason': combined.get('reason'),
            'score': result['score'], 'elapsedMs': round(result['elapsedMs'])}, ensure_ascii=False))
        check = expected.get(file.name)
        if not check:
            continue
        assert combined.get('agreement') == check['agreement'], file.name
        assert bool(combined.get('point')) == check['accepted'], file.name
        if 'point_bounds' in check:
            left, top, right, bottom = check['point_bounds']
            for item in result['results']:
                if not item.get('point'):
                    continue
                x, y = item['point']['x'] * result['width'], item['point']['y'] * result['height']
                assert left <= x <= right and top <= y <= bottom, (file.name, x, y)
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
