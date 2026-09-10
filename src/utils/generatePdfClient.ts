import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export interface GeneratePdfOptions {
  filename?: string;
  marginMm?: number;
  scale?: number;
}

/**
 * Generates a high-quality PDF Blob directly in the user's browser using html2canvas-pro and jsPDF.
 * html2canvas-pro supports modern CSS (oklch, color-mix, CSS variables used by Tailwind CSS v4)
 * and runs client-side with 0 server dependencies.
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: GeneratePdfOptions = {}
): Promise<Blob> {
  const {
    marginMm = 5,
    scale = 2, // 2x resolution (high definition retina quality)
  } = options;

  // Render element to high-resolution canvas using html2canvas-pro
  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    logging: false,
    backgroundColor: '#ffffff',
    windowWidth: element.scrollWidth || 800,
    windowHeight: element.scrollHeight || 1000,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.98);

  // Standard A4 dimensions in mm: 210 x 297
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - (marginMm * 2); // 200 mm
  const contentHeight = (canvas.height * contentWidth) / canvas.width;

  if (contentHeight <= (pageHeight - (marginMm * 2))) {
    // Fits comfortably on 1 page (A4 or half A4)
    pdf.addImage(imgData, 'JPEG', marginMm, marginMm, contentWidth, contentHeight, undefined, 'FAST');
  } else {
    // Multi-page handling if content is taller than A4
    let heightLeft = contentHeight;
    let position = marginMm;
    const pageUsableHeight = pageHeight - (marginMm * 2);

    pdf.addImage(imgData, 'JPEG', marginMm, position, contentWidth, contentHeight, undefined, 'FAST');
    heightLeft -= pageUsableHeight;

    while (heightLeft > 0) {
      position -= pageUsableHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', marginMm, position, contentWidth, contentHeight, undefined, 'FAST');
      heightLeft -= pageUsableHeight;
    }
  }

  return pdf.output('blob');
}

