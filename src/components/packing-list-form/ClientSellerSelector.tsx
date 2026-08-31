import React from 'react';
import { User, ShoppingBag } from 'lucide-react';
import { Client, Seller, Provider } from '../../types';
import SearchableCombobox from '../SearchableCombobox';

interface ClientSellerSelectorProps {
  clientId: string;
  setClientId: (id: string) => void;
  clients: Client[];
  onAddNewClient: (name: string, fields: Record<string, string>) => Promise<string>;
  sellerId: string;
  setSellerId: (id: string) => void;
  sellers: Seller[];
  onAddNewSeller: (name: string, fields: Record<string, string>) => Promise<string>;
  formProviderId: string;
  setFormProviderId: (id: string) => void;
  providers: Provider[];
  onAddNewProvider: (name: string, fields: Record<string, string>) => Promise<string>;
}

export default function ClientSellerSelector({
  clientId,
  setClientId,
  clients,
  onAddNewClient,
  sellerId,
  setSellerId,
  sellers,
  onAddNewSeller,
  formProviderId,
  setFormProviderId,
  providers,
  onAddNewProvider
}: ClientSellerSelectorProps) {
  return (
    <>
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

      <SearchableCombobox
        label="Proveedor *"
        placeholder="Buscar o registrar Proveedor..."
        value={formProviderId}
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
    </>
  );
}
