/**
 * Configuración de la API del backend de inventario.
 *
 * Para conectar tu backend:
 * 1. Crea un archivo `.env.local` en la raíz del proyecto.
 * 2. Define: NEXT_PUBLIC_API_URL=http://localhost:3001/api
 * 3. Descomenta las funciones fetch en `src/lib/api/products.ts`.
 * 4. Cambia USE_LOCAL_STORAGE a false.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/** Cambia a false cuando tu backend esté listo y los fetch estén descomentados */
export const USE_LOCAL_STORAGE = true;

export const LOCAL_STORAGE_KEY = "inventory_products";
