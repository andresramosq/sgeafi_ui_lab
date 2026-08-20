# Sistema de Inventario — UI de Prueba (Next.js)

Interfaz de usuario completa para probar un backend de inventario (estilo Odoo / Alegra) con operaciones CRUD, filtros de búsqueda y escáner de códigos de barras.

## Características

- **CRUD completo**: crear, leer, actualizar, desactivar y eliminar productos
- **Tabla con filtros**: búsqueda por código, nombre o descripción; filtro por estado
- **Formulario modal** con todos los campos estándar de producto físico
- **Escáner de códigos de barras** con `html5-qrcode` (cámara web + foto)
- **Capa API preparada** con funciones `fetch` comentadas para conectar tu backend

## Campos del producto

| Campo | Descripción |
|-------|-------------|
| Código | SKU o código de barras |
| Nombre | Nombre del producto |
| Descripción | Texto libre |
| Precio de venta | Valor de venta |
| Costo de compra | Costo unitario |
| Impuesto (IVA %) | 0%, 5% o 19% |
| Cantidad (Stock) | Unidades en inventario |
| Unidad de medida | Unidades, Kg, Litros, Cajas |
| Estado | Activo / Inactivo |

## Inicio rápido

```bash
# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

Por defecto la app usa **localStorage** para que puedas probar la UI sin backend.

## Conectar tu backend

1. Crea un archivo `.env.local` en la raíz:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

2. En `src/lib/config.ts`, cambia:

```ts
export const USE_LOCAL_STORAGE = false;
```

3. En `src/lib/api/products.ts`, descomenta los bloques `fetch` y ajusta las URLs según tu API.

### Endpoints esperados

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/products` | Listar todos los productos |
| `GET` | `/products/:id` | Obtener producto por ID |
| `GET` | `/products?codigo=XXX` | Buscar por código/SKU |
| `POST` | `/products` | Crear producto |
| `PUT` | `/products/:id` | Actualizar producto |
| `PATCH` | `/products/:id/deactivate` | Desactivar producto |
| `DELETE` | `/products/:id` | Eliminar producto |

### Formato JSON del producto

```json
{
  "id": "uuid",
  "codigo": "7701234567890",
  "nombre": "Producto ejemplo",
  "descripcion": "Descripción del producto",
  "precioVenta": 15000,
  "costoCompra": 10000,
  "impuestoIva": 19,
  "cantidad": 50,
  "unidadMedida": "unidades",
  "estado": "activo"
}
```

## Escáner de códigos de barras

- Haz clic en **"Escanear código"** para abrir la cámara web
- Si el código **no existe**: se abre el formulario de creación con el campo Código autocompletado
- Si el código **ya existe**: se abre el formulario de edición con todos los datos cargados

> Requiere permisos de cámara en el navegador. Funciona mejor en HTTPS o localhost.

## Estructura del proyecto

```
src/
├── app/
│   ├── layout.tsx          # Layout principal
│   ├── page.tsx            # Página de inventario
│   └── globals.css         # Estilos globales (Tailwind)
├── components/
│   ├── BarcodeScanner.tsx  # Escáner con html5-qrcode
│   ├── ProductFilters.tsx  # Filtros de búsqueda
│   ├── ProductForm.tsx     # Formulario crear/editar
│   └── ProductTable.tsx    # Tabla de productos
├── hooks/
│   └── useProducts.ts      # Hook de estado y CRUD
├── lib/
│   ├── config.ts           # Configuración API
│   └── api/
│       └── products.ts     # Funciones fetch (comentadas)
└── types/
    └── product.ts          # Tipos TypeScript
```

## Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **html5-qrcode** (escáner de códigos de barras)

## Scripts

```bash
npm run dev      # Desarrollo
npm run build    # Build de producción
npm run start    # Servidor de producción
npm run lint     # Linter
```
