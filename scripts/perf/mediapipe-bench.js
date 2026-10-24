// Still Here MediaPipe FaceLandmarker micro-benchmark. Paste into the DevTools / Safari Web Inspector
// console on a page served by the app (production or dev), then run:
//   await stillHereMediaPipeBench()            // defaults: 100 timed frames, 10 warm-up frames
// It does NOT use the camera and does not touch app state. It builds FaceLandmarker with the same
// options as src/access/blink-detector.ts (VIDEO mode, numFaces 2, blendshapes on) from this origin's
// /wasm and /models/face_landmarker.task, then times detectForVideo on a synthetic 640x480 canvas.
//
// Library: @mediapipe/tasks-vision 1.1.1 from jsDelivr. Its vision_bundle.mjs was checked to be
// byte-identical (sha256 a84921e0...68f1) to node_modules/@mediapipe/tasks-vision/vision_bundle.mjs.
// A bare 'import("@mediapipe/tasks-vision")' cannot resolve in a console, hence the pinned URL.
//
// Caveat: a synthetic canvas usually contains no detectable face, so only the face-detector stage
// runs; the landmark + blendshape stages run only when a face is found (reported as `faces`).
// Real camera frames with a face cost more per frame than a no-face frame.
/* eslint-disable */
async function stillHereMediaPipeBench({ iterations = 100, warmup = 10, delegates = ['GPU', 'CPU'] } = {}) {
  const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs';
  const ms = (x) => Math.round(x * 10) / 10;
  const stats = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, mean: ms(s.reduce((a, b) => a + b, 0) / s.length), median: ms(q(0.5)), p95: ms(q(0.95)), min: ms(s[0]), max: ms(s[s.length - 1]) };
  };

  // Synthetic frame: a crude drawn face (it may or may not be detected; see `faces`).
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  const g = canvas.getContext('2d');
  const draw = (k) => {
    g.fillStyle = '#6b7a8f'; g.fillRect(0, 0, 640, 480);
    g.fillStyle = '#e0b48f'; g.beginPath(); g.ellipse(320, 250, 120, 160, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; for (const x of [270, 370]) { g.beginPath(); g.ellipse(x, 210, 24, 12, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#3a2a1a'; for (const x of [270, 370]) { g.beginPath(); g.arc(x + (k % 3) - 1, 210, 9, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 6; for (const x of [270, 370]) { g.beginPath(); g.moveTo(x - 30, 180); g.lineTo(x + 30, 178); g.stroke(); }
    g.strokeStyle = '#a0522d'; g.lineWidth = 5; g.beginPath(); g.moveTo(320, 220); g.lineTo(310, 280); g.lineTo(330, 282); g.stroke();
    g.strokeStyle = '#8b0000'; g.beginPath(); g.arc(320, 320, 40, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  };

  const out = { at: new Date().toISOString(), origin: location.origin, ua: navigator.userAgent, cores: navigator.hardwareConcurrency, iterations, warmup, runs: [] };
  let t0 = performance.now();
  const { FaceLandmarker, FilesetResolver } = await import(LIB);
  out.libImportMs = ms(performance.now() - t0);
  t0 = performance.now();
  const fileset = await FilesetResolver.forVisionTasks('/wasm');
  out.filesetMs = ms(performance.now() - t0);
  out.fileset = { loader: fileset.wasmLoaderPath, binary: fileset.wasmBinaryPath };

  let ts = performance.now();
  for (const delegate of delegates) {
    const run = { delegate };
    const before = performance.getEntriesByType('resource').length;
    t0 = performance.now();
    let lm;
    try {
      lm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate },
        runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true, outputFacialTransformationMatrixes: false,
      });
    } catch (e) { run.error = String(e); out.runs.push(run); continue; }
    run.initMs = ms(performance.now() - t0);
    run.fetchedDuringInit = performance.getEntriesByType('resource').slice(before)
      .filter((r) => /\/wasm\/|\/models\//.test(r.name))
      .map((r) => ({ path: r.name.replace(location.origin, ''), transferBytes: r.transferSize, decodedBytes: r.decodedBodySize, ms: ms(r.duration), fromCache: r.transferSize === 0 && r.decodedBodySize > 0 }));
    const times = []; let faces = 0; let first = null;
    for (let i = 0; i < warmup + iterations; i++) {
      draw(i);
      ts = Math.max(ts + 1, performance.now());
      const s = performance.now();
      const r = lm.detectForVideo(canvas, ts);
      const d = performance.now() - s;
      if (i === 0) first = ms(d);
      if (i >= warmup) { times.push(d); faces = Math.max(faces, r.faceLandmarks?.length ?? 0); }
    }
    run.firstFrameMs = first;
    run.detectForVideoMs = stats(times);
    run.faces = faces;
    lm.close();
    out.runs.push(run);
  }
  return out;
}
