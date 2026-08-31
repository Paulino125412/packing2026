import React, { useState } from 'react';
import { Plus, Trash2, QrCode } from 'lucide-react';
import { Article, Provider, RollItem, PackingList } from '../../types';
import { findRollInInventory, fetchAllPackingLists } from '../../firebase';
import { FormArticleGroup, FormRollEntry } from './types';
import ExcelPasteParser from './ExcelPasteParser';
import SearchableCombobox from '../SearchableCombobox';
import BarcodeScannerModal from '../BarcodeScannerModal';

interface ArticleGroupSectionProps {
  key?: React.Key;
  group: FormArticleGroup;
  index: number;
  articles: Article[];
  providers: Provider[];
  packingType: 'nuevo' | 'antiguo' | 'corte' | 'rollo';
  availableRolls: RollItem[];
  allInventory: RollItem[];
  packingLists: PackingList[];
  formProviderId: string;
  onRemove: (groupId: string) => void;
  onGroupFieldChange: (groupId: string, field: keyof FormArticleGroup, value: any) => void;
  onRollFieldChange: (groupId: string, rollId: string, field: keyof FormRollEntry, value: any) => void;
  onAddRoll: (groupId: string) => void;
  onRemoveRoll: (groupId: string, rollId: string) => void;
  onProcessUnifiedInput: (groupId: string, textToProcess: string, manualMapping?: { [colIdx: number]: string }) => void;
  onRollKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, groupId: string, rollIndex: number) => void;
  onAddNewArticle: (name: string, fields: Record<string, string>) => Promise<string>;
  onSwitchToCorte?: () => void;
  onAddScannedRoll: (groupId: string, scan: {
    rollNumber: string;
    meters?: number;
    lot?: string;
    partida?: string;
    tono?: string;
    width?: string;
    weight?: string;
    rollId?: string;
    maxMeters?: number;
  }) => void;
}

export default function ArticleGroupSection({
  group,
  index,
  articles,
  providers,
  packingType,
  availableRolls,
  allInventory,
  packingLists,
  formProviderId,
  onRemove,
  onGroupFieldChange,
  onRollFieldChange,
  onAddRoll,
  onRemoveRoll,
  onProcessUnifiedInput,
  onRollKeyDown,
  onAddNewArticle,
  onSwitchToCorte,
  onAddScannedRoll
}: ArticleGroupSectionProps) {
  const groupEffectiveProviderId = group.providerId || formProviderId;
  const pConfig = providers.find(p => p.id === groupEffectiveProviderId) || null;
  const isExcelOnly = pConfig && (pConfig.hasRollNo ?? true) && pConfig.hasWidth && pConfig.hasWeight;
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const currentArticleObj = articles.find(a => a.id === group.articleId || a.name === group.articleId);
  const effectiveArticleId = currentArticleObj ? currentArticleObj.id : group.articleId;

  const articleOptions = articles
    .filter(a => 
      !groupEffectiveProviderId || 
      a.providerId === groupEffectiveProviderId || 
      a.id === effectiveArticleId || 
      a.id === group.articleId || 
      a.name === group.articleId
    )
    .map(a => {
      const provName = providers.find(p => p.id === a.providerId)?.name || '';
      return {
        id: a.id,
        name: a.name,
        detail: provName
      };
    });

  if (group.articleId && !articleOptions.some(o => o.id === group.articleId || o.id === effectiveArticleId || o.name === group.articleId)) {
    articleOptions.unshift({
      id: group.articleId,
      name: currentArticleObj ? currentArticleObj.name : group.articleId,
      detail: ''
    });
  }

  const showLot = Boolean((pConfig?.hasLot) || group.rolls.some(r => !!r.lot) || group.source === 'custom');
  const showPartida = Boolean((pConfig?.hasPartida) || group.rolls.some(r => !!r.partida) || group.source === 'custom');
  const showTono = Boolean((pConfig?.hasTono) || group.rolls.some(r => !!r.tono) || group.source === 'custom');
  const showWidth = Boolean((pConfig?.hasWidth) || group.rolls.some(r => !!r.width) || group.source === 'custom');
  const showWeight = Boolean((pConfig?.hasWeight) || group.rolls.some(r => !!r.weight) || group.source === 'custom');
  const showExtraRowFields = showLot || showPartida || showTono || showWidth || showWeight;

  const groupTotalMeters = group.rolls.reduce((sum, r) => sum + (Number(r.meters) || 0), 0);
  const groupTotalWeight = group.rolls.reduce((sum, r) => {
    const wStr = (r.weight || '').toString().trim().replace(/,/g, '.').replace(/[^\d.-]/g, '');
    const wNum = parseFloat(wStr);
    return sum + (!isNaN(wNum) && isFinite(wNum) && wNum > 0 ? wNum : 0);
  }, 0);
  const groupTotalRolls = group.rolls.length;

  const handleOpenScanner = () => {
    if (!group.articleId) {
      alert("Debe seleccionar o agregar un Artículo primero antes de activar el escáner de la cámara.");
      return;
    }
    setIsScannerOpen(true);
  };

  const getModeInfo = () => {
    if (packingType === 'corte') {
      return {
        title: 'Sección de Cortes / Muestras',
        badgeColor: 'bg-app-primary text-white',
        border: 'border-app-border focus-within:border-app-primary/50',
        counterBadge: 'bg-app-bg text-app-text/80 border-app-border'
      };
    }
    if (packingType === 'antiguo') {
      return {
        title: 'Sección de Artículo (Histórico)',
        badgeColor: 'bg-app-primary text-white',
        border: 'border-app-border focus-within:border-app-primary/50',
        counterBadge: 'bg-app-bg text-app-text/80 border-app-border'
      };
    }
    return {
      title: 'Sección de Artículo',
      badgeColor: 'bg-app-primary text-white',
      border: 'border-app-border focus-within:border-app-primary/50',
      counterBadge: 'bg-app-bg text-app-text/80 border-app-border'
    };
  };

  const modeInfo = getModeInfo();

  return (
    <div className="p-3 sm:p-5 border border-app-border hover:border-app-border/80 rounded-xl bg-app-surface shadow-xs space-y-3.5 sm:space-y-4 relative group transition-colors">
      
      {/* Absolute remove article section button */}
      <button
        type="button"
        onClick={() => onRemove(group.id)}
        className="absolute top-3 right-3 text-app-text/45 hover:text-red-500 p-2 md:p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer min-h-[40px] min-w-[40px] flex items-center justify-center bg-app-surface/80 border border-app-border md:border-none"
        title="Eliminar esta sección de artículo completa"
      >
        <Trash2 size={18} />
      </button>

      {/* Section Header */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 pr-10">
        <span className="w-6 h-6 rounded-full bg-app-primary text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
          {index + 1}
        </span>
        <h4 className="text-xs font-bold text-app-text uppercase tracking-wider mr-1">
          {modeInfo.title}
        </h4>

        {groupTotalRolls > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-mono font-medium bg-app-bg text-app-text/80 border-app-border">
            {groupTotalRolls} {packingType === 'corte' ? 'cortes' : 'rollos'} • {groupTotalMeters.toFixed(2)}m{groupTotalWeight > 0 ? ` • ${groupTotalWeight.toFixed(2)}kg` : ''}
          </span>
        )}

        {/* Stock Pick vs Direct Entry */}
        {(packingType === 'nuevo' || packingType === 'rollo') && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
            <div className="flex bg-app-bg p-1 rounded-lg border border-app-border text-xs md:text-[10px] font-bold w-full sm:w-auto">
              <button
                type="button"
                onClick={() => onGroupFieldChange(group.id, 'source', 'inventory')}
                className={`px-3 py-2 md:px-2 md:py-0.5 rounded-md cursor-pointer transition min-h-[38px] md:min-h-0 flex-1 sm:flex-none text-center flex items-center justify-center ${group.source === 'inventory' ? 'bg-app-surface text-app-text shadow-xs' : 'text-app-text/50'}`}
              >
                Pick Almacén (Stock)
              </button>
              <button
                type="button"
                onClick={() => onGroupFieldChange(group.id, 'source', 'custom')}
                className={`px-3 py-2 md:px-2 md:py-0.5 rounded-md cursor-pointer transition min-h-[38px] md:min-h-0 flex-1 sm:flex-none text-center flex items-center justify-center ${group.source === 'custom' ? 'bg-app-surface text-app-text shadow-xs' : 'text-app-text/50'}`}
              >
                Ingreso Directo
              </button>
            </div>
            <p className="text-[10px] sm:text-[11px] text-app-text/50 font-normal">
              {group.source === 'inventory' ? 'Elige rollo registrado' : 'Datos libres / manuales'}
            </p>
          </div>
        )}
      </div>

      {/* Article and Provider selection fields */}
      <div className="grid grid-cols-1 gap-4">
        {group.source === 'custom' ? (
          <div>
            <SearchableCombobox
              label="Agregar Artículos *"
              placeholder="Buscar o registrar Artículo..."
              value={effectiveArticleId || group.articleId}
              onChange={val => onGroupFieldChange(group.id, 'articleId', val)}
              options={articleOptions}
              addNewText="Agregar Nuevo Artículo"
              onAddNewWithFields={onAddNewArticle}
              additionalFields={[
                { key: 'description', label: 'Descripción', placeholder: 'Ingrese descripción (Opcional)' }
              ]}
            />
          </div>
        ) : (
          <div>
            <SearchableCombobox
              label="Artículo del Despacho (Pick de Almacén) *"
              placeholder="Buscar Artículo en Almacén..."
              value={effectiveArticleId || group.articleId}
              onChange={val => {
                const selectedArt = articles.find(a => a.id === val || a.name === val);
                if (selectedArt) {
                  onGroupFieldChange(group.id, 'providerId', selectedArt.providerId);
                  onGroupFieldChange(group.id, 'articleId', selectedArt.id);
                } else {
                  onGroupFieldChange(group.id, 'articleId', val);
                }
              }}
              options={articleOptions}
            />
          </div>
        )}
      </div>

      {/* Dynamic fields (Lote, Partida, Tono) depending on Custom config */}
      {/* Optional Shared Lote, Partida, Tono for Nuevo or Rollo with custom source */}
      {(packingType === 'nuevo' || packingType === 'rollo') && group.source === 'custom' && pConfig && (pConfig.hasLot || pConfig.hasPartida || pConfig.hasTono) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-app-bg p-3 rounded-lg border border-app-border">
          {pConfig.hasLot && (
            <div>
              <label className="block text-xs md:text-[10px] font-bold text-app-text/80 mb-1 uppercase">
                Lote (Compartido)
              </label>
              <input
                type="text"
                placeholder="Ingrese Lote para el grupo"
                value={group.lot}
                onChange={e => onGroupFieldChange(group.id, 'lot', e.target.value)}
                className="w-full px-3 py-2 md:py-1.5 border border-app-input-border rounded-lg text-xs font-mono bg-app-input-bg text-app-text min-h-[40px] md:min-h-0"
              />
            </div>
          )}
          {pConfig.hasPartida && (
            <div>
              <label className="block text-xs md:text-[10px] font-bold text-app-text/80 mb-1 uppercase">
                Partida (Compartida)
              </label>
              <input
                type="text"
                placeholder="Ingrese Partida para el grupo"
                value={group.partida}
                onChange={e => onGroupFieldChange(group.id, 'partida', e.target.value)}
                className="w-full px-3 py-2 md:py-1.5 border border-app-input-border rounded-lg text-xs font-mono bg-app-input-bg text-app-text min-h-[40px] md:min-h-0"
              />
            </div>
          )}
          {pConfig.hasTono && (
            <div>
              <label className="block text-xs md:text-[10px] font-bold text-app-text/80 mb-1 uppercase">
                Tono / Color (Compartido)
              </label>
              <input
                type="text"
                placeholder="Ingrese Tono para el grupo"
                value={group.tono}
                onChange={e => onGroupFieldChange(group.id, 'tono', e.target.value)}
                className="w-full px-3 py-2 md:py-1.5 border border-app-input-border rounded-lg text-xs font-mono bg-app-input-bg text-app-text min-h-[40px] md:min-h-0"
              />
            </div>
          )}
        </div>
      )}

      {/* Optional Lote and Partida for Packing List Antiguo */}
      {packingType === 'antiguo' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-app-bg p-3 rounded-lg border border-app-border">
          <div>
            <label className="block text-xs md:text-[10px] font-bold text-app-text/80 mb-1 uppercase">Lote (Opcional)</label>
            <input
              type="text"
              placeholder="Ingrese Lote"
              value={group.lot || ''}
              onChange={e => onGroupFieldChange(group.id, 'lot', e.target.value)}
              className="w-full px-3 py-2 md:py-1.5 border border-app-input-border rounded-lg text-xs font-mono bg-app-input-bg text-app-text focus:ring-1 focus:ring-app-primary min-h-[40px] md:min-h-0"
            />
          </div>
          <div>
            <label className="block text-xs md:text-[10px] font-bold text-app-text/80 mb-1 uppercase">Partida (Opcional)</label>
            <input
              type="text"
              placeholder="Ingrese Partida"
              value={group.partida || ''}
              onChange={e => onGroupFieldChange(group.id, 'partida', e.target.value)}
              className="w-full px-3 py-2 md:py-1.5 border border-app-input-border rounded-lg text-xs font-mono bg-app-input-bg text-app-text focus:ring-1 focus:ring-app-primary min-h-[40px] md:min-h-0"
            />
          </div>
        </div>
      )}

      {/* Embedded Roll Quantities list for this specific article */}
      <div className="space-y-4 bg-app-bg/40 p-3.5 sm:p-4 rounded-lg border-2 border-app-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <p className="text-xs md:text-[10px] font-black text-app-text/80 uppercase tracking-wider flex items-center gap-1">
            {packingType === 'corte' 
              ? `Cantidades de Corte para este Artículo (${group.rolls.length})`
              : `Cantidades de Metraje para este Artículo (${group.rolls.length})`}
          </p>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleOpenScanner}
              className="px-3 py-2 md:px-2.5 md:py-1 bg-app-secondary/10 hover:bg-app-secondary/20 dark:bg-app-secondary/20 dark:hover:bg-app-secondary/35 border border-app-secondary/30 dark:border-app-secondary/40 text-app-secondary rounded-lg text-xs md:text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[40px] md:min-h-0 flex-1 sm:flex-none"
              title="Escanear etiquetas de rollos con la cámara"
            >
              <QrCode size={14} className="text-app-secondary" />
              Escanear Cámara (QR/Barra)
            </button>

            {!isExcelOnly ? (
              <button
                type="button"
                onClick={() => onAddRoll(group.id)}
                className="px-3 py-2 md:px-2.5 md:py-1 bg-app-surface hover:bg-app-bg border border-app-border text-app-text rounded-lg text-xs md:text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition cursor-pointer shadow-2xs min-h-[40px] md:min-h-0 flex-1 sm:flex-none"
              >
                <Plus size={14} />
                {packingType === 'corte' ? 'Añadir Corte Manual' : 'Añadir Fila Manual'}
              </button>
            ) : (
              <span className="text-xs md:text-[10px] font-extrabold text-app-primary bg-app-bg px-2.5 py-1.5 rounded border border-app-border text-center w-full sm:w-auto">
                Solo permitido Pegar desde Excel
              </span>
            )}
          </div>
        </div>

        {/* Quick-add field for custom entry */}
        {group.source === 'custom' && (
          <ExcelPasteParser
            groupId={group.id}
            pConfig={pConfig}
            isExcelOnly={!!isExcelOnly}
            packingType={packingType}
            onProcess={(text, manualMapping) => onProcessUnifiedInput(group.id, text, manualMapping)}
          />
        )}

        {/* List of items below */}
        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-0.5 sm:pr-1">
          {group.rolls.length === 0 ? (
            <p className="text-center py-5 text-xs italic text-app-text/50 bg-app-surface/40 rounded-lg border border-dashed border-app-border">
              No hay metrajes agregados. Escriba un metraje en la casilla de arriba o presione "+ Añadir Fila".
            </p>
          ) : (
            group.rolls.map((roll, rIndex) => {
              return (
                <div key={roll.id} className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5 bg-app-surface p-3 md:p-2 border border-app-border rounded-lg shadow-2xs text-app-text">
                  
                  {/* Top mobile bar: Number badge + title + Delete action */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-app-primary/15 text-app-primary font-mono flex items-center justify-center font-bold text-[11px] shrink-0">
                        {rIndex + 1}
                      </span>
                      <span className="text-[11px] font-bold text-app-text md:hidden">
                        {roll.rollNumber || `Ítem #${rIndex + 1}`}
                      </span>
                    </div>

                    {/* Delete roll button (Mobile top-right) */}
                    <button
                      type="button"
                      onClick={() => onRemoveRoll(group.id, roll.id)}
                      className="md:hidden text-red-500 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center bg-red-50/60 dark:bg-red-950/20 border border-red-200/50"
                      title="Eliminar este metraje"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {/* Identification / selection */}
                  {(packingType === 'nuevo' || packingType === 'rollo') && (
                    <div className="flex-1">
                      <span className="block text-[9px] font-bold text-app-text/60 uppercase mb-0.5 md:hidden">
                        {group.source === 'inventory' ? 'Rollo de Almacén' : 'Nº de Rollo / Etiqueta'}
                      </span>
                      {group.source === 'inventory' ? (
                        <select
                          required
                          value={roll.rollId || ''}
                          onChange={e => onRollFieldChange(group.id, roll.id, 'rollId', e.target.value)}
                          className="w-full px-2.5 py-2 md:py-1 border border-app-border rounded-md text-xs font-mono font-bold text-app-text bg-app-surface min-h-[42px] md:min-h-0"
                        >
                          <option value="">-- Seleccionar Rollo de Stock --</option>
                          {allInventory
                            .filter(r =>
                              r.articleId === group.articleId &&
                              (r.currentMeters > 0 || r.id === roll.rollId)
                            )
                            .map(r => (
                              <option key={r.id} value={r.id}>
                                {r.rollNumber} [Stock: {r.currentMeters.toFixed(2)}m] {r.lot ? `| Lote: ${r.lot}` : ''}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <div className="relative">
                          <span className="absolute left-2.5 top-2.5 md:top-1.5 text-app-text/45 font-mono text-[10px] uppercase font-bold">Nº</span>
                          <input
                            type="text"
                            required
                            placeholder="Ej. ROLLO-01"
                            value={roll.rollNumber}
                            onChange={e => onRollFieldChange(group.id, roll.id, 'rollNumber', e.target.value)}
                            className="w-full pl-8 pr-2.5 py-2 md:py-1 border border-app-input-border rounded-md text-xs font-mono font-bold text-app-text bg-app-input-bg min-h-[42px] md:min-h-0"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Meters quantity */}
                  <div className={(packingType === 'corte' || packingType === 'antiguo') ? "w-full md:flex-1" : "w-full md:w-36"}>
                    <span className="block text-[9px] font-bold text-app-text/60 uppercase mb-0.5 md:hidden">
                      {packingType === 'corte' ? 'Metraje del Corte (m) * (mín. 0.10m)' : 'Metraje del Rollo (m) * (mín. 10.00m)'}
                    </span>
                    <div className="relative">
                      <input
                        id={`meters-${group.id}-${rIndex}`}
                        type="number"
                        step="any"
                        min={packingType === 'corte' ? "0.10" : "10.00"}
                        inputMode="decimal"
                        required
                        placeholder={packingType === 'corte' ? "0.10" : "10.00"}
                        value={roll.meters !== undefined && roll.meters !== null ? roll.meters : ''}
                        onChange={e => onRollFieldChange(group.id, roll.id, 'meters', e.target.value)}
                        onKeyDown={e => onRollKeyDown(e, group.id, rIndex)}
                        onFocus={e => e.target.select()}
                        className={`w-full pl-2.5 pr-8 py-2 md:py-1 border rounded-md text-xs font-mono font-bold bg-app-input-bg min-h-[42px] md:min-h-0 text-left transition ${
                          packingType !== 'corte' && roll.meters !== '' && Number(roll.meters) > 0 && Number(roll.meters) < 10.00
                            ? 'border-amber-500 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30'
                            : 'border-app-input-border text-app-text font-bold'
                        }`}
                      />
                      <span className="absolute right-2.5 top-2.5 md:top-1 text-app-text/50 font-mono text-[11px] font-bold">m</span>
                    </div>

                    {/* Feedback and Rule Warnings */}
                    {packingType === 'corte' ? (
                      <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                        Mínimo 0.10m {roll.maxMeters ? `• Stock máx: ${roll.maxMeters.toFixed(2)}m` : ''}
                      </p>
                    ) : (
                      <>
                        {roll.meters !== '' && Number(roll.meters) > 0 && Number(roll.meters) < 10.00 ? (
                          <div className="mt-1 p-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-800 dark:text-amber-200 flex flex-col gap-1">
                            <span className="leading-tight font-medium">
                              ⚠️ En rollos nuevos/antiguos el mínimo es <strong>10.00m</strong>.
                            </span>
                            {onSwitchToCorte && (
                              <button
                                type="button"
                                onClick={onSwitchToCorte}
                                className="w-full py-1 px-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-[9px] uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                                title="Cambiar todo este Packing List a modo Cortes manteniendo tus datos"
                              >
                                <span>Pasar a Modo Cortes</span>
                                <span aria-hidden="true">⚡</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-[9px] text-app-text/50 mt-0.5">
                            Mínimo 10.00m {roll.maxMeters ? `• Stock máx: ${roll.maxMeters.toFixed(2)}m` : ''}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Group optional extra fields in a responsive grid on mobile */}
                  {showExtraRowFields && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:items-center gap-2 w-full md:w-auto pt-1 md:pt-0 border-t md:border-t-0 border-app-border/40">
                      {/* Optional Lote per roll */}
                      {showLot && (
                        <div className="w-full md:w-24 shrink-0">
                          <span className="block text-[8px] font-bold text-app-text/50 uppercase mb-0.5 md:hidden">Lote</span>
                          <input
                            type="text"
                            placeholder="Lote"
                            value={roll.lot || ''}
                            onChange={e => onRollFieldChange(group.id, roll.id, 'lot', e.target.value)}
                            className="w-full px-2 py-2 md:py-1 border border-app-input-border rounded-md text-xs font-mono font-bold text-app-text bg-app-input-bg focus:ring-1 focus:ring-app-primary uppercase placeholder:font-sans placeholder:font-normal text-center min-h-[38px] md:min-h-0"
                          />
                        </div>
                      )}

                      {/* Optional Partida per roll */}
                      {showPartida && (
                        <div className="w-full md:w-24 shrink-0">
                          <span className="block text-[8px] font-bold text-app-text/50 uppercase mb-0.5 md:hidden">Partida</span>
                          <input
                            type="text"
                            placeholder="Partida"
                            value={roll.partida || ''}
                            onChange={e => onRollFieldChange(group.id, roll.id, 'partida', e.target.value)}
                            className="w-full px-2 py-2 md:py-1 border border-app-input-border rounded-md text-xs font-mono font-bold text-app-text bg-app-input-bg focus:ring-1 focus:ring-app-primary uppercase placeholder:font-sans placeholder:font-normal text-center min-h-[38px] md:min-h-0"
                          />
                        </div>
                      )}

                      {/* Optional Tono per roll */}
                      {showTono && (
                        <div className="w-full md:w-24 shrink-0">
                          <span className="block text-[8px] font-bold text-app-text/50 uppercase mb-0.5 md:hidden">Tono/Color</span>
                          <input
                            type="text"
                            placeholder="Tono/Color"
                            value={roll.tono || ''}
                            onChange={e => onRollFieldChange(group.id, roll.id, 'tono', e.target.value)}
                            className="w-full px-2 py-2 md:py-1 border border-app-input-border rounded-md text-xs font-mono font-bold text-app-text bg-app-input-bg focus:ring-1 focus:ring-app-primary uppercase placeholder:font-sans placeholder:font-normal text-center min-h-[38px] md:min-h-0"
                          />
                        </div>
                      )}

                      {/* Optional Ancho per roll */}
                      {showWidth && (
                        <div className="w-full md:w-24 shrink-0">
                          <span className="block text-[8px] font-bold text-app-text/50 uppercase mb-0.5 md:hidden">Ancho</span>
                          <input
                            type="text"
                            placeholder="Ancho"
                            value={roll.width || ''}
                            onChange={e => onRollFieldChange(group.id, roll.id, 'width', e.target.value)}
                            className="w-full px-2 py-2 md:py-1 border border-app-input-border rounded-md text-xs font-mono font-bold text-app-text bg-app-input-bg focus:ring-1 focus:ring-app-primary uppercase placeholder:font-sans placeholder:font-normal text-center min-h-[38px] md:min-h-0"
                          />
                        </div>
                      )}

                      {/* Optional Peso per roll */}
                      {showWeight && (
                        <div className="w-full md:w-24 shrink-0">
                          <span className="block text-[8px] font-bold text-app-text/50 uppercase mb-0.5 md:hidden">Peso</span>
                          <input
                            type="text"
                            placeholder="Peso"
                            value={roll.weight || ''}
                            onChange={e => onRollFieldChange(group.id, roll.id, 'weight', e.target.value)}
                            className="w-full px-2 py-2 md:py-1 border border-app-input-border rounded-md text-xs font-mono font-bold text-app-text bg-app-input-bg focus:ring-1 focus:ring-app-primary uppercase placeholder:font-sans placeholder:font-normal text-center min-h-[38px] md:min-h-0"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Desktop Delete roll button */}
                  <button
                    type="button"
                    onClick={() => onRemoveRoll(group.id, roll.id)}
                    className="hidden md:flex text-app-text/45 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition cursor-pointer min-h-[32px] min-w-[32px] items-center justify-center self-center shrink-0"
                    title="Eliminar este metraje"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Quick-Add Roll button for mobile convenience */}
        {!isExcelOnly && group.rolls.length > 0 && (
          <div className="pt-2 border-t border-app-border/40 flex justify-between items-center">
            <span className="text-[10px] font-mono text-app-text/60">
              Subtotal: <strong>{groupTotalMeters.toFixed(2)}m</strong>{groupTotalWeight > 0 ? <> | <strong>{groupTotalWeight.toFixed(2)}kg</strong></> : null} ({groupTotalRolls} {packingType === 'corte' ? 'cortes' : 'rollos'})
            </span>
            <button
              type="button"
              onClick={() => onAddRoll(group.id)}
              className="px-3 py-2 bg-app-surface hover:bg-app-bg border border-app-border text-app-primary font-bold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-2xs min-h-[38px]"
            >
              <Plus size={14} />
              <span>Añadir Fila</span>
            </button>
          </div>
        )}
      </div>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanResult={async (scan) => {
          let foundRoll = availableRolls.find(
            r => r.articleId === group.articleId &&
                 r.rollNumber.trim().toLowerCase() === scan.rollNumber.trim().toLowerCase()
          );

          let depletedRoll = allInventory.find(
            r => r.articleId === group.articleId &&
                 r.rollNumber.trim().toLowerCase() === scan.rollNumber.trim().toLowerCase() &&
                 r.currentMeters === 0
          );

          // If not in currently loaded paginated slice, search entire Firestore collection
          if (!foundRoll && !depletedRoll) {
            try {
              const dbRoll = await findRollInInventory(scan.rollNumber, group.articleId || undefined);
              if (dbRoll) {
                if (dbRoll.currentMeters > 0) {
                  foundRoll = dbRoll;
                } else {
                  depletedRoll = dbRoll;
                }
              }
            } catch (err) {
              console.warn("Error searching roll in full database:", err);
            }
          }

          if (foundRoll) {
            const emptyRoll = group.rolls.find(r => !r.rollId);
            if (emptyRoll) {
              onRollFieldChange(group.id, emptyRoll.id, 'rollId', foundRoll.id);
            } else {
              onAddScannedRoll(group.id, {
                rollNumber: foundRoll.rollNumber,
                rollId: foundRoll.id,
                meters: foundRoll.currentMeters,
                maxMeters: foundRoll.currentMeters,
                lot: foundRoll.lot,
                partida: foundRoll.partida,
                tono: foundRoll.tono,
                width: foundRoll.width,
                weight: foundRoll.weight
              });
            }
          } else if (depletedRoll) {
            let usedPL = packingLists.find(pl =>
              pl.items.some(item => item.rollId === depletedRoll!.id)
            );
            if (!usedPL) {
              try {
                const allPLs = await fetchAllPackingLists();
                usedPL = allPLs.find(pl => pl.items.some(item => item.rollId === depletedRoll!.id));
              } catch (err) {
                console.warn("Error checking packing lists:", err);
              }
            }
            const packingListNo = usedPL ? usedPL.packingListNo : 'desconocido';
            const confirmed = window.confirm(
              `Este rollo (${depletedRoll.rollNumber}) ya fue registrado como agotado (0 metros) en el almacén. Se usó en el Packing List N° ${packingListNo}. ¿Deseas continuar de todas formas y cargarlo como entrada manual?`
            );
            if (confirmed) {
              onAddScannedRoll(group.id, scan);
            }
          } else {
            onAddScannedRoll(group.id, scan);
          }
        }}
      />
    </div>
  );
}
