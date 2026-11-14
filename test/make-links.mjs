// A PDF with link annotations: web, e-mail, unsafe (javascript:), and a jump to page 4.
import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib';
import fs from 'fs';
const doc = await PDFDocument.load(fs.readFileSync(process.argv[2]));
const font = await doc.embedFont(StandardFonts.Helvetica);
const p1 = doc.getPage(0);
const ctx = doc.context;
const link = (rect, action) => {
  const a = ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], A: action });
  p1.node.addAnnot(ctx.register(a));
};
const label = (text, x, y) => p1.drawText(text, { x, y, size: 12, font, color: rgb(0.1, 0.3, 0.8) });
label('Visit https://example.com/pdfacil-test', 60, 120); link([58, 116, 300, 132], ctx.obj({ S: 'URI', URI: PDFString.of('https://example.com/pdfacil-test') }));
label('Write to someone@example.com', 60, 100); link([58, 96, 260, 112], ctx.obj({ S: 'URI', URI: PDFString.of('mailto:someone@example.com') }));
label('Bad link', 60, 80); link([58, 76, 120, 92], ctx.obj({ S: 'URI', URI: PDFString.of('javascript:alert(1)') }));
label('Jump to Chapter 4', 320, 120);
const p4 = doc.getPage(3);
link([318, 116, 450, 132], ctx.obj({ S: 'GoTo', D: [p4.ref, PDFName.of('XYZ'), 0, 400, null] }));
fs.writeFileSync(process.argv[3], await doc.save());
