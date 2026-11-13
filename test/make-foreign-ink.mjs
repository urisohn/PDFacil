// A PDF with an Ink annotation made by "another app" (no PDFacil data), to test importing it.
import { PDFDocument, PDFName } from 'pdf-lib';
import fs from 'fs';
const doc = await PDFDocument.load(fs.readFileSync(process.argv[2]));
const page = doc.getPage(1);
const ctx = doc.context;
const ink = ctx.obj({ Type: 'Annot', Subtype: 'Ink', Rect: [100, 600, 300, 700], C: [0, 0.5, 0], InkList: [[110, 610, 150, 690, 200, 620, 290, 690]], BS: { W: 3 }, F: 4 });
page.node.addAnnot(ctx.register(ink));
fs.writeFileSync(process.argv[3], await doc.save());
