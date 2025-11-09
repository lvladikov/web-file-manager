/* helper to render a PDF page to an offscreen canvas using pdfjs-dist
   Returns a canvas element. */
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";

// Ensure workerSrc points to the copied worker file
if (
  pdfjsLib &&
  pdfjsLib.GlobalWorkerOptions &&
  !pdfjsLib.GlobalWorkerOptions.workerSrc
) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export async function renderPdfPageToCanvas(
  fileUrl,
  pageNumber = 1,
  targetWidth = 800
) {
  if (!fileUrl) throw new Error("fileUrl required");
  // pdfjs can accept a URL string or an object with {data: ArrayBuffer}.
  // Try the simple path first; if it fails (CORS or network), try fetching
  // the resource ourselves and pass the bytes to pdfjs.
  let loadingTask;
  try {
    loadingTask = pdfjsLib.getDocument(fileUrl);
  } catch (e) {
    // fallback to fetch below
  }

  if (!loadingTask) {
    // attempt to fetch the file bytes and pass as `data`
    const resp = await fetch(fileUrl);
    if (!resp.ok)
      throw new Error(`Failed to fetch PDF: ${resp.status} ${resp.statusText}`);
    const buffer = await resp.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: buffer });
  }

  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const devicePixelRatio =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const scale = (targetWidth * devicePixelRatio) / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(scaledViewport.width);
    canvas.height = Math.round(scaledViewport.height);
    // CSS pixel dimensions for the rendered image (what we want the image to occupy)
    const cssWidth = Math.round(targetWidth);
    const cssHeight = Math.round(scaledViewport.height / devicePixelRatio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    // Attach metadata so callers can set img width/height attributes and preserve
    // the exact aspect ratio when swapping the data URL into an <img>.
    canvas._cssWidth = cssWidth;
    canvas._cssHeight = cssHeight;
    canvas._pixelWidth = canvas.width;
    canvas._pixelHeight = canvas.height;

    const ctx = canvas.getContext("2d", { alpha: false });
    const renderTask = page.render({
      canvasContext: ctx,
      viewport: scaledViewport,
    });
    await renderTask.promise;
    return canvas;
  } finally {
    try {
      pdf.destroy();
    } catch (e) {}
  }
}

export async function getPdfNumPages(fileUrl) {
  if (!fileUrl) return null;
  let loadingTask;
  try {
    loadingTask = pdfjsLib.getDocument(fileUrl);
  } catch (e) {
    // fallback to fetch
  }
  if (!loadingTask) {
    const resp = await fetch(fileUrl);
    if (!resp.ok)
      throw new Error(`Failed to fetch PDF: ${resp.status} ${resp.statusText}`);
    const buffer = await resp.arrayBuffer();
    loadingTask = pdfjsLib.getDocument({ data: buffer });
  }
  const pdf = await loadingTask.promise;
  const pages = pdf.numPages;
  try {
    pdf.destroy();
  } catch (e) {}
  return pages;
}
