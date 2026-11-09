import React from 'react';
import { User, ShoppingBag, Zap } from 'lucide-react';
import { Client, Seller, Provider } from '../../types';
import SearchableCombobox from '../SearchableCombobox';

interface ClientSellerSelectorProps {
  clientId: string;
  setClientId: (id: string) => void;
  clients: Client[];
  recentClients?: Client[];
  onAddNewClient: (name: string, fields: Record<string, string>) => Promise<string>;
  sellerId: string;
  setSellerId: (id: string) => void;
  sellers: Seller[];
  onAddNewSeller: (name: string, fields: Record<string, string>) => Promise<string>;
  formProviderId?: string;
  setFormProviderId?: (id: string) => void;
  providers?: Provider[];
  onAddNewProvider?: (name: string, fields: Record<string, string>) => Promise<string>;
  showProviderSelector?: boolean;
  packingType?: 'nuevo' | 'antiguo' | 'corte' | 'rollo';
}

export default function ClientSellerSelector({
  clientId,
  setClientId,
  clients,
  recentClients = [],
  onAddNewClient,
  sellerId,
  setSellerId,
  sellers,
  onAddNewSeller,
  formProviderId,
  setFormProviderId,
  providers = [],
  onAddNewProvider,
  showProviderSelector = false,
  packingType
}: ClientSellerSelectorProps) {
  return (
    <>
      <div className="space-y-1.5">
        <SearchableCombobox
          label="Cliente Solicitante *"
          placeholder="Escriba para buscar o registrar cliente..."
          value={clientId}
          onChange={setClientId}
          options={clients.map(c => ({
            id: c.id,
            name: c.name,
            detail: `DNI/RUC: ${c.dni} ${c.address ? `| ${c.address}` : ''}`
          }))}
          icon={<User size={16} />}
          addNewText="Registrar como Nuevo Cliente"
          onAddNewWithFields={onAddNewClient}
          additionalFields={[
            { key: 'dni', label: 'DNI / RUC *', placeholder: 'Ingrese DNI o RUC (Obligatorio)', required: true },
            { key: 'phone', label: 'Teléfono', placeholder: 'Ingrese teléfono (Opcional)' },
            { key: 'fiscalAddress', label: 'Dirección Fiscal', placeholder: 'Dirección SUNAT (Opcional)' },
            { key: 'address', label: 'Dirección de Entrega', placeholder: 'Lugar de entrega / Despacho (Opcional)' }
          ]}
        />
        {packingType !== 'nuevo' && !clientId && recentClients.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            <span className="text-[9px] font-black uppercase tracking-wider text-app-text/50 flex items-center gap-0.5 mr-0.5">
              <Zap size={10} className="text-amber-500" /> Recientes:
            </span>
            {recentClients.slice(0, 5).map(rc => (
              <button
                key={rc.id}
                type="button"
                onClick={() => setClientId(rc.id)}
                className="text-[10px] font-bold px-2 py-0.5 rounded bg-app-bg hover:bg-app-primary/15 text-app-text/80 hover:text-app-primary border border-app-border hover:border-app-primary/40 transition cursor-pointer truncate max-w-[160px]"
                title={`Seleccionar ${rc.name}`}
              >
                {rc.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <SearchableCombobox
        label="Vendedor Encargado *"
        placeholder="Escriba para buscar o registrar vendedor..."
        value={sellerId}
        onChange={setSellerId}
        options={sellers.map(s => ({
          id: s.id,
          name: s.name,
          detail: s.email ? `Email: ${s.email}` : undefined
        }))}
        addNewText="Registrar como Nuevo Vendedor"
        onAddNewWithFields={onAddNewSeller}
        additionalFields={[
          { key: 'phone', label: 'Teléfono', placeholder: 'Ingrese teléfono (Opcional)' }
        ]}
      />

      {showProviderSelector && setFormProviderId && onAddNewProvider && (
        <SearchableCombobox
          label="Proveedor (Opcional)"
          placeholder="Buscar o registrar Proveedor..."
          value={formProviderId || ''}
          onChange={setFormProviderId}
          options={providers.map(p => ({
            id: p.id,
            name: p.name,
            detail: `Lote: ${p.hasLot ? 'SÍ' : 'NO'} | Partida: ${p.hasPartida ? 'SÍ' : 'NO'}`
          }))}
          icon={<ShoppingBag size={16} />}
          addNewText="Registrar como Nuevo Proveedor"
          onAddNewWithFields={onAddNewProvider}
          additionalFields={[
            { key: 'hasLot', label: '¿Lote? (SÍ o NO)', placeholder: 'SÍ (por defecto) o NO' },
            { key: 'hasPartida', label: '¿Partida? (SÍ o NO)', placeholder: 'SÍ (por defecto) o NO' },
            { key: 'hasTono', label: '¿Tono? (SÍ o NO)', placeholder: 'SÍ (por defecto) o NO' }
          ]}
        />
      )}
    </>
  );
}
