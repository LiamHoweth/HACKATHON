// Still Here: final hackathon pitch deck generator.
// Usage (from repo root):
//   NODE_PATH=docs/deck/final/.build/node_modules node docs/deck/final/build_final_deck.js        -> Still_Here_Final.pptx
//   ... node docs/deck/final/build_final_deck.js --qa <dir>                                      -> one single-slide pptx per slide (for Quick Look QA)
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
const OUT = path.join(HERE, "Still_Here_Final.pptx");
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

// ---------- slides ----------
// Each entry: { section, build(pres) }.
const S = [];
const add = (section, build) => S.push({ section, build });

// 1. Title
add("Opening", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Dark Title", sectionTitle: sec });
  const lock = logoFile("lockup-horizontal-white.png");
  if (lock) s.addImage({ path: lock, x: 0.45, y: 1.2, w: 4.4, h: 1.1, altText: "Still Here" });
  else T(s, "Still Here", { x: 0.6, y: 1.25, w: 4.6, h: 1.0, fontSize: 54, bold: true, color: HEX.white, valign: "bottom" });
  T(s, "Your words. Your choice.", { x: 0.6, y: 2.35, w: 4.6, h: 0.5, fontSize: 24, bold: true, color: HEX.mint });
  T(s, "Be part of the conversation while it's still happening.", { x: 0.6, y: 2.95, w: 4.3, h: 0.75, fontSize: 18, color: "E6E8EB" });
  T(s, "Liam Howeth  ·  Richard Oduma  ·  SASEHacks for Good", { x: 0.6, y: 4.6, w: 4.6, h: 0.3, fontSize: 12, color: "9AA0A8" });
  await screenshot(s, path.join(SCREENS, "02-board-highlight.png"), 5.4, 1.05, 4.2, 3.6, { dark: true, alt: "Still Here board on iPad: partner question and two reply cards" });
  s.addNotes("Hi, we're the Still Here team. Before we show you anything technical, we want you to imagine something.\n\n[Screenshot: current build, Live AI replies; the yellow highlight was applied by script for the capture, not reached by blink input.]");
});

// 2. Imagine
add("Opening", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Dark", sectionTitle: sec });
  s.addText("Imagine", { placeholder: "title" });
  T(s, "You know your answer.", { x: 0.5, y: 1.75, w: 4.2, h: 0.55, fontSize: 28, bold: true, color: HEX.white });
  T(s, "By the time you can say it, everyone has moved on.", { x: 0.5, y: 2.4, w: 4.0, h: 1.0, fontSize: 20, color: "C9CDD2" });
  // chat
  T(s, "Friend", { x: 5.05, y: 1.2, w: 2, h: 0.25, fontSize: 11, color: "9AA0A8" });
  bubble(s, "“Are you coming to dinner tonight?”", 5.0, 1.5, 4.5, 0.7, { fill: "2B2F35", color: HEX.white, fontSize: 18 });
  T(s, "You", { x: 7.3, y: 2.42, w: 2.15, h: 0.25, fontSize: 11, color: "9AA0A8", align: "right" });
  bubble(s, "Y - e - s ,  I ...", 6.7, 2.72, 2.8, 0.62, { fill: HEX.ink, color: HEX.mint, line: HEX.mint, dash: "dash", fontSize: 18 });
  bubble(s, "“She's probably tired, she'll skip it.”", 5.0, 3.75, 4.0, 0.62, { fill: "2B2F35", color: HEX.white, fontSize: 15, transparency: 55, italic: true });
  T(s, "Illustrative scenario, not a real person.", { x: 0.5, y: 5.2, w: 4.5, h: 0.28, fontSize: 10, color: "9AA0A8", valign: "middle" });
  s.addNotes("Imagine a friend turns to you and asks, 'Are you coming to dinner tonight?' You know exactly what you want to say. Maybe it's 'Yes, save me a seat,' maybe it's a joke. But you can't speak, and you can't use your hands. So you start spelling, one letter at a time. Before you finish, the conversation has moved on. Someone answers for you. 'She's probably tired.' You're in the room, and you're still here, but the conversation is happening without you. What you want isn't just a way to answer later. You want to be part of the conversation while it's still happening. That's what we built.\n\n[Pause one beat before the next slide. Illustrative scenario, not a real person; do not imply we interviewed anyone.]");
});

// 3. Problem
add("Opening", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("The conversation keeps moving", { placeholder: "title" });
  const stat = (x, num, label) => {
    card(s, x, 1.3, 4.35, 1.95);
    T(s, num, { x: x + 0.3, y: 1.42, w: 3.9, h: 1.0, fontSize: 60, bold: true, color: HEX.accent, valign: "middle" });
    T(s, label, { x: x + 0.3, y: 2.45, w: 3.85, h: 0.7, fontSize: 15, color: HEX.muted });
  };
  stat(0.5, "5 million+", "people in the U.S. cannot rely on speech alone (estimate) [1]");
  stat(5.15, "Most", "people with ALS gradually lose the ability to speak [2]");
  // timeline
  const ty = 3.75;
  bubble(s, "“Dinner tonight?”", 0.5, ty, 1.95, 0.5, { fill: HEX.tint, color: HEX.accent, fontSize: 14, bold: true });
  s.addShape("roundRect", { x: 2.6, y: ty + 0.12, w: 4.4, h: 0.26, rectRadius: 0.13, fill: { color: "D5D8DC" }, line: { color: "D5D8DC", width: 0 }, objectName: "spelling bar" });
  T(s, "spelling a reply, letter by letter", { x: 2.6, y: ty + 0.42, w: 4.4, h: 0.3, fontSize: 12, color: HEX.muted, align: "center" });
  bubble(s, "Already moved on", 7.15, ty, 2.35, 0.5, { fill: "ECEDEF", color: HEX.muted, fontSize: 14 });
  T(s, "Spelling a reply takes longer than the moment lasts.", { x: 0.5, y: 4.6, w: 9, h: 0.4, fontSize: 18, bold: true, color: HEX.ink });
  footnote(s, "[1] CommunicationFIRST, organization estimate (accessed 2026-10-24).  [2] Eshghi et al., Scientific Reports 12:15713 (2022).");
  s.addNotes("This isn't rare. CommunicationFIRST estimates more than five million children and adults in the U.S. can't rely on speech alone. That includes people with ALS, stroke, cerebral palsy and more. In ALS, most people gradually lose the ability to speak and eventually need a device to communicate. Most tools make them build messages letter by letter, and conversation doesn't wait.\n\n[Say \"estimates\". Do not say \"voiceless\" or \"trapped\".]");
});

// 4. Why it matters
add("Opening", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Speed, cost, and authorship", { placeholder: "title" });
  s.addShape("roundRect", { x: 0.5, y: 1.2, w: 9, h: 0.5, rectRadius: 0.1, fill: { color: HEX.tint }, line: { color: HEX.tint, width: 0 }, objectName: "theme banner" });
  T(s, [
    { text: "SASEHacks for Good:  ", options: { bold: true } },
    { text: "“Build creative and innovative solutions to create a positive change in the community or the world.”", options: { italic: true } },
  ], { x: 0.7, y: 1.2, w: 8.6, h: 0.5, fontSize: 13, color: HEX.accent, valign: "middle" });
  const cols = [
    ["LuTimer", "~190", "words a minute: speaking rate in one study [3]"],
    ["LuTag", "$10,000+", "what dedicated eye-gaze devices have cost [4]"],
    ["LuPenLine", "Your words", "people need speed without losing authorship"],
  ];
  for (let i = 0; i < 3; i++) {
    const x = 0.5 + i * 3.1;
    await iconCircle(s, cols[i][0], x, 2.0, 0.55);
    T(s, cols[i][1], { x, y: 2.65, w: 2.9, h: 0.85, fontSize: i === 2 ? 40 : 54, bold: true, color: HEX.accent, valign: "middle" });
    T(s, cols[i][2], { x, y: 3.55, w: 2.75, h: 0.55, fontSize: 14, color: HEX.muted });
  }
  T(s, [
    { text: "No special hardware.  ", options: { bold: true, color: HEX.accent } },
    { text: "No eye tracker. No head switch. No dedicated speech device.", options: { bold: true } },
  ], { x: 0.5, y: 4.4, w: 9, h: 0.4, fontSize: 17, color: HEX.ink });
  footnote(s, "[3] Eshghi et al. 2022, healthy controls, mean 187.6 words/min.  [4] Montana AT Program, Tobii I-16 eye-gaze device, est. $10,695 (older model).");
  s.addNotes("This hackathon asks us to create positive change in the community or the world. Here's where change is needed. Speed: healthy speakers in one study talked at about 190 words a minute, and spelling a reply is far slower. Cost: dedicated eye-gaze communication devices have been listed at over ten thousand dollars. And authorship: AI that talks for you isn't the goal. So we set a rule: no special hardware. No eye tracker, no head switch, no dedicated speech device. Just a camera, a mic and a speaker people already own.\n\n[Say \"about 190 in one study\" and \"have been listed at over $10,000\".]");
});

// 5. Solution
add("Opening", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("No special hardware", { placeholder: "title" });
  T(s, "Just the iPad or phone you already have.", { x: 0.5, y: 1.08, w: 9, h: 0.4, fontSize: 20, color: HEX.accent, bold: true });
  const steps = [
    ["LuMic", "The partner talks", "Hands-free listening"],
    ["LuMessagesSquare", "Two likely replies", "plus Other ways to answer"],
    ["LuScanFace", "Eyebrows move", "A long blink chooses"],
    ["LuVolume2", "A natural voice", "speaks the chosen words"],
  ];
  const w = 1.95, gap = 0.4, y = 1.8;
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + i * (w + gap);
    card(s, x, y, w, 1.85);
    await iconCircle(s, steps[i][0], x + (w - 0.62) / 2, y + 0.2, 0.62);
    T(s, steps[i][1], { x: x + 0.1, y: y + 0.95, w: w - 0.2, h: 0.35, fontSize: 15, bold: true, align: "center" });
    T(s, steps[i][2], { x: x + 0.1, y: y + 1.3, w: w - 0.2, h: 0.45, fontSize: 12, color: HEX.muted, align: "center" });
    if (i < 3) arrow(s, x + w + 0.06, y + 0.92, x + w + gap - 0.06, y + 0.92, HEX.accent);
  }
  // loop back
  const lx1 = 0.5 + 3 * (w + gap) + w / 2, lx0 = 0.5 + w / 2, ly = y + 2.05;
  s.addShape("line", { x: lx1, y: y + 1.85, w: 0.001, h: 0.2, line: { color: HEX.accent, width: 1.25 } });
  s.addShape("line", { x: lx0, y: ly, w: lx1 - lx0, h: 0.001, line: { color: HEX.accent, width: 1.25 } });
  arrow(s, lx0, ly, lx0, y + 1.88, HEX.accent, 1.25);
  T(s, "next turn", { x: 4.0, y: ly + 0.03, w: 2, h: 0.25, fontSize: 11, color: HEX.accent, align: "center", italic: true });
  T(s, "Be part of the conversation while it's still happening.", { x: 0.5, y: 4.4, w: 5.8, h: 0.4, fontSize: 17, italic: true, bold: true, color: HEX.ink });
  // devices
  s.addImage({ data: await icon("LuTablet", HEX.accent), x: 6.75, y: 4.32, w: 0.5, h: 0.5, altText: "iPad" });
  T(s, "iPad today", { x: 7.3, y: 4.42, w: 0.95, h: 0.3, fontSize: 12, color: HEX.accent, bold: true });
  s.addImage({ data: await icon("LuSmartphone", "9AA0A8"), x: 8.3, y: 4.35, w: 0.42, h: 0.42, altText: "Phone" });
  T(s, "next", { x: 8.75, y: 4.42, w: 0.6, h: 0.3, fontSize: 12, color: HEX.muted });
  footnote(s, "Tested on iPad today; phone support next.");
  s.addNotes("Still Here lets someone who can't speak or use their hands keep up with a real, back-and-forth conversation and answer in the moment, in their own words. Not just answers. Conversation. And it needs only what people already own: a device with a front camera, a microphone and a speaker. It's a web app that runs in the browser, and we also built an installable iPad app. Here's the loop. The partner just talks; the iPad listens hands-free. Still Here offers the two most likely replies, plus Other ways to answer when neither fits. The person raises their eyebrows to move and does a long blink to choose, and the reply is spoken in a natural voice. Today we've demoed and tested it on an iPad. Phones are next: the layout adapts, but we haven't tested on a phone yet.");
});

// 6. Live demo
add("Demo", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Live: two conversations", { placeholder: "title" });
  await screenshot(s, path.join(SCREENS, "02-board.png"), 0.5, 1.25, 4.35, 3.2, { alt: "Board: partner asked Are you coming to dinner tonight, two live replies and Other ways to answer" });
  await screenshot(s, path.join(SCREENS, "06-howyourday.png"), 5.15, 1.25, 4.35, 3.2, { alt: "Board: partner asked How was your day, two replies and Other ways to answer" });
  T(s, [
    { text: "Watch: ", options: { bold: true, color: HEX.accent } },
    { text: "eyebrows move, long blink speaks, Other ways when nothing fits." },
  ], { x: 0.5, y: 4.62, w: 9, h: 0.35, fontSize: 16 });
  footnote(s, "Current build, iPad-size browser view, Live AI replies (wording varies run to run).");
  s.addNotes("Remember the dinner question? Let's run it. My teammate asks, 'Are you coming to dinner tonight?' Two likely replies show up in a few seconds. A raise moves the highlight, a long blink speaks it. Now an open question: 'How was your day?' If neither reply fits, Other ways to answer offers directions like Rough day or You first, with replies usually already loaded. Nothing is spoken unless the person chooses it.\n\n[Then switch to the live iPad mirror. Fallbacks if needed: Touch mode, typed partner line, basic device voice, Fixture demo, all labeled on screen. Do not say \"instant\"; open questions can take about 7 to 9 s.]");
});

// 7. Control
add("Demo", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Raise. Hold. Drop. Blink.", { placeholder: "title" });
  const rows = [
    ["LuArrowUp", "Raise eyebrows", "Next"],
    ["LuRepeat", "Keep them up", "Keep moving"],
    ["LuUndo2", "Jaw drop", "Back"],
    ["LuEyeOff", "Long blink", "Choose, or stop speech"],
  ];
  for (let i = 0; i < 4; i++) {
    const y = 1.3 + i * 0.88;
    card(s, 0.5, y, 5.6, 0.74, { sh: false });
    await iconCircle(s, rows[i][0], 0.65, y + 0.12, 0.5);
    T(s, rows[i][1], { x: 1.35, y, w: 2.2, h: 0.74, fontSize: 17, bold: true, valign: "middle" });
    s.addImage({ data: await icon("LuArrowRight", HEX.soft), x: 3.5, y: y + 0.24, w: 0.26, h: 0.26, altText: "" });
    T(s, rows[i][2], { x: 3.95, y, w: 2.05, h: 0.74, fontSize: 16, color: HEX.accent, bold: true, valign: "middle" });
  }
  s.addShape("roundRect", { x: 6.5, y: 1.3, w: 3.0, h: 3.38, rectRadius: 0.12, fill: { color: HEX.tint }, line: { color: HEX.tint, width: 0 }, objectName: "callout" });
  await iconCircle(s, "LuEyeOff", 6.8, 1.6, 0.6);
  T(s, "Blink always wins", { x: 6.8, y: 2.4, w: 2.5, h: 1.0, fontSize: 28, bold: true, color: HEX.accent });
  T(s, "If a blink and a raise overlap, the ambiguous input is thrown away. Touch, keyboard, and switch still work.", { x: 6.8, y: 3.4, w: 2.5, h: 1.15, fontSize: 13, color: HEX.muted });
  footnote(s, "Gesture logic tested with unit and synthetic-frame tests; reliability on people not yet measured.");
  s.addNotes("Control uses four face movements the front camera can see. Raise your eyebrows for about half a second to move one step; keep them up and it keeps moving, a step every 0.6 seconds. A brief jaw drop goes back; talking and yawns are ignored. A long blink with both eyes chooses; normal blinks and winks don't count. If a blink and a raise overlap, the blink wins and the ambiguous input is thrown away. Touch, keyboard and switch all still work.");
});

// 8. Calibration
add("Demo", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Calibrated to your face", { placeholder: "title" });
  T(s, "A short guided calibration learns your resting face, your eyebrow raise, and your natural vs deliberate blinks.", { x: 0.5, y: 1.15, w: 8.6, h: 0.6, fontSize: 16, color: HEX.muted });
  const steps = [
    ["LuSmile", "Hold still", "1 s"],
    ["LuEye", "Eyes open", "3 s"],
    ["LuEye", "Blink normally", "8 s"],
    ["LuEyeOff", "Long blink x4", "deliberate"],
    ["LuArrowUp", "Raise eyebrows", "a few raises"],
  ];
  const w = 1.3, gap = 0.15, y = 2.05;
  for (let i = 0; i < 5; i++) {
    const x = 0.5 + i * (w + gap);
    card(s, x, y, w, 1.9);
    T(s, String(i + 1), { x: x + 0.12, y: y + 0.1, w: 0.3, h: 0.25, fontSize: 11, color: HEX.soft, bold: true });
    await iconCircle(s, steps[i][0], x + (w - 0.55) / 2, y + 0.3, 0.55);
    T(s, steps[i][1], { x: x + 0.08, y: y + 0.95, w: w - 0.16, h: 0.55, fontSize: 14, bold: true, align: "center", valign: "middle" });
    T(s, steps[i][2], { x: x + 0.08, y: y + 1.5, w: w - 0.16, h: 0.3, fontSize: 12, color: HEX.muted, align: "center" });
  }
  const fx = 0.5 + 5 * (w + gap), fw = 9.5 - fx;
  s.addShape("roundRect", { x: fx, y, w: fw, h: 1.9, rectRadius: 0.12, fill: { color: HEX.accent }, line: { color: HEX.accent, width: 0 }, objectName: "saved card" });
  s.addImage({ data: await icon("LuLock", HEX.white), x: fx + 0.2, y: y + 0.22, w: 0.4, h: 0.4, altText: "" });
  T(s, "Saved on this iPad", { x: fx + 0.2, y: y + 0.7, w: fw - 0.3, h: 0.5, fontSize: 15, bold: true, color: HEX.white });
  T(s, "Thresholds and timing only, no images.", { x: fx + 0.2, y: y + 1.2, w: fw - 0.3, h: 0.6, fontSize: 12, color: HEX.tint });
  T(s, "Your timing, saved on this iPad.", { x: 0.5, y: 4.3, w: 9, h: 0.45, fontSize: 18, bold: true, color: HEX.ink });
  footnote(s, "Calibration logic verified in code; a calibration on a real person on the iPad is not yet recorded.");
  s.addNotes("Faces differ, so every person gets their own calibration. In under a minute it records their relaxed face, watches their normal blinking, asks for a few deliberate long blinks and a few eyebrow raises, and sets personal thresholds and timing: for example the eyebrow hold lands between about 0.35 and 0.5 seconds. If it can't tell a natural blink from a deliberate one, it says so honestly instead of guessing. Only a few numbers are saved, on that iPad. No images, no face data, no cloud profile.\n\n[Say \"saved on this iPad\", never \"cloud profile\".]");
});

// 9. Learning
add("Demo", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("It learns you, with your permission", { placeholder: "title" });
  const w = 2.8, gap = 0.3, y = 1.3, h = 2.85;
  const cards = [
    ["LuRefreshCw", "“None of these”", "Turn down a set of replies and the next ones take a different direction.", "this question", null],
    ["LuSparkles", "“Shorter replies?”", "Wording habits can be learned in a session, if you opt in.", "opt-in, this session", ["Yes", "Not now"]],
    ["LuShieldCheck", "Saved preferences", "Kept only with your approval. See, pause, or delete anytime.", "only with approval, only on this iPad", ["Pause", "Delete"]],
  ];
  for (let i = 0; i < 3; i++) {
    const x = 0.5 + i * (w + gap);
    const c = cards[i];
    card(s, x, y, w, h);
    await iconCircle(s, c[0], x + 0.25, y + 0.25, 0.55);
    T(s, c[1], { x: x + 0.25, y: y + 0.92, w: w - 0.5, h: 0.4, fontSize: 17, bold: true });
    T(s, c[2], { x: x + 0.25, y: y + 1.32, w: w - 0.5, h: 0.8, fontSize: 14, color: HEX.muted });
    if (c[4]) {
      c[4].forEach((b, j) => {
        const bx = x + 0.25 + j * 0.95;
        s.addShape("roundRect", { x: bx, y: y + 2.12, w: 0.85, h: 0.3, rectRadius: 0.15, fill: { color: j === 0 ? HEX.accent : HEX.white }, line: { color: HEX.accent, width: 1 }, objectName: "mini button" });
        T(s, b, { x: bx, y: y + 2.12, w: 0.85, h: 0.3, fontSize: 11, bold: true, align: "center", valign: "middle", color: j === 0 ? HEX.white : HEX.accent });
      });
    } else {
      s.addImage({ data: await icon("LuArrowRight", HEX.accent), x: x + 0.25, y: y + 2.14, w: 0.26, h: 0.26, altText: "" });
      T(s, "new meanings, not paraphrases", { x: x + 0.58, y: y + 2.12, w: 2.0, h: 0.3, fontSize: 11, color: HEX.accent, valign: "middle", italic: true });
    }
    T(s, c[3], { x: x + 0.25, y: y + 2.5, w: w - 0.5, h: 0.25, fontSize: 10, color: HEX.soft, italic: true });
  }
  s.addImage({ data: await icon("LuLock", HEX.accent), x: 0.5, y: 4.42, w: 0.34, h: 0.34, altText: "" });
  T(s, "Nothing is kept without your approval. Learning is off by default.", { x: 0.95, y: 4.4, w: 8.5, h: 0.4, fontSize: 17, bold: true, valign: "middle" });
  s.addNotes("Still Here adapts, but only in ways the person controls. If they turn down a set of replies, the server is told what was offered and not chosen for this question, so the next set takes different meanings, not paraphrases. If they turn on session learning at setup, the app notices wording patterns, like repeatedly asking for shorter replies, and then asks, 'Shorter replies?' It only applies that after they approve, twice. It's kept for the session unless they choose to save it on this iPad, and they can see, pause or delete it anytime. Learning is off by default. No model is trained on them.\n\n[Do not say \"learns everything about you\", \"cloud profile\" or \"trains a model\".]");
});

// 10. Architecture (simplified diagram)
add("How it works", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("How it fits together", { placeholder: "title" });
  const file = path.join(DIAGRAM, "architecture-simple.png");
  await diagramBlock(s, file, 0.5, 1.15, 9.0, 3.8, "Simplified architecture: iPad (camera, microphone, speaker), our Railway server, OpenAI and ElevenLabs", { left: 0, top: 150, width: 1920, height: 930 });
  footnote(s, "Face tracking runs on the iPad. Audio clips, text, and chosen words go to our server. Keys never leave the server.", { y: 5.0, w: 8.1 });
  s.addNotes("Face tracking runs on the iPad with MediaPipe, so camera frames stay on the device by design. When the partner talks, a short clip goes to our server, which calls OpenAI to transcribe it and to suggest replies. The chosen reply goes to ElevenLabs for the voice. All API keys live on the server; the iPad only holds an access code.\n\n[\"Camera frames stay on device\" is by design; the device network check was not run.]");
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

// 11. On the iPad
add("How it works", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("On the iPad", { placeholder: "title" });
  const blocks = [
    ["LuScanFace", "Face tracking, on device", "MediaPipe on the GPU, served from our own origin. Reads eye blink (both eyes, so winks never count), eyebrow raise, and jaw open. Locks onto one face."],
    ["LuMic", "Hands-free listening", "On-device voice activity detection. 0.65 s of silence ends an utterance. Filler like “uh huh” is ignored. Listening pauses while the app speaks."],
    ["LuCpu", "One reducer decides everything", "Touch, keyboard, switch, blink, and eyebrow all become one guarded ACTIVATE. A gesture arbiter is the only source of accepted commands."],
    ["LuTablet", "Native shell", "SwiftUI + WKWebView. Camera and mic granted for our own site only. Audio plays without a tap. Auto-lock off."],
  ];
  const w = 4.35, h = 1.78;
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + (i % 2) * (w + 0.3), y = 1.25 + Math.floor(i / 2) * (h + 0.25);
    card(s, x, y, w, h);
    await iconCircle(s, blocks[i][0], x + 0.22, y + 0.22, 0.52);
    T(s, blocks[i][1], { x: x + 0.9, y: y + 0.2, w: w - 1.1, h: 0.55, fontSize: 16, bold: true, valign: "middle" });
    T(s, blocks[i][2], { x: x + 0.9, y: y + 0.78, w: w - 1.1, h: 0.95, fontSize: 12.5, color: HEX.muted });
  }
  s.addNotes("On the iPad, MediaPipe's Face Landmarker runs locally in WebAssembly on the GPU. We read only a few blendshape scores: eye blink, eyebrow raise and jaw open, and if several faces are in view we lock onto one. Listening uses on-device voice detection; 0.65 seconds of silence ends the partner's turn. Every input, from touch to a blink, goes through one pure reducer and one target list, so a gesture can never do two things. A small SwiftUI shell wraps the web app so camera, mic and audio just work.");
});

// 12. Server and APIs
add("How it works", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Server and APIs", { placeholder: "title" });
  T(s, "Four routes on Railway. Every paid call needs an access code, is rate limited, and keeps keys on the server.", { x: 0.5, y: 1.1, w: 9, h: 0.5, fontSize: 15, color: HEX.muted });
  const hdr = (t) => ({ text: t, options: { bold: true, color: HEX.ink } });
  const code = (t) => ({ text: t, options: { bold: true, color: HEX.accent } });
  const cell = (t) => ({ text: t, options: { color: HEX.muted } });
  const rows = [
    [hdr("Route"), hdr("Calls"), hdr("Key details")],
    [code("/api/transcribe"), cell("OpenAI gpt-transcribe"), cell("VAD-cut clips, size and type checked, 20/min per client")],
    [code("/api/replies"), cell("OpenAI Responses API, gpt-6-astra"), cell("Strict JSON schema, store: false, low reasoning effort. 2 replies + 3 to 5 directions. 15 s timeout, one repair retry, 30/min")],
    [code("/api/speech"), cell("ElevenLabs eleven_v4_turbo, Text-to-Dialogue WebSocket"), cell("Exact text only (max 500 chars), prefetched into an on-device cache, 40/min")],
    [code("/api/status, /api/voices"), cell("Config check, voice list"), cell("Never returns secrets")],
  ];
  const border = { type: "solid", color: HEX.line, pt: 0.75 };
  const none = { type: "none" };
  s.addTable(rows, { x: 0.5, y: 1.7, w: 9, colW: [2.1, 2.75, 4.15], fontSize: 12, fontFace: undefined, valign: "middle", margin: [0.06, 0.08, 0.06, 0.0],
    border: [none, none, border, none], rowH: [0.38, 0.5, 0.72, 0.62, 0.42] });
  s.addImage({ data: await icon("LuShieldCheck", HEX.accent), x: 0.5, y: 4.55, w: 0.3, h: 0.3, altText: "" });
  T(s, "Access code checked with a timing-safe compare  ·  60,000-character daily voice budget  ·  HSTS, X-Frame-Options DENY, camera and mic for our own site only", { x: 0.9, y: 4.48, w: 8.4, h: 0.5, fontSize: 11, color: HEX.muted, valign: "middle" });
  s.addNotes("The server is a Next.js API on Railway with four routes. Transcribe sends the detected clip to OpenAI's gpt-transcribe. Replies calls the OpenAI Responses API with a strict JSON schema, store false, and low reasoning effort; in branching mode it returns two replies plus three to five directions, and a follow-up from the partner merges into the open question. Speech sends only the exact reply text to ElevenLabs' turbo model over a WebSocket, and the app prefetches audio for the suggestions so the chosen one can play from memory. Every paid route checks an access code, rate limits per client, and voice has a daily character budget.");
});

// 13. Speed
add("How it works", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("About 4 seconds to suggestions", { placeholder: "title" });
  T(s, "3.8 s", { x: 0.5, y: 1.25, w: 3.3, h: 0.95, fontSize: 64, bold: true, color: HEX.accent, valign: "middle" });
  T(s, "median, partner stops to suggestions on screen (was 5.1 s)", { x: 0.5, y: 2.2, w: 3.1, h: 0.55, fontSize: 14, color: HEX.muted });
  T(s, "5.8 s", { x: 0.5, y: 2.9, w: 3.3, h: 0.75, fontSize: 44, bold: true, color: HEX.ink, valign: "middle" });
  T(s, "p90, the slow tail (was 7.8 s)", { x: 0.5, y: 3.65, w: 3.1, h: 0.3, fontSize: 14, color: HEX.muted });
  T(s, "Voice starts at the blink when audio is prefetched.", { x: 0.5, y: 4.2, w: 3.3, h: 0.6, fontSize: 14, bold: true, color: HEX.ink });
  s.addChart(pres.charts.BAR, [
    { name: "Before", labels: ["Median", "p90"], values: [5.1, 7.8] },
    { name: "After", labels: ["Median", "p90"], values: [3.8, 5.8] },
  ], {
    x: 4.0, y: 1.2, w: 5.5, h: 3.65, barDir: "col", barGrouping: "clustered", barGapWidthPct: 60,
    chartColors: ["B8BDC4", HEX.accent],
    showTitle: true, title: "Partner stops to suggestions on screen (seconds)", titleFontSize: 13, titleColor: HEX.ink, titleFontFace: "+mn-lt",
    showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0.0" s"', dataLabelFontSize: 12, dataLabelColor: HEX.ink, dataLabelFontFace: "+mn-lt",
    showLegend: true, legendPos: "b", legendFontSize: 12, legendColor: HEX.muted, legendFontFace: "+mn-lt",
    catAxisLabelColor: HEX.muted, catAxisLabelFontSize: 12, catAxisLabelFontFace: "+mn-lt", catAxisLineShow: false,
    valAxisHidden: true, valAxisMinVal: 0, valAxisMaxVal: 9, valGridLine: { style: "none" }, catGridLine: { style: "none" },
  });
  footnote(s, "Mac to deployed server, synthetic speech, 10 runs per side, 0 failures. Excludes reading and gesture time. Not iPad-measured. One sample per side, not a controlled A/B.", { y: 5.0, w: 8.1 });
  s.addNotes("We timed the chain. From the partner finishing to suggestions on screen went from a median of 5.1 seconds to 3.8, and the slow tail from 7.8 to 5.8. Voice audio is fetched while the person reads, so if reading and blinking take longer than about 0.6 seconds, the voice starts right at the blink. These are Mac measurements with synthetic speech, not iPad numbers.\n\n[Detail if asked: replies call alone 3.9 s / 6.6 s before, 2.5 s / 4.4 s after (median / p90). Blink to voice without prefetch 0.69 s / 0.80 s before, 0.63 s / 0.72 s after. Never cite the priority-tier 1.8 s. No \"faster than typing\" claim.]");
});

// 14. Safety and privacy
add("Trust", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Safe by design, honest about limits", { placeholder: "title" });
  const cols = [
    ["LuShieldCheck", "Safety", [
      "Nothing is spoken without a deliberate long blink or touch",
      "Blink while speaking stops it; Pause button",
      "Review plus a separate confirm is one checkbox away",
      "Medication questions never get a “yes”",
    ]],
    ["LuLock", "Privacy", [
      "Camera frames stay on the iPad by design",
      "Calibration and approved preferences saved only on the iPad",
      "Audio clips and text to OpenAI with store: false; suggested sentences sent ahead to ElevenLabs in fast mode",
      "Prebuilt voice, no cloning. No zero-retention claim",
    ]],
  ];
  for (let i = 0; i < 2; i++) {
    const x = 0.5 + i * 4.65;
    card(s, x, 1.25, 4.35, 3.6);
    await iconCircle(s, cols[i][0], x + 0.25, 1.45, 0.52);
    T(s, cols[i][1], { x: x + 0.9, y: 1.45, w: 3, h: 0.52, fontSize: 20, bold: true, valign: "middle" });
    T(s, cols[i][2].map((t, j, a) => ({ text: t, options: { bullet: { indent: 14 }, breakLine: j < a.length - 1, paraSpaceAfter: 7 } })),
      { x: x + 0.25, y: 2.15, w: 3.9, h: 2.6, fontSize: 14, color: HEX.ink });
  }
  footnote(s, "14/14 synthetic safety scenarios behaved as intended (synthetic prompts, not human-reviewed). Gesture false-positive rate not yet measured.", { y: 5.0, w: 8.1 });
  s.addNotes("Nothing is ever spoken without a deliberate long blink or a touch. Fast mode, the default, trades the review step for speed; a helper can turn on review plus a separate confirming blink with one checkbox. In our test scenarios the AI kept disagreement, refused a prompt injection, and never offered consent on a medication question. Camera frames stay on the iPad by design. Audio clips and text go to OpenAI with store false, and in fast mode suggested sentences are sent to ElevenLabs ahead of time. We make no zero-retention claim.");
});

// 15. What we built today
add("Trust", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("What we built today", { placeholder: "title" });
  s.addShape("roundRect", { x: 0.5, y: 1.25, w: 2.55, h: 3.6, rectRadius: 0.12, fill: { color: HEX.tint }, line: { color: HEX.tint, width: 0 }, objectName: "stat panel" });
  T(s, "586", { x: 0.75, y: 1.45, w: 2.2, h: 1.0, fontSize: 66, bold: true, color: HEX.accent, valign: "middle" });
  T(s, "automated tests pass (34 files, plus 2 expected fails)", { x: 0.75, y: 2.5, w: 2.1, h: 0.8, fontSize: 13, color: HEX.muted });
  T(s, "Built and deployed in one day.", { x: 0.75, y: 3.6, w: 2.1, h: 0.9, fontSize: 17, bold: true, color: HEX.ink });
  const lists = [
    ["Verified", "LuCircleCheck", HEX.accent, ["Live AI replies and transcription", "Natural voice via server", "Installed iPad app", "Hands-free conversation on iPad (team test)", "Latency measured from a Mac", "Security probe on deployed server", "Deployed smoke test 6/6"]],
    ["Not yet", "LuCircleDashed", HEX.soft, ["Gesture reliability trial", "One-blink timing on iPad", "Audible prefetch on iPad", "Multi-face lock, live", "Other ways and jaw Back by a person", "Phone testing", "Any AAC user or clinician testing"]],
  ];
  for (let i = 0; i < 2; i++) {
    const x = 3.35 + i * 3.15;
    const [hd, ic, col, items] = lists[i];
    T(s, hd, { x, y: 1.25, w: 2.9, h: 0.4, fontSize: 18, bold: true, color: i === 0 ? HEX.accent : HEX.muted, valign: "middle" });
    for (let j = 0; j < items.length; j++) {
      const y = 1.75 + j * 0.44;
      s.addImage({ data: await icon(Lu[ic] ? ic : "LuCircle", col), x, y: y + 0.06, w: 0.22, h: 0.22, altText: "" });
      T(s, items[j], { x: x + 0.32, y, w: 2.75, h: 0.4, fontSize: 13, color: HEX.ink, valign: "middle" });
    }
  }
  footnote(s, "Tests prove logic, not reliability. Smoke test 6/6 was for the 13:50 deploy.", { y: 5.0 });
  s.addNotes("Everything here was built today, starting at 9 AM: face control with calibration, hands-free listening, AI suggestions, natural voice, a native iPad app and a Railway backend. We have 586 passing automated tests. And we're clear about what we haven't proven: we haven't measured gesture reliability on people, and no AAC user has tested it yet.\n\n[Re-run node scripts/smoke-deployed.mjs against the current deploy before citing 6/6 for it. Built with Claude Code under the team's direction.]");
});

// 16. Related work
add("Trust", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Built on a known idea", { placeholder: "title" });
  T(s, "AI suggestions for AAC already exist. We learned from:", { x: 0.5, y: 1.15, w: 9, h: 0.4, fontSize: 16, color: HEX.muted });
  const names = ["VisioALS", "Google SpeakFaster", "Project Converse / DEAN", "Bobbai", "Speak4Me", "Alek"];
  const w = 2.9, h = 0.62;
  names.forEach((n, i) => {
    const x = 0.5 + (i % 3) * (w + 0.15), y = 1.7 + Math.floor(i / 3) * (h + 0.18);
    s.addShape("roundRect", { x, y, w, h, rectRadius: 0.31, fill: { color: HEX.white }, line: { color: HEX.line, width: 1 }, objectName: "name chip" });
    T(s, n, { x, y, w, h, fontSize: 16, bold: true, align: "center", valign: "middle" });
  });
  s.addShape("roundRect", { x: 0.5, y: 3.4, w: 9, h: 1.4, rectRadius: 0.12, fill: { color: HEX.tint }, line: { color: HEX.tint, width: 0 }, objectName: "contribution callout" });
  await iconCircle(s, "LuSparkles", 0.8, 3.8, 0.6);
  T(s, [
    { text: "Our contribution is the combination: ", options: { bold: true, color: HEX.accent } },
    { text: "face gestures on hardware you own, hands-free listening, and choice by direction." },
  ], { x: 1.65, y: 3.4, w: 7.6, h: 1.4, fontSize: 19, valign: "middle" });
  footnote(s, "Public sources checked 2026-10-24 (docs/REFERENCES.md). We have not tested these products.", { y: 5.0 });
  s.addNotes("We're not the first to pair AI suggestions with AAC. VisioALS is the closest: spoken question, AI replies, gaze selection, ElevenLabs voice. SpeakFaster and Project Converse are research systems. What we built is the combination: eyebrow, jaw and blink control with no eye tracker, hands-free partner listening, personal calibration, and Other ways to answer so the person steers by meaning.\n\n[Alek shut down 2026-06-01. Do not say \"first\" or \"only\".]");
});

// 17. Theme
add("Close", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Dark", sectionTitle: sec });
  s.addText("How Still Here answers the theme", { placeholder: "title" });
  T(s, "“Build creative and innovative solutions to create a positive change in the community or the world.”", { x: 0.5, y: 1.08, w: 9, h: 0.4, fontSize: 14, italic: true, color: HEX.mint });
  const q = [
    ["LuHeart", "Positive change", "People who cannot speak or use their hands get back the speed and authorship of conversation, and so do the people talking with them."],
    ["LuUsers", "Community", "Caregivers, speech-language pathologists, classrooms, hospitals. A stock iPad, no eye-gaze hardware."],
    ["LuLightbulb", "Creative", "Eyebrows, blink, and jaw on a front camera. Other ways to answer. It learns you, with permission."],
    ["LuSparkles", "Innovative", "AI offers, the person decides. On-device face tracking. Prefetched natural voice."],
  ];
  const w = 4.4, h = 1.65;
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + (i % 2) * (w + 0.2), y = 1.65 + Math.floor(i / 2) * (h + 0.2);
    s.addShape("roundRect", { x, y, w, h, rectRadius: 0.12, fill: { color: HEX.darkCard }, line: { color: HEX.darkLine, width: 0.75 }, objectName: "quadrant" });
    await iconCircle(s, q[i][0], x + 0.22, y + 0.22, 0.5, { fill: HEX.tint, color: HEX.accent });
    T(s, q[i][1], { x: x + 0.88, y: y + 0.22, w: w - 1.1, h: 0.5, fontSize: 18, bold: true, color: HEX.white, valign: "middle" });
    T(s, q[i][2], { x: x + 0.88, y: y + 0.75, w: w - 1.1, h: 0.85, fontSize: 13, color: "C9CDD2" });
  }
  s.addNotes("Back to the theme. Positive change: the goal is to give people who can't speak or use their hands the speed and authorship of conversation back, and that includes their family and friends on the other side of it. Community: it's meant for caregivers, speech-language pathologists, classrooms and hospitals, on a device they may already have. Creative: face gestures on a normal front camera, Other ways to answer, and learning only with permission. Innovative: the AI offers, and the person decides.\n\n[Do not add impact numbers; we have none. Design goals, not measured outcomes.]");
});

// 18. Next steps
add("Close", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("What comes next", { placeholder: "title" });
  const steps = [
    ["LuUsers", "Co-design with AAC users and SLPs"],
    ["LuGauge", "Measure reliability and latency on iPad"],
    ["LuSmartphone", "Bring it to phones"],
    ["LuAudioLines", "Personal voice with consent, on-device models"],
  ];
  const w = 1.95, gap = 0.4, y = 1.35;
  for (let i = 0; i < 4; i++) {
    const x = 0.5 + i * (w + gap);
    card(s, x, y, w, 1.95);
    await iconCircle(s, steps[i][0], x + 0.22, y + 0.22, 0.55);
    T(s, String(i + 1), { x: x + w - 0.5, y: y + 0.25, w: 0.3, h: 0.3, fontSize: 14, bold: true, color: HEX.soft, align: "right" });
    T(s, steps[i][1], { x: x + 0.22, y: y + 0.92, w: w - 0.4, h: 0.9, fontSize: 15, bold: true });
    if (i < 3) arrow(s, x + w + 0.06, y + 0.98, x + w + gap - 0.06, y + 0.98, HEX.accent);
  }
  s.addShape("roundRect", { x: 0.5, y: 3.65, w: 9, h: 1.15, rectRadius: 0.12, fill: { color: HEX.accent }, line: { color: HEX.accent, width: 0 }, objectName: "ask callout" });
  s.addImage({ data: await icon("LuHandshake", HEX.white), x: 0.8, y: 3.97, w: 0.5, h: 0.5, altText: "" });
  T(s, "We are looking for co-design partners.", { x: 1.55, y: 3.75, w: 7.7, h: 0.5, fontSize: 22, bold: true, color: HEX.white, valign: "middle" });
  T(s, "If you know AAC users, clinicians, or researchers, we'd love an introduction.", { x: 1.55, y: 4.22, w: 7.7, h: 0.45, fontSize: 15, color: HEX.tint, valign: "middle" });
  s.addNotes("Next, we need the people this is for. We want to co-design with AAC users and speech-language pathologists, run our reliability trial with real people, and test on phones so it really works on the device you already have. Later, a personal voice with consent, and on-device models to cut latency and cloud exposure. If you know AAC users, clinicians or researchers, we'd love an introduction.\n\n[Plans only. No partnerships arranged.]");
});

// 19. Close
add("Close", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Dark Close", sectionTitle: sec });
  s.addText("AI offers possibilities. The person keeps authorship.", { placeholder: "title" });
  T(s, "Be part of the conversation while it's still happening.", { x: 0.6, y: 2.75, w: 4.3, h: 0.75, fontSize: 18, color: "E6E8EB" });
  T(s, "Your words. Your choice.", { x: 0.6, y: 3.6, w: 4.6, h: 0.45, fontSize: 22, bold: true, color: HEX.mint });
  const lock = logoFile("lockup-horizontal-white.png");
  if (lock) s.addImage({ path: lock, x: 0.5, y: 4.35, w: 2.4, h: 0.6, altText: "Still Here" });
  else T(s, "Still Here", { x: 0.6, y: 4.4, w: 3, h: 0.5, fontSize: 22, bold: true, color: HEX.white });
  T(s, "Friend", { x: 5.65, y: 1.45, w: 2, h: 0.25, fontSize: 11, color: "9AA0A8" });
  bubble(s, "“Are you coming to dinner tonight?”", 5.6, 1.75, 3.9, 0.7, { fill: "2B2F35", color: HEX.white, fontSize: 16 });
  T(s, "You, spoken by Still Here", { x: 6.6, y: 2.75, w: 2.85, h: 0.25, fontSize: 11, color: "9AA0A8", align: "right" });
  bubble(s, "“Yeah, I'm coming tonight.”", 6.2, 3.05, 3.3, 0.7, { fill: HEX.accent, color: HEX.white, fontSize: 18, bold: true });
  s.addImage({ data: await icon("LuVolume2", HEX.mint), x: 5.65, y: 3.22, w: 0.38, h: 0.38, altText: "" });
  s.addNotes("Remember the dinner question. With Still Here, you answer while the conversation is still happening, and you join in instead of responding later. In your words. AI offers possibilities. The person keeps authorship. Thank you.\n\n[The dinner reply is a real live suggestion from the deployed server.]");
});

// ---------- backups ----------
add("Backup", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Dark", sectionTitle: sec });
  s.addText("Backup slides", { placeholder: "title" });
  T(s, "Review mode  ·  Demo route  ·  Evidence boundaries  ·  Priority-tier incident  ·  Architecture detail  ·  One turn, end to end", { x: 0.5, y: 1.2, w: 9, h: 0.6, fontSize: 13, color: "C9CDD2" });
  s.addNotes("Backup slides for judge questions.");
});

// B1 Review mode
add("Backup", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Optional review mode", { placeholder: "title" });
  const steps = [
    ["LuSlidersHorizontal", "Turn off fast mode", "Every reply goes to review."],
    ["LuShieldCheck", "Review starts on Cancel", "A stray blink does nothing harmful."],
    ["LuEyeOff", "A new blink confirms", "One gesture can never do two things."],
  ];
  const w = 2.8, gap = 0.3;
  for (let i = 0; i < 3; i++) {
    const x = 0.5 + i * (w + gap);
    card(s, x, 1.35, w, 2.3);
    await iconCircle(s, steps[i][0], x + 0.25, 1.6, 0.55);
    T(s, steps[i][1], { x: x + 0.25, y: 2.25, w: w - 0.5, h: 0.6, fontSize: 17, bold: true });
    T(s, steps[i][2], { x: x + 0.25, y: 2.9, w: w - 0.5, h: 0.7, fontSize: 14, color: HEX.muted });
    if (i < 2) arrow(s, x + w + 0.04, 2.5, x + w + gap - 0.04, 2.5, HEX.accent);
  }
  T(s, "Slower, safer, for higher-stakes settings.", { x: 0.5, y: 4.0, w: 9, h: 0.45, fontSize: 18, bold: true });
  footnote(s, "Browser switch test: 20 auto-repeats produced one action. Other checks synthetic.", { y: 5.0 });
  s.addNotes("Turn off fast mode and every reply goes to review. Review starts on Cancel. A new blink confirms. Slower, safer, for higher-stakes settings. One gesture can never do two things (synthetic tests; verified browser switch test: 20 auto-repeats produced one action).");
});

// B2 Demo route
add("Backup", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Live demo route", { placeholder: "title" });
  await screenshot(s, path.join(SCREENS, "05-speaking.png"), 0.5, 1.25, 4.6, 3.5, { alt: "Speaking screen: Yeah, but I'm running a bit late" });
  const steps = [["1", "Dinner", "“Are you coming to dinner tonight?”"], ["2", "How was your day?", "with Other ways to answer"]];
  steps.forEach((st, i) => {
    const y = 1.3 + i * 0.95;
    s.addShape("ellipse", { x: 5.5, y, w: 0.5, h: 0.5, fill: { color: HEX.accent }, line: { color: HEX.accent, width: 0 } });
    T(s, st[0], { x: 5.5, y, w: 0.5, h: 0.5, fontSize: 16, bold: true, color: HEX.white, align: "center", valign: "middle" });
    T(s, st[1], { x: 6.2, y: y - 0.03, w: 3.3, h: 0.35, fontSize: 17, bold: true });
    T(s, st[2], { x: 6.2, y: y + 0.32, w: 3.3, h: 0.35, fontSize: 13, color: HEX.muted });
  });
  T(s, "Fallbacks", { x: 5.5, y: 3.3, w: 3, h: 0.35, fontSize: 15, bold: true, color: HEX.accent });
  ["Touch", "Typed partner line", "Basic voice", "Fixture demo"].forEach((f, i) => {
    const x = 5.5 + (i % 2) * 2.0, y = 3.72 + Math.floor(i / 2) * 0.5;
    s.addShape("roundRect", { x, y, w: 1.85, h: 0.38, rectRadius: 0.19, fill: { color: HEX.tint }, line: { color: HEX.tint, width: 0 }, objectName: "fallback chip" });
    T(s, f, { x, y, w: 1.85, h: 0.38, fontSize: 12, bold: true, color: HEX.accent, align: "center", valign: "middle" });
  });
  footnote(s, "Use a Private window in Safari. Run the smoke test before stage. Fixture demo is labeled on screen and is a manual choice.", { y: 5.0, w: 8.1 });
  s.addNotes("Dinner, then How was your day with Other ways. Fallbacks: Touch, typed partner line, basic voice, Fixture demo. Use a Private window if in Safari. Run the smoke test before stage. Fixture demo is labeled on screen and is a manual choice.");
});

// B3 Evidence boundaries
add("Backup", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("Evidence boundaries", { placeholder: "title" });
  const items = [
    ["LuFlaskConical", "Synthetic tests prove logic, not reliability."],
    ["LuClock", "Latency is Mac-measured."],
    ["LuUsers", "No AAC users yet."],
    ["LuSmartphone", "Not tested on phones."],
    ["LuInfo", "Not a medical device."],
  ];
  for (let i = 0; i < items.length; i++) {
    const y = 1.25 + i * 0.7;
    await iconCircle(s, items[i][0], 0.5, y, 0.5);
    T(s, items[i][1], { x: 1.2, y, w: 7.5, h: 0.5, fontSize: 18, valign: "middle" });
  }
  footnote(s, "MediaPipe model card: not intended for human life-critical decisions. See the Do-not-say list in JUDGE_QA.md.", { y: 5.0, w: 8.1 });
  s.addNotes("Synthetic tests prove logic, not reliability. Latency is Mac-measured. No AAC users yet. Not tested on phones. Not a medical device. Read the Do-not-say list in JUDGE_QA.md. MediaPipe model card: \"not intended for human life-critical decisions\".");
});

// B4 Priority-tier incident
add("Backup", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Content", sectionTitle: sec });
  s.addText("We tried a faster tier. It failed live", { placeholder: "title" });
  T(s, "4 of 6 replies timed out on the deployed server. We turned it off, redeployed, and now smoke-test after every config change.", { x: 0.5, y: 1.15, w: 9, h: 0.6, fontSize: 16, color: HEX.muted });
  const ev = [
    ["14:05", "Fail", "4 of 6 replies timed out", "LuTriangleAlert", "B54A3C"],
    ["14:10", "Variable deleted", "No redeploy, still failing", "LuX", HEX.soft],
    ["14:16", "Redeploy", "4/4 OK", "LuCircleCheck", HEX.accent],
  ];
  const ly = 2.55;
  s.addShape("line", { x: 1.2, y: ly, w: 7.6, h: 0.001, line: { color: HEX.line, width: 2 } });
  for (let i = 0; i < 3; i++) {
    const cx = 1.2 + i * 3.8;
    await iconCircle(s, ev[i][3], cx - 0.3, ly - 0.3, 0.6, { fill: ev[i][4] });
    T(s, ev[i][0], { x: cx - 1.2, y: ly + 0.45, w: 2.4, h: 0.4, fontSize: 20, bold: true, align: "center" });
    T(s, ev[i][1], { x: cx - 1.2, y: ly + 0.9, w: 2.4, h: 0.35, fontSize: 15, bold: true, align: "center", color: HEX.ink });
    T(s, ev[i][2], { x: cx - 1.2, y: ly + 1.25, w: 2.4, h: 0.35, fontSize: 13, align: "center", color: HEX.muted });
  }
  footnote(s, "Source: Railway logs, TEST_RESULTS.md.", { y: 5.0 });
  s.addNotes("Honest engineering story. We tried a faster priority tier; 4 of 6 replies timed out on the deployed server. 14:05 fail, 14:10 variable deleted but no redeploy so still failing, 14:16 redeploy and 4/4 OK. We now smoke-test after every config change. Never cite its offline 1.8 s number.");
});

// B5 Architecture detail (full detailed diagram)
add("Backup", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Full Image", sectionTitle: sec });
  await diagramBlock(s, path.join(DIAGRAM, "architecture.png"), 0.15, 0.08, 9.7, 5.45, "Detailed architecture: iPad, Railway server, external providers");
  s.addNotes("Architecture detail for technical questions. Reducer, target registry, gesture arbiter, effects runner. Same guarded ACTIVATE for every input. Camera frames stay on the iPad by design (device network check not run). Keys stay on the server.");
});

// B6 One turn, end to end
add("Backup", async (pres, sec) => {
  const s = pres.addSlide({ masterName: "Full Image", sectionTitle: sec });
  await diagramBlock(s, path.join(DIAGRAM, "turn-sequence.png"), 0.15, 0.08, 9.7, 5.45, "One turn, end to end: sequence of partner, person, iPad, server, OpenAI, ElevenLabs");
  s.addNotes("One turn, end to end. Measured on a Mac with synthetic speech; not yet timed on the iPad. Voice from cache at the blink is conditional on prefetch and not yet verified on the iPad. The headline number on the Speed slide is the measured end-to-end median of 3.8 s.");
});

// ---------- build ----------
async function buildPres(indices) {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  pres.title = "Still Here: SASEHacks for Good pitch";
  pres.author = "Still Here team";
  defineLayouts(pres);
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
