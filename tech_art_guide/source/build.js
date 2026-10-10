// Builds Taiko_VR_Tech_Art_Guide.docx — e-sumi ink style (black ink, vermilion accents).
// Usage: node build.js <output.docx>   (run gen_ink.py first to create assets/)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, AlignmentType, HeadingLevel, LevelFormat, Footer, PageNumber, TabStopType,
  VerticalAlign, HeightRule, ExternalHyperlink, TableLayoutType, LineRuleType,
} = require("docx");

const HERE = __dirname;
const OUT = process.argv[2] || path.join(HERE, "..", "Taiko_VR_Tech_Art_Guide.docx");

// palette
const RED = "B72026";
const INK = "1A1818";
const GREY = "6E6A64";
const WASH = "F3ECE1";   // callout fill
const PAPER = "FBF8F1";  // page colour
const HEAD = "Georgia";
const BODY = "Calibri";

// page: US Letter, 0.7" margins -> 10224 DXA content width (~680 px at 96 dpi)
const MARGIN = 1008;
const CONTENT_DXA = 12240 - 2 * MARGIN;
const CONTENT_PX = 680;

const img = (name) => fs.readFileSync(path.join(HERE, "img", name));
const asset = (name) => fs.readFileSync(path.join(HERE, "assets", name));
const jpgSize = (buf) => { // read JPEG SOF dimensions
  let i = 2;
  while (i < buf.length) {
    const marker = buf.readUInt16BE(i);
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error("no SOF");
};
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

// ---------- inline text: **bold ink**, [[bold red]], _italic_ ----------
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\[\[[^\]]+\]\]|_[^_]+_)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith("**")) out.push(new TextRun({ text: t.slice(2, -2), bold: true, color: INK, ...base }));
    else if (t.startsWith("[[")) out.push(new TextRun({ text: t.slice(2, -2), ...base, bold: true, color: RED }));
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

const p = (text, opts = {}) => new Paragraph({ children: runs(text), spacing: { after: 100 }, ...opts });

// ---------- decorations ----------
let strokeIdx = 0;
function redStroke(widthPx) {
  const name = `stroke_red_${strokeIdx++ % 6}.png`;
  const w = Math.round(widthPx);
  return new Paragraph({
    spacing: { before: 0, after: 80 },
    keepNext: true,
    children: [new ImageRun({ type: "png", data: asset(name), transformation: { width: w, height: Math.round(w * 90 / 1400) } })],
  });
}

function inkStroke(i) {
  return new Paragraph({
    spacing: { before: 0, after: 140 },
    keepNext: true,
    children: [new ImageRun({ type: "png", data: asset(`stroke_ink_${i % 3}.png`), transformation: { width: CONTENT_PX, height: Math.round(CONTENT_PX * 120 / 2200) } })],
  });
}

// "3 · Title" heading followed by a red brushstroke sized to the text
function section(num, title) {
  const est = (String(num).length + title.length + 4) * 8.6 + 60;
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      children: [
        new TextRun({ text: `${num}`, color: RED, font: HEAD, bold: true }),
        new TextRun({ text: "  ·  ", color: RED, font: HEAD }),
        new TextRun({ text: title, color: INK, font: HEAD, bold: true }),
      ],
    }),
    redStroke(Math.min(CONTENT_PX, Math.max(240, est))),
  ];
}

// Part opener: seal + name, role line, full-width black ink stroke
function part(sealFile, label, name, role) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
      keepNext: true,
      spacing: { before: 0, after: 40 },
      children: [
        new ImageRun({ type: "png", data: asset(sealFile), transformation: { width: 46, height: 46 } }),
        new TextRun({ text: "   " + label + "   ", color: RED, font: HEAD, size: 20, bold: true, characterSpacing: 40 }),
        new TextRun({ text: name, color: INK, font: HEAD }),
      ],
    }),
    new Paragraph({
      keepNext: true,
      spacing: { after: 0 },
      children: [new TextRun({ text: role, italics: true, color: GREY, font: HEAD, size: 21 })],
    }),
    inkStroke(label.length),
  ];
}

function caption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 140 },
    children: [new TextRun({ text, italics: true, color: GREY, size: 16 })],
  });
}

function figure(file, caption_, widthPx = CONTENT_PX) {
  const data = img(file);
  const { w, h } = jpgSize(data);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: 60, after: 0 },
      children: [new ImageRun({ type: "jpg", data, transformation: { width: widthPx, height: Math.round(widthPx * h / w) } })],
    }),
    caption(caption_),
  ];
}

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

// two images side by side at equal height
function figurePair(a, capA, b, capB) {
  const da = img(a), db = img(b);
  const sa = jpgSize(da), sb = jpgSize(db);
  const ra = sa.w / sa.h, rb = sb.w / sb.h;
  const gapPx = 14;
  const hPx = (CONTENT_PX - gapPx * 2) / (ra + rb);
  const wa = Math.round(ra * hPx), wb = Math.round(rb * hPx);
  const colA = Math.round(CONTENT_DXA * ra / (ra + rb));
  const colB = CONTENT_DXA - colA;
  const cell = (data, w, cap, width) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: noBorders,
    margins: { top: 0, bottom: 0, left: 60, right: 60 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "jpg", data, transformation: { width: w, height: Math.round(hPx) } })] }),
      caption(cap),
    ],
  });
  return [
    new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      columnWidths: [colA, colB],
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows: [new TableRow({ cantSplit: true, children: [cell(da, wa, capA, colA), cell(db, wb, capB, colB)] })],
    }),
    new Paragraph({ spacing: { after: 40 }, children: [] }),
  ];
}

// bullet: [[Label → Values]] — description
function bullet(text) {
  return new Paragraph({ numbering: { reference: "ink", level: 0 }, spacing: { after: 70 }, children: runs(text) });
}

// shaded box with a vermilion spine on the left
function callout(title, paras, { fill = WASH, dashed = false, spine = RED } = {}) {
  const edge = dashed ? { style: BorderStyle.DASHED, size: 6, color: RED } : NONE;
  return [
    new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      columnWidths: [CONTENT_DXA],
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({
        children: [new TableCell({
          width: { size: CONTENT_DXA, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, color: "auto", fill },
          borders: { top: edge, bottom: edge, right: edge, left: { style: BorderStyle.SINGLE, size: 24, color: spine } },
          margins: { top: 120, bottom: 80, left: 220, right: 200 },
          children: [
            ...(title ? [new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: title, bold: true, color: RED, font: HEAD, size: 21 })] })] : []),
            ...paras,
          ],
        })],
      })],
    }),
    new Paragraph({ spacing: { after: 60 }, children: [] }),
  ];
}

// prompt box for teammates to replace
function todo(who, lines) {
  return callout(`✎  ${who} — replace this box with your write-up`, lines.map((l) =>
    new Paragraph({ spacing: { after: 50 }, children: runs(l, { italics: true, color: GREY }) })), { fill: "FBF1EE", dashed: true });
}

// empty, dashed frame where a screenshot goes
function imageSlot(label, heightDxa = 1700) {
  const dash = { style: BorderStyle.DASHED, size: 6, color: "A9A39A" };
  return [
    new Table({
      width: { size: CONTENT_DXA, type: WidthType.DXA },
      columnWidths: [CONTENT_DXA],
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({
        height: { value: heightDxa, rule: HeightRule.ATLEAST },
        children: [new TableCell({
          width: { size: CONTENT_DXA, type: WidthType.DXA },
          verticalAlign: VerticalAlign.CENTER,
          borders: { top: dash, bottom: dash, left: dash, right: dash },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: "F6F2EA" },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `[ ${label} ]`, color: GREY, italics: true, size: 18 })] })],
        })],
      })],
    }),
    caption("Caption — what the image shows · which values are visible"),
  ];
}

function codeSlot(lines) {
  return callout(null, lines.map((l) => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: l, font: "Consolas", size: 17, color: INK })] })), { fill: "F1EDE4", spine: INK });
}

// ---------- team table ----------
function teamTable() {
  const cols = [900, 2300, 5424, 1600];
  const hdr = ["", "Who", "Focus", "Sections"];
  const rows = [
    ["seal_1.png", "Phil Morgan", "Drum controls & hit feedback in VR · Sound design & implementation", "1 – 2"],
    ["seal_2.png", "Wenji Pu", "Niagara VFX · Custom C++ splat motion for NanoGS", "3 – 4"],
    ["seal_3.png", "M-J Nelson", "Generative splat pipelines · Museum film · Procedural PBR materials", "5 – 11"],
  ];
  const line = { style: BorderStyle.SINGLE, size: 4, color: "D8D0C4" };
  const mk = (children, w, opts = {}) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    borders: { top: NONE, left: NONE, right: NONE, bottom: line },
    ...opts,
    children,
  });
  return new Table({
    width: { size: CONTENT_DXA, type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        tableHeader: true,
        children: hdr.map((h, i) => mk([new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", font: HEAD, size: 19 })] })], cols[i],
          { shading: { type: ShadingType.CLEAR, color: "auto", fill: INK } })),
      }),
      ...rows.map(([seal, who, focus, secs]) => new TableRow({
        children: [
          mk([new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: "png", data: asset(seal), transformation: { width: 30, height: 30 } })] })], cols[0]),
          mk([new Paragraph({ children: [new TextRun({ text: who, bold: true, font: HEAD, color: INK, size: 20 })] })], cols[1]),
          mk([new Paragraph({ children: [new TextRun({ text: focus, size: 19 })] })], cols[2]),
          mk([new Paragraph({ children: [new TextRun({ text: secs, color: RED, bold: true, size: 19 })] })], cols[3]),
        ],
      })),
    ],
  });
}

// ---------- content ----------
const children = [];
const add = (...xs) => xs.flat().forEach((x) => children.push(x));

// Title block
const banner = asset("banner.png");
const bs = pngSize(banner);
add(new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ type: "png", data: banner, transformation: { width: CONTENT_PX, height: Math.round(CONTENT_PX * bs.h / bs.w) } })] }));
add(new Paragraph({
  heading: HeadingLevel.TITLE,
  spacing: { before: 60, after: 0 },
  children: [
    new ImageRun({ type: "png", data: asset("seal_taiko.png"), transformation: { width: 50, height: 50 } }),
    new TextRun({ text: "  Technical Art — Gaussian Splats, VR Drumming, VFX & Generative Pipelines" }),
  ],
}));
add(redStroke(CONTENT_PX));
add(new Paragraph({
  spacing: { after: 160 },
  children: [
    new TextRun({ text: "Taiko VR", bold: true, color: RED, font: HEAD, size: 20 }),
    new TextRun({ text: "  ·  Serious game rapid prototype  ·  Unreal Engine 5  ·  VR  ·  Gaussian Splats (NanoGS)  ·  Two-week sprint", color: GREY, font: HEAD, size: 20 }),
  ],
}));
add(p("A serious game that teaches the history and playing of the Japanese **taiko** drum in VR, set in worlds built from Gaussian splats. This guide covers where each system lives, the workflow behind it, and which exposed values to change when tuning. Node math and full graphs are not covered (more detail lives in each team member’s professional development report)."));
add(teamTable());
add(new Paragraph({ spacing: { after: 80 }, children: [] }));
add(figure("taikoprogress.jpg", "In-engine progress shot — the taiko drums on stage in front of the stylized Nachi Falls pagoda splat", 560));

// ===== Part I — Phil =====
add(part("seal_1.png", "PART I", "Phil Morgan", "Drum interaction & sound — how a hit is read, felt and heard"));
add(section(1, "Drum controls & hit feedback — VR"));
add(todo("Phil", [
  "Keep it to about half a page, same pattern as sections 5 – 11: one short paragraph, one or two images, then bullets of exposed values.",
  "Paragraph — how a hit is detected (bachi / stick collision, swing velocity → hit strength, centre “don” vs rim “ka”) and how the player knows they hit (haptics, visuals, score / rhythm prompts).",
  "Why — any decision worth recording, e.g. what you tried first and why it changed.",
]));
add(imageSlot("Screenshot — stick & drum collision setup / hit Blueprint / in-headset view", 1400));
add(bullet("[[Component → Exposed value]] — what it changes, and a safe tuning range."));
add(bullet("[[e.g. Hit velocity threshold / Cooldown]] — how hard a swing must be to count, and how soon the drum can be hit again."));
add(bullet("[[e.g. Haptics → Amplitude / Duration]] — controller rumble per hit strength."));

add(section(2, "Sound design & implementation"));
add(todo("Phil", [
  "Paragraph — where the sounds came from (recorded / library taiko, don & ka variations, ambience, UI) and how they are played in Unreal (MetaSounds or Sound Cues).",
  "How hit strength maps to sound (volume, pitch, layer choice), randomisation / round-robin, attenuation and the mix between museum and outdoor stage.",
]));
add(imageSlot("Screenshot — MetaSound graph / Sound Cue / attenuation settings", 1200));
add(bullet("[[Sound asset → Parameter]] — what it changes, and a safe tuning range."));
add(bullet("[[e.g. Velocity → Volume / Pitch range]] — how strongly a harder hit changes the sound."));
add(bullet("[[e.g. Attenuation / Reverb send]] — how the drum carries in the museum vs. the stage."));

// ===== Part II — Wenji =====
add(part("seal_2.png", "PART II", "Wenji Pu", "Niagara VFX & moving splats — making the world answer the drum"));
add(section(3, "Niagara VFX"));
add(todo("Wenji", [
  "Paragraph — which Niagara systems are in the game (hit bursts, ambient particles, etc.), what triggers each, and how they support the drumming.",
  "Bullets — the User Parameters / emitter values worth tuning, with what each changes.",
]));
add(imageSlot("Screenshot — Niagara system overview / emitter stack / in-game effect", 1500));
add(bullet("[[System → User parameter]] — what it changes, and a safe tuning range."));

add(section(4, "Moving splats — custom C++ for NanoGS"));
add(todo("Wenji", [
  "Paragraph — NanoGS renders static splats; explain what the C++ adds so splats move like particles, wave and ripple outward (e.g. from a drum hit), and how it is driven at runtime.",
  "Why — performance in VR, what was tried first, anything the next developer must know before editing it.",
]));
add(imageSlot("Screenshot / GIF still — splats rippling outward from a hit", 1500));
add(codeSlot([
  "// Paste a short, key excerpt here (10 – 20 lines), e.g. the per-splat ripple offset:",
  "// offset = Amplitude * sin(k * dist - Speed * t) * exp(-Falloff * dist)",
]));
add(bullet("[[e.g. Ripple → Speed / Amplitude / Wavelength / Falloff]] — how fast and far the wave travels, and how strongly splats move."));
add(bullet("[[e.g. Origin / Trigger]] — where a ripple starts and what event fires it."));

// ===== Part III — M-J =====
add(part("seal_3.png", "PART III", "M-J Nelson", "Generative splat pipelines, the museum film & procedural materials"));

add(section(5, "One image → 33-view splat — ComfyUI → COLMAP → Houdini"));
add(p("Gaussian splats normally need dozens of real photos circling a subject. We start from a **single real-life reference image** instead. A local ComfyUI graph — Qwen-Image-Edit 2509 with the Multiple-Angles and 4-step Lightning LoRAs, all running as local safetensors on a laptop RTX 4090 — re-prompts that image into 32 new camera angles. The 33 images feed **COLMAP**, which solves camera poses and a sparse point cloud, and Houdini’s Gaussian splat tools train the splat. Claude Code built the graph from ComfyUI’s multiple-scene-angles template, guided by a Gaussian splatting skill from my local research corpus."));
add(figurePair(
  "claude-generative-gaussians-experiment.jpg", "Briefing Claude Code to build the 32-angle graph",
  "Image_to_multiple_angles_comfyui_Qwen_image_edit_2509_safetensors.jpg", "RD09_Image_to_32_Angles_for_COLMAP — one image fans out to 32 branches"));
add(bullet("[[Views → view_00_original … view_32]] — names encode the camera move (l / r orbit degrees, low, air, close, wide), so one bad angle is regenerated alone instead of all 32."));
add(bullet("[[Source → Load Scene Image]] — swap the input to re-iterate; dataset, COLMAP solve and splat bake all re-run from that one image."));
add(bullet("[[Library → RapidDrums RD01 – RD09]] — stylize, restyle, image-to-prop, mesh-to-dot-splat and panorama graphs, saved for reuse."));

add(section(6, "Main backdrop — Nachi Falls pagoda"));
add(p("Our main environment backdrop started from an image of the famous red three-storied pagoda at **Nachi Falls**. It went through the 33-view pipeline above, but before training every view passed through a **python stylizing script — a deterministic filter, not AI** — so the splat inherits the same painterly look from every angle and reads as a unique background asset rather than a photo-scan."));
add(figurePair(
  "Gaussian_Pre_Restyle.jpg", "test_01_generative_colmap — 33 generated views",
  "Gaussian_post_restyle.jpg", "test_01_generative_styled — the same views after the restyle"));
add(bullet("[[Restyle the dataset, not the splat]] — one identical filter on all 33 views keeps colour consistent between angles. To change the look, re-run the script and re-bake."));

add(section(7, "Style-transferred splats — StylizedGS"));
add(p("Taking it a step further: a splat trained from a **360° drone VR video of a waterfall in Fiji** (Gaussian 01) was passed through **StylizedGS**, a research ML method that re-trains an existing splat to match a reference image’s style. Re-trained on Hokusai’s _The Great Wave off Kanagawa_ (Gaussian 02), the waterfall became an ukiyo-e inspired environment."));
add(new Paragraph({
  spacing: { after: 100 },
  children: [
    new TextRun({ text: "Credit — StylizedGS: ", color: GREY, italics: true, size: 18 }),
    new ExternalHyperlink({ link: "http://geometrylearning.com/stylizedgs/", children: [new TextRun({ text: "geometrylearning.com/stylizedgs", style: "Hyperlink", size: 18 })] }),
  ],
}));
add(figurePair(
  "gaussian_01.jpg", "Gaussian 01 — waterfall splat from 360° drone footage",
  "Gaussian_02.jpg", "Gaussian 02 — re-trained on The Great Wave, CTRL null exposed"));
add(bullet("[[Look → Saturation / Brightness]] — grade on the baked splat (adjust_colour); no re-training needed."));
add(bullet("[[Keep Points % → thin_points]] — share of splats kept, chosen at random; 25 % keeps ~330 k of 1.32 M. The biggest lever on VR frame-rate."));
add(bullet("[[Splat Size → splat_size]] — multiplies every splat’s scale. Smaller and sparser reads as brush dabs; larger closes gaps."));

add(section(8, "Pointillist props — image → splat"));
add(p("Late in the project, quick props came from single photos through a locally-run, open-source **Tripo image-to-Gaussian-splat** model (RD04_Image_to_Full3D_Prop_TripoSplat). The same Houdini CTRL pattern then tuned them toward a neo-impressionist look — **pointillism**, an image built from separate dots of colour."));
add(bullet("[[Point size / Point count]] — fewer, larger dots push toward Seurat-style pointillism; more, smaller dots read as a photo."));
add(bullet("[[Culling]] — strip floaters and stray splats before export so props stay clean in the headset."));

add(section(9, "Museum intro film — e-sumi ink renderer & narration"));
add(p("Our designer envisioned a museum where players start by watching a short educational film about the drum. With our professor’s go-ahead to try AI, I prompted Claude Code with a detailed brief on Japanese **e-sumi ink** style, plus the history script and captions written by our game designer, **Aryan**. After some back-and-forth it produced **Taiko Studio** — an interactive, stylized 2D ink renderer that animates the scenes, burns in captions and renders straight to MP4."));
add(figure("E_Sumi_Ink_2d_renderer.jpg", "Taiko Studio — e-sumi ink renderer with render, caption and audio controls", 500));
add(p("Narration is generative too: a ComfyUI node network (TTS Audio Suite) running **Chatterbox**, an open voice model from Hugging Face, turns the script into voiceover and captions. It is saved as a reusable caption / voiceover skill — and yes, it has a David Attenborough-style voice preset, which the team found amusing."));
add(bullet("[[Render → Frame rate / Quality / Burn in captions]] — 30 or 60 fps, Master 40 Mbps; the preview is exactly what gets encoded."));
add(bullet("[[Captions → Load / Save SRT]] — 16 cues from the narration script; edit timings in the SRT and reload."));
add(bullet("[[Audio → Drums level / Voiceover level / Starts at]] — balance and offset the voiceover against the drum hits."));

add(section(10, "Museum interior — modeling & procedural PBR materials"));
add(p("A modeled interior with four new PBR materials would normally be out of scope for a two-week prototype. Drawing on past 3D art experience, I modeled and UV’d **one section** of the museum, then used **radial duplication** to complete the hall. The four materials — indigo-stripe Japanese fabric, gold marble, redwood and hinoki planks — would usually mean days in Substance Designer. Instead they were built procedurally in **Houdini Copernicus** by a frontier model working from my own distilled research."));
add(figure("Procedural_PBR_Materials.jpg", "Four procedural materials built in Houdini Copernicus — fabric, gold marble, redwood, hinoki", 540));
add(callout("How the material skill was built", [
  p("Over several months of free time I have built a personal AI harness and research corpus. For this, a swarm of **~110 agents** studied Houdini Copernicus tutorials on YouTube, SideFX’s documentation and my own project files for several hours, distilling a set of rules for texturing in Houdini. A frontier model then used that context to **operate Houdini directly** and build a full material graph with exposed parameters."),
  p("The first material (gold marble) took **two days**. Claude Code then turned those learnings into a reusable skill: give it a few reference photos of a surface and it builds a PBR graph from real-world physical values, with rule checks and exposed controls for pattern, wear and surface noise / roughness. **The next three surfaces took about two hours.**"),
  p("_Why not just generate a texture?_ Browser AI texture tools return a flat image that is unreliable, inconsistent and different every time. This returns a procedural, rule-checked graph that keeps being tweaked like a Substance Designer graph.", { spacing: { after: 40 } }),
]));
add(figurePair(
  "Japanese_Wood_COPS_NET.jpg", "japanese_wood — CTRL tabs exposed like a Substance graph",
  "planks_shape.jpg", "Planks shape — per-board phase and noise build the stagger"));
add(bullet("[[CTRL → Presets / Planks / Grain / Knots / Wood Color / Wear / Finish / Surface / Export]] — art-direct after creation; nothing is regenerated."));
add(bullet("[[Surface → Normal Strength / Displacement Depth / Grain Relief]] — overall relief of the planks and grain."));
add(bullet("[[Roughness → Earlywood / Latewood / Gaps / Streaks / Board Variation]] — roughness per grain band and per board, set from real-world wood values."));
add(bullet("[[Breakup → Board Height Variation / Cupping / Gap Depth / Gap Darkening / Saturation Variation]] — keeps the floor from reading as one repeated tile."));
add(bullet("[[Output → 2048², 32-bit, wrap border]] — tileable maps. The museum geo is brought into Houdini to adjust tiling and surface detail with nodes, materials are pre-assigned there, and everything exports to Unreal together."));

add(section(11, "Also in the build"));
add(bullet("[[VAT clouds]] — clouds baked to vertex animation textures for cheap playback in Unreal."));
add(bullet("[[Fish]] — a swimming-fish particle system for ambient life. (Full details left out for brevity.)"));

add(new Paragraph({ spacing: { after: 60 }, children: [] }));
add(callout("A note on AI in this pipeline", [
  p("Some of the workflows and tools here were AI-generated, but every final result was **art-directed, placed and refined by our technical art team** — hand-tuning the exposed parameters, and prompting from real domain knowledge to get results most people would not get out of an LLM. Our own knowledge, multiplied by frontier models and specialized open-source models running locally, let a small team reach a quality bar a two-week prototype normally couldn’t.", { spacing: { after: 40 } }),
], { fill: "F6EDE8" }));

add(...section("✦", "Credits & references"));
const ref = (t) => new Paragraph({ numbering: { reference: "ink", level: 0 }, spacing: { after: 30 }, children: runs(t, { size: 17 }) });
[
  "**StylizedGS** — 3D Gaussian splat stylization from a reference image · geometrylearning.com/stylizedgs",
  "**COLMAP** — structure-from-motion and multi-view reconstruction",
  "**ComfyUI** · Qwen-Image-Edit 2509 with Multiple-Angles and Lightning LoRAs",
  "**Tripo** — open-source image-to-3D / Gaussian splat model, run locally",
  "**Chatterbox** (Resemble AI, via Hugging Face) · ComfyUI TTS Audio Suite",
  "**NanoGS** — Gaussian splat rendering plugin for Unreal Engine 5",
  "**SideFX Houdini** — Gaussian splat tools and Copernicus (COPs)",
  "**The Great Wave off Kanagawa** — Katsushika Hokusai",
  "**Narrative script & captions** — Aryan, Game Designer",
].forEach((t) => add(ref(t)));

// ---------- document ----------
const doc = new Document({
  creator: "M-J Nelson",
  title: "Taiko VR — Technical Art Guide",
  description: "Technical art guide for the Taiko VR serious game rapid prototype",
  background: { color: PAPER },
  styles: {
    default: { document: { run: { font: BODY, size: 20, color: "2A2725" }, paragraph: { spacing: { line: 264, lineRule: LineRuleType.AUTO } } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: HEAD, size: 38, bold: true, color: INK }, paragraph: { spacing: { after: 0 } } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: HEAD, size: 36, bold: true, color: INK }, paragraph: { spacing: { before: 0, after: 40 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: HEAD, size: 26, bold: true, color: INK }, paragraph: { spacing: { before: 260, after: 0 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [{
      reference: "ink",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "▪", alignment: AlignmentType.LEFT,
        style: { run: { color: RED }, paragraph: { indent: { left: 400, hanging: 260 } } } }],
    }],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 900, bottom: 900, left: MARGIN, right: MARGIN, footer: 400 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_DXA }],
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: RED, space: 4 } },
          children: [
            new TextRun({ text: "太鼓  ", color: RED, bold: true, size: 16 }),
            new TextRun({ text: "TAIKO VR  ·  TECHNICAL ART GUIDE", color: GREY, size: 15, characterSpacing: 30 }),
            new TextRun({ text: "\t", size: 16 }),
            new TextRun({ children: [PageNumber.CURRENT], color: RED, bold: true, size: 16 }),
          ],
        })],
      }),
    },
    children: children.filter((c) => c && typeof c === "object"),
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("wrote", OUT, (buf.length / 1024 / 1024).toFixed(2), "MB");
});
