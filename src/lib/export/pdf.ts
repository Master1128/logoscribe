import PDFDocument from "pdfkit";
import type { Block, Sermon } from "../types";
import { coverLines, documentRefs, formatTime, runsWithRefs, type ExportOptions } from "./common";

const MARGIN = 72;
const INK = "#1f2430";
const HEADING = "#2b3a55";
const MUTED = "#888888";

export function buildPdf(sermon: Sermon, blocks: Block[], opts: ExportOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: { Title: sermon.title, Author: sermon.preacher ?? "", Creator: "Logoscribe" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - MARGIN * 2;
    const bottom = () => doc.page.height - MARGIN;

    // Cover
    doc.y = doc.page.height * 0.33;
    doc.font("Helvetica-Bold").fontSize(26).fillColor(INK).text(sermon.title, { align: "center", width });
    doc.moveDown(1.2);
    doc.font("Helvetica").fontSize(14).fillColor("#555555");
    for (const line of coverLines(sermon)) doc.text(line, { align: "center", width }).moveDown(0.3);

    doc.addPage();
    let seenHeading = false;
    for (const block of blocks) {
      if (block.kind === "heading") {
        if (!opts.headings) continue;
        // Never leave a heading stranded at the bottom of a page.
        if ((opts.sectionPageBreaks && seenHeading) || doc.y > bottom() - 90) doc.addPage();
        else if (seenHeading || doc.y > MARGIN + 1) doc.moveDown(0.8);
        doc.font("Helvetica-Bold").fontSize(15).fillColor(HEADING).text(block.text, { width });
        doc.moveDown(0.5);
        seenHeading = true;
        continue;
      }
      if (opts.timestamps && block.start !== null) {
        if (doc.y > bottom() - 40) doc.addPage();
        doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(formatTime(block.start), { width });
        doc.moveDown(0.15);
      }
      const runs = runsWithRefs(block.text);
      doc.fontSize(12).fillColor(INK);
      runs.forEach((run, i) => {
        doc.font(run.ref ? "Times-Bold" : "Times-Roman").text(run.text, {
          width,
          // pdfkit's justify spreads letters apart inside mixed-font runs.
          align: "left",
          lineGap: 4,
          continued: i < runs.length - 1,
        });
      });
      doc.moveDown(0.8);
    }

    const refs = opts.bibleIndex ? documentRefs(blocks) : [];
    if (refs.length) {
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(15).fillColor(HEADING).text("Citas bíblicas mencionadas", { width });
      doc.moveDown(0.6);
      doc.font("Times-Roman").fontSize(12);
      for (const r of refs) doc.fillColor(INK).text(`•  ${r.label}`, { width, link: r.url, lineGap: 3 });
    }

    // Page numbers on every page after the cover.
    const range = doc.bufferedPageRange();
    for (let i = range.start + 1; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const saved = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(9).fillColor(MUTED)
        .text(String(i), MARGIN, doc.page.height - MARGIN / 2 - 4, { width, align: "center", lineBreak: false });
      doc.page.margins.bottom = saved;
    }
    doc.end();
  });
}
