import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

export interface GeneratePdfOptions {
  filename?: string;
  marginMm?: number;
  scale?: number;
}

/**
 * Converts an image URL (relative or CORS-enabled absolute) to a Base64 data URL.
 * Inlining images prevents any cross-origin tainting of the HTML5 Canvas during PDF export.
 */
async function toDataUrlSafe(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:image/')) return src;

  try {
    const res = await fetch(src, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // If fetch failed due to CORS or network, attempt in-memory canvas conversion with anonymous crossOrigin
    try {
      return await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            // Tainted canvas during fallback - safely return null
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = src;
      });
    } catch {
      return null;
    }
  }
}

/**
 * Inlines all image sources inside the cloned container into safe data URLs and waits for
 * all image elements to complete decoding before html2canvas captures the DOM.
 */
async function inlineAndPrepareImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  
  await Promise.all(
    images.map(async (img) => {
      img.crossOrigin = 'anonymous';

      if (img.src && !img.src.startsWith('data:')) {
        const dataUrl = await toDataUrlSafe(img.src);
        if (dataUrl) {
          img.src = dataUrl;
          if (img.srcset) {
            img.removeAttribute('srcset');
          }
        }
      }

      if (img.complete) {
        if (typeof img.decode === 'function') {
          try {
            await img.decode();
          } catch {
            // Non-critical decoding warning
          }
        }
      } else {
        await new Promise<void>((resolve) => {
          const finish = () => resolve();
          img.onload = finish;
          img.onerror = finish;
          setTimeout(finish, 3500); // 3.5s timeout safety guard
        });
      }
    })
  );
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
  wrapper.style.visibility = 'visible';

  // Inject explicit CSS styles to guarantee clean typography, table borders, and clear printing
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    .pdf-render-wrapper,
    .pdf-render-wrapper * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
      visibility: visible !important;
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
      justify-content: flex-start !important;
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
  clone.style.overflow = 'visible';

  // Wait for fonts to be ready if supported
  if (typeof document !== 'undefined' && (document as any).fonts && (document as any).fonts.ready) {
    try {
      await (document as any).fonts.ready;
    } catch {
      // Non-blocking font wait
    }
  }

  // Pre-process and inline any image/logo assets to prevent CORS taint errors
  await inlineAndPrepareImages(clone);

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
      half.style.overflow = 'visible';
    });
  } else if (halves.length === 1) {
    clone.style.height = 'auto';
    clone.style.minHeight = 'auto';
    clone.style.maxHeight = 'none';
    halves[0].style.width = '100%';
    halves[0].style.height = 'auto';
    halves[0].style.maxHeight = 'none';
    halves[0].style.overflow = 'visible';
  } else {
    clone.style.height = 'auto';
    clone.style.minHeight = 'auto';
    clone.style.maxHeight = 'none';
  }

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // Render element to high-resolution canvas using html2canvas-pro
    // allowTaint MUST be false so canvas.toDataURL() never throws SecurityError
    const canvas = await html2canvas(clone, {
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 800,
      width: 800,
      imageTimeout: 15000,
    });

    let imgData: string;
    try {
      imgData = canvas.toDataURL('image/jpeg', 0.98);
    } catch (exportErr: any) {
      const isSecurityError =
        exportErr?.name === 'SecurityError' ||
        /tainted|security/i.test(exportErr?.message || '');

      if (isSecurityError) {
        throw new Error(
          'No se pudo exportar el PDF porque el documento contiene imágenes con restricciones de seguridad CORS. Asegúrese de que las imágenes provengan del mismo servidor o tengan habilitado el encabezado Cross-Origin.'
        );
      }
      throw new Error(`Error al exportar la imagen del documento: ${exportErr?.message || exportErr}`);
    }

    if (!imgData || imgData === 'data:,' || imgData.length < 100) {
      throw new Error('El renderizado del documento no produjo una imagen válida para el PDF.');
    }

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

    const isSalesOrderFicha =
      clone.classList.contains('sales-ficha-print-container') ||
      clone.classList.contains('sales-ficha-print-sheet') ||
      !!clone.querySelector('.sales-ficha-print-sheet');

    if (isSalesOrderFicha) {
      // Sales order sheets are strictly 1-page A4 documents (either single 1/2 top-half or double full A4)
      const renderHeight = contentHeight > maxUsableHeight ? maxUsableHeight : contentHeight;
      pdf.addImage(imgData, 'JPEG', marginMm, marginMm, contentWidth, renderHeight, undefined, 'FAST');
    } else if (contentHeight <= maxUsableHeight + 2) {
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


