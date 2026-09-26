import {
  AlignmentType, Document, ExternalHyperlink, Footer, HeadingLevel, Packer, PageBreak, PageNumber, Paragraph, TextRun,
} from "docx";
import type { Block, Sermon } from "../types";
import { coverLines, documentRefs, formatTime, runsWithRefs, type ExportOptions } from "./common";

const BODY_FONT = "Georgia";
const HEAD_FONT = "Calibri";

export async function buildDocx(sermon: Sermon, blocks: Block[], opts: ExportOptions): Promise<Buffer> {
  const cover = [
    new Paragraph({ spacing: { before: 3600 }, children: [new TextRun("")] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: sermon.title, font: HEAD_FONT, size: 52, bold: true })],
    }),
    ...coverLines(sermon).map(
      (line) =>
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: line, font: HEAD_FONT, size: 28, color: "555555" })],
        }),
    ),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const body: Paragraph[] = [];
  let seenHeading = false;
  for (const block of blocks) {
    if (block.kind === "heading") {
      if (!opts.headings) continue;
      body.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          pageBreakBefore: opts.sectionPageBreaks && seenHeading,
          keepNext: true,
          spacing: { before: 480, after: 200 },
          children: [new TextRun({ text: block.text, font: HEAD_FONT, size: 30, bold: true, color: "2B3A55" })],
        }),
      );
      seenHeading = true;
      continue;
    }
    if (opts.timestamps && block.start !== null) {
      body.push(
        new Paragraph({
          keepNext: true,
          spacing: { after: 0 },
          children: [new TextRun({ text: formatTime(block.start), font: HEAD_FONT, size: 16, color: "999999" })],
        }),
      );
    }
    // Spacing and font are repeated on each paragraph (not only in the default
    // style) because Google Docs, Pages and previewers ignore docDefaults.
    body.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { line: 360, after: 240 },
        children: runsWithRefs(block.text).map(
          (r) => new TextRun({ text: r.text, bold: Boolean(r.ref), font: BODY_FONT, size: 24 }),
        ),
      }),
    );
  }

  const refs = opts.bibleIndex ? documentRefs(blocks) : [];
  if (refs.length) {
    body.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: true, children: [new TextRun("Citas bíblicas mencionadas")] }),
      ...refs.map(
        (r) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 60 },
            children: [new ExternalHyperlink({ link: r.url, children: [new TextRun({ text: r.label, style: "Hyperlink" })] })],
          }),
      ),
    );
  }

  const doc = new Document({
    creator: "Logoscribe",
    title: sermon.title,
    description: sermon.preacher ?? undefined,
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: 24 },
          paragraph: { spacing: { line: 360, after: 200 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: HEAD_FONT, size: 30, bold: true, color: "2B3A55" },
          paragraph: { spacing: { before: 480, after: 200 } },
        },
      ],
    },
    sections: [
      {
        // One section with a distinct first page: the cover shows no number and
        // counts as page 0, so the sermon starts on page 1.
        properties: { titlePage: true, page: { pageNumbers: { start: 0 } } },
        footers: {
          first: new Footer({ children: [new Paragraph({ children: [] })] }),
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: [PageNumber.CURRENT], font: HEAD_FONT, size: 18, color: "888888" })],
              }),
            ],
          }),
        },
        children: [...cover, ...body],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
