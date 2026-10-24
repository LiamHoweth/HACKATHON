# Local MediaPipe assets for the blink adapter

Served from this origin so blink detection makes no runtime CDN request. Camera frames are
processed in the browser and never uploaded.

## `face_landmarker.task`

- Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Version path: `float16/1`
- License: Apache-2.0 (Google MediaPipe models)
- Downloaded: 2026-10-24
- Size: 3,758,596 bytes
- SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`
- Contents: face_detector.tflite, face_landmarks_detector.tflite, geometry_pipeline_metadata_landmarks.binarypb, face_blendshapes.tflite

## `../wasm/*`

- Package: `@mediapipe/tasks-vision` 1.1.1 (Apache-2.0), pinned exactly in `package.json`
- Copied by `node scripts/copy-mediapipe-assets.mjs` (see `public/wasm/VERSION.txt`)
- SHA-256:
  - vision_wasm_internal.js `6522286aa32dd93eff17c3da002b0649516f87abfec7a80b5bfe5c9625caa5f8`
  - vision_wasm_internal.wasm `0e101a010e262ef8e78f22e3c95b60a9705fd06962753c9acd6356d9fb56b7bd`
  - vision_wasm_module_internal.js `539a4386fd12d0723d6e900ec80467d168ba7290dda2f79e77a2181b8e906115`
  - vision_wasm_module_internal.wasm `3b57e4b55ac6346bf940212e3e11250b308a6a474077385e2f527b119cf74525`
  - vision_wasm_nosimd_internal.js `942654dbdcebce08ea039af23d18e58bebf23c8607d74023d2df7071c8a7b638`
  - vision_wasm_nosimd_internal.wasm `c9b1b69bb87baf9e529254d8559dcbcf4c5a9c0eda84f56a12f17d675335ec9c`

Re-run the copy script after upgrading the package, and update this file with new hashes.
