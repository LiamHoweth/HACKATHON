// Still Here: simple 6-slide pitch deck generator (copied from build_final_deck.js).
// Usage (from repo root):
//   NODE_PATH=docs/deck/final/.build/node_modules node docs/deck/final/build_six.js               -> Still_Here_6.pptx
//   ... node docs/deck/final/build_six.js --qa       <dir>                                      -> one single-slide pptx per slide (for Quick Look QA)
// Content source: docs/deck/FINAL_DECK.md. No keys, codes or secrets appear in this deck.

const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const JSZip = require("jszip");
const Lu = require("react-icons/lu");

const SKILL = "/Users/howeth/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin/e2e76801-e371-48a2-a4ce-50f987c1ca98/46d4403c-5433-4561-a06b-ec75361c26ec/skills/pptx";
const { applyTheme } = require(path.join(SKILL, "scripts/apply_theme.js"));

const HERE = __dirname;
const DECK = path.resolve(HERE, "..");
const SCREENS = path.join(DECK, "screens");
const DIAGRAM = path.join(DECK, "diagram");
const OUT = path.join(HERE, "Still_Here_6.pptx");
const LOGO = path.join(DECK, "logo");
const logoFile = (n) => (fs.existsSync(path.join(LOGO, n)) ? path.join(LOGO, n) : null);

// ---------- theme ----------
const HEX = {
  bg: "FAFAFA", ink: "121417", accent: "0B5D46", tint: "E2F2EC", muted: "464B53",
  white: "FFFFFF", line: "D9DCE0", soft: "8A9099", darkCard: "1E2126", darkLine: "343940", mint: "7FD1B0",
};
const THEME = {
  name: "Still Here",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: HEX.ink, lt1: HEX.white, dk2: HEX.muted, lt2: HEX.bg,
    accent1: HEX.accent, accent2: HEX.tint, accent3: "3C8C6E", accent4: HEX.soft,
    accent5: "B8BDC4", accent6: HEX.mint, hlink: HEX.accent, folHlink: HEX.muted,
  },
};

// ---------- assets ----------
const cache = {};
async function icon(name, color, size = 256) {
  const key = `${name}-${color}`;
  if (cache[key]) return cache[key];
  const Comp = Lu[name];
  if (!Comp) throw new Error("missing icon " + name);
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return (cache[key] = "image/png;base64," + buf.toString("base64"));
}

// Rounded-corner screenshot, baked into the PNG so it renders the same everywhere.
async function rounded(file, { width = 1800, radiusFrac = 0.022, crop } = {}) {
  const key = `r-${file}-${width}-${JSON.stringify(crop || {})}`;
  if (cache[key]) return cache[key];
  if (!fs.existsSync(file)) return (cache[key] = null);
  let img = sharp(file);
  if (crop) img = img.extract(crop);
  const resized = await img.resize({ width, withoutEnlargement: true }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  const r = Math.round(meta.width * radiusFrac);
  const mask = Buffer.from(`<svg width="${meta.width}" height="${meta.height}"><rect x="0" y="0" width="${meta.width}" height="${meta.height}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const buf = await sharp(resized).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return (cache[key] = { data: "image/png;base64," + buf.toString("base64"), w: meta.width, h: meta.height });
}

const missing = new Set();

// ---------- layouts ----------
function markObj(dark) {
  const f = logoFile(dark ? "mark-white-512.png" : "mark-512.png");
  if (!f) { missing.add("logo mark"); return []; }
  return [{ image: { x: 8.78, y: 5.245, w: 0.2, h: 0.2, path: f, altText: "Still Here mark" } }];
}
function defineLayouts(pres) {
  const C = pres.SchemeColor;
  pres.defineSlideMaster({
    title: "Content",
    background: { color: HEX.bg },
    objects: [
      ...markObj(false),
      { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.32, w: 9.0, h: 0.75, fontSize: 32, bold: true, color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: 9.0, y: 5.22, w: 0.5, h: 0.25, fontSize: 10, color: HEX.soft, align: "right" },
  });
  pres.defineSlideMaster({
    title: "Dark",
    background: { color: HEX.ink },
    objects: [
      ...markObj(true),
      { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.32, w: 9.0, h: 0.75, fontSize: 32, bold: true, color: C.background1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: 9.0, y: 5.22, w: 0.5, h: 0.25, fontSize: 10, color: HEX.soft, align: "right" },
  });
  pres.defineSlideMaster({
    title: "Dark Title",
    background: { color: HEX.ink },
    objects: [],
  });
  pres.defineSlideMaster({
    title: "Dark Close",
    background: { color: HEX.ink },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.75, w: 4.6, h: 1.9, fontSize: 34, bold: true, color: C.background1, align: "left", valign: "top", margin: 0 }, text: "" } },
    ],
  });
  pres.defineSlideMaster({
    title: "Full Image",
    background: { color: HEX.white },
    objects: [],
    slideNumber: { x: 9.0, y: 5.28, w: 0.5, h: 0.25, fontSize: 10, color: HEX.soft, align: "right" },
  });
}

// ---------- helpers ----------
const shadow = () => ({ type: "outer", color: "000000", opacity: 0.16, blur: 8, offset: 2, angle: 90 });
const softShadow = () => ({ type: "outer", color: "000000", opacity: 0.08, blur: 6, offset: 1, angle: 90 });

function T(slide, text, opts) {
  slide.addText(text, Object.assign({ isTextBox: true, margin: 0, fontSize: 14, color: HEX.ink, valign: "top" }, opts));
}
async function iconCircle(slide, name, x, y, d, { fill = HEX.accent, color = HEX.white, name: objName } = {}) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill, width: 0 }, objectName: objName || `icon ${name}` });
  const pad = d * 0.25;
  slide.addImage({ data: await icon(name, color), x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, altText: "" });
}
function card(slide, x, y, w, h, { fill = HEX.white, line = HEX.line, sh = true, name } = {}) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { color: line, width: 0.75 }, shadow: sh ? softShadow() : undefined, objectName: name || "card" });
}
// Screenshot inside a rounded "device" frame. Image is never stretched: fit by width or height.
async function screenshot(slide, file, x, y, maxW, maxH, { dark = false, alt = "", crop, label } = {}) {
  const img = await rounded(file, { crop });
  const bez = 0.07;
  const aspect = img ? img.w / img.h : 4 / 3;
  let w = maxW - 2 * bez, h = w / aspect;
  if (h > maxH - 2 * bez) { h = maxH - 2 * bez; w = h * aspect; }
  const fx = x + (maxW - (w + 2 * bez)) / 2, fy = y;
  slide.addShape("roundRect", { x: fx, y: fy, w: w + 2 * bez, h: h + 2 * bez, rectRadius: 0.1,
    fill: { color: dark ? "2B2F35" : "1B1E22" }, line: { color: dark ? "4A5058" : "1B1E22", width: 0.75 }, shadow: shadow(), objectName: "device frame" });
  if (img) {
    slide.addImage({ data: img.data, x: fx + bez, y: fy + bez, w, h, altText: alt });
  } else {
    missing.add(path.basename(file));
    slide.addShape("roundRect", { x: fx + bez, y: fy + bez, w, h, rectRadius: 0.06, fill: { color: "2B2F35" }, line: { color: "4A5058", width: 0.75, dashType: "dash" } });
    T(slide, `Missing asset: ${label || path.basename(file)}`, { x: fx + bez, y: fy + bez, w, h, align: "center", valign: "middle", color: HEX.white, fontSize: 14 });
  }
  return { x: fx, y: fy, w: w + 2 * bez, h: h + 2 * bez };
}
function footnote(slide, text, { dark = false, y = 5.2, w = 8.1 } = {}) {
  T(slide, text, { x: 0.5, y, w, h: 0.28, fontSize: 10, color: dark ? "9AA0A8" : HEX.muted, valign: "middle" });
}
function arrow(slide, x1, y1, x2, y2, color = HEX.soft, width = 1.5) {
  const flipH = x2 < x1, flipV = y2 < y1;
  slide.addShape("line", { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001,
    flipH, flipV, line: { color, width, endArrowType: "triangle" } });
}
function bubble(slide, text, x, y, w, h, { fill, color, fontSize = 18, line, transparency, bold = false, dash, align = "left", italic = false } = {}) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.22, fill: { color: fill, transparency: transparency || 0 },
    line: { color: line || fill, width: line ? 1.25 : 0, dashType: dash, transparency: transparency || 0 }, objectName: "chat bubble" });
  T(slide, text, { x: x + 0.2, y, w: w - 0.4, h, fontSize, color, valign: "middle", bold, align, italic, transparency });
}
// ---------- slides (6-slide simple deck) ----------
const S = [];
const add = (section, build) => S.push({ section, build });

function defineExtraLayouts(pres) {
  const C = pres.SchemeColor;
  pres.defineSlideMaster({
    title: "Dark Plain",
    background: { color: HEX.ink },
    objects: [
      { placeholder: { options: { name: "title", type: "title", x: 0.5, y: 0.32, w: 9.0, h: 0.75, fontSize: 32, bold: true, color: C.background1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    ],
    slideNumber: { x: 9.0, y: 5.22, w: 0.5, h: 0.25, fontSize: 10, color: HEX.soft, align: "right" },
  });
}

// 1. Title
add("Pitch", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Dark Title", sectionTitle: sec });
  const lock = logoFile("lockup-horizontal-white.png");
  if (lock) s.addImage({ path: lock, x: 0.45, y: 1.3, w: 4.4, h: 1.1, altText: "Still Here" });
  else T(s, "Still Here", { x: 0.6, y: 1.35, w: 4.6, h: 1.0, fontSize: 54, bold: true, color: HEX.white, valign: "bottom" });
  T(s, "Be part of the conversation while it's still happening.", { x: 0.6, y: 2.65, w: 4.4, h: 0.9, fontSize: 22, bold: true, color: HEX.mint });
  T(s, "Liam Howeth  ·  Richard Ognefijiro  ·  SASEHacks for Good", { x: 0.6, y: 4.6, w: 4.7, h: 0.3, fontSize: 12, color: "9AA0A8" });
  await screenshot(s, path.join(SCREENS, "02-board-highlight.png"), 5.4, 1.05, 4.2, 3.6, { dark: true, alt: "Still Here board on iPad: partner question and two reply cards" });
  s.addNotes("Hi, we're Liam and Richard, and this is Still Here. It helps people who can't speak or use their hands join a conversation while it's still happening.");
});

// 2. Who it's for
add("Pitch", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Built for people living with ALS", { placeholder: "title" });
  // Left: What is ALS?
  card(s, 0.5, 1.25, 4.4, 2.75, { name: "ALS card" });
  T(s, "What is ALS?", { x: 0.75, y: 1.42, w: 3.9, h: 0.4, fontSize: 20, bold: true, color: HEX.accent, valign: "middle" });
  T(s, "A progressive disease that destroys the nerve cells controlling muscles. People lose movement, speech, and breathing. Thinking often stays intact.¹",
    { x: 0.75, y: 1.9, w: 3.9, h: 1.25, fontSize: 15, color: HEX.ink });
  s.addShape("line", { x: 0.75, y: 3.25, w: 3.9, h: 0, line: { color: HEX.line, width: 0.75 } });
  T(s, "Most people with ALS lose their speech.²", { x: 0.75, y: 3.32, w: 3.9, h: 0.55, fontSize: 16, bold: true, color: HEX.accent, valign: "middle" });
  // Right: Also helps
  card(s, 5.1, 1.25, 4.4, 2.75, { name: "also helps card" });
  T(s, "Also helps", { x: 5.35, y: 1.42, w: 3.9, h: 0.4, fontSize: 20, bold: true, color: HEX.accent, valign: "middle" });
  const groups = ["Locked-in syndrome", "Cerebral palsy", "High spinal cord injury", "Muscular dystrophy or MS", "Intubated hospital patients"];
  for (let i = 0; i < groups.length; i++) {
    const y = 1.92 + i * 0.4;
    s.addImage({ data: await icon("LuCheck", HEX.accent), x: 5.37, y: y + 0.07, w: 0.22, h: 0.22, altText: "" });
    T(s, groups[i], { x: 5.7, y, w: 3.65, h: 0.36, fontSize: 14, color: HEX.ink, valign: "middle" });
  }
  // Bottom: small callouts
  const calls = [["5M+", "Americans can't rely on speech³"], ["$10,000+", "eye-gaze devices⁴"]];
  for (let i = 0; i < 2; i++) {
    const x = 0.5 + i * 4.6;
    T(s, calls[i][0], { x, y: 4.12, w: 1.45, h: 0.45, fontSize: 24, bold: true, color: HEX.accent, valign: "middle" });
    T(s, calls[i][1], { x: x + 1.5, y: 4.12, w: 2.9, h: 0.45, fontSize: 14, color: HEX.muted, valign: "middle" });
  }
  T(s, "¹ ALS Association, \"What is ALS?\" and \"Changes in Thinking\" (accessed 2026-10-24).  ² Eshghi et al., Scientific Reports 12:15713 (2022).  ³ CommunicationFIRST, organization estimate (accessed 2026-10-24).  ⁴ Montana AT Program, Tobii I-16 eye-gaze device, est. $10,695 (older model).",
    { x: 0.5, y: 4.68, w: 8.1, h: 0.45, fontSize: 8, color: HEX.muted, valign: "top" });
  s.addNotes("Imagine a friend asks, \"Are you coming to dinner tonight?\" and by the time you spell out an answer, everyone has moved on. We built for ALS first because most people with ALS lose their speech while their thinking often stays intact, and that is exactly what Still Here needs. The same face controls can also help people with locked-in syndrome, cerebral palsy, high spinal cord injury, and patients who cannot speak for a while, like after intubation.");
});

// 3. Solution
add("Pitch", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Listen. Suggest. Choose. Speak.", { placeholder: "title" });
  const steps = [
    ["LuMic", "Listen", "Partner just talks"],
    ["LuMessagesSquare", "Suggest", "Two best replies + other ways"],
    ["LuScanFace", "Choose", "Eyebrows move, blink picks"],
    ["LuVolume2", "Speak", "Natural voice"],
  ];
  const w = 1.95, gap = 0.4, y = 1.35, h = 2.45;
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + i * (w + gap);
    card(s, x, y, w, h);
    await iconCircle(s, steps[i][0], x + (w - 0.85) / 2, y + 0.25, 0.85);
    T(s, steps[i][1], { x: x + 0.1, y: y + 1.22, w: w - 0.2, h: 0.45, fontSize: 22, bold: true, align: "center", valign: "middle" });
    T(s, steps[i][2], { x: x + 0.15, y: y + 1.7, w: w - 0.3, h: 0.62, fontSize: 14, color: HEX.muted, align: "center" });
    if (i < 3) arrow(s, x + w + 0.06, y + 0.68, x + w + gap - 0.06, y + 0.68, HEX.accent);
  }
  s.addImage({ data: await icon("LuTablet", HEX.accent), x: 2.45, y: 4.18, w: 0.5, h: 0.5, altText: "iPad" });
  T(s, "Just an iPad. No special hardware.", { x: 3.05, y: 4.15, w: 5.0, h: 0.55, fontSize: 24, bold: true, color: HEX.accent, valign: "middle" });
  s.addNotes("Still Here listens when the partner talks and suggests the two best replies, plus other ways to answer. The person raises their eyebrows to move and does a long blink to choose. The chosen reply is spoken in a natural voice, on a regular iPad with no eye tracker or special hardware.");
});

// 4. How to use it
add("Pitch", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Your face is the controller", { placeholder: "title" });
  const rows = [
    ["LuChevronsUp", "Raise eyebrows", "Next option"],
    ["LuFastForward", "Keep them up", "Keep moving"],
    ["LuUndo2", "Drop your jaw", "Go back"],
    ["LuEyeClosed", "Long blink", "Choose and speak"],
  ];
  const x0 = 0.5, w = 5.0, h = 0.66, gap = 0.12, y0 = 1.25;
  for (let i = 0; i < rows.length; i++) {
    const y = y0 + i * (h + gap);
    card(s, x0, y, w, h, { name: "gesture row" });
    await iconCircle(s, rows[i][0], x0 + 0.13, y + 0.09, 0.48);
    T(s, rows[i][1], { x: x0 + 0.78, y, w: 1.7, h, fontSize: 17, bold: true, valign: "middle" });
    arrow(s, x0 + 2.5, y + h / 2, x0 + 2.85, y + h / 2, HEX.accent);
    T(s, rows[i][2], { x: x0 + 3.0, y, w: 1.95, h, fontSize: 16, color: HEX.accent, bold: true, valign: "middle" });
  }
  T(s, "One-minute calibration learns your face. Partner just talks.", { x: 0.5, y: 4.45, w: 8.2, h: 0.45, fontSize: 18, bold: true, color: HEX.muted, valign: "middle" });
  await screenshot(s, path.join(SCREENS, "02-board-highlight.png"), 5.85, 1.25, 3.65, 3.05, { alt: "Board with the highlighted reply card" });
  s.addNotes("There is no touch screen tapping and no eye tracker. Raising your eyebrows moves to the next option, keeping them up keeps moving, dropping your jaw goes back, and a long blink chooses and speaks. A one-minute calibration learns each person's face, and the partner simply talks.");
});

// 5. See it
add("Pitch", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("One blink to answer", { placeholder: "title" });
  const a = await screenshot(s, path.join(SCREENS, "02-board.png"), 0.5, 1.2, 4.35, 3.3, { alt: "Board: partner asked Are you coming to dinner tonight, two live replies" });
  const b = await screenshot(s, path.join(SCREENS, "03-paths.png"), 5.15, 1.2, 4.35, 3.3, { alt: "Other ways to answer: What time, Who's coming, Decide later, Where at" });
  T(s, "Two best replies", { x: a.x, y: a.y + a.h + 0.15, w: a.w, h: 0.4, fontSize: 18, bold: true, align: "center", valign: "middle" });
  T(s, "Or pick a direction", { x: b.x, y: b.y + b.h + 0.15, w: b.w, h: 0.4, fontSize: 18, bold: true, align: "center", valign: "middle", color: HEX.accent });
  footnote(s, "Current build, iPad-size browser view, Live AI replies (wording varies run to run).", { y: 5.2 });
  s.addNotes("Here is the dinner question on the iPad. Two likely replies appear, and one long blink speaks the highlighted one. If neither fits, Other ways to answer lets the person pick a direction instead. Nothing is spoken unless the person chooses it.");
});

// 6. How it works + close
add("Pitch", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Simple, private, personal", { placeholder: "title" });
  await diagramBlock(s, path.join(DIAGRAM, "architecture-simple.png"), 0.4, 1.2, 5.8, 2.75,
    "Simplified architecture: iPad (camera, microphone, speaker), our Railway server, OpenAI and ElevenLabs", { left: 0, top: 170, width: 1920, height: 880 });
  const lines = [
    ["LuScanFace", "Calibrated to your face"],
    ["LuLock", "Camera stays on the iPad"],
    ["LuShieldCheck", "Learns you, with permission"],
  ];
  for (let i = 0; i < 3; i++) {
    const y = 1.35 + i * 0.85;
    await iconCircle(s, lines[i][0], 6.55, y, 0.6);
    T(s, lines[i][1], { x: 7.3, y, w: 2.25, h: 0.6, fontSize: 16, bold: true, valign: "middle" });
  }
  s.addShape("line", { x: 0.5, y: 4.08, w: 9.0, h: 0, line: { color: HEX.line, width: 0.75 } });
  const mark = logoFile("mark-512.png");
  if (mark) s.addImage({ path: mark, x: 0.5, y: 4.22, w: 0.46, h: 0.46, altText: "Still Here mark" });
  T(s, "Your words. Your choice.", { x: mark ? 1.1 : 0.5, y: 4.17, w: 6.0, h: 0.56, fontSize: 26, bold: true, color: HEX.accent, valign: "middle" });
  T(s, "Next: test with people with ALS · phones and offline · personal voice", { x: mark ? 1.1 : 0.5, y: 4.78, w: 7.4, h: 0.32, fontSize: 13, color: HEX.muted, valign: "middle" });
  s.addNotes("Face tracking runs on the iPad, so camera frames stay on the device by design, and a short calibration learns each person's face. Our server keeps the API keys private and calls OpenAI for replies and ElevenLabs for the voice, and learning is off by default and keeps only what the person approves. Next, we want to test with people with ALS, bring it to phones and offline use, and add a personal voice. Your words, your choice. Thank you.");
});

async function diagramBlock(s, file, x, y, maxW, maxH, label, crop) {
  if (!fs.existsSync(file)) {
    missing.add(path.basename(file));
    s.addShape("roundRect", { x, y, w: maxW, h: maxH, rectRadius: 0.12, fill: { color: HEX.white }, line: { color: HEX.soft, width: 1, dashType: "dash" }, objectName: "missing diagram frame" });
    T(s, `Diagram pending: ${label}`, { x, y, w: maxW, h: maxH, align: "center", valign: "middle", color: HEX.muted, fontSize: 16 });
    return;
  }
  let meta = await sharp(file).metadata();
  let data;
  if (crop) {
    const buf = await sharp(file).extract(crop).png().toBuffer();
    data = "image/png;base64," + buf.toString("base64");
    meta = { width: crop.width, height: crop.height };
  } else {
    data = "image/png;base64," + fs.readFileSync(file).toString("base64");
  }
  const aspect = meta.width / meta.height;
  let w = maxW, h = w / aspect;
  if (h > maxH) { h = maxH; w = h * aspect; }
  s.addImage({ data, x: x + (maxW - w) / 2, y, w, h, altText: label });
}

// ---------- build ----------
async function buildPres(indices) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = "Still Here: SASEHacks for Good pitch";
  pres.author = "Still Here team";
  defineLayouts(pres);
  defineExtraLayouts(pres);
  let lastSec = null;
  for (const i of indices) {
    const { section, build } = S[i];
    if (section !== lastSec) { pres.addSection({ title: section }); lastSec = section; }
    await build(pres, section);
  }
  return pres;
}

async function addTransitions(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  for (const n of names) {
    let xml = await zip.file(n).async("string");
    if (xml.includes("<p:transition")) continue;
    const tr = '<p:transition spd="med"><p:fade/></p:transition>';
    if (xml.includes("</p:clrMapOvr>")) xml = xml.replace("</p:clrMapOvr>", "</p:clrMapOvr>" + tr);
    else if (xml.includes("<p:timing")) xml = xml.replace("<p:timing", tr + "<p:timing");
    else xml = xml.replace("</p:sld>", tr + "</p:sld>");
    zip.file(n, xml);
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

async function writeDeck(pres, file) {
  await pres.writeFile({ fileName: file });
  await applyTheme(file, THEME);
  await addTransitions(file);
}

(async () => {
  const qaIdx = process.argv.indexOf("--qa");
  if (qaIdx > -1) {
    const dir = process.argv[qaIdx + 1];
    const only = process.argv[qaIdx + 2] ? process.argv[qaIdx + 2].split(",").map(Number) : null;
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < S.length; i++) {
      if (only && !only.includes(i + 1)) continue;
      const pres = await buildPres([i]);
      await writeDeck(pres, path.join(dir, `s${String(i + 1).padStart(2, "0")}.pptx`));
    }
  } else {
    const pres = await buildPres(S.map((_, i) => i));
    await writeDeck(pres, OUT);
    console.log("wrote", OUT, S.length, "slides");
  }
  if (missing.size) console.log("MISSING ASSETS:", [...missing].join(", "));
})().catch((e) => { console.error(e); process.exit(1); });
