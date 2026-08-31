/**
 * Utility helper to query public SUNAT (RUC) and RENIEC (DNI) databases in Peru.
 */

export interface SunatQueryResult {
  success: boolean;
  name?: string;
  address?: string;
  department?: string;
  province?: string;
  district?: string;
  condition?: string;
  state?: string;
  error?: string;
}

/**
 * Helper to build full SUNAT / RENIEC fiscal address with district, province and department
 */
export function buildFullFiscalAddress(
  rawAddress?: string,
  distrito?: string,
  provincia?: string,
  departamento?: string
): string {
  const addr = (rawAddress || '').trim().replace(/\s+/g, ' ');
  const dist = (distrito || '').trim();
  const prov = (provincia || '').trim();
  const dep = (departamento || '').trim();

  const ubigeoParts = [dist, prov, dep].filter(Boolean);

  if (!addr) {
    return ubigeoParts.join(' - ');
  }

  if (ubigeoParts.length === 0) {
    return addr;
  }

  const addrUpper = addr.toUpperCase();
  const ubigeoSuffix = ubigeoParts.join(' - ').toUpperCase();

  // If address already contains the full ubigeo pattern or district and department
  if (
    addrUpper.endsWith(ubigeoSuffix) ||
    addrUpper.includes(` - ${ubigeoSuffix}`) ||
    (dist && dep && addrUpper.includes(`- ${dist.toUpperCase()}`) && addrUpper.includes(`- ${dep.toUpperCase()}`))
  ) {
    return addr;
  }

  // Format as: "DIRECCION - DISTRITO - PROVINCIA - DEPARTAMENTO"
  return `${addr} - ${ubigeoParts.join(' - ')}`;
}

export async function lookupRucOrDni(number: string): Promise<SunatQueryResult> {
  const cleanNumber = number.trim().replace(/\D/g, '');

  if (!cleanNumber) {
    return { success: false, error: 'Ingrese un número de RUC (11 dígitos) o DNI (8 dígitos).' };
  }

  if (cleanNumber.length !== 11 && cleanNumber.length !== 8) {
    return { success: false, error: 'El RUC debe tener 11 dígitos o el DNI 8 dígitos.' };
  }

  // 1. Try our Express backend API endpoint first (Bypasses CORS completely)
  try {
    const apiRes = await fetch(`/api/sunat/${cleanNumber}`);
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.success) {
        return data;
      }
    } else {
      const errData = await apiRes.json().catch(() => null);
      if (errData && errData.error) {
        // If server explicitly returned an error message, save it
        console.warn('Backend SUNAT endpoint message:', errData.error);
      }
    }
  } catch (err) {
    console.warn('Backend API request failed, trying client fallback:', err);
  }

  // 2. Direct client fallback via CORS proxies if backend fails
  if (cleanNumber.length === 11) {
    // Try AllOrigins CORS proxy
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.apis.net.pe/v2/sunat/ruc?numero=${cleanNumber}`)}`;
      const response = await fetch(proxyUrl);
      if (response.ok) {
        const data = await response.json();
        const name = data.razonSocial || data.nombre;
        const rawAddress = data.direccionCompleta || data.direccion || '';
        const address = buildFullFiscalAddress(rawAddress, data.distrito, data.provincia, data.departamento);
        if (name) {
          return {
            success: true,
            name: name.trim(),
            address: address ? address.trim() : '',
            department: data.departamento,
            province: data.provincia,
            district: data.distrito,
            condition: data.condicion || 'HABIDO',
            state: data.estado || 'ACTIVO'
          };
        }
      }
    } catch (e) {
      console.warn('Client proxy fallback error:', e);
    }

    // Fallback for RUC 10 (Persona Natural con Negocio) -> query DNI (digits 3..10)
    if (cleanNumber.startsWith('10')) {
      const dniPart = cleanNumber.substring(2, 10);
      try {
        const proxyDniUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://api.apis.net.pe/v2/reniec/dni?numero=${dniPart}`)}`;
        const response = await fetch(proxyDniUrl);
        if (response.ok) {
          const data = await response.json();
          const fullName = `${data.nombres || ''} ${data.apellidoPaterno || ''} ${data.apellidoMaterno || ''}`.trim();
          if (fullName) {
            return {
              success: true,
              name: fullName,
              address: '',
              condition: 'HABIDO',
              state: 'ACTIVO'
            };
          }
        }
      } catch (e) {
        console.warn('RUC 10 DNI fallback error:', e);
      }
    }

    return {
      success: false,
      error: 'No se pudieron obtener los datos automáticos en este momento. Puede ingresar el nombre / Razón Social y Dirección Fiscal manualmente.'
    };
  }

  // DNI 8 digits fallback
  const clientDniEndpoints = [
    `https://api.apis.net.pe/v1/dni?numero=${cleanNumber}`,
    `https://api.apis.net.pe/v2/reniec/dni?numero=${cleanNumber}`,
    `https://dniruc.apisperu.com/api/v1/dni/${cleanNumber}`,
    `https://api.atypical.pe/dni/${cleanNumber}`,
    `https://consultaruc.isunat.com/api/dni/${cleanNumber}`,
    `https://api.factiliza.com/peru/v1/dni/info/${cleanNumber}`
  ];

  for (const ep of clientDniEndpoints) {
    try {
      const proxyDniUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ep)}`;
      const response = await fetch(proxyDniUrl);
      if (response.ok) {
        const data = await response.json();
        const t = data.data || data.result || data;
        const first = t.nombres || t.nombre || t.first_name || '';
        const pat = t.apellidoPaterno || t.apellido_paterno || t.paterno || '';
        const mat = t.apellidoMaterno || t.apellido_materno || t.materno || '';
        const full = `${first} ${pat} ${mat}`.trim() || t.nombre_completo || t.full_name || t.nombre || t.razonSocial;
        if (full && full.length > 3) {
          return {
            success: true,
            name: String(full).trim(),
            address: ''
          };
        }
      }
    } catch (e) {
      console.warn('Client DNI proxy fallback error:', e);
    }
  }

  return {
    success: false,
    error: 'No se encontraron datos automáticos en RENIEC/SUNAT para este DNI. Ingrese el nombre manualmente.'
  };
}
