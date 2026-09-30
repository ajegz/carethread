/** Preparation scaffold. No final rendering until design.json is explicitly ready. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = import.meta.dirname;
const content = JSON.parse(await fs.readFile(path.join(root, 'content.json'), 'utf8'));
const design = JSON.parse(await fs.readFile(path.join(root, 'design.json'), 'utf8'));
if (content.slides.length !== 8) throw new Error('The approved narrative has eight slides.');
for (const slide of content.slides) {
  if (!slide.title || !slide.notes) throw new Error('Every slide requires a title and source notes.');
}

const capturePath = design.workspace_capture
  ? path.resolve(root, design.workspace_capture) : null;
const acceptedPath = design.accepted_capture
  ? path.resolve(root, design.accepted_capture) : null;
if (!process.argv.includes('--build')) {
  console.log(JSON.stringify({
    stage: 'preparation',
    slides: content.slides.length,
    finalGenerationEnabled: design.ready === true,
    workspaceCaptureSupplied: Boolean(capturePath),
    outputsCreated: false,
  }));
  process.exit(0);
}
if (design.ready !== true) throw new Error('Final UI design has not been handed off. No artifacts generated.');
if (!capturePath || !design.capture_provenance) throw new Error('An interface image and its provenance are required.');
await fs.access(capturePath);
if (acceptedPath) await fs.access(acceptedPath);

const runtimeRoot = '/Users/mj/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const nodeModules = process.env.RUNTIME_NODE_MODULES ?? path.join(runtimeRoot, 'node/node_modules');
const python = process.env.RUNTIME_PYTHON ?? path.join(runtimeRoot, 'python/bin/python3');
const skillDir = process.env.CARETHREAD_PRESENTATION_SKILL
  ?? '/Users/mj/.codex/plugins/cache/openai-primary-runtime/presentations/26.929.10730/skills/presentations';
process.env.RUNTIME_NODE_MODULES = nodeModules;
const runtimeRequire = createRequire(path.join(nodeModules, '..', 'package.json'));
const { Presentation, PresentationFile } = await import(pathToFileURL(runtimeRequire.resolve('@oai/artifact-tool')).href);
const { resolvePresentationFont, finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);
const font = resolvePresentationFont({ fontFamily: design.font_family });
const C = design.colors;
const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const buildDir = path.join(root, '.build', stamp);
const outputDir = path.join(root, 'output', stamp);
await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

function text(slide, value, x, y, w, h, size = 30, color = C.ink, bold = false) {
  const shape = slide.shapes.add({
    geometry: 'textbox', position: { left: x, top: y, width: w, height: h },
    fill: 'none', line: { fill: 'none', width: 0 },
  });
  shape.text = value;
  shape.text.style = { typeface: font, fontSize: size, bold, color, autoFit: 'none' };
  return shape;
}
function base(data, index, background = C.background) {
  const slide = deck.slides.add();
  slide.background.fill = background;
  text(slide, data.title, 72, 72, 1136, 124, 51, C.ink, true);
  if (data.footer) text(slide, data.footer, 72, 640, 1040, 48, 18, C.secondary);
  text(slide, String(index + 1).padStart(2, '0'), 1154, 650, 54, 26, 17, C.secondary);
  slide.speakerNotes.textFrame.setText(data.notes);
  return slide;
}
async function capture(slide, file, position) {
  const blob = new Uint8Array(await fs.readFile(file));
  slide.images.add({
    blob, contentType: 'image/png', alt: 'Code-rendered CareThread interface illustration using a fictional patient',
    fit: 'contain', position,
  });
}

for (const [index, data] of content.slides.entries()) {
  let slide;
  switch (data.layout) {
    case 'cover': {
      slide = deck.slides.add();
      slide.background.fill = C.background;
      text(slide, content.poster.eyebrow, 76, 60, 1128, 40, 21, C.secondary);
      text(slide, data.title, 68, 205, 1140, 135, 100, C.ink, true);
      text(slide, data.subtitle, 72, 350, 1128, 142, 49, C.secondary);
      text(slide, content.poster.scope, 76, 615, 1128, 45, 21, C.accent);
      slide.speakerNotes.textFrame.setText(data.notes);
      break;
    }
    case 'comparison': {
      slide = base(data, index, C.alternate);
      text(slide, data.left_label, 72, 244, 490, 38, 22, C.secondary, true);
      text(slide, data.left, 68, 315, 510, 192, 37);
      text(slide, data.right_label, 680, 244, 490, 38, 22, C.secondary, true);
      text(slide, data.right, 676, 315, 530, 192, 37);
      text(slide, data.takeaway, 72, 560, 1128, 50, 29, C.accent, true);
      break;
    }
    case 'product': {
      slide = base(data, index);
      text(slide, data.subtitle, 72, 176, 1128, 48, 26, C.secondary);
      await capture(slide, capturePath, { left: 310, top: 238, width: 898, height: 390 });
      text(slide, 'Pending work.\nNamed owner.\nStated timing.\nSource evidence.', 72, 296, 270, 275, 30, C.secondary);
      slide.speakerNotes.textFrame.setText(`${data.notes}\nCapture provenance: ${design.capture_provenance}`);
      break;
    }
    case 'states': {
      slide = base(data, index, C.alternate);
      if (acceptedPath) {
        await capture(slide, acceptedPath, { left: 72, top: 225, width: 1136, height: 375 });
      } else {
        text(slide, data.left_label, 72, 257, 500, 38, 22, C.secondary, true);
        text(slide, data.left, 66, 330, 528, 93, 63, C.accent, true);
        text(slide, data.left_detail, 72, 459, 516, 105, 30);
        text(slide, data.right_label, 680, 257, 500, 38, 22, C.secondary, true);
        text(slide, data.right, 674, 330, 534, 93, 62, C.ink, true);
        text(slide, data.right_detail, 680, 459, 528, 105, 29);
      }
      break;
    }
    case 'architecture': {
      slide = base(data, index);
      const xs = [72, 470, 868];
      data.columns.forEach((column, n) => {
        text(slide, String(n + 1).padStart(2, '0'), xs[n], 260, 320, 70, 49, C.accent, true);
        text(slide, column.title, xs[n], 366, 340, 82, 32, C.ink, true);
        text(slide, column.body, xs[n], 469, 338, 120, 25, C.secondary);
      });
      break;
    }
    case 'market': {
      slide = base(data, index, C.alternate);
      text(slide, data.lead, 68, 295, 550, 180, 43, C.ink, true);
      text(slide, data.body, 682, 296, 526, 260, 30, C.secondary);
      break;
    }
    case 'evidence': {
      slide = base(data, index);
      text(slide, data.checks, 64, 252, 535, 152, 110, C.accent, true);
      text(slide, data.checks_label, 72, 440, 528, 90, 34, C.ink, true);
      text(slide, data.checks_detail, 72, 548, 532, 54, 23, C.secondary);
      text(slide, data.fixture, 674, 252, 530, 152, 110, C.accent, true);
      text(slide, data.fixture_label, 680, 440, 528, 90, 34, C.ink, true);
      text(slide, data.fixture_detail, 680, 548, 528, 54, 23, C.secondary);
      break;
    }
    case 'closing': {
      slide = base(data, index, C.alternate);
      text(slide, data.subtitle, 68, 270, 1110, 180, 60, C.ink, true);
      const url = design.application_url_verified && design.application_url
        ? design.application_url : design.repository_url;
      text(slide, url, 72, 540, 1128, 52, 25, C.accent);
      break;
    }
    default: throw new Error(`Unsupported layout: ${data.layout}`);
  }
}

for (const [index, slide] of deck.slides.items.entries()) {
  const blob = await deck.export({ slide, format: 'png', scale: 1.5 });
  await fs.writeFile(path.join(buildDir, `slide-${String(index + 1).padStart(2, '0')}.png`), new Uint8Array(await blob.arrayBuffer()));
}
const candidate = path.join(buildDir, 'candidate.pptx');
await (await PresentationFile.exportPptx(deck)).save(candidate);
const finalPath = path.join(outputDir, 'carethread-redesigned.pptx');
await finalizePresentation({
  workspaceDir: root, candidatePath: candidate, finalPath,
  pythonExecutable: python,
  integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
  explicitTotalSlideCount: 8,
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
  fontPolicy: { basis: 'design', families: [font] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, 'validation.json'),
});
await fs.copyFile(path.join(root, 'video/out/carethread-poster.png'), path.join(outputDir, 'carethread-poster.png'));
const manifest = { outputDir, buildDir, font, slideCount: 8, interfaceIllustration: capturePath, provenance: design.capture_provenance };
await fs.writeFile(path.join(root, '.build/last-build.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest));
