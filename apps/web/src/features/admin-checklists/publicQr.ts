import qrcode from 'qrcode-generator';

/** PR 466: the QR code of a link, drawn in the browser (no external service, nothing about the sheet leaves the page). */

const QUIET_ZONE = 4;
const CAPTION_ROWS = 5;
const CAPTION_MAX = 48;

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function qrModules(url: string): boolean[][] {
  // Type 0 = the smallest version that fits; M corrects about 15% damage, enough for a printed sheet.
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (_, column) => qr.isDark(row, column)));
}

/** SVG markup of the code, one path for all dark modules. With a caption the sheet's name sits under the code for printing. */
export function qrSvg(url: string, options: { caption?: string; label?: string } = {}): string {
  const modules = qrModules(url);
  const size = modules.length + QUIET_ZONE * 2;
  const caption = options.caption?.replace(/\s+/g, ' ').trim().slice(0, CAPTION_MAX);
  const height = size + (caption ? CAPTION_ROWS : 0);
  const path = modules.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`] : []))).join('');
  const text = caption
    ? `<text x="${size / 2}" y="${size + 2.6}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="2.2" fill="#000">${escapeXml(caption)}</text>`
    : '';
  const label = options.label ? ` role="img" aria-label="${escapeXml(options.label)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${height}" width="${size * 8}" height="${height * 8}" shape-rendering="crispEdges"${label}><rect width="${size}" height="${height}" fill="#fff"/><path d="${path}" fill="#000"/>${text}</svg>`;
}

/** File name for a download: the sheet's title made safe, never empty. */
export function qrFileName(title: string, extension: 'png' | 'svg'): string {
  const base = title.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base || 'checklist'}-qr.${extension}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadQrSvg(url: string, title: string) {
  saveBlob(new Blob([qrSvg(url, { caption: title })], { type: 'image/svg+xml;charset=utf-8' }), qrFileName(title, 'svg'));
}

/** PNG at 1024 px wide: the SVG is painted onto a canvas in the browser. */
export async function downloadQrPng(url: string, title: string): Promise<void> {
  const svg = qrSvg(url, { caption: title });
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('QR image failed to load')); });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await loaded;
  const width = 1024;
  const ratio = (image.naturalHeight || 1) / (image.naturalWidth || 1);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * ratio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG could not be created');
  saveBlob(blob, qrFileName(title, 'png'));
}
