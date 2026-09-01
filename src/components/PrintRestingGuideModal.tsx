import React, { useState } from 'react';
import { Printer, X, Clock, Copy, Scissors } from 'lucide-react';

interface PrintRestingGuideModalProps {
  onClose: () => void;
}

export default function PrintRestingGuideModal({ onClose }: PrintRestingGuideModalProps) {
  // Option to print 3 copies (3 equal parts per A4), 2 copies (half A4), or 1 copy (1/3 A4)
  const [copiesCount, setCopiesCount] = useState<1 | 2 | 3>(3);

  const handlePrint = () => {
    window.print();
  };

  const GuideCard = ({ copyNumber }: { copyNumber?: number }) => (
    <div 
      className="resting-guide-card w-full bg-white text-[#000000] border-2 border-[#0c2340] rounded-none p-3 sm:p-4 flex flex-col justify-between shadow-2xs font-sans print:border-2 print:border-[#0c2340] print:p-2.5 print:shadow-none"
      style={{ backgroundColor: '#ffffff' }}
    >
      {/* Header with Title and JUDITEX Logo */}
      <div className="flex justify-between items-center mb-1 sm:mb-1.5 gap-2 print:mb-1">
        <div className="space-y-0.5">
          <h1 className="text-xs sm:text-sm md:text-base font-black text-[#000000] tracking-tight uppercase leading-tight print:text-[13px]">
            TIEMPO DE REPOSO:
          </h1>
          <p className="text-[10px] sm:text-xs font-bold text-[#111827] print:text-[10.5px] leading-tight">
            Tiempo recomendado de reposo por tipo de tela
          </p>
        </div>

        {/* Official Juditex Logo */}
        <div className="shrink-0 flex items-center justify-end">
          <img 
            src="/logo-juditex.png" 
            alt="JUDITEX" 
            className="h-8 sm:h-10 md:h-11 max-h-[42px] w-auto object-contain print:h-9 print:max-h-[38px] print:opacity-100" 
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Master Table */}
      <div className="overflow-hidden border border-[#0c2340] my-1 shadow-2xs bg-white print:my-0.5 print:border-[#0c2340] flex-1 flex flex-col justify-center">
        <table className="w-full h-full border-collapse text-left text-[10px] sm:text-[11px] print:text-[10px] bg-white">
          <thead>
            <tr className="bg-[#0c2340] text-white">
              <th className="py-1 px-2.5 font-bold border-r border-[#0c2340] w-[24%] text-[10px] sm:text-xs print:text-[10px] print:py-1">
                Tipo de tela
              </th>
              <th className="py-1 px-2.5 font-bold border-r border-[#0c2340] w-[28%] text-[10px] sm:text-xs print:text-[10px] print:py-1">
                Tiempo recomendado
              </th>
              <th className="py-1 px-2.5 font-bold w-[48%] text-[10px] sm:text-xs print:text-[10px] print:py-1">
                Motivo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0c2340] bg-white font-medium">
            {/* Row 1 */}
            <tr className="border-b border-[#0c2340] bg-white">
              <td className="py-1 px-2.5 font-extrabold text-[#000000] text-[10px] sm:text-xs print:text-[10px] border-r border-[#0c2340] align-middle print:py-1">
                Rígidos
              </td>
              <td className="py-1 px-2.5 text-[#000000] text-[10px] sm:text-xs print:text-[10px] border-r border-[#0c2340] align-middle font-semibold print:py-1">
                8 - 12 horas
              </td>
              <td className="py-1 px-2.5 text-[#000000] text-[9.5px] sm:text-[10.5px] print:text-[9.5px] leading-tight align-middle print:py-1">
                Estabilizan la tensión del rollo.
              </td>
            </tr>

            {/* Row 2 */}
            <tr className="border-b border-[#0c2340] bg-white">
              <td className="py-1 px-2.5 font-extrabold text-[#000000] text-[10px] sm:text-xs print:text-[10px] border-r border-[#0c2340] align-middle print:py-1">
                Comfort
              </td>
              <td className="py-1 px-2.5 text-[#000000] text-[10px] sm:text-xs print:text-[10px] border-r border-[#0c2340] align-middle font-semibold print:py-1">
                12 - 24 horas
              </td>
              <td className="py-1 px-2.5 text-[#000000] text-[9.5px] sm:text-[10.5px] print:text-[9.5px] leading-tight align-middle print:py-1">
                Requieren relajación por presencia de elastano.
              </td>
            </tr>

            {/* Row 3 */}
            <tr className="border-b border-[#0c2340] bg-white">
              <td className="py-1 px-2.5 font-extrabold text-[#000000] text-[10px] sm:text-xs print:text-[10px] border-r border-[#0c2340] align-middle print:py-1">
                Stretch
              </td>
              <td className="py-1 px-2.5 text-[#000000] text-[10px] sm:text-xs print:text-[10px] border-r border-[#0c2340] align-middle font-semibold print:py-1">
                24 horas
              </td>
              <td className="py-1 px-2.5 text-[#000000] text-[9.5px] sm:text-[10.5px] print:text-[9.5px] leading-tight align-middle print:py-1">
                El elastano necesita tiempo para regresar a su estado natural.
              </td>
            </tr>

            {/* Row 4 */}
            <tr className="bg-white">
              <td className="py-1 px-2.5 font-extrabold text-[#000000] text-[10px] sm:text-xs print:text-[10px] border-r border-[#0c2340] align-middle print:py-1">
                High Stretch
              </td>
              <td className="py-1 px-2.5 text-[#000000] text-[10px] sm:text-xs print:text-[10px] border-r border-[#0c2340] align-middle font-semibold print:py-1">
                24 - 48 horas
              </td>
              <td className="py-1 px-2.5 text-[#000000] text-[9.5px] sm:text-[10.5px] print:text-[9.5px] leading-tight align-middle print:py-1">
                Mayor elasticidad = más riesgo de crecimiento o reducción después del corte.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Warning Footer in Bold Red */}
      <div className="text-center pt-0.5">
        <p className="text-red-600 font-extrabold text-[9px] sm:text-[10px] print:text-[9px] leading-tight tracking-tight">
          Incluso con una excelente tela, si no se respeta el reposo, la confección puede fallar. La calidad final depende del proceso completo, no solo del textil
        </p>
      </div>
    </div>
  );

  return (
    <div 
      id="resting-guide-print-modal"
      className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex flex-col items-center justify-start overflow-y-auto p-3 sm:p-6 print:p-0 print:bg-white print:overflow-visible print:static"
    >
      {/* Print Specific CSS: A4 Portrait (Vertical) split in 3 equal parts filling the entire page */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 5mm 6mm;
          }
          html, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            height: 100% !important;
            min-height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #resting-guide-print-modal,
          #resting-guide-print-modal *,
          #resting-guide-sheet,
          #resting-guide-sheet * {
            visibility: visible !important;
          }
          #resting-guide-print-modal {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          #resting-guide-sheet {
            box-shadow: none !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 198mm !important;
            height: 285mm !important;
            min-height: 285mm !important;
            max-height: 285mm !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            background-color: #ffffff !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            gap: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .resting-guide-card {
            border: 2px solid #0c2340 !important;
            background-color: #ffffff !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            flex: 1 1 0 !important;
            min-height: 0 !important;
            height: auto !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            padding: 3mm 4mm !important;
          }
          .resting-cut-separator {
            height: 4.5mm !important;
            min-height: 4.5mm !important;
            max-height: 4.5mm !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 !important;
            padding: 0 !important;
            flex-shrink: 0 !important;
            box-sizing: border-box !important;
          }
        }
      `}</style>

      {/* Screen Control Bar (Hidden on print) */}
      <div className="w-full max-w-3xl bg-app-surface text-app-text border border-app-border rounded-t-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg no-print print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-app-primary/10 border border-app-primary/20 flex items-center justify-center text-app-primary">
            <Clock size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-app-text">Guía de Tiempo de Reposo (3 Partes en A4)</h3>
            <p className="text-[11px] text-app-text/60">Formato 3 partes iguales en 1 hoja A4 con logo JUDITEX</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle copies count (1, 2, or 3 per A4) */}
          <div className="flex items-center bg-app-bg p-0.5 rounded-lg border border-app-border text-xs">
            <button
              type="button"
              onClick={() => setCopiesCount(1)}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                copiesCount === 1 ? 'bg-app-primary text-white font-bold shadow-xs' : 'text-app-text/70 hover:text-app-text'
              }`}
            >
              1 Copia
            </button>
            <button
              type="button"
              onClick={() => setCopiesCount(2)}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                copiesCount === 2 ? 'bg-app-primary text-white font-bold shadow-xs' : 'text-app-text/70 hover:text-app-text'
              }`}
            >
              2 Copias
            </button>
            <button
              type="button"
              onClick={() => setCopiesCount(3)}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer flex items-center gap-1 ${
                copiesCount === 3 ? 'bg-app-primary text-white font-bold shadow-xs' : 'text-app-text/70 hover:text-app-text'
              }`}
            >
              <Copy size={12} />
              3 Copias (3 Partes A4)
            </button>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer uppercase tracking-wider"
            id="btn-print-resting-guide"
          >
            <Printer size={14} />
            Imprimir A4
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-app-text/60 hover:text-app-text hover:bg-app-bg rounded-lg transition cursor-pointer border border-app-border"
            title="Cerrar"
            id="btn-close-resting-guide"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Printable Sheet Container (Simulates A4 Portrait with 3 equal parts) */}
      <div className="w-full max-w-3xl bg-slate-900/40 p-4 sm:p-6 flex justify-center rounded-b-xl no-print:shadow-2xl print:p-0 print:bg-transparent print:w-full">
        <div 
          id="resting-guide-sheet"
          className={`w-full max-w-[700px] bg-white text-[#000000] p-4 sm:p-5 flex flex-col gap-3 shadow-xl font-sans print:p-0 print:gap-0 ${
            copiesCount === 3 ? 'min-h-[880px]' : copiesCount === 2 ? 'min-h-[600px]' : 'min-h-[300px]'
          }`}
          style={{ backgroundColor: '#ffffff' }}
        >
          {/* Card 1 */}
          <GuideCard copyNumber={1} />

          {/* Card 2 (if 2 or 3 copies) */}
          {copiesCount >= 2 && (
            <>
              {/* Scissors cut separator 1 */}
              <div className="resting-cut-separator relative py-1 flex items-center justify-center my-0.5 print:my-0">
                <div className="border-t-2 border-dashed border-gray-400 w-full"></div>
                <div className="absolute bg-white px-2 text-gray-500 flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider">
                  <Scissors size={11} className="rotate-90" />
                  <span>Línea de corte ({copiesCount === 3 ? '1/3 Hoja A4' : 'Media Hoja A4'})</span>
                </div>
              </div>

              <GuideCard copyNumber={2} />
            </>
          )}

          {/* Card 3 (if 3 copies) */}
          {copiesCount === 3 && (
            <>
              {/* Scissors cut separator 2 */}
              <div className="resting-cut-separator relative py-1 flex items-center justify-center my-0.5 print:my-0">
                <div className="border-t-2 border-dashed border-gray-400 w-full"></div>
                <div className="absolute bg-white px-2 text-gray-500 flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider">
                  <Scissors size={11} className="rotate-90" />
                  <span>Línea de corte (1/3 Hoja A4)</span>
                </div>
              </div>

              <GuideCard copyNumber={3} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

