import React from "react";
import {
  AlignmentType,
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const e = React.createElement;

// @react-pdf/renderer is ESM-only; this backend is CommonJS, so it must be
// loaded via a dynamic import (a static import would compile to a `require`
// call and fail at runtime). The module's type is left to inference — an
// explicit written-out reference to the ESM package's types from this CJS
// file would itself need a resolution-mode import attribute.
function importReactPdf() {
  return import("@react-pdf/renderer");
}

let reactPdfPromise: ReturnType<typeof importReactPdf> | null = null;

function loadReactPdf() {
  reactPdfPromise ??= importReactPdf();
  return reactPdfPromise;
}

export interface CvExportInput {
  name: string;
  role: string;
  email: string;
  phone: string;
  location: string;
  skills: string;
  exp: string;
  summary: string;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---- PDF (via @react-pdf/renderer — real vector text, not a print-dialog screenshot) ----
// Plain style objects rather than StyleSheet.create() — react-pdf accepts either, and plain
// objects avoid needing the dynamically-imported StyleSheet helper at module load time.

const styles = {
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10.5, color: "#1a2420" },
  name: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  role: { fontSize: 11.5, color: "#5b6b64", marginBottom: 8 },
  contactRow: { fontSize: 9.5, color: "#5b6b64", marginBottom: 18 },
  sectionLabel: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: "#0f766e",
    marginTop: 16,
    marginBottom: 7,
    paddingBottom: 4,
    borderBottom: "1pt solid #d8e0dc",
  },
  skillsRow: { flexDirection: "row", flexWrap: "wrap" },
  skillChip: {
    backgroundColor: "#e3f4f0",
    color: "#0f766e",
    fontSize: 9,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  expLine: { fontSize: 10.5, marginBottom: 6, lineHeight: 1.4 },
  summaryText: { fontSize: 10.5, lineHeight: 1.5 },
} as const;

export async function renderCvPdf(cv: CvExportInput): Promise<Buffer> {
  const { Document, Page, View, Text, renderToBuffer } = await loadReactPdf();

  const skills = splitList(cv.skills);
  const expLines = splitLines(cv.exp);
  const contact = [cv.email, cv.phone, cv.location].map((s) => s.trim()).filter(Boolean).join("   ·   ");

  const document = e(
    Document,
    null,
    e(
      Page,
      { size: "A4", style: styles.page },
      e(Text, { style: styles.name }, cv.name || "Your Name"),
      e(Text, { style: styles.role }, cv.role || "Target role"),
      contact ? e(Text, { style: styles.contactRow }, contact) : null,

      cv.summary
        ? e(
            View,
            null,
            e(Text, { style: styles.sectionLabel }, "SUMMARY"),
            e(Text, { style: styles.summaryText }, cv.summary)
          )
        : null,

      skills.length
        ? e(
            View,
            null,
            e(Text, { style: styles.sectionLabel }, "SKILLS"),
            e(
              View,
              { style: styles.skillsRow },
              ...skills.map((s, i) => e(Text, { key: i, style: styles.skillChip }, s))
            )
          )
        : null,

      expLines.length
        ? e(
            View,
            null,
            e(Text, { style: styles.sectionLabel }, "EXPERIENCE"),
            ...expLines.map((line, i) => e(Text, { key: i, style: styles.expLine }, `•  ${line}`))
          )
        : null
    )
  );

  return renderToBuffer(document);
}

// ---- DOCX (via docx — real OOXML, opens natively in Word) ----

export async function renderCvDocx(cv: CvExportInput): Promise<Buffer> {
  const skills = splitList(cv.skills);
  const expLines = splitLines(cv.exp);
  const contact = [cv.email, cv.phone, cv.location].map((s) => s.trim()).filter(Boolean).join("   |   ");

  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: cv.name || "Your Name", bold: true })],
    }),
    new Paragraph({
      children: [new TextRun({ text: cv.role || "Target role", color: "5B6B64" })],
      spacing: { after: contact ? 60 : 200 },
    }),
  ];

  if (contact) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: contact, size: 18, color: "5B6B64" })],
        spacing: { after: 240 },
      })
    );
  }

  if (cv.summary.trim()) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Summary", spacing: { before: 120 } }),
      new Paragraph({ text: cv.summary.trim(), spacing: { after: 120 } })
    );
  }

  if (skills.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Skills", spacing: { before: 120 } }));
    for (const skill of skills) {
      children.push(new Paragraph({ text: skill, bullet: { level: 0 } }));
    }
  }

  if (expLines.length) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, text: "Experience", spacing: { before: 200 } })
    );
    for (const line of expLines) {
      children.push(new Paragraph({ text: line, bullet: { level: 0 } }));
    }
  }

  const doc = new DocxDocument({
    sections: [{ properties: {}, children }],
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
        heading2: { run: { color: "0F766E", bold: true, size: 22 }, paragraph: { alignment: AlignmentType.LEFT } },
      },
    },
  });

  return Packer.toBuffer(doc);
}
