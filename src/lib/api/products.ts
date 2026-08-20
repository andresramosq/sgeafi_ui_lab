import {
  API_BASE_URL,
  LOCAL_STORAGE_KEY,
  USE_LOCAL_STORAGE,
} from "@/lib/config";
import type { Product, ProductFormData } from "@/types/product";

// ─────────────────────────────────────────────────────────────────────────────
// CAPA DE API — Conecta aquí tu backend de inventario
// Descomenta cada bloque fetch y ajusta las URLs según tu API.
// ─────────────────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function readLocalProducts(): Product[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Product[]) : [];
  } catch {
    return [];
  }
}

function writeLocalProducts(products: Product[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
}

/** GET /products — Listar todos los productos */
export async function fetchProducts(): Promise<Product[]> {
  if (USE_LOCAL_STORAGE) {
    return readLocalProducts();
  }

  // const response = await fetch(`${API_BASE_URL}/products`, {
  //   method: "GET",
  //   headers: { "Content-Type": "application/json" },
  // });
  // if (!response.ok) throw new Error("Error al obtener productos");
  // return response.json();

  return [];
}

/** GET /products/:id — Obtener un producto por ID */
export async function fetchProductById(id: string): Promise<Product | null> {
  if (USE_LOCAL_STORAGE) {
    return readLocalProducts().find((p) => p.id === id) ?? null;
  }

  // const response = await fetch(`${API_BASE_URL}/products/${id}`, {
  //   method: "GET",
  //   headers: { "Content-Type": "application/json" },
  // });
  // if (response.status === 404) return null;
  // if (!response.ok) throw new Error("Error al obtener el producto");
  // return response.json();

  return null;
}

/** GET /products?codigo=XXX — Buscar producto por código/SKU */
export async function fetchProductByCode(
  codigo: string
): Promise<Product | null> {
  if (USE_LOCAL_STORAGE) {
    return (
      readLocalProducts().find(
        (p) => p.codigo.toLowerCase() === codigo.toLowerCase()
      ) ?? null
    );
  }

  // const response = await fetch(
  //   `${API_BASE_URL}/products?codigo=${encodeURIComponent(codigo)}`,
  //   {
  //     method: "GET",
  //     headers: { "Content-Type": "application/json" },
  //   }
  // );
  // if (response.status === 404) return null;
  // if (!response.ok) throw new Error("Error al buscar producto por código");
  // const data = await response.json();
  // return Array.isArray(data) ? data[0] ?? null : data;

  return null;
}

/** POST /products — Crear un nuevo producto */
export async function createProduct(data: ProductFormData): Promise<Product> {
  if (USE_LOCAL_STORAGE) {
    const products = readLocalProducts();
    const now = new Date().toISOString();
    const newProduct: Product = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    };
    products.push(newProduct);
    writeLocalProducts(products);
    return newProduct;
  }

  // const response = await fetch(`${API_BASE_URL}/products`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(data),
  // });
  // if (!response.ok) throw new Error("Error al crear el producto");
  // return response.json();

  throw new Error("Configura tu backend y descomenta createProduct");
}

/** PUT /products/:id — Actualizar un producto existente */
export async function updateProduct(
  id: string,
  data: ProductFormData
): Promise<Product> {
  if (USE_LOCAL_STORAGE) {
    const products = readLocalProducts();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Producto no encontrado");
    const updated: Product = {
      ...products[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    products[index] = updated;
    writeLocalProducts(products);
    return updated;
  }

  // const response = await fetch(`${API_BASE_URL}/products/${id}`, {
  //   method: "PUT",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify(data),
  // });
  // if (!response.ok) throw new Error("Error al actualizar el producto");
  // return response.json();

  throw new Error("Configura tu backend y descomenta updateProduct");
}

/** PATCH /products/:id/deactivate — Desactivar producto (cambiar estado a inactivo) */
export async function deactivateProduct(id: string): Promise<Product> {
  if (USE_LOCAL_STORAGE) {
    const products = readLocalProducts();
    const index = products.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Producto no encontrado");
    products[index] = {
      ...products[index],
      estado: "inactivo",
      updatedAt: new Date().toISOString(),
    };
    writeLocalProducts(products);
    return products[index];
  }

  // const response = await fetch(`${API_BASE_URL}/products/${id}/deactivate`, {
  //   method: "PATCH",
  //   headers: { "Content-Type": "application/json" },
  // });
  // if (!response.ok) throw new Error("Error al desactivar el producto");
  // return response.json();

  throw new Error("Configura tu backend y descomenta deactivateProduct");
}

/** DELETE /products/:id — Eliminar producto permanentemente */
export async function deleteProduct(id: string): Promise<void> {
  if (USE_LOCAL_STORAGE) {
    const products = readLocalProducts().filter((p) => p.id !== id);
    writeLocalProducts(products);
    return;
  }

  // const response = await fetch(`${API_BASE_URL}/products/${id}`, {
  //   method: "DELETE",
  //   headers: { "Content-Type": "application/json" },
  // });
  // if (!response.ok) throw new Error("Error al eliminar el producto");

  throw new Error("Configura tu backend y descomenta deleteProduct");
}
