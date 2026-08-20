"use client";

import { useCallback, useMemo, useState } from "react";
import BarcodeScanner from "@/components/BarcodeScanner";
import { useUsbBarcode } from "@/hooks/useUsbBarcode";
import ProductFilters, {
  type ProductFiltersState,
} from "@/components/ProductFilters";
import ProductForm from "@/components/ProductForm";
import ProductTable from "@/components/ProductTable";
import { fetchProductByCode } from "@/lib/api/products";
import { USE_LOCAL_STORAGE } from "@/lib/config";
import { useProducts } from "@/hooks/useProducts";
import type { Product, ProductFormData } from "@/types/product";

export default function InventoryPage() {
  const {
    products,
    loading,
    error,
    reload,
    createProduct,
    updateProduct,
    deactivateProduct,
    deleteProduct,
  } = useProducts();

  const [filters, setFilters] = useState<ProductFiltersState>({
    search: "",
    estado: "todos",
  });

  const [formOpen, setFormOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [scannedCode, setScannedCode] = useState<string | undefined>();
  const [formTitle, setFormTitle] = useState<string | undefined>();
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info" = "success") => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 4000);
    },
    []
  );

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !filters.search ||
        p.codigo.toLowerCase().includes(filters.search.toLowerCase()) ||
        p.nombre.toLowerCase().includes(filters.search.toLowerCase()) ||
        p.descripcion.toLowerCase().includes(filters.search.toLowerCase());

      const matchesEstado =
        filters.estado === "todos" || p.estado === filters.estado;

      return matchesSearch && matchesEstado;
    });
  }, [products, filters]);

  const openCreateForm = () => {
    setEditingProduct(null);
    setScannedCode(undefined);
    setFormTitle(undefined);
    setFormOpen(true);
  };

  const openEditForm = (product: Product) => {
    setEditingProduct(product);
    setScannedCode(undefined);
    setFormTitle(undefined);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingProduct(null);
    setScannedCode(undefined);
    setFormTitle(undefined);
  };

  const handleFormSubmit = async (data: ProductFormData) => {
    if (editingProduct) {
      await updateProduct(editingProduct.id, data);
      showToast(`Producto "${data.nombre}" actualizado correctamente`);
    } else {
      await createProduct(data);
      showToast(`Producto "${data.nombre}" creado correctamente`);
    }
  };

  const handleDeactivate = async (product: Product) => {
    if (
      !window.confirm(
        `¿Desactivar el producto "${product.nombre}"? Podrás reactivarlo editándolo.`
      )
    ) {
      return;
    }
    try {
      await deactivateProduct(product.id);
      showToast(`Producto "${product.nombre}" desactivado`);
    } catch {
      showToast("Error al desactivar el producto", "error");
    }
  };

  const handleDelete = async (product: Product) => {
    if (
      !window.confirm(
        `¿Eliminar permanentemente "${product.nombre}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    try {
      await deleteProduct(product.id);
      showToast(`Producto "${product.nombre}" eliminado`);
    } catch {
      showToast("Error al eliminar el producto", "error");
    }
  };

  const closeScanner = useCallback(() => setScannerOpen(false), []);

  const handleBarcodeScan = useCallback(async (code: string) => {
    try {
      const existing = await fetchProductByCode(code);

      if (existing) {
        setEditingProduct(existing);
        setScannedCode(undefined);
        setFormTitle(`Editar producto escaneado — ${code}`);
        setFormOpen(true);
        showToast(
          `Código encontrado: "${existing.nombre}". Modifica los campos y confirma.`,
          "info"
        );
      } else {
        setEditingProduct(null);
        setScannedCode(code);
        setFormTitle(`Nuevo producto — Código: ${code}`);
        setFormOpen(true);
        showToast(
          `Código nuevo: ${code}. Completa los datos del producto.`,
          "info"
        );
      }
    } catch {
      showToast("Error al buscar el código escaneado", "error");
    }
  }, [showToast]);

  // Lector USB en toda la página (modo teclado) — funciona sin abrir el modal
  useUsbBarcode(true, handleBarcodeScan);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Sistema de Inventario
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                UI de prueba para conectar tu backend de inventario
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="btn-secondary"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Escanear código
              </button>
              <button type="button" onClick={openCreateForm} className="btn-primary">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nuevo producto
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Status banner */}
        {USE_LOCAL_STORAGE && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-amber-800">
              <p className="font-medium">Modo local activo (localStorage)</p>
              <p className="mt-0.5">
                Los datos se guardan en el navegador. Para conectar tu backend,
                configura <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code> en{" "}
                <code className="rounded bg-amber-100 px-1">.env.local</code> y
                descomenta los fetch en{" "}
                <code className="rounded bg-amber-100 px-1">src/lib/api/products.ts</code>.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}{" "}
            <button
              type="button"
              onClick={reload}
              className="font-medium underline hover:no-underline"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ProductFilters
            filters={filters}
            onChange={setFilters}
            totalCount={products.length}
            filteredCount={filteredProducts.length}
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <ProductTable
            products={filteredProducts}
            loading={loading}
            onEdit={openEditForm}
            onDeactivate={handleDeactivate}
            onDelete={handleDelete}
          />
        </div>
      </main>

      {/* Modals */}
      <ProductForm
        isOpen={formOpen}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
        product={editingProduct}
        initialCode={scannedCode}
        title={formTitle}
      />

      <BarcodeScanner
        isOpen={scannerOpen}
        onClose={closeScanner}
        onScan={handleBarcodeScan}
      />

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : toast.type === "error"
                  ? "bg-red-600 text-white"
                  : "bg-brand-600 text-white"
            }`}
          >
            {toast.type === "success" && (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {toast.type === "error" && (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.type === "info" && (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
