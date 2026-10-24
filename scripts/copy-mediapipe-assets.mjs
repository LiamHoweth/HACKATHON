// Copies the pinned @mediapipe/tasks-vision WASM runtime into public/wasm so the blink adapter
// loads it from this origin (no runtime CDN fetch). Run after installing/upgrading the package:
//   node scripts/copy-mediapipe-assets.mjs
// The face landmarker model is downloaded separately; see public/models/README.md.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@mediapipe', 'tasks-vision');
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const src = join(pkgDir, 'wasm');
const dest = join(root, 'public', 'wasm');
mkdirSync(dest, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.js') || f.endsWith('.wasm'));
for (const f of files) copyFileSync(join(src, f), join(dest, f));
writeFileSync(
  join(dest, 'VERSION.txt'),
  `@mediapipe/tasks-vision ${pkg.version} (${pkg.license})\nCopied from node_modules/@mediapipe/tasks-vision/wasm by scripts/copy-mediapipe-assets.mjs\n${files.join('\n')}\n`,
);
console.log(`Copied ${files.length} files from @mediapipe/tasks-vision ${pkg.version} to public/wasm`);
