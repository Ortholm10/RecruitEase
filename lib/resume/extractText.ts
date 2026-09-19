// PDF.js used directly (no third-party resume parser — see licensing note in
// the build plan). Runs server-side only; pdfjs-dist is in
// serverExternalPackages so Node loads it natively instead of Turbopack.

const MAX_PAGES = 20;

/** Plain text of every page, lines kept, pages separated by a blank line.
 *  Whatever this returns is what gets stored as candidates.resume_text, and
 *  every Evidence offset is an index into exactly that string. */
export async function extractText(pdf: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Hand PDF.js its worker in-process; otherwise it tries to import
  // GlobalWorkerOptions.workerSrc, which fails under Next.js.
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error pdfjs-dist ships no types for the worker entry
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");

  const task = pdfjs.getDocument({ data: pdf });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    // Resumes are short; don't let a 10 MB, thousand-page PDF pin the server.
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      pages.push(
        items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join(""),
      );
    }
    // Postgres text columns reject NUL; some PDFs emit it.
    return pages.join("\n\n").replace(/\u0000/g, "").trim();
  } finally {
    await task.destroy(); // v6: cleanup lives on the loading task
  }
}
