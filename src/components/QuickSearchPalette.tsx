import React, { useState, useEffect, useRef } from 'react';
import { Client, Article, PackingList, RollItem } from '../types';
import { Search, User, Layers, FileText, X, Command, Box } from 'lucide-react';

interface QuickSearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  articles: Article[];
  packingLists: PackingList[];
  inventory?: RollItem[];
  onSelectResult: (type: 'client' | 'article' | 'packing_list' | 'inventory', item: any) => void;
}

interface GroupedResults {
  clients: Client[];
  articles: Article[];
  packingLists: PackingList[];
  inventory: RollItem[];
}

export default function QuickSearchPalette({
  isOpen,
  onClose,
  clients,
  articles,
  packingLists,
  inventory = [],
  onSelectResult
}: QuickSearchPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Toggle body scroll lock when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Small timeout to ensure the DOM is rendered before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  // Reset query and active index when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Search filter logic
  const filteredResults = React.useMemo((): GroupedResults => {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      return { clients: [], articles: [], packingLists: [], inventory: [] };
    }

    const matchedClients = clients.filter(c => 
      (c.name || '').toLowerCase().includes(q) || 
      (c.dni || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedArticles = articles.filter(a => 
      (a.name || '').toLowerCase().includes(q) || 
      (a.description || '').toLowerCase().includes(q)
    ).slice(0, 5);

    const matchedPackingLists = packingLists.filter(pl => 
      (pl.packingListNo || '').toLowerCase().includes(q) ||
      (pl.guideNumber || '').toLowerCase().includes(q)
    ).slice(0, 6);

    const matchedInventory = inventory.filter(r => {
      const art = articles.find(a => a.id === r.articleId)?.name || '';
      return (r.rollNumber || '').toLowerCase().includes(q) ||
        (r.lot || '').toLowerCase().includes(q) ||
        (r.partida || '').toLowerCase().includes(q) ||
        (r.tono || '').toLowerCase().includes(q) ||
        (r.status || '').toLowerCase().includes(q) ||
        (art || '').toLowerCase().includes(q);
    }).slice(0, 6);

    return {
      clients: matchedClients,
      articles: matchedArticles,
      packingLists: matchedPackingLists,
      inventory: matchedInventory
    };
  }, [query, clients, articles, packingLists, inventory]);

  // Flattened results for keyboard navigation index mapping
  const flatResults = React.useMemo(() => {
    const list: { type: 'client' | 'article' | 'packing_list' | 'inventory'; item: any }[] = [];
    filteredResults.packingLists.forEach(pl => list.push({ type: 'packing_list', item: pl }));
    filteredResults.inventory.forEach(r => list.push({ type: 'inventory', item: r }));
    filteredResults.clients.forEach(c => list.push({ type: 'client', item: c }));
    filteredResults.articles.forEach(a => list.push({ type: 'article', item: a }));
    return list;
  }, [filteredResults]);

  // Handle keyboard arrow navigation & Enter key
  useEffect(() => {
    const handleNav = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (flatResults.length > 0 ? (prev + 1) % flatResults.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (flatResults.length > 0 ? (prev - 1 + flatResults.length) % flatResults.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatResults.length > 0 && flatResults[activeIndex]) {
          const selected = flatResults[activeIndex];
          onSelectResult(selected.type, selected.item);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleNav);
    return () => window.removeEventListener('keydown', handleNav);
  }, [isOpen, flatResults, activeIndex, onSelectResult, onClose]);

  // Reset active index when query results change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const totalResultsCount = flatResults.length;

  return (
    <div className="fixed inset-0 bg-app-bg/60 backdrop-blur-xs flex items-start justify-center p-4 sm:p-10 md:p-20 z-50 animate-fade-in no-print">
      <div 
        ref={containerRef}
        className="bg-app-surface border border-app-border rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scale-up"
      >
        {/* Search Header */}
        <div className="p-4 border-b border-app-border flex items-center gap-3 bg-app-bg/20">
          <Search className="text-app-text/45 shrink-0" size={18} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar por cliente, artículo de tela, número de packing list..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full bg-transparent border-none text-sm text-app-text focus:outline-hidden focus:ring-0 placeholder:text-app-text/40"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-app-bg text-app-text/50 hover:text-app-text rounded transition cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1 bg-app-bg border border-app-border px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-app-text/55">
            <Command size={10} />
            <span>K</span>
          </div>
        </div>

        {/* Search Results Body */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {!query ? (
            <div className="py-12 text-center text-app-text/50 space-y-2">
              <Command size={28} className="mx-auto text-app-text/30" />
              <p className="text-xs font-semibold">Buscador Rápido del Almacén</p>
              <p className="text-[10px] text-app-text/40 max-w-xs mx-auto leading-relaxed">
                Escribe para buscar simultáneamente en el catálogo de clientes, artículos de tela y números de packing list.
              </p>
            </div>
          ) : totalResultsCount === 0 ? (
            <div className="py-12 text-center text-app-text/50 space-y-2">
              <Search size={28} className="mx-auto text-app-text/30 animate-pulse" />
              <p className="text-xs font-semibold">Sin resultados para "{query}"</p>
              <p className="text-[10px] text-app-text/40">
                Verifica la ortografía o intenta buscar con otros términos.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Packing Lists Group */}
              {filteredResults.packingLists.length > 0 && (
                <div>
                  <h4 className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-app-text/45 bg-app-bg/30 rounded-md mb-1.5 flex items-center gap-1.5">
                    <FileText size={10} />
                    Documentos Packing List ({filteredResults.packingLists.length})
                  </h4>
                  <div className="space-y-0.5">
                    {filteredResults.packingLists.map((pl) => {
                      const globalIndex = flatResults.findIndex(r => r.type === 'packing_list' && r.item.id === pl.id);
                      const isSelected = globalIndex === activeIndex;

                      return (
                        <div
                          key={pl.id}
                          onClick={() => {
                            onSelectResult('packing_list', pl);
                            onClose();
                          }}
                          className={`px-3 py-2.5 rounded-lg flex items-center justify-between transition cursor-pointer text-xs ${
                            isSelected 
                              ? 'bg-app-primary text-white' 
                              : 'hover:bg-app-bg text-app-text'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9px] ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-app-bg text-app-text border border-app-border'
                            }`}>
                              {pl.packingListNo}
                            </span>
                            <span className={`truncate ${isSelected ? 'text-white/90 font-medium' : 'text-app-text/80'}`}>
                              Fecha: {pl.date} • {pl.items.length} rollos/cortes
                            </span>
                          </div>
                          <span className={`text-[9px] font-bold tracking-widest uppercase ${
                            isSelected ? 'text-white/60' : 'text-app-text/40'
                          }`}>
                            Historial
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Inventory Group */}
              {filteredResults.inventory.length > 0 && (
                <div>
                  <h4 className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-app-text/45 bg-app-bg/30 rounded-md mb-1.5 flex items-center gap-1.5">
                    <Box size={10} />
                    Rollos en Inventario ({filteredResults.inventory.length})
                  </h4>
                  <div className="space-y-0.5">
                    {filteredResults.inventory.map((r) => {
                      const globalIndex = flatResults.findIndex(res => res.type === 'inventory' && res.item.id === r.id);
                      const isSelected = globalIndex === activeIndex;
                      const artName = articles.find(a => a.id === r.articleId)?.name || 'Artículo';

                      return (
                        <div
                          key={r.id}
                          onClick={() => {
                            onSelectResult('inventory', r);
                            onClose();
                          }}
                          className={`px-3 py-2.5 rounded-lg flex items-center justify-between transition cursor-pointer text-xs ${
                            isSelected 
                              ? 'bg-app-primary text-white' 
                              : 'hover:bg-app-bg text-app-text'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Box size={13} className={isSelected ? 'text-white/70' : 'text-app-text/45'} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono font-bold ${isSelected ? 'text-white' : 'text-app-text'}`}>
                                  {r.rollNumber}
                                </span>
                                <span className={`text-[10px] truncate ${isSelected ? 'text-white/80' : 'text-app-text/70'}`}>
                                  ({artName})
                                </span>
                              </div>
                              <p className={`text-[10px] font-mono truncate ${isSelected ? 'text-white/70' : 'text-app-text/50'}`}>
                                Metros: {r.currentMeters.toFixed(2)} m / Lote: {r.lot || 'N/A'}
                              </p>
                            </div>
                          </div>
                          <span className={`text-[9px] font-bold tracking-widest uppercase shrink-0 ${
                            isSelected ? 'text-white/60' : 'text-app-text/40'
                          }`}>
                            Inventario
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Clients Group */}
              {filteredResults.clients.length > 0 && (
                <div>
                  <h4 className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-app-text/45 bg-app-bg/30 rounded-md mb-1.5 flex items-center gap-1.5">
                    <User size={10} />
                    Clientes Registrados ({filteredResults.clients.length})
                  </h4>
                  <div className="space-y-0.5">
                    {filteredResults.clients.map((c) => {
                      const globalIndex = flatResults.findIndex(r => r.type === 'client' && r.item.id === c.id);
                      const isSelected = globalIndex === activeIndex;

                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            onSelectResult('client', c);
                            onClose();
                          }}
                          className={`px-3 py-2.5 rounded-lg flex items-center justify-between transition cursor-pointer text-xs ${
                            isSelected 
                              ? 'bg-app-primary text-white' 
                              : 'hover:bg-app-bg text-app-text'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <User size={13} className={isSelected ? 'text-white/70' : 'text-app-text/45'} />
                            <div className="min-w-0">
                              <p className={`font-semibold truncate ${isSelected ? 'text-white' : 'text-app-text'}`}>{c.name}</p>
                              <p className={`text-[10px] font-mono truncate ${isSelected ? 'text-white/70' : 'text-app-text/50'}`}>RUC/DNI: {c.dni}</p>
                            </div>
                          </div>
                          <span className={`text-[9px] font-bold tracking-widest uppercase shrink-0 ${
                            isSelected ? 'text-white/60' : 'text-app-text/40'
                          }`}>
                            Catálogos
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Articles Group */}
              {filteredResults.articles.length > 0 && (
                <div>
                  <h4 className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-app-text/45 bg-app-bg/30 rounded-md mb-1.5 flex items-center gap-1.5">
                    <Layers size={10} />
                    Artículos de Tela ({filteredResults.articles.length})
                  </h4>
                  <div className="space-y-0.5">
                    {filteredResults.articles.map((a) => {
                      const globalIndex = flatResults.findIndex(r => r.type === 'article' && r.item.id === a.id);
                      const isSelected = globalIndex === activeIndex;

                      return (
                        <div
                          key={a.id}
                          onClick={() => {
                            onSelectResult('article', a);
                            onClose();
                          }}
                          className={`px-3 py-2.5 rounded-lg flex items-center justify-between transition cursor-pointer text-xs ${
                            isSelected 
                              ? 'bg-app-primary text-white' 
                              : 'hover:bg-app-bg text-app-text'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Layers size={13} className={isSelected ? 'text-white/70' : 'text-app-text/45'} />
                            <div className="min-w-0">
                              <p className={`font-semibold truncate ${isSelected ? 'text-white' : 'text-app-text'}`}>{a.name}</p>
                              {a.description && (
                                <p className={`text-[10px] truncate ${isSelected ? 'text-white/70' : 'text-app-text/50'}`}>{a.description}</p>
                              )}
                            </div>
                          </div>
                          <span className={`text-[9px] font-bold tracking-widest uppercase shrink-0 ${
                            isSelected ? 'text-white/60' : 'text-app-text/40'
                          }`}>
                            Catálogos
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-3 border-t border-app-border bg-app-bg/40 text-[10px] font-medium text-app-text/50 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="bg-app-surface border border-app-border px-1 py-0.5 rounded font-bold font-mono text-[9px]">↑↓</span>
              Navegar
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-app-surface border border-app-border px-1 py-0.5 rounded font-bold font-mono text-[9px]">Enter</span>
              Seleccionar
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-app-surface border border-app-border px-1 py-0.5 rounded font-bold font-mono text-[9px]">ESC</span>
              Cerrar
            </span>
          </div>
          <div>
            <span>{totalResultsCount} resultados encontrados</span>
          </div>
        </div>

      </div>
    </div>
  );
}
