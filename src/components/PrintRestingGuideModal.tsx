import React, { useState } from 'react';
import { Printer, X, Clock, Copy, Scissors } from 'lucide-react';

interface PrintRestingGuideModalProps {
  onClose: () => void;
}

export default function PrintRestingGuideModal({ onClose }: PrintRestingGuideModalProps) {
  // Option to print 1 copy (top half) or 2 copies (both halves of the A4 portrait sheet)
  const [doubleCopy, setDoubleCopy] = useState(true);

  const handlePrint = () => {
    window.print();
  };

  const GuideCard = ({ copyNumber }: { copyNumber?: number }) => (
    <div 
      className="resting-guide-card w-full bg-white text-[#000000] border-2 border-[#0c2340] rounded-none p-4 sm:p-5 flex flex-col justify-between shadow-xs font-sans print:border-2 print:border-[#0c2340]"
      style={{ backgroundColor: '#ffffff' }}
    >
      {/* Header with Title and JUDITEX Logo */}
      <div className="flex justify-between items-start mb-3 gap-3">
        <div className="space-y-0.5">
          <h1 className="text-base sm:text-lg font-black text-[#000000] tracking-tight uppercase leading-tight">
            TIEMPO DE REPOSO:
          </h1>
          <p className="text-xs sm:text-sm font-bold text-[#111827]">
            Tiempo recomendado de reposo por tipo de tela
          </p>
        </div>

        {/* Official Juditex Logo */}
        <div className="shrink-0 flex items-center justify-end">
          <img 
            src="/logo-juditex.png" 
            alt="JUDITEX" 
            className="h-13 sm:h-16 md:h-18 max-h-[68px] w-auto object-contain print:h-14 print:max-h-[58px] print:opacity-100" 
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Master Table */}
      <div className="overflow-hidden border border-[#0c2340] mb-3 shadow-xs bg-white">
        <table className="w-full border-collapse text-left text-[11px] sm:text-xs bg-white">
          <thead>
            <tr className="bg-[#0c2340] text-white">
              <th className="py-2 px-2.5 sm:px-3 font-bold border-r border-[#0c2340] w-[25%] text-xs sm:text-sm">
                Tipo de tela
              </th>
              <th className="py-2 px-2.5 sm:px-3 font-bold border-r border-[#0c2340] w-[30%] text-xs sm:text-sm">
                Tiempo recomendado
              </th>
              <th className="py-2 px-2.5 sm:px-3 font-bold w-[45%] text-xs sm:text-sm">
                Motivo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0c2340] bg-white font-medium">
            {/* Row 1 */}
            <tr className="border-b border-[#0c2340] bg-white">
              <td className="py-2 px-2.5 sm:px-3 font-extrabold text-[#000000] text-xs sm:text-sm border-r border-[#0c2340] align-middle">
                Rígidos
              </td>
              <td className="py-2 px-2.5 sm:px-3 text-[#000000] text-xs sm:text-sm border-r border-[#0c2340] align-middle font-semibold">
                8 - 12 horas
              </td>
              <td className="py-2 px-2.5 sm:px-3 text-[#000000] text-[11px] sm:text-xs leading-snug align-middle">
                Estabilizan la tensión del rollo.
              </td>
            </tr>

            {/* Row 2 */}
            <tr className="border-b border-[#0c2340] bg-white">
              <td className="py-2 px-2.5 sm:px-3 font-extrabold text-[#000000] text-xs sm:text-sm border-r border-[#0c2340] align-middle">
                Comfort
              </td>
              <td className="py-2 px-2.5 sm:px-3 text-[#000000] text-xs sm:text-sm border-r border-[#0c2340] align-middle font-semibold">
                12 - 24 horas
              </td>
              <td className="py-2 px-2.5 sm:px-3 text-[#000000] text-[11px] sm:text-xs leading-snug align-middle">
                Requieren relajación por presencia de elastano.
              </td>
            </tr>

            {/* Row 3 */}
            <tr className="border-b border-[#0c2340] bg-white">
              <td className="py-2 px-2.5 sm:px-3 font-extrabold text-[#000000] text-xs sm:text-sm border-r border-[#0c2340] align-middle">
                Stretch
              </td>
              <td className="py-2 px-2.5 sm:px-3 text-[#000000] text-xs sm:text-sm border-r border-[#0c2340] align-middle font-semibold">
                24 horas
              </td>
              <td className="py-2 px-2.5 sm:px-3 text-[#000000] text-[11px] sm:text-xs leading-snug align-middle">
                El elastano necesita tiempo para regresar a su estado natural.
              </td>
            </tr>

            {/* Row 4 */}
            <tr className="bg-white">
              <td className="py-2 px-2.5 sm:px-3 font-extrabold text-[#000000] text-xs sm:text-sm border-r border-[#0c2340] align-middle">
                High Stretch
              </td>
              <td className="py-2 px-2.5 sm:px-3 text-[#000000] text-xs sm:text-sm border-r border-[#0c2340] align-middle font-semibold">
                24 - 48 horas
              </td>
              <td className="py-2 px-2.5 sm:px-3 text-[#000000] text-[11px] sm:text-xs leading-snug align-middle">
                Mayor elasticidad = más riesgo de crecimiento o reducción después del corte.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Warning Footer in Bold Red */}
      <div className="text-center">
        <p className="text-red-600 font-extrabold text-[11px] sm:text-xs leading-tight tracking-tight">
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
      {/* Print Specific CSS: A4 Portrait (Vertical) */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm;
          }
          html, body {
            background: #ffffff !important;
            background-color: #ffffff !important;
            color: #000000 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
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
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
          }
          #resting-guide-sheet {
            box-shadow: none !important;
            margin: 0 auto !important;
            width: 100% !important;
            max-width: 190mm !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            background-color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .resting-guide-card {
            border: 2px solid #0c2340 !important;
            background-color: #ffffff !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Screen Control Bar (Hidden on print) */}
      <div className="w-full max-w-2xl bg-app-surface text-app-text border border-app-border rounded-t-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-lg no-print print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-app-primary/10 border border-app-primary/20 flex items-center justify-center text-app-primary">
            <Clock size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-app-text">Guía de Tiempo de Reposo (A4 Vertical)</h3>
            <p className="text-[11px] text-app-text/60">Formato Media Hoja Vertical con logo JUDITEX</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle 1 copy vs 2 copies (double per A4) */}
          <div className="flex items-center bg-app-bg p-0.5 rounded-lg border border-app-border text-xs">
            <button
              type="button"
              onClick={() => setDoubleCopy(false)}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer ${
                !doubleCopy ? 'bg-app-primary text-white font-bold shadow-xs' : 'text-app-text/70 hover:text-app-text'
              }`}
            >
              1 Copia (Media Hoja)
            </button>
            <button
              type="button"
              onClick={() => setDoubleCopy(true)}
              className={`px-2.5 py-1 rounded-md transition font-medium cursor-pointer flex items-center gap-1 ${
                doubleCopy ? 'bg-app-primary text-white font-bold shadow-xs' : 'text-app-text/70 hover:text-app-text'
              }`}
            >
              <Copy size={12} />
              2 Copias (1 Hoja A4)
            </button>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-app-primary hover:bg-app-primary/90 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer uppercase tracking-wider"
            id="btn-print-resting-guide"
          >
            <Printer size={14} />
            Imprimir
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

      {/* Printable Sheet Container (Simulates A4 Portrait) */}
      <div className="w-full max-w-2xl bg-slate-900/40 p-4 sm:p-6 flex justify-center rounded-b-xl no-print:shadow-2xl print:p-0 print:bg-transparent print:w-full">
        <div 
          id="resting-guide-sheet"
          className="w-full max-w-[650px] bg-white text-[#000000] p-4 sm:p-6 flex flex-col gap-4 shadow-xl font-sans print:p-0 print:gap-3"
          style={{ backgroundColor: '#ffffff' }}
        >
          {/* Card 1: Top Half of A4 */}
          <GuideCard copyNumber={1} />

          {/* If double copy is enabled, show cut line and Card 2 (Bottom Half) */}
          {doubleCopy && (
            <>
              {/* Scissors cut separator */}
              <div className="relative py-1 flex items-center justify-center my-1 print:my-2">
                <div className="border-t-2 border-dashed border-gray-400 w-full"></div>
                <div className="absolute bg-white px-2 text-gray-500 flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider">
                  <Scissors size={12} className="rotate-90" />
                  <span>Línea de corte (Media Hoja A4)</span>
                </div>
              </div>

              {/* Card 2: Bottom Half of A4 */}
              <GuideCard copyNumber={2} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
