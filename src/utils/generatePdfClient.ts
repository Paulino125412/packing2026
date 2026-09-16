import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export interface GeneratePdfOptions {
  filename?: string;
  marginMm?: number;
  scale?: number;
}

/**
 * Generates a high-quality PDF Blob directly in the user's browser using html2canvas-pro and jsPDF.
 * Renders in a dedicated 800px fixed-width offscreen container with explicit CSS borders
 * to avoid mobile viewport distortions or missing table borders.
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: GeneratePdfOptions = {}
): Promise<Blob> {
  const {
    marginMm = 8,
    scale = 2, // 2x resolution (high definition retina quality)
  } = options;

  // Create an offscreen wrapper with exact fixed width (800px matches standard printable A4 width at 96 DPI)
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.top = '-99999px';
  wrapper.style.left = '-99999px';
  wrapper.style.width = '800px';
  wrapper.style.padding = '0';
  wrapper.style.margin = '0';
  wrapper.style.backgroundColor = '#ffffff';
  wrapper.style.zIndex = '-99999';
  wrapper.style.boxSizing = 'border-box';

  // Inject explicit CSS styles to guarantee table borders and clear printing
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    .pdf-render-wrapper * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .pdf-render-wrapper table {
      width: 100% !important;
      border-collapse: collapse !important;
      border: 1.5px solid #000000 !important;
    }
    .pdf-render-wrapper th {
      background-color: #e5e7eb !important;
      border: 1px solid #000000 !important;
      color: #000000 !important;
    }
    .pdf-render-wrapper td {
      border: 1px solid #000000 !important;
      color: #000000 !important;
    }
    .pdf-render-wrapper .border-r {
      border-right: 1px solid #000000 !important;
    }
    .pdf-render-wrapper .border-b {
      border-bottom: 1px solid #000000 !important;
    }
    .pdf-render-wrapper .border-dotted {
      border-bottom: 1px dotted #000000 !important;
    }
    .pdf-render-wrapper .border-dashed {
      border-bottom: 1px dashed #6b7280 !important;
    }
    .pdf-render-wrapper .blank-ficha-half,
    .pdf-render-wrapper .sales-ficha-half {
      width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
      box-sizing: border-box !important;
    }
  `;
  wrapper.className = 'pdf-render-wrapper';
  wrapper.appendChild(styleTag);

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = '800px';
  clone.style.maxWidth = '800px';
  clone.style.margin = '0';
  clone.style.backgroundColor = '#ffffff';

  // Handle double-mode half-sheet symmetry if present
  const halves = clone.querySelectorAll<HTMLElement>('.blank-ficha-half, .sales-ficha-half');
  if (halves.length === 2) {
    clone.style.height = '1131px';
    clone.style.minHeight = '1131px';
    clone.style.maxHeight = '1131px';
    clone.style.display = 'flex';
    clone.style.flexDirection = 'column';
    clone.style.justifyContent = 'space-between';
    halves.forEach((half) => {
      half.style.width = '100%';
      half.style.height = '565.5px';
      half.style.minHeight = '565.5px';
      half.style.maxHeight = '565.5px';
      half.style.display = 'flex';
      half.style.flexDirection = 'column';
      half.style.justifyContent = 'center';
      half.style.alignItems = 'center';
      half.style.boxSizing = 'border-box';
    });
  }

  wrapper.appendChild(clone);

  document.body.appendChild(wrapper);

  try {
    // Render element to high-resolution canvas using html2canvas-pro
    const canvas = await html2canvas(clone, {
      scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 800,
      width: 800,
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
    const contentWidth = pageWidth - (marginMm * 2);
    const contentHeight = (canvas.height * contentWidth) / canvas.width;
    const maxUsableHeight = pageHeight - (marginMm * 2);

    if (contentHeight <= maxUsableHeight + 2) {
      // Fits comfortably on 1 page (top half or full A4 page with proper aspect ratio)
      const renderHeight = Math.min(contentHeight, maxUsableHeight);
      pdf.addImage(imgData, 'JPEG', marginMm, marginMm, contentWidth, renderHeight, undefined, 'FAST');
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
  } finally {
    if (document.body.contains(wrapper)) {
      document.body.removeChild(wrapper);
    }
  }
}


