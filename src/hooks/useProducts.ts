"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createProduct,
  deactivateProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
} from "@/lib/api/products";
import type { Product, ProductFormData } from "@/types/product";

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleCreate = async (data: ProductFormData) => {
    const created = await createProduct(data);
    setProducts((prev) => [...prev, created]);
    return created;
  };

  const handleUpdate = async (id: string, data: ProductFormData) => {
    const updated = await updateProduct(id, data);
    setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  };

  const handleDeactivate = async (id: string) => {
    const updated = await deactivateProduct(id);
    setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  };

  const handleDelete = async (id: string) => {
    await deleteProduct(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  };

  return {
    products,
    loading,
    error,
    reload: loadProducts,
    createProduct: handleCreate,
    updateProduct: handleUpdate,
    deactivateProduct: handleDeactivate,
    deleteProduct: handleDelete,
  };
}
