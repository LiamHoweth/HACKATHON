// Builds docs/deck/Still_Here_Pitch.pptx from the repo's own docs and real screenshots.
//
// Usage (from anywhere):
//   NODE_PATH=/path/to/node_modules PPTX_SKILL_DIR=/path/to/pptx-skill node docs/deck/build_deck.js
//
// Needs pptxgenjs 3.12, react-icons 5, react 18, react-dom 18, and sharp, resolvable through
// NODE_PATH (they are deliberately NOT added to the app's package.json). PPTX_SKILL_DIR points at
// the pptx skill folder that holds scripts/apply_theme.js, which writes the theme colors.
//
// Claims on the slides are limited to what docs/TEST_RESULTS.md records as executed. Everything
// else is labeled "not run", "not measured", or "not iPad-verified". Screenshots come only from
// docs/screenshots/ and each one is labeled with where it was captured.

const path = require("path");
// Resolve build deps from NODE_PATH first, so the app's own node_modules (React 19) is not mixed
// with the react-icons/React 18 pair used here.
const DEP_PATHS = (process.env.NODE_PATH || "").split(path.delimiter).filter(Boolean);
const dep = (m) => require(require.resolve(m, { paths: DEP_PATHS.length ? DEP_PATHS : [__dirname] }));
const pptxgen = dep("pptxgenjs");
const React = dep("react");
const ReactDOMServer = dep("react-dom/server");
const sharp = dep("sharp");
const Fi = dep("react-icons/fi");

const ROOT = path.resolve(__dirname, "..", "..");
const SHOTS = path.join(ROOT, "docs", "screenshots");
const OUT = path.join(__dirname, "Still_Here_Pitch.pptx");
const SKILL_DIR = process.env.PPTX_SKILL_DIR;

const THEME = {
  name: "Still Here",
  headFontFace: "Calibri",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "13201B", // ink
    lt1: "FFFFFF",
    dk2: "0F2A22", // deep green-black (dark slides)
    lt2: "EDF5F1", // pale mint tint (cards)
    accent1: "0B6B50", // app green
    accent2: "8A4F00", // amber ink: "not verified" text and borders
    accent3: "FCEBCF", // amber tint: "not verified" fill
    accent4: "4F5E58", // muted caption gray-green
    accent5: "CFE5DA", // mint border
    accent6: "8FDCBC", // light green for dark backgrounds
    hlink: "0B6B50",
    folHlink: "4F5E58",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "Still Here: hackathon pitch";
pres.author = "Still Here team";
pres.subject = "SASEHacks for Good, October 24, 2026";
const C = pres.SchemeColor;
const S = pres.shapes;

const W = 13.333;
const MX = 0.6;
const CW = W - 2 * MX; // 12.133

// ---------- layouts ----------
const FOOTER = "Still Here · hackathon prototype · not clinically validated";

pres.defineSlideMaster({
  title: "SH_TITLE_DARK",
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 2.3, w: CW, h: 1.5, fontSize: 66, bold: true, color: C.background1, valign: "bottom", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "subtitle", type: "body", x: MX, y: 3.95, w: CW, h: 0.8, fontSize: 28, color: C.accent6, valign: "top", margin: 0 }, text: "" } },
  ],
});

pres.defineSlideMaster({
  title: "SH_CLOSE_DARK",
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 1.6, w: 10.5, h: 2.4, fontSize: 48, bold: true, color: C.background1, valign: "bottom", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "subtitle", type: "body", x: MX, y: 4.3, w: CW, h: 0.7, fontSize: 24, color: C.accent6, valign: "top", margin: 0 }, text: "" } },
  ],
});

pres.defineSlideMaster({
  title: "SH_CONTENT",
  background: { color: HEX.lt1 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: MX, y: 0.32, w: CW, h: 0.32, fontSize: 12, bold: true, color: C.accent1, charSpacing: 2, valign: "middle", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.66, w: CW, h: 0.8, fontSize: 36, bold: true, color: C.text1, valign: "middle", margin: 0 }, text: "" } },
    { text: { text: FOOTER, options: { x: MX, y: 7.02, w: 8, h: 0.3, fontSize: 10, color: C.accent4, margin: 0, valign: "middle" } } },
  ],
  slideNumber: { x: 12.23, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: HEX.accent4, align: "right", margin: 0 },
});

pres.defineSlideMaster({
  title: "SH_DARK",
  background: { color: HEX.dk2 },
  objects: [
    { placeholder: { options: { name: "kicker", type: "body", x: MX, y: 0.32, w: CW, h: 0.32, fontSize: 12, bold: true, color: C.accent6, charSpacing: 2, valign: "middle", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "title", type: "title", x: MX, y: 0.66, w: CW, h: 0.8, fontSize: 36, bold: true, color: C.background1, valign: "middle", margin: 0 }, text: "" } },
    { text: { text: FOOTER, options: { x: MX, y: 7.02, w: 8, h: 0.3, fontSize: 10, color: HEX.accent5, margin: 0, valign: "middle" } } },
  ],
  slideNumber: { x: 12.23, y: 7.02, w: 0.5, h: 0.3, fontSize: 10, color: HEX.accent5, align: "right", margin: 0 },
});

// ---------- helpers ----------
const shadow = () => ({ type: "outer", color: "000000", opacity: 0.1, blur: 6, offset: 2, angle: 90 });

async function icon(Comp, hex) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + hex, size: 256 }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

async function shot(file, maxW = 1600) {
  const buf = await sharp(path.join(SHOTS, file)).resize({ width: maxW, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
  return "image/jpeg;base64," + buf.toString("base64");
}

function card(slide, name, x, y, w, h, opts = {}) {
  slide.addShape(S.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12,
    fill: { color: opts.fill || C.background2 },
    line: opts.line ? { color: opts.line, width: 1 } : { type: "none" },
    shadow: opts.shadow ? shadow() : undefined,
    objectName: name,
  });
}

// Status pill: the deck's recurring motif. kind "ok" = recorded in TEST_RESULTS, "gap" = not run / not measured / not verified.
function pill(slide, name, text, x, y, w, kind = "gap", h = 0.38) {
  const ok = kind === "ok";
  slide.addText(text, {
    shape: S.ROUNDED_RECTANGLE, rectRadius: h / 2, x, y, w, h,
    fill: { color: ok ? C.background2 : C.accent3 },
    line: { color: ok ? C.accent1 : C.accent2, width: 1 },
    color: ok ? C.accent1 : C.accent2, fontSize: 12, bold: true, align: "center", valign: "middle", margin: 0,
    objectName: name,
  });
}

function iconCircle(slide, name, data, x, y, d, fill) {
  slide.addShape(S.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: "none" }, objectName: name + " circle" });
  const pad = d * 0.24;
  slide.addImage({ data, x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad, altText: "", objectName: name + " icon" });
}

function framedShot(slide, name, data, x, y, w, h, alt) {
  slide.addShape(S.RECTANGLE, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: C.background1 }, line: { color: C.accent4, width: 0.75 }, shadow: shadow(), objectName: name + " frame" });
  slide.addImage({ data, x, y, w, h, altText: alt, objectName: name });
}

function caption(slide, name, text, x, y, w, h, opts = {}) {
  slide.addText(text, { x, y, w, h, fontSize: opts.size || 11, color: opts.color || C.accent4, italic: !!opts.italic, valign: "top", margin: 0, isTextBox: true, objectName: name });
}

function content(section, kicker, title) {
  const s = pres.addSlide({ masterName: "SH_CONTENT", sectionTitle: section });
  s.addText(kicker, { placeholder: "kicker" });
  s.addText(title, { placeholder: "title" });
  return s;
}

// Automated-test claim: keep in step with the latest run recorded in docs/TEST_RESULTS.md.
const TESTS_PASSED = "134/134";
const TESTS_DETAIL = "vitest, 10 files, 11:50 CT. Reducer, blink gesture and calibration, schema, API routes (provider SDK mocked)";

const SIM_LABEL = "Real screenshots · iPad simulator, Safari, localhost · Fixture demo, touch input · 12:15–12:18 CT · not a physical iPad, not gesture-driven";

(async () => {
  const ic = {};
  const want = {
    msg: [Fi.FiMessageCircle, HEX.accent1], clock: [Fi.FiClock, HEX.accent1], edit: [Fi.FiEdit3, HEX.accent1],
    noSelect: [Fi.FiSlash, HEX.accent1], noSpeak: [Fi.FiVolumeX, HEX.accent1], noMem: [Fi.FiDatabase, HEX.accent1],
    vol: [Fi.FiVolume2, HEX.lt1], user: [Fi.FiUser, HEX.lt1], lock: [Fi.FiLock, HEX.lt1], repeat: [Fi.FiRepeat, HEX.lt1],
    face: [Fi.FiUser, HEX.accent6], alert: [Fi.FiAlertCircle, HEX.accent2], check: [Fi.FiCheck, HEX.accent1],
    users: [Fi.FiUsers, HEX.lt1], mic: [Fi.FiClipboard, HEX.lt1], tablet: [Fi.FiTablet, HEX.lt1], bar: [Fi.FiBarChart2, HEX.lt1],
  };
  for (const [k, [Comp, hex]] of Object.entries(want)) ic[k] = await icon(Comp, hex);

  const img = {
    board: await shot("ipad-sim-landscape-board-candidates.png"),
    review: await shot("ipad-sim-landscape-review.png"),
    setup: await shot("ipad-sim-landscape-setup-top.png"),
    calib: await shot("ipad-sim-landscape-blink-setup.png"),
    nocam: await shot("ipad-sim-landscape-camera-unavailable.png"),
    audio: await shot("ipad-sim-landscape-audio-enabled.png"),
  };

  // ===== 1. Title =====
  pres.addSection({ title: "Opening" });
  {
    const s = pres.addSlide({ masterName: "SH_TITLE_DARK", sectionTitle: "Opening" });
    s.addText("Still Here", { placeholder: "title" });
    s.addText("Your words. Your choice.", { placeholder: "subtitle" });
    s.addText("Hands-free AAC prototype for iPad: AI offers possible words, the person decides what to say.", {
      x: MX, y: 5.0, w: CW, h: 0.5, fontSize: 18, color: C.background1, margin: 0, isTextBox: true, objectName: "Positioning line",
    });
    // Abstract motif: three options, one highlighted (decorative, not a UI capture)
    [0, 1, 2].forEach((i) => {
      s.addShape(S.ROUNDED_RECTANGLE, {
        x: 8.7, y: 2.5 + i * 0.75, w: 4.03, h: 0.55, rectRadius: 0.1,
        fill: { color: i === 1 ? C.accent6 : C.text2 }, line: { color: C.accent6, width: 1.25 },
        objectName: `Motif option ${i + 1}`,
      });
    });
    s.addText("SASEHacks for Good · University of Oklahoma · October 24, 2026", {
      x: MX, y: 6.55, w: 9, h: 0.35, fontSize: 12, color: HEX.accent5, margin: 0, isTextBox: true, objectName: "Event line",
    });
    s.addNotes(
      "Open calmly, no drama. \"Still Here is a hackathon prototype. AI offers possible words; the person decides what to say.\"\n\n" +
      "Set expectations up front: this is a prototype built today. We'll show what we verified and say plainly what we haven't.\n\n" +
      "Timing: about 15 seconds."
    );
  }

  // ===== 2. Human problem =====
  pres.addSection({ title: "Human problem" });
  {
    const s = content("Human problem", "1 · THE HUMAN PROBLEM", "The words are ready. The conversation won't wait");
    s.addText("What happens when you know what you want to say, but entering it takes longer than the conversation allows?", {
      x: MX, y: 1.85, w: 5.5, h: 2.9, fontSize: 28, bold: true, color: C.accent1, valign: "top", margin: 0, isTextBox: true, objectName: "Problem question",
    });
    s.addText("A design problem for some people who use AAC, not a universal claim.", {
      x: MX, y: 4.6, w: 5.3, h: 0.8, fontSize: 16, color: C.accent4, valign: "top", margin: 0, isTextBox: true, objectName: "Scope note",
    });
    const cards = [
      ["msg", "People who use AAC have plenty to say", "Humor, plans, boundaries, relationships. The words are already there."],
      ["clock", "Entering them can be slow", "Building a sentence one selection at a time can fall behind a live conversation."],
      ["edit", "Our design question", "Can choosing a whole, reviewable message reduce that effort without giving up authorship?"],
    ];
    const x = 6.7, w = W - MX - x, h = 1.45;
    cards.forEach(([k, head, body], i) => {
      const y = 1.75 + i * (h + 0.3);
      card(s, `Problem card ${i + 1}`, x, y, w, h);
      iconCircle(s, `Problem card ${i + 1}`, ic[k], x + 0.3, y + 0.38, 0.7, C.background1);
      s.addText([
        { text: head, options: { fontSize: 18, bold: true, color: C.text1, breakLine: true } },
        { text: body, options: { fontSize: 14, color: C.text1 } },
      ], { x: x + 1.25, y: y + 0.15, w: w - 1.5, h: h - 0.3, valign: "middle", margin: 0, paraSpaceAfter: 4, isTextBox: true, objectName: `Problem card ${i + 1} text` });
    });
    s.addNotes(
      "Ask the question on the slide and pause.\n\n" +
      "\"We built Still Here to explore reducing that effort while keeping every word under the person's control.\"\n\n" +
      "Connect it to ordinary life: humor, relationships, setting boundaries, independence. People who use AAC have plenty to say; the bottleneck we care about is the effort of getting it out in time.\n\n" +
      "Do NOT quote statistics (none are verified in REFERENCES.md). No pity framing. This is a design problem for some AAC users, not a claim about everyone.\n\n" +
      "Timing: about 30 seconds."
    );
  }

  // ===== 3. Product flow =====
  pres.addSection({ title: "Product" });
  {
    const s = content("Product", "2 · THE PRODUCT", "AI offers possible words. The person decides");
    const steps = [
      ["Partner asks", "Typed, shown exactly as entered", "partner"],
      ["Three possibilities", "Different meanings, not three wordings", "ai"],
      ["The person steers", "Choose, None of these, Guide, or My words", "person"],
      ["Exact review", "The whole sentence; starts on Cancel", "person"],
      ["Separate confirm", "A new input cycle authorizes speech", "person"],
      ["Spoken", "The confirmed sentence, nothing else", "partner"],
    ];
    const gap = 0.3, bw = (CW - gap * 5) / 6, by = 1.95, bh = 1.75;
    steps.forEach(([head, body, who], i) => {
      const x = MX + i * (bw + gap);
      const person = who === "person", ai = who === "ai";
      s.addShape(S.ROUNDED_RECTANGLE, {
        x, y: by, w: bw, h: bh, rectRadius: 0.12,
        fill: { color: person ? C.accent1 : C.background1 },
        line: { color: ai ? C.accent2 : person ? C.accent1 : C.accent4, width: ai ? 1.5 : 1, dashType: ai ? "dash" : "solid" },
        objectName: `Flow step ${i + 1}`,
      });
      s.addText([
        { text: String(i + 1), options: { fontSize: 12, bold: true, color: person ? C.accent6 : C.accent4, breakLine: true } },
        { text: head, options: { fontSize: 16, bold: true, color: person ? C.background1 : C.text1, breakLine: true } },
        { text: body, options: { fontSize: 12, color: person ? C.background1 : C.text1 } },
      ], { x: x + 0.14, y: by + 0.12, w: bw - 0.28, h: bh - 0.24, valign: "top", margin: 0, paraSpaceAfter: 3, isTextBox: true, objectName: `Flow step ${i + 1} text` });
      if (i < steps.length - 1) {
        s.addShape(S.LINE, { x: x + bw + 0.04, y: by + bh / 2, w: gap - 0.08, h: 0, line: { color: C.accent4, width: 1.5, endArrowType: "triangle" }, objectName: `Flow arrow ${i + 1}` });
      }
    });
    // legend
    s.addShape(S.ROUNDED_RECTANGLE, { x: MX, y: 3.92, w: 0.32, h: 0.22, rectRadius: 0.05, fill: { color: C.accent1 }, line: { type: "none" }, objectName: "Legend person swatch" });
    caption(s, "Legend person", "The person decides", MX + 0.42, 3.9, 2.2, 0.28, { size: 12, color: C.text1 });
    s.addShape(S.ROUNDED_RECTANGLE, { x: MX + 2.6, y: 3.92, w: 0.32, h: 0.22, rectRadius: 0.05, fill: { color: C.background1 }, line: { color: C.accent2, width: 1.5, dashType: "dash" }, objectName: "Legend AI swatch" });
    caption(s, "Legend AI", "AI only offers", MX + 3.02, 3.9, 2.2, 0.28, { size: 12, color: C.text1 });

    const nots = [
      ["noSelect", "AI cannot select", "Only the person's input chooses a reply."],
      ["noSpeak", "AI cannot speak", "Nothing is ever spoken automatically."],
      ["noMem", "AI cannot save memories", "Only after an explicit yes and a separate confirmation."],
    ];
    const nw = (CW - 0.6) / 3, ny = 4.5, nh = 1.45;
    nots.forEach(([k, head, body], i) => {
      const x = MX + i * (nw + 0.3);
      card(s, `Guardrail card ${i + 1}`, x, ny, nw, nh);
      iconCircle(s, `Guardrail card ${i + 1}`, ic[k], x + 0.25, ny + 0.37, 0.7, C.background1);
      s.addText([
        { text: head, options: { fontSize: 16, bold: true, color: C.text1, breakLine: true } },
        { text: body, options: { fontSize: 14, color: C.text1 } },
      ], { x: x + 1.15, y: ny + 0.12, w: nw - 1.35, h: nh - 0.24, valign: "middle", margin: 0, paraSpaceAfter: 3, isTextBox: true, objectName: `Guardrail card ${i + 1} text` });
    });
    s.addText("The person can also start a conversation, not just answer one.", {
      x: MX, y: 6.25, w: CW, h: 0.4, fontSize: 16, color: C.text1, margin: 0, isTextBox: true, objectName: "Initiation note",
    });
    s.addNotes(
      "Core line: \"AI offers possible words. The person decides what to say.\"\n\n" +
      "Walk the flow left to right: the partner asks; the AI offers three possibilities with different meanings; the person chooses one, rejects all with None of these, guides the direction, or writes their own; review shows the exact sentence and starts on Cancel; a separate confirmation authorizes speech; only that sentence is spoken.\n\n" +
      "Stress the guardrails: the AI cannot select, speak, or remember anything on its own. Rejections apply to the current question only and are not stored as opinions.\n\n" +
      "The person can also start conversations (Start a conversation, Quick phrases, My words).\n\n" +
      "Timing: about 40 seconds."
    );
  }

  // ===== 4. Screenshots: board + review =====
  {
    const s = content("Product", "2 · THE PRODUCT", "As built: the board and the review");
    const iw = 5.73, ih = iw * 0.75, y = 1.62;
    framedShot(s, "Screenshot board", img.board, MX, y, iw, ih, "Still Here board in iPad simulator Safari: partner asked 'Are you coming to dinner tonight?' with three fixture suggestions, None of these, and Guide, Quick phrases, My words, More tools buttons.");
    framedShot(s, "Screenshot review", img.review, W - MX - iw, y, iw, ih, "Still Here review screen in iPad simulator Safari: 'Yes, that works for me.' with Cancel, Speak, and Change wording; text says nothing is spoken until you select Speak.");
    caption(s, "Caption board", "Board: the partner's question as typed, three different replies, None of these, and Guide / Quick phrases / My words.", MX, y + ih + 0.12, iw, 0.5, { size: 12, color: C.text1 });
    caption(s, "Caption review", "Review: the whole sentence, attributed to its source. \"Nothing is spoken until you select Speak.\"", W - MX - iw, y + ih + 0.12, iw, 0.5, { size: 12, color: C.text1 });
    caption(s, "Screenshot provenance", SIM_LABEL, MX, 6.6, CW, 0.3, { size: 11 });
    s.addNotes(
      "These are real screenshots from the iPad simulator in Safari, running locally, in Fixture demo mode with touch input. They are not from a physical iPad and not driven by facial gestures. Say that if asked.\n\n" +
      "Left: the board. The partner asked \"Are you coming to dinner tonight?\"; three replies with different meanings (yes, no, ask for more); None of these for new meanings; Guide, Quick phrases, My words.\n\n" +
      "Right: review. The exact sentence, its source (Fixture demo suggestion), and what it answers. Cancel, Speak, Change wording. In gesture mode the highlight starts on Cancel.\n\n" +
      "Note the status bar shows the real state: Voice = Basic device voice, Suggestions = Fixture demo.\n\n" +
      "Timing: about 20 seconds."
    );
  }

  // ===== 5. Hands-free gestures =====
  pres.addSection({ title: "Hands-free iPad" });
  {
    const s = content("Hands-free iPad", "3 · HANDS-FREE ON IPAD", "Two facial gestures, one guarded path");
    const rows = [
      ["NEXT", "eyebrows up 0.5\u00A0s", "Raise both eyebrows for half a second", "Moves the highlight exactly one step. Holding longer doesn't skip. Relax to rearm. Nothing moves on a timer."],
      ["SELECT", "long blink", "A long, deliberate blink", "Selects what was highlighted when your eyes closed. Ordinary blinks and winks are ignored."],
      ["SPEAK", "a new long blink", "A fresh blink, after review", "Review opens on Cancel. Raise brows to reach Speak, then blink again. One gesture can never both select and confirm."],
    ];
    const lx = MX, lw = 7.35, rh = 1.38;
    rows.forEach(([tag, sub, head, body], i) => {
      const y = 1.72 + i * (rh + 0.25);
      s.addShape(S.ROUNDED_RECTANGLE, { x: lx, y, w: 1.95, h: rh, rectRadius: 0.12, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `Gesture ${tag} block` });
      s.addText([
        { text: tag, options: { fontSize: 22, bold: true, color: C.background1, breakLine: true } },
        { text: sub, options: { fontSize: 12, color: C.background1 } },
      ], { x: lx + 0.1, y, w: 1.75, h: rh, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `Gesture ${tag} label` });
      s.addText([
        { text: head, options: { fontSize: 17, bold: true, color: C.text1, breakLine: true } },
        { text: body, options: { fontSize: 14, color: C.text1 } },
      ], { x: lx + 2.2, y, w: lw - 2.2, h: rh, valign: "middle", margin: 0, paraSpaceAfter: 3, isTextBox: true, objectName: `Gesture ${tag} text` });
    });

    // iPad schematic (diagram, not a screenshot)
    const dx = 8.45, dy = 1.72, dw = W - MX - dx, dh = dw * 0.75;
    s.addShape(S.ROUNDED_RECTANGLE, { x: dx, y: dy, w: dw, h: dh, rectRadius: 0.22, fill: { color: C.text2 }, line: { type: "none" }, objectName: "Diagram iPad body" });
    const sx = dx + 0.18, sy = dy + 0.18, sw = dw - 0.36, sh = dh - 0.36;
    s.addShape(S.RECTANGLE, { x: sx, y: sy, w: sw, h: sh, fill: { color: C.background1 }, line: { type: "none" }, objectName: "Diagram iPad screen" });
    // fake option rows
    [0, 1, 2].forEach((i) => {
      s.addShape(S.ROUNDED_RECTANGLE, { x: sx + 0.2, y: sy + 0.55 + i * 0.5, w: sw - 1.75, h: 0.38, rectRadius: 0.06, fill: { color: i === 1 ? C.background2 : C.background1 }, line: { color: i === 1 ? C.accent1 : C.accent4, width: i === 1 ? 2.25 : 0.75 }, objectName: `Diagram option ${i + 1}` });
    });
    caption(s, "Diagram highlight label", "highlight", sx + 0.32, sy + 1.12, 1.5, 0.25, { size: 10, color: C.accent1 });
    // preview top-right
    const px = sx + sw - 1.3, py = sy + 0.12;
    s.addShape(S.ROUNDED_RECTANGLE, { x: px, y: py, w: 1.18, h: 0.88, rectRadius: 0.08, fill: { color: C.text2 }, line: { type: "none" }, objectName: "Diagram live preview" });
    s.addImage({ data: ic.face, x: px + 0.36, y: py + 0.17, w: 0.46, h: 0.46, altText: "", objectName: "Diagram preview face" });
    caption(s, "Diagram preview label", "live preview", px, py + 0.92, 1.18, 0.25, { size: 10, color: C.text1 });
    s.addText("Eyebrow raise detected — Next", {
      shape: S.ROUNDED_RECTANGLE, rectRadius: 0.06, x: sx + 0.2, y: sy + sh - 0.5, w: 2.9, h: 0.34,
      fill: { color: C.background2 }, line: { color: C.accent1, width: 0.75 }, color: C.accent1, fontSize: 11, bold: true, align: "center", valign: "middle", margin: 0, objectName: "Diagram feedback",
    });
    caption(s, "Diagram caption", "Diagram, not a screenshot. A small mirrored live preview sits top right so the person can see tracking works. Live view only; nothing is recorded.", dx, dy + dh + 0.12, dw, 0.75, { size: 11 });
    pill(s, "Status not iPad-verified", "Not iPad-verified", dx, 5.85, 1.95);
    pill(s, "Status reliability", "Reliability not measured", dx + 2.1, 5.85, dw - 2.1);
    s.addNotes(
      "Three rules: eyebrows up for half a second moves one item; a deliberate long blink selects; a fresh long blink authorizes speech.\n\n" +
      "Details if asked: the 500 ms hold is timed with a monotonic clock, not frame counts. Holding longer still moves one step. A raise must relax to neutral before the next counts. A blink closure freezes the highlight and cancels an unfinished raise. Short natural blinks fall below the calibrated minimum; both eyes must close, so winks don't count.\n\n" +
      "The small mirrored live self-view sits top right with accepted-gesture feedback (\"Eyebrow raise detected — Next\", \"Blink detected — Selected\"). The drawing on the right is a diagram, not a screenshot.\n\n" +
      "Be honest: none of this has been run on a physical iPad, and reliability is not measured. Long-blink logic passes synthetic tests; the eyebrow and arbiter tests are written but no run is recorded in TEST_RESULTS.\n\n" +
      "Live demo: see DEMO_SCRIPT.md. Say if a helper granted camera permission or tapped Enable Audio. If eyebrow detection fails, switch to auto-scan + blink and say \"the eyebrow path is experimental\".\n\n" +
      "Timing: about 40 seconds."
    );
  }

  // ===== 6. Setup screenshots =====
  {
    const s = content("Hands-free iPad", "3 · HANDS-FREE ON IPAD", "Setup is calibrated per person, with real fallbacks");
    const iw = (CW - 0.6) / 3, ih = iw * 0.75, y = 1.62;
    const shots = [
      [img.setup, "Choose how to select: eyebrows + blinks recommended; auto-scan with blink, keyboard/switch, and touch alongside.", "Setup screen in iPad simulator: 'Use eyebrows + blinks' recommended, with Auto-scan with blink, Keyboard / switch, and Touch options."],
      [img.calib, "Guided calibration: relax brows, raise brows, practice Next, natural and deliberate blinks, practice select and confirm.", "Eyebrow and blink calibration screen in iPad simulator, showing the steps from Camera through Practice confirm and a Turn on camera button."],
      [img.nocam, "No camera available: the app says so and offers keyboard/switch or touch instead of failing silently.", "Camera not available screen in iPad simulator offering Use keyboard / switch, Use touch, and Try the camera again."],
    ];
    shots.forEach(([data, cap, alt], i) => {
      const x = MX + i * (iw + 0.3);
      framedShot(s, `Screenshot setup ${i + 1}`, data, x, y, iw, ih, alt);
      caption(s, `Caption setup ${i + 1}`, cap, x, y + ih + 0.12, iw, 0.75, { size: 12, color: C.text1 });
    });
    card(s, "Helper note card", MX, 5.45, CW, 0.95);
    s.addText([
      { text: "Said aloud: ", options: { bold: true } },
      { text: "a helper may tap the camera Allow prompt and Enable Audio once. Every input method reaches every screen through the same review and separate confirmation." },
    ], { x: MX + 0.3, y: 5.45, w: CW - 0.6, h: 0.95, fontSize: 15, color: C.text1, valign: "middle", margin: 0, isTextBox: true, objectName: "Helper note text" });
    caption(s, "Screenshot provenance", "Real screenshots · iPad simulator, Safari, localhost · 12:15–12:16 CT · the simulator has no camera, so calibration itself was not exercised", MX, 6.6, CW, 0.3, { size: 11 });
    s.addNotes(
      "Setup is touch-friendly for a helper, then hands-free.\n\n" +
      "Left: the person picks how to choose. Eyebrows + blinks is recommended; auto-scan with blink, keyboard/switch, and touch are first-class alternatives, not afterthoughts.\n\n" +
      "Middle: per-person calibration: neutral brows, comfortable 500 ms raises, natural blinks, deliberate long blinks, then a practice select and a separate practice confirm. Calibration fails openly if raised and neutral brows (or natural and deliberate blinks) can't be separated.\n\n" +
      "Right: the simulator has no camera, so the app says the camera is unavailable and offers keyboard/switch or touch. That is the honest-failure behavior.\n\n" +
      "Do not claim setup is hands-free if a helper tapped Allow or Enable Audio.\n\n" +
      "Timing: about 25 seconds."
    );
  }

  // ===== 7. Live demo =====
  {
    const s = pres.addSlide({ masterName: "SH_DARK", sectionTitle: "Hands-free iPad" });
    s.addText("LIVE DEMO", { placeholder: "kicker" });
    s.addText("Hands in lap after setup", { placeholder: "title" });
    const steps = [
      "Partner types: \"Are you coming to dinner tonight?\"",
      "One raise moves one step; holding longer doesn't skip",
      "Long blink on None of these: new meanings",
      "Guide my response → Suggest an alternative; pick a card",
      "Review opens on Cancel → raise to Speak → new blink",
    ];
    steps.forEach((t, i) => {
      const y = 1.8 + i * 0.88;
      s.addShape(S.OVAL, { x: MX, y, w: 0.56, h: 0.56, fill: { color: C.accent6 }, line: { type: "none" }, objectName: `Demo step ${i + 1} number bg` });
      s.addText(String(i + 1), { x: MX, y, w: 0.56, h: 0.56, fontSize: 18, bold: true, color: C.text2, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `Demo step ${i + 1} number` });
      s.addText(t, { x: MX + 0.8, y: y - 0.05, w: 5.9, h: 0.66, fontSize: 17, color: C.background1, valign: "middle", margin: 0, isTextBox: true, objectName: `Demo step ${i + 1} text` });
    });
    const fx = 7.75, fw = W - MX - fx;
    s.addShape(S.ROUNDED_RECTANGLE, { x: fx, y: 1.7, w: fw, h: 4.75, rectRadius: 0.12, fill: { color: C.background1 }, line: { type: "none" }, objectName: "Fallback card" });
    s.addText("If something fails, we say so", { x: fx + 0.3, y: 1.85, w: fw - 0.6, h: 0.5, fontSize: 18, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: "Fallback heading" });
    const fb = [
      ["Eyebrows unreliable", "touch, or auto-scan + blink"],
      ["Blinks don't separate", "keyboard / switch or touch"],
      ["Natural voice unavailable", "labeled basic device voice, fresh confirmation"],
      ["Safari blocks audio", "helper taps Enable audio; we say so"],
      ["Live AI fails", "labeled Fixture demo, or My words"],
    ];
    s.addText(fb.map(([a, b], i) => ({ text: `${a}: ${b}`, options: { bullet: true, breakLine: i < fb.length - 1 } })), {
      x: fx + 0.3, y: 2.5, w: fw - 0.6, h: 3.8, fontSize: 16, color: C.text1, valign: "top", margin: 0, paraSpaceAfter: 14, isTextBox: true, objectName: "Fallback list",
    });
    s.addText("Say the source shown on the badge (Live AI or Fixture demo) and which voice spoke.", {
      x: MX, y: 6.4, w: 7.0, h: 0.45, fontSize: 13, italic: true, color: C.accent6, margin: 0, isTextBox: true, objectName: "Demo honesty note",
    });
    s.addNotes(
      "Switch to the iPad. Follow DEMO_SCRIPT.md (90–120 s; exact raise and blink counts are there). A helper may have tapped Safari's camera prompt and \"Enable audio & test voice\": say so. Operator's hands go in their lap.\n\n" +
      "1. \"My partner asks a question. The AI offers three different possibilities. It chooses nothing.\"\n" +
      "2. One raise: \"Eyebrows up for half a second moves one step.\" Hold about 2 s: \"Holding longer doesn't skip ahead. Nothing moves on a timer.\"\n" +
      "3. Raises to None of these, long blink: \"That rejects them for this question only; it isn't stored as an opinion.\"\n" +
      "4. Guide my response → Choose a direction → Suggest an alternative: \"The person steers; the AI follows.\" Pick a card.\n" +
      "5. Review: \"Nothing is spoken yet. Review shows the exact text and starts on Cancel.\" One raise to Speak, then a new long blink: \"Speaking takes a second, separate blink.\"\n" +
      "   Only if heard: \"That's ElevenLabs saying exactly the sentence I confirmed and nothing else.\" Basic voice: \"That's the basic device voice; the natural voice isn't configured here.\"\n\n" +
      "Fallback lines (label every one):\n" +
      "- Eyebrows: tap the card (touch works in every mode) or switch to auto-scan + blink: \"Eyebrow detection isn't reliable in this light... The eyebrow path is experimental.\"\n" +
      "- Blinks: \"Blinks aren't separating cleanly here. Same screens, same review and confirmation, by touch.\"\n" +
      "- Voice: \"The natural voice is unavailable. This is the basic device voice, and I had to confirm again.\"\n" +
      "- Audio blocked: helper taps Enable audio. \"Safari blocked the audio, so it isn't fully hands-free here. The app says so instead of pretending.\"\n" +
      "- Live AI: \"The AI is unavailable, so this is our labeled fixture set (or my own words).\"\n" +
      "- Crash: restart; any backup recording is introduced as \"a recording from earlier today.\"\n\n" +
      "Do not say detection is accurate, reliable, or clinical; do not say frames never leave the iPad as a verified fact; do not say the voice is cloned."
    );
  }

  // ===== 8. Natural voice =====
  pres.addSection({ title: "Natural voice" });
  {
    const s = content("Natural voice", "4 · NATURAL VOICE", "ElevenLabs speaks exactly the confirmed sentence");
    const rows = [
      ["vol", "Only the confirmed sentence", "No added words, no paraphrase, no chatbot talking for the user. Nothing is synthesized in advance."],
      ["user", "A prebuilt AI voice, not a clone", "Disclosed as AI-generated speech."],
      ["lock", "The key stays on our server", "The iPad never holds the ElevenLabs key; the server sends only that sentence."],
      ["repeat", "A labeled fallback, never silent", "If the natural voice fails, the basic device voice is offered and needs a fresh confirmation."],
    ];
    const rw = 6.5, rh = 1.0;
    rows.forEach(([k, head, body], i) => {
      const y = 1.72 + i * (rh + 0.22);
      iconCircle(s, `Voice row ${i + 1}`, ic[k], MX, y + 0.15, 0.7, C.accent1);
      s.addText([
        { text: head, options: { fontSize: 17, bold: true, color: C.text1, breakLine: true } },
        { text: body, options: { fontSize: 14, color: C.text1 } },
      ], { x: MX + 0.95, y, w: rw - 0.95, h: rh, valign: "middle", margin: 0, paraSpaceAfter: 2, isTextBox: true, objectName: `Voice row ${i + 1} text` });
    });
    const iw = 4.95, ih = iw * 0.75, ix = W - MX - iw, iy = 1.62;
    framedShot(s, "Screenshot voice setup", img.audio, ix, iy, iw, ih, "Voice setup in iPad simulator: Natural voice (ElevenLabs) not configured on this server; the basic device voice will be used and labeled. Enable audio & test voice button, Audio ready.");
    caption(s, "Caption voice", "Voice setup as it really reads today: \"Not configured on this server — the basic device voice will be used, and it will be labeled.\" iPad simulator, Safari, localhost, 12:16 CT.", ix, iy + ih + 0.12, iw, 0.85, { size: 11 });
    pill(s, "Status voice", "ElevenLabs: implemented, key not configured, not yet heard", MX, 6.45, 6.5);
    s.addNotes(
      "ElevenLabs speaks the exact confirmed sentence: no added words, no paraphrase, no generic chatbot talking for the user. Prebuilt AI voice, not a clone, disclosed as AI-generated.\n\n" +
      "The key is server-side only; the server sends only the confirmed sentence. If ElevenLabs fails, the app shows the exact text and offers the clearly labeled basic device voice, which needs a fresh review and confirmation because the first attempt may have partly played.\n\n" +
      "Honest status (TEST_RESULTS.md): no ElevenLabs key is configured, so the live natural voice has NOT been heard in our app. The screenshot shows the app saying exactly that. Audible output of the basic browser voice was not confirmed by a listener either (only playback callbacks were observed).\n\n" +
      "Only say \"that was ElevenLabs\" if it was actually heard on the iPad. Do not quote vendor latency as our latency. Do not claim zero retention: per the ElevenLabs docs read today, request logging is on by default and zero-retention mode is enterprise-only.\n\n" +
      "On iPad Safari, audio needs one real tap first (Enable Audio / Test Voice); whether later blink-confirmed speech plays without another touch is not iPad-verified.\n\n" +
      "Timing: about 30 seconds."
    );
  }

  // ===== 9. Architecture =====
  pres.addSection({ title: "Engineering and evidence" });
  {
    const s = content("Engineering and evidence", "5 · ENGINEERING", "How a gesture becomes speech");
    // iPad band
    const by = 1.65, bh = 2.35;
    card(s, "Band iPad", MX, by, CW, bh);
    caption(s, "Band iPad label", "ON THE IPAD, IN SAFARI", MX + 0.25, by + 0.15, 6, 0.3, { size: 12, color: C.accent1 });
    const boxes = [
      ["Local face model", "MediaPipe Face Landmarker, pinned 1.1.1, served from our own origin"],
      ["Two scores only", "Brow raise and eye closure. No identity, gaze, or emotion"],
      ["Per-person tuning", "Calibration, hysteresis, 500\u00A0ms monotonic hold, latch and rearm"],
      ["Gesture arbiter", "At most one accepted command per physical gesture"],
      ["One guarded kernel", "One reducer, one target registry; immutable review; fresh confirm"],
    ];
    const g = 0.3, bw = (CW - 0.5 - g * 4) / 5, bxy = by + 0.6, bxh = bh - 0.8;
    boxes.forEach(([head, body], i) => {
      const x = MX + 0.25 + i * (bw + g);
      s.addShape(S.ROUNDED_RECTANGLE, { x, y: bxy, w: bw, h: bxh, rectRadius: 0.1, fill: { color: i === 4 ? C.accent1 : C.background1 }, line: { color: C.accent5, width: 1 }, objectName: `Arch iPad box ${i + 1}` });
      s.addText([
        { text: head, options: { fontSize: 15, bold: true, color: i === 4 ? C.background1 : C.text1, breakLine: true } },
        { text: body, options: { fontSize: 12, color: i === 4 ? C.background1 : C.text1 } },
      ], { x: x + 0.12, y: bxy + 0.1, w: bw - 0.24, h: bxh - 0.2, valign: "top", margin: 0, paraSpaceAfter: 4, isTextBox: true, objectName: `Arch iPad box ${i + 1} text` });
      if (i < boxes.length - 1) s.addShape(S.LINE, { x: x + bw + 0.04, y: bxy + bxh / 2, w: g - 0.08, h: 0, line: { color: C.accent4, width: 1.5, endArrowType: "triangle" }, objectName: `Arch arrow ${i + 1}` });
    });
    // connector down
    const kx = MX + 0.25 + 4 * (bw + g) + bw / 2;
    s.addShape(S.LINE, { x: kx, y: by + bh, w: 0, h: 0.5, line: { color: C.accent4, width: 1.5, endArrowType: "triangle" }, objectName: "Arch down arrow" });
    caption(s, "Arch down label", "replies are requested; only the confirmed sentence goes to speech", kx - 5.6, by + bh + 0.1, 5.45, 0.3, { size: 11 });
    // server band
    const sy = by + bh + 0.6, sh = 1.85;
    s.addShape(S.ROUNDED_RECTANGLE, { x: MX, y: sy, w: CW, h: sh, rectRadius: 0.12, fill: { color: C.background1 }, line: { color: C.accent4, width: 1 }, objectName: "Band server" });
    caption(s, "Band server label", "ON OUR SERVER · RAILWAY, HTTPS", MX + 0.25, sy + 0.15, 6, 0.3, { size: 12, color: C.accent1 });
    const sv = [
      ["Structured replies", "OpenAI gpt-6-astra, strict JSON schema, store:\u00A0false, no tools; output validated to three distinct options"],
      ["Speech, after confirmation", "ElevenLabs gets only the confirmed sentence; key held server-side only"],
      ["Access gate", "Access code on paid routes; logs keep route, outcome, and duration, never sentence text"],
    ];
    const sw = (CW - 0.5 - 0.6) / 3;
    sv.forEach(([head, body], i) => {
      const x = MX + 0.25 + i * (sw + 0.3);
      s.addText([
        { text: head, options: { fontSize: 15, bold: true, color: C.text1, breakLine: true } },
        { text: body, options: { fontSize: 13, color: C.text1 } },
      ], { x, y: sy + 0.5, w: sw, h: sh - 0.65, valign: "top", margin: 0, paraSpaceAfter: 4, isTextBox: true, objectName: `Arch server ${i + 1}` });
    });
    s.addNotes(
      "Left to right on the iPad: a local MediaPipe face landmarker running in Safari, pinned to 1.1.1 and served from our own origin. We use only brow-raise and eye-closure scores plus a face count: no identity, no gaze, no emotion.\n\n" +
      "Those scores go through per-person calibration, hysteresis, a 500 ms monotonic hold, and latch-and-rearm, then a single arbiter that accepts at most one command per physical gesture. A raise and a closure that start together are treated as ambiguous and do nothing.\n\n" +
      "Everything, touch, switch, keyboard, and gestures, reaches one reducer and one target registry through the same guarded activate path. Review is immutable and starts on Cancel; confirmation needs a new input cycle.\n\n" +
      "Server: structured OpenAI generation (gpt-6-astra, strict JSON schema, store: false, no tools, at most one repair attempt), validated to exactly three distinct options. ElevenLabs key held on the server only. Railway gives HTTPS, which iPad Safari needs for camera access. Paid routes need an access code.\n\n" +
      "Status honesty: the blink path is in TEST_RESULTS with synthetic tests passing. The eyebrow gesture, brow calibration, arbiter, and ElevenLabs speech code were committed at 12:13 CT; their tests are written but no run is recorded in TEST_RESULTS. The deployed Railway build did not include them at the last recorded check. \"Camera stays on the iPad\" is the design; the network-log check is pending.\n\n" +
      "Timing: about 40 seconds."
    );
  }

  // ===== 10. Evidence =====
  {
    const s = content("Engineering and evidence", "5 · MEASURED EVIDENCE", "What actually ran, and what didn't");
    const stats = [
      [TESTS_PASSED, "automated tests passed", TESTS_DETAIL],
      ["14/14", "synthetic live scenarios returned valid batches", "gpt-6-astra, 11:35 CT. Human judgment of the outputs not yet recorded"],
      ["401 / 200", "Railway access gate", "Live route without code: 401. With code: 200. 11:18 CT"],
      ["Passed", "typecheck, lint, production build", "11:00 CT. Client bundle grep found no key or prompt names"],
    ];
    const cw = 3.4, ch = 2.28, g = 0.3;
    stats.forEach(([big, label, detail], i) => {
      const x = MX + (i % 2) * (cw + g), y = 1.65 + Math.floor(i / 2) * (ch + g);
      card(s, `Stat card ${i + 1}`, x, y, cw, ch);
      s.addText(big, { x: x + 0.25, y: y + 0.15, w: cw - 0.5, h: 0.8, fontSize: 40, bold: true, color: C.accent1, valign: "middle", margin: 0, isTextBox: true, objectName: `Stat ${i + 1} number` });
      s.addText([
        { text: label, options: { fontSize: 14, bold: true, color: C.text1, breakLine: true } },
        { text: detail, options: { fontSize: 11, color: C.accent4 } },
      ], { x: x + 0.25, y: y + 0.98, w: cw - 0.5, h: ch - 1.1, valign: "top", margin: 0, paraSpaceAfter: 3, isTextBox: true, objectName: `Stat ${i + 1} text` });
    });
    const rx = MX + 2 * cw + g + 0.4, rw = W - MX - rx;
    s.addShape(S.ROUNDED_RECTANGLE, { x: rx, y: 1.65, w: rw, h: 2 * ch + g, rectRadius: 0.12, fill: { color: C.accent3 }, line: { color: C.accent2, width: 1 }, objectName: "Gaps card" });
    s.addText("Not run or not measured", { x: rx + 0.3, y: 1.8, w: rw - 0.6, h: 0.45, fontSize: 18, bold: true, color: C.accent2, margin: 0, isTextBox: true, objectName: "Gaps heading" });
    const gaps = [
      "Physical iPad acceptance trial: not run",
      "Eyebrow and blink on a real camera: not run",
      "Gesture reliability: not measured",
      "ElevenLabs live voice: not configured",
      "Eyebrow, arbiter, and speech tests: written, no run recorded",
      "Time to speech, latency, error rates: not measured",
      "Testing with AAC users: none",
    ];
    s.addText(gaps.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < gaps.length - 1 } })), {
      x: rx + 0.3, y: 2.4, w: rw - 0.6, h: 2 * ch + g - 0.9, fontSize: 15, color: C.text1, valign: "top", margin: 0, paraSpaceAfter: 10, isTextBox: true, objectName: "Gaps list",
    });
    caption(s, "Evidence footnote", "Source: docs/TEST_RESULTS.md. Synthetic tests prove logic, not reliability. All automated and browser checks ran on a MacBook, not an iPad.", MX, 6.55, CW, 0.35, { size: 11 });
    s.addNotes(
      "Only numbers recorded in docs/TEST_RESULTS.md.\n\n" +
      "- 134/134 vitest tests in 10 files at 11:50 CT, including blink gesture, calibration, scan attribution and timing, detector timestamps, and audit regressions. The provider SDK is mocked in the API tests: that proves plumbing, validation, and retry budget, not model behavior.\n" +
      "- 14/14 synthetic live scenarios with gpt-6-astra returned valid batches (outputs in docs/evidence/live-scenarios.json). Human judgment fields are still \"not reviewed\". If asked about behavior: Claude reviewed them (not human judgment) and saw, for example, the quoted prompt injection not being followed and no invented memories.\n" +
      "- Railway: live route without the access code returned 401 (also with a spoofed Host header); with the code, 200. Blink model and WASM assets served from our origin at 11:46 CT.\n" +
      "- Typecheck, lint, and production build passed at 11:00 CT.\n" +
      "- Observation only, not a latency study: a single synthetic live reply call took about 4 seconds.\n\n" +
      "Not run or not measured: the physical iPad trial, eyebrow and blink on a real camera, gesture reliability, the ElevenLabs voice, any run of the new eyebrow/arbiter/speech tests, time to speech and error rates, and any testing with AAC users. Browser fallbacks (switch scanning, staging, consented learning, My words) passed in a desktop browser pane with synthesized key events, not a physical switch.\n\n" +
      "Newer runs: PRESENTATION_LOG.md mentions a 285/285 vitest run at 12:18 CT that is NOT yet recorded in TEST_RESULTS.md. Cite it only once it is recorded there (then update TESTS_PASSED in build_deck.js and rebuild).\n\n" +
      "If the iPad trial gets recorded before judging, replace \"not run\" with the real counts and n (raises attempted, committed NEXTs, missed, inadvertent; lighting, glasses, tester). Never give percentages from a tiny sample.\n\n" +
      "Timing: about 40 seconds."
    );
  }

  // ===== 11. Limitations & next steps =====
  pres.addSection({ title: "Limitations and next steps" });
  {
    const s = content("Limitations and next steps", "6 · LIMITATIONS AND NEXT STEPS", "Limits we state plainly, and what comes next");
    const lw = 6.55;
    card(s, "Limits card", MX, 1.65, lw, 4.85);
    s.addText("Limitations", { x: MX + 0.3, y: 1.8, w: lw - 0.6, h: 0.45, fontSize: 18, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: "Limits heading" });
    const limits = [
      "Not clinically validated. Not tested with AAC users or people with ALS.",
      "Not everyone can raise their eyebrows or blink on purpose, so auto-scan, switch, keyboard, and touch stay first-class.",
      "The camera stays on the iPad by design; the network-log check is still pending.",
      "The confirmed sentence goes to ElevenLabs. We make no zero-retention claim.",
      "AAC and facial-gesture access already exist. Our contribution is this working combination.",
    ];
    s.addText(limits.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < limits.length - 1 } })), {
      x: MX + 0.3, y: 2.4, w: lw - 0.6, h: 3.95, fontSize: 16, color: C.text1, valign: "top", margin: 0, paraSpaceAfter: 12, isTextBox: true, objectName: "Limits list",
    });
    const nx = MX + lw + 0.4, nw = W - MX - nx;
    s.addText("Next steps", { x: nx, y: 1.8, w: nw, h: 0.45, fontSize: 18, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: "Next heading" });
    const next = [
      ["tablet", "Run the physical iPad trial", "Record counts with n and conditions."],
      ["vol", "Configure and listen to the voice", "Hear ElevenLabs on the iPad before claiming it."],
      ["users", "Co-design with AAC users and specialists", "Evaluation and co-design: planned, not yet arranged."],
      ["bar", "Measure effort", "Time to speech versus a scanning keyboard."],
    ];
    next.forEach(([k, head, body], i) => {
      const y = 2.4 + i * 1.03;
      iconCircle(s, `Next ${i + 1}`, ic[k], nx, y + 0.08, 0.66, C.accent1);
      s.addText([
        { text: head, options: { fontSize: 16, bold: true, color: C.text1, breakLine: true } },
        { text: body, options: { fontSize: 14, color: C.text1 } },
      ], { x: nx + 0.9, y, w: nw - 0.9, h: 0.85, valign: "middle", margin: 0, paraSpaceAfter: 2, isTextBox: true, objectName: `Next ${i + 1} text` });
    });
    s.addNotes(
      "Be direct about limits.\n\n" +
      "AAC and facial-gesture access already exist (VisioALS, Bobbai, Speak4Me, Google's SpeakFaster, and Project Converse are research leads in REFERENCES.md; we haven't independently verified them). We are not claiming a first. Our contribution is this working combination.\n\n" +
      "Access needs differ. Not everyone can raise their eyebrows or blink on purpose, so auto-scan, switch, keyboard, and touch stay first-class. Lighting, glasses, camera angle, fatigue, and speech movements are expected to affect detection; none of that has been studied.\n\n" +
      "Privacy: the camera stays on the iPad by design. Say \"the network log showed no frames uploaded\" only if that check (SYS-13) has been recorded. The confirmed sentence goes to ElevenLabs; we make no zero-retention claim.\n\n" +
      "Not clinically validated. Not tested with AAC users. The next step, planned but not arranged, is evaluation and co-design with AAC users and specialists, alongside a recorded iPad trial and real effort measurements.\n\n" +
      "Timing: about 30 seconds."
    );
  }

  // ===== 12. Close =====
  {
    const s = pres.addSlide({ masterName: "SH_CLOSE_DARK", sectionTitle: "Limitations and next steps" });
    s.addText("AI offers possibilities. The person keeps authorship.", { placeholder: "title" });
    s.addText("Still Here · Your words. Your choice.", { placeholder: "subtitle" });
    s.addText("Evidence and limits: docs/TEST_RESULTS.md · Demo: docs/DEMO_SCRIPT.md · Q&A: docs/JUDGE_QA.md", {
      x: MX, y: 6.55, w: CW, h: 0.35, fontSize: 12, color: HEX.accent5, margin: 0, isTextBox: true, objectName: "Close references",
    });
    s.addNotes(
      "Close with: \"AI offers possibilities. The person keeps authorship. Our prototype uses simple calibrated facial gestures and a natural voice to explore less effortful conversation. The next step is evaluation and co-design with AAC users and specialists.\"\n\n" +
      "If the natural voice was not heard in the demo, drop \"and a natural voice\" or say \"a natural voice path, not yet heard on the iPad\".\n\n" +
      "Then take questions; JUDGE_QA.md has grounded answers. Common ones: reliability (not measured), whether a gesture can accidentally speak (needs selection, review starting on Cancel, a raise to Speak, and a new long blink at least 600 ms after review opens; kernel side unit-tested, gesture side not iPad-tested), what goes to ElevenLabs (only the confirmed sentence), and whether someone with ALS can use it (we don't know; no AAC user has tested it)."
    );
  }

  await pres.writeFile({ fileName: OUT });
  if (SKILL_DIR) {
    const { applyTheme } = require(path.join(SKILL_DIR, "scripts", "apply_theme.js"));
    await applyTheme(OUT, THEME);
  } else {
    console.warn("PPTX_SKILL_DIR not set: theme colors not applied (scheme colors will show Office defaults).");
  }
  console.log("Wrote " + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
