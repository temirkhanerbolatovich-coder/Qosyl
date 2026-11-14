import fontkit from '@pdf-lib/fontkit';
import { PDFArray, PDFDocument, PDFName, PDFString, PageSizes, rgb, type PDFFont } from 'pdf-lib';
import { safePortfolioUrl } from './profile-links';

type ResumeDocument = {
  name: string;
  language: 'ru' | 'kk' | 'en';
  heading: string[];
  sections: { title: string; text: string; links?: boolean }[];
};

const margin = 44;
const [width, height] = PageSizes.A4;
const textWidth = width - margin * 2;

function wrap(text: string, font: PDFFont, size: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.trim().split(/\s+/u)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= textWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (font.widthOfTextAtSize(line + char, size) > textWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  lines.push(line);
  return lines;
}

export async function createResumePdf(resume: ResumeDocument, fontBytes?: Uint8Array) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  if (!fontBytes) {
    const response = await fetch('/fonts/Inter-resume.ttf');
    if (!response.ok) throw new Error('Resume font could not be loaded');
    fontBytes = new Uint8Array(await response.arrayBuffer());
  }
  // Full embedding preserves the glyph outlines of the converted Inter font across PDF readers.
  const font = await pdf.embedFont(fontBytes);
  const supported = new Set(font.getCharacterSet());
  const clean = (value: string) =>
    Array.from(value.normalize('NFC'), (char) =>
      /\s/u.test(char) || supported.has(char.codePointAt(0)!) ? char : '□',
    ).join('');

  let page = pdf.addPage(PageSizes.A4);
  let y = height - margin;
  function ensureSpace(needed: number) {
    if (y - needed < margin) {
      page = pdf.addPage(PageSizes.A4);
      y = height - margin;
    }
  }

  function draw(text: string, size: number, step: number, link?: string) {
    for (const line of wrap(clean(text), font, size)) {
      ensureSpace(step);
      if (line) {
        page.drawText(line, {
          x: margin,
          y: y - size,
          size,
          font,
          color: link ? rgb(0.216, 0.188, 0.639) : rgb(0.067, 0.094, 0.153),
        });
        if (link) {
          const annotation = pdf.context.register(
            pdf.context.obj({
              Type: 'Annot',
              Subtype: 'Link',
              Rect: [margin, y - size - 2, margin + font.widthOfTextAtSize(line, size), y],
              Border: [0, 0, 0],
              A: { S: 'URI', URI: PDFString.of(link) },
            }),
          );
          let annotations = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
          if (!annotations) {
            annotations = pdf.context.obj([]);
            page.node.set(PDFName.of('Annots'), annotations);
          }
          annotations.push(annotation);
        }
      }
      y -= step;
    }
  }

  pdf.setTitle(resume.name);
  pdf.setLanguage(resume.language);
  draw(resume.name, 23, 31);
  if (resume.heading.length) draw(resume.heading.join(' · '), 11, 17);
  for (const section of resume.sections) {
    ensureSpace(54);
    y -= 12;
    draw(section.title, 14, 20);
    for (const paragraph of section.text.split(/\r?\n/u)) {
      draw(paragraph, 11, 16, section.links ? resumeLink(paragraph) : undefined);
    }
  }
  return pdf.save();
}

function resumeLink(value: string) {
  const url = safePortfolioUrl.safeParse(value);
  return url.success ? new URL(url.data).href : undefined;
}
