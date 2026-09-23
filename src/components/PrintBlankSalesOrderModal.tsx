import React, { useState } from 'react';
import { Printer, X, FileText, FileDown } from 'lucide-react';
import AlertBanner from './AlertBanner';
import { generatePdfFromElement } from '../utils/generatePdfClient';

interface PrintBlankSalesOrderModalProps {
  onClose: () => void;
}

export const BLANK_SALES_FICHA_PRINT_CSS = `
  * {
    box-sizing: border-box !important;
  }
  .blank-ficha-card {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
    width: 100% !important;
    max-width: 198mm !important;
    box-sizing: border-box !important;
    padding: 1.5mm !important;
    margin: 0 auto !important;
  }
  .blank-ficha-card table {
    width: 100% !important;
    border-collapse: collapse !important;
    border: 1.5px solid #000000 !important;
    table-layout: fixed !important;
  }
  .blank-ficha-card thead tr {
    background-color: #e5e7eb !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .blank-ficha-card th {
    background-color: #e5e7eb !important;
    border: 1px solid #000000 !important;
    color: #000000 !important;
    font-weight: bold !important;
    text-align: center !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .blank-ficha-card td {
    border: 1px solid #000000 !important;
    color: #000000 !important;
    line-height: 1.3 !important;
  }
  .blank-ficha-half {
    width: 100% !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    justify-content: flex-start !important;
    align-items: center !important;
  }

  @media print {
    @page {
      size: 210mm 297mm;
      margin: 0;
    }
    html, body {
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 210mm !important;
      height: 297mm !important;
      overflow: hidden !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body * {
      visibility: hidden !important;
    }
    #blank-sales-order-modal,
    #blank-sales-order-modal *,
    #blank-sales-ficha-print-area,
    #blank-sales-ficha-print-area *,
    #print-section,
    #print-section * {
      visibility: visible !important;
    }
    #blank-sales-order-modal {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background: #ffffff !important;
      padding: 0 !important;
      margin: 0 !important;
      display: block !important;
    }
    #blank-sales-ficha-print-area {
      box-shadow: none !important;
      margin: 0 auto !important;
      width: 210mm !important;
      max-width: 210mm !important;
      background-color: #ffffff !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 0 !important;
      padding: 0 !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    #blank-sales-ficha-print-area.is-double-mode {
      height: 297mm !important;
      max-height: 297mm !important;
      justify-content: space-between !important;
    }
    #blank-sales-ficha-print-area.is-single-mode {
      height: 148.5mm !important;
      max-height: 148.5mm !important;
      justify-content: flex-start !important;
    }
    .blank-ficha-half {
      width: 100% !important;
      box-sizing: border-box !important;
      padding: 0 4mm !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      flex-shrink: 0 !important;
    }
    .is-double-mode .blank-ficha-half {
      height: 148.5mm !important;
      max-height: 148.5mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: center !important;
      align-items: center !important;
    }
    .is-single-mode .blank-ficha-half {
      height: 148.5mm !important;
      max-height: 148.5mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
      align-items: center !important;
      padding-top: 4mm !important;
    }
    .blank-ficha-card {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  }
`;

export default function PrintBlankSalesOrderModal({ onClose }: PrintBlankSalesOrderModalProps) {
  // Mode: 'single' = 1 Ficha (Parte Superior / 1/2 A4)
  //       'double' = 2 Fichas (Superior e Inferior / A4 Completa)
  const [printMode, setPrintMode] = useState<'single' | 'double'>('double');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (isGeneratingPDF) return;
    const element = document.querySelector('#blank-sales-ficha-print-area') as HTMLElement;
    if (!element) return;

    try {
      setPdfError(null);
      setIsGeneratingPDF(true);
      const filename = `Ficha_de_Venta_en_Blanco_${printMode === 'double' ? '2_Partes_A4' : 'Parte_Superior'}.pdf`;

      // Generación directa y confiable en cliente (HTML2Canvas + jsPDF)
      const pdfBlob = await generatePdfFromElement(element, { filename, marginMm: 4 });

      const blobUrl = URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {}
      }, 45000);
    } catch (err: any) {
      console.error('Error al generar PDF:', err);
      const isSecurityError = /CORS|seguridad|tainted/i.test(err?.message || '');
      const userMessage = isSecurityError
        ? `${err.message} Como alternativa, puede hacer clic en "Imprimir A4" y elegir "Guardar como PDF".`
        : (err?.message || 'No se pudo generar el archivo PDF. Puede usar el botón "Imprimir A4" para guardarlo como PDF.');
      setPdfError(userMessage);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Reusable Single Blank Ficha Card
  const BlankFichaCard = () => (
    <div className="blank-ficha-card w-full bg-white text-black font-sans text-[10.5px] leading-tight p-2 max-w-[200mm] mx-auto select-none print:p-1.5 print:max-w-none">
      {/* 1. Header Title */}
      <div className="text-center font-bold text-sm sm:text-base text-black mb-1 flex items-baseline justify-center">
        <span>Ficha de Venta Cliente N°</span>
        <span className="w-32 border-b border-black ml-1.5" />
      </div>

      {/* 2. Top Sub-header */}
      <div className="flex justify-between items-center text-[10.5px] mb-1 px-0.5 font-normal text-black gap-2">
        <div className="flex items-baseline flex-1 min-w-0">
          <span className="font-normal whitespace-nowrap">Nombre del ejecutor de ventas:</span>
          <span className="flex-1 ml-1" />
        </div>
        <div className="flex items-baseline shrink-0 min-w-[130px]">
          <span className="font-normal whitespace-nowrap">Fecha:</span>
          <span className="ml-1" />
        </div>
      </div>

      {/* 3. Items & Info Master Table Grid */}
      <table className="w-full table-fixed border-collapse border border-black text-[10px] mb-1.5 text-black">
        <thead>
          <tr className="border-b border-black font-bold text-[9.5px]" style={{ backgroundColor: '#e5e7eb' }}>
            <th className="border-r border-black py-0.5 px-1 text-center font-bold w-[10%] align-middle">Código</th>
            <th className="border-r border-black py-0.5 px-1 text-center font-bold w-[40%] align-middle">Descripción</th>
            <th className="border-r border-black py-0.5 px-1 text-center font-bold w-[11%] leading-tight align-middle">
              Precio<br />Unitario
            </th>
            <th className="border-r border-black py-0.5 px-1 text-center font-bold w-[11%] leading-tight align-middle">
              Cantidad<br />solicitada
            </th>
            <th className="border-r border-black py-0.5 px-1 text-center font-bold w-[11%] leading-tight align-middle">
              Cantidad<br />despachada
            </th>
            <th className="py-0.5 px-1 text-center font-bold w-[17%] leading-tight align-middle">
              Importe<br />total
            </th>
          </tr>
        </thead>
        <tbody>
          {/* 3 Blank Product Rows for handwriting */}
          {[1, 2, 3].map((rowIdx) => (
            <tr key={rowIdx} className="border-b border-black h-7">
              <td className="border-r border-black p-1 text-center font-mono"></td>
              <td className="border-r border-black p-1"></td>
              <td className="border-r border-black p-1 text-right font-mono"></td>
              <td className="border-r border-black p-1 text-right font-mono"></td>
              <td className="border-r border-black p-1 text-right font-mono"></td>
              <td className="p-1 text-right font-mono"></td>
            </tr>
          ))}

          {/* CLIENTE & TOTAL Row */}
          <tr className="border-b border-black h-6">
            <td colSpan={4} className="border-r border-black p-1 font-normal align-middle">
              <div className="flex items-baseline">
                <span className="font-normal whitespace-nowrap">CLIENTE:</span>
              </div>
            </td>
            <td colSpan={1} className="border-r border-black p-1 text-left font-normal align-middle">
              TOTAL
            </td>
            <td colSpan={1} className="p-1 text-left font-bold align-middle">
              <span className="font-normal text-[10px]">S/.</span>
            </td>
          </tr>

          {/* Dirección fiscal & RUC/DNI Row */}
          <tr className="border-b border-black h-6">
            <td colSpan={1} className="border-r border-black py-0.5 px-1 font-normal text-left leading-tight align-middle">
              Dirección fiscal
            </td>
            <td colSpan={3} className="border-r border-black py-0.5 px-1 font-bold align-middle">
            </td>
            <td colSpan={2} className="py-0.5 px-1 font-normal align-middle">
              <div className="flex items-baseline">
                <span className="font-normal whitespace-nowrap">RUC/DNI:</span>
              </div>
            </td>
          </tr>

          {/* Contacto de despacho Row */}
          <tr className="border-b border-black">
            <td colSpan={1} className="border-r border-black py-0.5 px-1 text-left font-normal leading-tight align-middle">
              Contacto de<br />despacho
            </td>
            <td colSpan={5} className="p-0 align-middle">
              <table className="w-full border-collapse text-[10px]">
                <tbody>
                  <tr className="border-b border-black h-5.5">
                    <td className="w-16 border-r border-black py-0.5 px-1 font-normal align-middle">Nombre:</td>
                    <td className="py-0.5 px-1 align-middle"></td>
                  </tr>
                  <tr className="h-5.5">
                    <td className="w-16 border-r border-black py-0.5 px-1 font-normal align-middle">Teléfono:</td>
                    <td className="py-0.5 px-1 align-middle"></td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>

          {/* Lugar de despacho & Número de piso Row */}
          <tr className="border-b border-black h-6">
            <td colSpan={1} className="border-r border-black py-0.5 px-1 text-left font-normal leading-tight align-middle">
              Lugar de despacho
            </td>
            <td colSpan={3} className="border-r border-black py-0.5 px-1 text-left font-bold align-middle">
            </td>
            <td colSpan={1} className="border-r border-black py-0.5 px-1 text-center font-normal align-middle">
              Número de piso
            </td>
            <td colSpan={1} className="py-0.5 px-1 text-center font-bold align-middle">
            </td>
          </tr>

          {/* Fecha de despacho & Hora de despacho Row */}
          <tr className="border-b border-black h-6">
            <td colSpan={1} className="border-r border-black py-0.5 px-1 text-left font-normal leading-tight align-middle">
              Fecha de despacho
            </td>
            <td colSpan={1} className="border-r border-black py-0.5 px-1 text-center font-normal align-middle">
            </td>
            <td colSpan={1} className="border-r border-black py-0.5 px-1 text-center font-normal leading-tight align-middle">
              Hora de despacho
            </td>
            <td colSpan={3} className="py-0.5 px-1 text-center font-bold align-middle">
            </td>
          </tr>

          {/* Forma de pago Row */}
          <tr className="border-b border-black h-6">
            <td colSpan={1} className="border-r border-black py-0.5 px-1 text-left font-normal leading-tight align-middle">
              Forma de pago
            </td>
            <td colSpan={5} className="py-0.5 px-1 text-left font-bold align-middle">
            </td>
          </tr>

          {/* Billing Split Row */}
          <tr>
            <td colSpan={6} className="p-0 align-top">
              <div className="flex w-full">
                {/* Left Sub-column */}
                <div className="w-[36%] border-r border-black p-1 align-top">
                  <div className="space-y-1.5 text-[9.5px]">
                    <div className="flex items-baseline overflow-hidden">
                      <span className="font-normal whitespace-nowrap">Importe facturado:(S/.)</span>
                    </div>
                    <div className="flex items-baseline overflow-hidden">
                      <span className="font-normal whitespace-nowrap">Nombre:</span>
                    </div>
                    <div className="flex items-baseline overflow-hidden">
                      <span className="font-normal whitespace-nowrap">RUC/DNI:</span>
                    </div>
                  </div>
                </div>

                {/* Right Sub-column */}
                <div className="w-[64%] p-1 align-top">
                  <div className="space-y-1.5 text-[9.5px]">
                    <div className="flex items-baseline overflow-hidden w-[58%] min-w-0">
                      <span className="font-normal whitespace-nowrap">Importe facturado:(S/.)</span>
                      <span className="flex-1 border-b border-black ml-1 min-w-[15px]" />
                    </div>
                    <div className="flex justify-between items-baseline gap-2 overflow-hidden">
                      <div className="flex items-baseline w-[58%] min-w-0">
                        <span className="font-normal whitespace-nowrap">Nombre:</span>
                        <span className="flex-1 border-b border-black ml-1 min-w-[15px]" />
                      </div>
                      <div className="flex items-baseline w-[42%] min-w-0">
                        <span className="font-normal whitespace-nowrap">Pendiente:</span>
                        <span className="flex-1 border-b border-black ml-1 min-w-[15px]" />
                      </div>
                    </div>
                    <div className="flex items-baseline overflow-hidden w-[58%] min-w-0">
                      <span className="font-normal whitespace-nowrap">RUC/DNI:</span>
                      <span className="flex-1 border-b border-black ml-1 min-w-[15px]" />
                    </div>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 4. Observaciones */}
      <div className="mt-1 px-0.5 text-[10px] text-black">
        <div className="flex items-baseline">
          <span className="font-normal whitespace-nowrap">Observaciones:</span>
          <span className="flex-1 border-b border-black ml-1" />
        </div>
      </div>

      {/* 5. (PARA SER LLENADO POR ALMACÉN) Section & PENDIENTE POR FACTURAR Box */}
      <div className="px-0.5 text-[9.5px] mt-1 text-black">
        <div className="flex w-full items-stretch justify-between gap-3">
          {/* Left Column: ALMACÉN section */}
          <div className="flex-1 flex flex-col justify-between">
            <div className="font-normal uppercase text-[9.5px] mb-0.5">
              (PARA SER LLENADO POR ALMACÉN)
            </div>

            <div className="grid grid-cols-2 gap-3 my-0.5">
              <div className="space-y-1.5">
                <div className="flex items-baseline overflow-hidden">
                  <span className="font-normal whitespace-nowrap">DEALER:</span>
                  <span className="flex-1 border-b border-black ml-1" />
                </div>
                <div className="flex items-baseline overflow-hidden pt-0.5">
                  <span className="font-normal whitespace-nowrap"># FACTURA:</span>
                  <span className="flex-1 border-b border-black ml-1" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-baseline overflow-hidden">
                  <span className="font-normal whitespace-nowrap">BOLÍVAR:</span>
                  <span className="flex-1 border-b border-black ml-1" />
                </div>
                <div className="flex items-baseline overflow-hidden pt-0.5">
                  <span className="font-normal whitespace-nowrap"># FACTURA:</span>
                  <span className="flex-1 border-b border-black ml-1" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: PENDIENTE POR FACTURAR Box */}
          <div className="border border-black p-1.5 space-y-1.5 bg-white w-[30%] min-w-[190px] shrink-0 flex flex-col justify-between">
            <div className="font-normal text-[9.5px] uppercase text-left">
              PENDIENTE POR FACTURAR
            </div>
            <div className="flex items-baseline overflow-hidden">
              <span className="font-normal whitespace-nowrap">DEALER:</span>
              <span className="flex-1 border-b border-black ml-1" />
            </div>
            <div className="flex items-baseline overflow-hidden">
              <span className="font-normal whitespace-nowrap">BOLÍVAR:</span>
              <span className="flex-1 border-b border-black ml-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      id="blank-sales-order-modal"
      className="fixed inset-0 bg-black/75 z-50 flex flex-col items-center justify-start overflow-y-auto p-2 sm:p-4 print:p-0 print:bg-white print:overflow-visible"
    >
      {/* Screen Control Bar (Hidden when printing) */}
      <div className="w-full max-w-4xl bg-app-surface text-app-text border border-app-border rounded-t-xl p-3 sm:p-4 flex flex-col gap-3 shadow-lg no-print print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-app-primary/10 border border-app-primary/20 flex items-center justify-center text-app-primary">
              <FileText size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-app-text">Ficha de Venta en Blanco</h3>
              <p className="text-[11px] text-app-text/60">Formato listo para impresión y llenado manual a lapicero</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode Selector: 1 Copia (Parte Superior) vs 2 Copias (Superior e Inferior) */}
            <div className="flex items-center bg-app-bg p-0.5 rounded-lg border border-app-border text-xs">
              <button
                type="button"
                onClick={() => setPrintMode('single')}
                className={`px-3 py-1.5 rounded-md transition font-medium cursor-pointer ${
                  printMode === 'single'
                    ? 'bg-app-primary text-white font-bold shadow-xs'
                    : 'text-app-text/70 hover:text-app-text'
                }`}
                title="Imprimir únicamente en la parte superior (1/2 Hoja A4)"
              >
                1 Copia (Parte Superior)
              </button>
              <button
                type="button"
                onClick={() => setPrintMode('double')}
                className={`px-3 py-1.5 rounded-md transition font-medium cursor-pointer ${
                  printMode === 'double'
                    ? 'bg-app-primary text-white font-bold shadow-xs'
                    : 'text-app-text/70 hover:text-app-text'
                }`}
                title="Imprimir dos fichas en una sola hoja A4 (Superior e Inferior)"
              >
                2 Copias (Superior e Inferior)
              </button>
            </div>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPDF}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Descargar Ficha en blanco en PDF"
              id="btn-download-pdf-blank-order"
            >
              <FileDown size={14} />
              {isGeneratingPDF ? 'Generando...' : 'Descargar PDF'}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold text-xs rounded flex items-center gap-1.5 transition shadow-xs cursor-pointer uppercase tracking-wider"
              id="btn-print-blank-order-action"
            >
              <Printer size={14} />
              Imprimir A4
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-app-text/60 hover:text-app-text hover:bg-app-bg rounded transition cursor-pointer border border-app-border"
              title="Cerrar"
              id="btn-close-blank-order-modal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {pdfError && (
          <AlertBanner
            type="error"
            message={pdfError}
            onClose={() => setPdfError(null)}
          />
        )}
      </div>

      {/* Printable Sheet Container (Simulates A4 Portrait Sheet) */}
      <div className="w-full max-w-4xl bg-slate-900/40 p-4 sm:p-6 flex justify-center rounded-b-xl no-print:shadow-2xl print:p-0 print:bg-transparent print:w-full">
        <div
          id="blank-sales-ficha-print-area"
          className={`is-${printMode}-mode w-full max-w-[760px] bg-white text-black flex flex-col justify-between shadow-xl font-sans print:p-0 print:shadow-none print:max-w-none print:w-full ${
            printMode === 'double'
              ? 'min-h-[1075px] h-[1075px] print:h-[297mm]'
              : 'min-h-[538px] print:h-[148.5mm]'
          }`}
          style={{ backgroundColor: '#ffffff' }}
        >
          {/* Half 1: Top Part */}
          <div className="blank-ficha-half w-full flex-1 flex flex-col justify-center items-center p-2 print:p-0">
            <BlankFichaCard />
          </div>

          {/* Optional Half 2: Bottom Part (Mode 'double') */}
          {printMode === 'double' && (
            <>
              {/* Guía de corte en el centro exacto de la hoja A4 */}
              <div className="w-full flex items-center justify-center my-0.5 select-none print:my-0">
                <div className="flex-1 border-b border-dashed border-gray-400 print:border-black" />
                <span className="px-2.5 text-[8.5px] font-mono text-gray-500 print:text-black uppercase tracking-widest flex items-center gap-1">
                  ✂ corte aquí
                </span>
                <div className="flex-1 border-b border-dashed border-gray-400 print:border-black" />
              </div>

              <div className="blank-ficha-half w-full flex-1 flex flex-col justify-center items-center p-2 print:p-0">
                <BlankFichaCard />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Print Specific CSS */}
      <style>{BLANK_SALES_FICHA_PRINT_CSS}</style>
    </div>
  );
}
