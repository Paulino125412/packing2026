import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Check, Plus, Loader2, X } from 'lucide-react';

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
}

interface ComboboxOption {
  id: string;
  name: string;
  detail?: string;
}

interface SearchableComboboxProps {
  id?: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (id: string) => void;
  options: ComboboxOption[];
  icon?: React.ReactNode;
  addNewText?: string;
  additionalFields?: FieldConfig[];
  onAddNewWithFields?: (name: string, fields: Record<string, string>) => Promise<string>;
}

export default function SearchableCombobox({
  id,
  label,
  placeholder,
  value,
  onChange,
  options,
  icon,
  addNewText,
  additionalFields = [],
  onAddNewWithFields
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Dynamic fields for new record creation
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync typed search text with currently selected option label
  const selectedOption = options.find(o => o.id === value || o.name === value);

  useEffect(() => {
    if (selectedOption) {
      setSearch(selectedOption.name);
    } else if (value) {
      setSearch(value);
    } else {
      setSearch('');
    }
  }, [value, selectedOption]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsAddingNew(false);
        setError(null);
        // Re-sync input text with current selection if they clicked away without choosing
        if (selectedOption) {
          setSearch(selectedOption.name);
        } else if (value) {
          setSearch(value);
        } else {
          setSearch('');
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedOption, value]);

  // Filter options based on search query
  const filteredOptions = options.filter(o => {
    const q = search.toLowerCase();
    return o.name.toLowerCase().includes(q) || (o.detail && o.detail.toLowerCase().includes(q));
  });

  const exactMatchExists = options.some(o => o.name.toLowerCase().trim() === search.toLowerCase().trim());

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
    setIsAddingNew(false);
    setError(null);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    // Clear search to show all options on focus, or select all for easy overwrite
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setIsOpen(true);
    if (isAddingNew) {
      setIsAddingNew(false);
    }
  };

  const handleInitAddNew = () => {
    setNewName(search);
    const initialFields: Record<string, string> = {};
    additionalFields.forEach(f => {
      initialFields[f.key] = '';
    });
    setNewFields(initialFields);
    setIsAddingNew(true);
    setError(null);
  };

  const handleSaveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddNewWithFields) return;

    if (!newName.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }

    // Validate required additional fields
    for (const f of additionalFields) {
      if (f.required && !newFields[f.key]?.trim()) {
        setError(`El campo "${f.label}" es obligatorio.`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const newId = await onAddNewWithFields(newName.trim(), newFields);
      onChange(newId);
      setIsOpen(false);
      setIsAddingNew(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error al guardar el nuevo registro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative" ref={containerRef} id={id}>
      <label className="block text-[11px] font-bold text-app-text/60 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-3 sm:top-2 text-app-text/45 pointer-events-none">
            {icon}
          </div>
        )}
        
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={search}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          className={`w-full ${icon ? 'pl-9' : 'pl-3'} pr-9 py-2.5 sm:py-1.5 min-h-[42px] sm:min-h-[34px] border ${
            isOpen 
              ? 'border-app-primary ring-2 ring-app-primary/15' 
              : 'border-app-input-border'
          } rounded-lg sm:rounded text-xs bg-app-input-bg font-medium text-app-text placeholder-app-text/45 focus:outline-none transition shadow-2xs`}
        />

        <div className="absolute right-2 top-2.5 sm:top-2 flex items-center gap-1">
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                onChange('');
                setIsOpen(true);
                if (inputRef.current) inputRef.current.focus();
              }}
              className="text-app-text/45 hover:text-app-text p-1 sm:p-0.5 rounded cursor-pointer min-h-[30px] min-w-[30px] flex items-center justify-center"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown size={14} className="text-app-text/45 pointer-events-none" />
        </div>
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-app-surface border border-app-border rounded shadow-md max-h-80 overflow-hidden flex flex-col">
          
          {/* Micro Registration Form */}
          {isAddingNew ? (
            <form onSubmit={handleSaveNew} className="p-4 bg-app-bg/55 border-b border-app-border flex flex-col gap-3">
              <div className="flex justify-between items-center pb-1.5 border-b border-app-border">
                <span className="text-[9px] font-bold text-app-text/60 uppercase tracking-wider">
                  Nuevo Registro Rápido
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="text-app-text/45 hover:text-app-text p-0.5 rounded cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>

              {error && (
                <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 p-1.5 rounded border border-red-200 dark:border-red-900/40">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-[9px] font-bold text-app-text/60 uppercase mb-1">
                  Nombre completo o Razón Social *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-app-input-border rounded text-xs focus:ring-2 focus:ring-app-primary/20 focus:border-app-primary focus:outline-none font-medium text-app-text bg-app-input-bg transition"
                />
              </div>

              {additionalFields.map(f => (
                <div key={f.key}>
                  <label className="block text-[9px] font-bold text-app-text/60 uppercase mb-1">
                    {f.label} {f.required && '*'}
                  </label>
                  <input
                    type="text"
                    required={f.required}
                    placeholder={f.placeholder}
                    value={newFields[f.key] || ''}
                    onChange={e => setNewFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-app-input-border rounded text-xs focus:ring-2 focus:ring-app-primary/20 focus:border-app-primary focus:outline-none font-medium text-app-text bg-app-input-bg transition"
                  />
                </div>
              ))}

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="px-2.5 py-1 bg-app-bg hover:bg-app-border text-app-text text-[10px] font-bold rounded uppercase transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1 bg-app-primary hover:bg-app-primary/90 text-white text-[10px] font-bold rounded uppercase transition flex items-center gap-1 cursor-pointer"
                >
                  {loading ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Check size={10} />
                  )}
                  {loading ? 'Guardando...' : 'Grabar'}
                </button>
              </div>
            </form>
          ) : (
            // Options List
            <div className="overflow-y-auto flex-1 max-h-60 py-1 bg-app-surface">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-xs italic text-app-text/45 text-center">
                  No se encontraron resultados
                </div>
              ) : (
                filteredOptions.map(option => {
                  const isSelected = option.id === value;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelect(option.id)}
                      className={`w-full px-3 py-2 sm:py-1.5 min-h-[38px] sm:min-h-0 text-left text-xs flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? 'bg-app-bg text-app-text font-semibold border-l-2 border-app-primary'
                          : 'hover:bg-app-bg/50 text-app-text'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-app-text text-xs">
                          {option.name}
                        </span>
                        {option.detail && (
                          <span className="text-[10px] text-app-text/50 font-mono mt-0.5">
                            {option.detail}
                          </span>
                        )}
                      </div>
                      {isSelected && <Check size={13} className="text-app-primary shrink-0 ml-2" />}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Create New Trigger inside list (if search text is present and onAddNew is provided) */}
          {onAddNewWithFields && !isAddingNew && !exactMatchExists && search.trim().length > 1 && (
            <div className="border-t border-app-border bg-app-bg/60 p-2 shrink-0">
              <button
                type="button"
                onClick={handleInitAddNew}
                className="w-full py-1.5 px-3 bg-app-surface hover:bg-app-bg border border-app-border text-app-text font-bold text-[10px] uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer"
              >
                <Plus size={13} className="text-app-text/45" />
                {addNewText || `Registrar "${search}"`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
