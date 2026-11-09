# Plan de Implementación: Ajustes de Diseño en P. List Nuevo

## Objetivo
Optimizar el flujo visual y la disposición de controles exclusivamente en **P. List Nuevo** (`packingType === 'nuevo'`), moviendo el botón **Añadir Otro Artículo** al final de la sección de artículos y ocultando los textos de consejos y sugerencias rápidas para lograr una interfaz más limpia y directa.

## Cambios Propuestos

### 1. Reubicación del botón "Añadir Otro Artículo" (`src/components/PackingListForm.tsx`)
- En la sección **2. Artículos y Rollos**:
  - Cuando `packingType === 'nuevo'`, retirar el botón **Añadir Otro Artículo** del encabezado superior de la sección y colocarlo al final de la lista de artículos (`articleGroups`), justo debajo del último bloque de artículo con un diseño destacado y accesible.
  - Conservar su ubicación actual en el encabezado para los demás modos (`P. List Antiguo` y `P. List Corte`).
- Pasar la propiedad `packingType` al componente `ClientSellerSelector` para controlar la visibilidad de las sugerencias rápidas según el tipo de Packing List.

### 2. Eliminación de sugerencias rápidas en Datos del Despacho (`src/components/packing-list-form/ClientSellerSelector.tsx`)
- Añadir `packingType` a las propiedades de `ClientSellerSelector`.
- Cuando `packingType === 'nuevo'`, ocultar la fila de píldoras de sugerencias rápidas de clientes (**Recientes**).

### 3. Eliminación de sugerencias rápidas y textos de ayuda en Artículos (`src/components/packing-list-form/ArticleGroupSection.tsx`)
- Cuando `packingType === 'nuevo'`:
  - Ocultar la barra de píldoras de **Artículos rápidos** debajo del selector de artículos.
  - Ocultar el texto auxiliar junto al selector de modo (`Ráfaga / Excel / Manual` o `Seleccione rollos disponibles en inventario`).
  - Simplificar las etiquetas del bloque de Lote / Partida / Tono compartido, quitando el texto secundario `(Compartido - Sincroniza Filas)` y la nota de sincronización inferior.

### 4. Eliminación de textos de consejos en el cuadro de ingreso (`src/components/packing-list-form/ExcelPasteParser.tsx`)
- Cuando `packingType === 'nuevo'`:
  - Ocultar el texto inferior de **Consejo rápido / Requisito obligatorio** debajo del área de ingreso de datos.
  - Ocultar la etiqueta informativa `Soporta ráfaga (ej: 48.5 52 50x3)` en el encabezado del campo.

## Verificación
- Compilar la aplicación y verificar que no existan errores de TypeScript.
- Comprobar que en **P. List Nuevo** el botón **Añadir Otro Artículo** aparezca al final de la sección de artículos y que no se muestren los textos de consejos ni sugerencias rápidas.
- Comprobar que **P. List Antiguo** y **P. List Corte** mantengan su comportamiento y elementos actuales sin cambios.
