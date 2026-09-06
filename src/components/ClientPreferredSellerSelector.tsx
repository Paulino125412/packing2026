import React, { useState, useEffect, useRef } from 'react';
import { Plus, User, Search, Check, X, Sparkles, ChevronDown } from 'lucide-react';
import { Seller } from '../types';

interface ClientPreferredSellerSelectorProps {
  sellerId: string;
  onSelectSeller: (id: string) => void;
  sellers: Seller[];
}

export default function ClientPreferredSellerSelector({
  sellerId,
  onSelectSeller,
  sellers
}: ClientPreferredSellerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Find currently selected seller if any
  const selectedSeller = sellers.find(s => s.id === sellerId);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      // Small timeout ensures the DOM node is rendered and ready for focus
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Filter sellers by search query
  const filteredSellers = sellers.filter(s => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q))
    );
  });

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* State 1: No seller assigned -> Discreet, compact trigger button */}
      {!sellerId ? (
        <button
          id="btn-add-preferred-seller"
          type="button"
          onClick={() => setIsOpen(prev => !prev)}
          className="group inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-app-text/75 hover:text-app-primary bg-app-surface hover:bg-app-bg border border-dashed border-app-border hover:border-app-primary/50 rounded-lg transition-all cursor-pointer shadow-2xs"
          title="Asignar un vendedor por defecto para este cliente (opcional)"
        >
          <span className="w-4 h-4 rounded-full bg-app-bg group-hover:bg-app-primary/15 flex items-center justify-center text-app-primary text-xs font-bold transition-colors">
            <Plus size={11} />
          </span>
          <span className="tracking-normal font-medium">[+] Añadir vendedor preferido (opcional)</span>
        </button>
      ) : (
        /* State 2: Seller assigned -> Compact pill / tag with Cambiar & Quitar (✕) */
        <div
          id="pill-preferred-seller"
          className="inline-flex items-center gap-2 bg-app-surface border border-app-primary/30 rounded-lg px-2.5 py-1 text-xs text-app-text shadow-2xs transition-all"
        >
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-app-primary/15 text-app-primary font-bold text-[10px] shrink-0">
            <User size={12} />
          </span>

          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[11px] text-app-text/60">Vendedor preferido:</span>
            <span className="font-semibold text-app-text text-xs truncate max-w-[180px] sm:max-w-[220px]">
              {selectedSeller ? selectedSeller.name : 'Vendedor asignado'}
            </span>
            {selectedSeller?.email && (
              <span className="text-[10px] text-app-text/40 hidden md:inline truncate max-w-[140px]">
                ({selectedSeller.email})
              </span>
            )}
          </div>

          <div className="h-3.5 w-px bg-app-border/80 mx-0.5 shrink-0" />

          {/* Action: Cambiar */}
          <button
            id="btn-change-preferred-seller"
            type="button"
            onClick={() => setIsOpen(prev => !prev)}
            className="text-[11px] font-semibold text-app-primary hover:text-app-primary/80 hover:underline cursor-pointer transition-colors px-1 py-0.5 rounded shrink-0"
            title="Cambiar vendedor preferido"
          >
            Cambiar
          </button>

          {/* Action: Quitar (✕) */}
          <button
            id="btn-remove-preferred-seller"
            type="button"
            onClick={() => {
              onSelectSeller('');
              setIsOpen(false);
              setSearchQuery('');
            }}
            className="text-[11px] font-medium text-app-text/50 hover:text-app-error px-1.5 py-0.5 rounded hover:bg-app-error/10 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
            title="Quitar vendedor preferido (volver a modo automático)"
          >
            <span>Quitar</span>
            <X size={12} className="text-app-error/80" />
          </button>
        </div>
      )}

      {/* Floating Popover Dropdown */}
      {isOpen && (
        <div
          id="popover-preferred-seller"
          className="absolute z-50 left-0 mt-1.5 w-72 sm:w-80 bg-app-surface border border-app-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Popover Header with Search Input */}
          <div className="p-2.5 border-b border-app-border/70 bg-app-bg/40">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-app-text/40 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar vendedor por nombre..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-app-surface border border-app-border rounded-lg text-app-text placeholder-app-text/40 focus:outline-hidden focus:ring-1 focus:ring-app-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-app-text/40 hover:text-app-text p-0.5 rounded cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
            {/* Automatic / Default Option */}
            <button
              id="opt-seller-auto"
              type="button"
              onClick={() => {
                onSelectSeller('');
                setIsOpen(false);
                setSearchQuery('');
              }}
              className={`w-full text-left p-2 rounded-lg flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                !sellerId
                  ? 'bg-app-primary/10 text-app-primary font-semibold'
                  : 'hover:bg-app-bg text-app-text'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-app-bg border border-app-border flex items-center justify-center shrink-0 mt-0.5 text-app-text/60">
                  <Sparkles size={11} className={!sellerId ? 'text-app-primary' : 'text-app-text/60'} />
                </div>
                <div>
                  <div className="font-medium leading-tight">
                    Automático (Aprender de pedidos)
                  </div>
                  <div className="text-[10px] text-app-text/50 font-normal leading-tight mt-0.5">
                    Se asociará según el historial y pedidos del cliente
                  </div>
                </div>
              </div>
              {!sellerId && <Check size={14} className="text-app-primary shrink-0" />}
            </button>

            {/* Separator */}
            <div className="border-t border-app-border/40 my-1" />

            <div className="px-2 py-1 text-[10px] font-bold text-app-text/50 uppercase tracking-wider flex items-center justify-between">
              <span>Vendedores Disponibles</span>
              <span className="text-[10px] font-mono font-normal">({filteredSellers.length})</span>
            </div>

            {/* Filtered Sellers */}
            {filteredSellers.length === 0 ? (
              <div className="p-3 text-center text-xs text-app-text/50">
                {sellers.length === 0
                  ? 'No hay vendedores registrados en el sistema.'
                  : 'No se encontraron vendedores con ese nombre.'}
              </div>
            ) : (
              filteredSellers.map(s => {
                const isSelected = sellerId === s.id;
                return (
                  <button
                    key={s.id}
                    id={`opt-seller-${s.id}`}
                    type="button"
                    onClick={() => {
                      onSelectSeller(s.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left p-2 rounded-lg flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-app-primary/10 text-app-primary font-semibold'
                        : 'hover:bg-app-bg text-app-text'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-5 h-5 rounded-full bg-app-bg border border-app-border flex items-center justify-center shrink-0 text-app-text/60">
                        <User size={11} className={isSelected ? 'text-app-primary' : 'text-app-text/60'} />
                      </div>
                      <div className="truncate">
                        <div className="font-medium truncate">{s.name}</div>
                        {(s.email || s.phone) && (
                          <div className="text-[10px] text-app-text/50 truncate">
                            {[s.email, s.phone].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-app-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
