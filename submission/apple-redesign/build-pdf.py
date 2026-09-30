"""Assemble the reviewed rendered slides into a matching PDF after final handoff."""
import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

root = Path(__file__).resolve().parent
design = json.loads((root / 'design.json').read_text())
if not design.get('ready'):
    raise SystemExit('Final UI design has not been handed off. No PDF generated.')
manifest = json.loads((root / '.build/last-build.json').read_text())
build = Path(manifest['buildDir']).resolve()
out = Path(manifest['outputDir']).resolve()
if not build.is_relative_to(root) or not out.is_relative_to(root):
    raise SystemExit('Outputs must stay in the redesign workspace.')
images = [build / f'slide-{i:02}.png' for i in range(1, 9)]
if not all(image.exists() for image in images):
    raise SystemExit('All eight reviewed slide renders are required.')
pdf = canvas.Canvas(str(out / 'carethread-redesigned.pdf'), pagesize=(960, 540))
pdf.setTitle('CareThread: clinical handoffs with responsibility intact')
pdf.setAuthor('CareThread')
pdf.setSubject('Synthetic clinical communication simulation')
for image in images:
    pdf.drawImage(ImageReader(str(image)), 0, 0, width=960, height=540)
    pdf.showPage()
pdf.save()
print(out / 'carethread-redesigned.pdf')
