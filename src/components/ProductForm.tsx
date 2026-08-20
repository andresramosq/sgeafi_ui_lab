"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Product, ProductFormData } from "@/types/product";
import {
  EMPTY_PRODUCT_FORM,
  TAX_OPTIONS,
  UNIT_OPTIONS,
} from "@/types/product";

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ProductFormData) => Promise<void>;
  product?: Product | null;
  initialCode?: string;
  title?: string;
}

export default function ProductForm({
  isOpen,
  onClose,
  onSubmit,
  product,
  initialCode,
  title,
}: ProductFormProps) {
  const [form, setForm] = useState<ProductFormData>(EMPTY_PRODUCT_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(product);

  useEffect(() => {
    if (!isOpen) return;

    if (product) {
      setForm({
        codigo: product.codigo,
        nombre: product.nombre,
        descripcion: product.descripcion,
        precioVenta: product.precioVenta,
        costoCompra: product.costoCompra,
        impuestoIva: product.impuestoIva,
        cantidad: product.cantidad,
        unidadMedida: product.unidadMedida,
        estado: product.estado,
      });
    } else {
      setForm({
        ...EMPTY_PRODUCT_FORM,
        codigo: initialCode ?? "",
      });
    }
    setErrors({});
  }, [isOpen, product, initialCode]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ProductFormData, string>> = {};

    if (!form.codigo.trim()) newErrors.codigo = "El código es obligatorio";
    if (!form.nombre.trim()) newErrors.nombre = "El nombre es obligatorio";
    if (form.precioVenta < 0) newErrors.precioVenta = "El precio no puede ser negativo";
    if (form.costoCompra < 0) newErrors.costoCompra = "El costo no puede ser negativo";
    if (form.cantidad < 0) newErrors.cantidad = "La cantidad no puede ser negativa";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(form);
      onClose();
    } catch (err) {
      setErrors({
        codigo: err instanceof Error ? err.message : "Error al guardar",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = <K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-xl font-semibold text-slate-900">
            {title ?? (isEditing ? "Editar producto" : "Nuevo producto")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar formulario"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="codigo" className="label">
                Código (SKU / Barras) <span className="text-red-500">*</span>
              </label>
              <input
                id="codigo"
                type="text"
                className={`input ${errors.codigo ? "border-red-500" : ""}`}
                value={form.codigo}
                onChange={(e) => updateField("codigo", e.target.value)}
                placeholder="Ej: 7701234567890"
              />
              {errors.codigo && (
                <p className="mt-1 text-xs text-red-600">{errors.codigo}</p>
              )}
            </div>

            <div>
              <label htmlFor="nombre" className="label">
                Nombre del producto <span className="text-red-500">*</span>
              </label>
              <input
                id="nombre"
                type="text"
                className={`input ${errors.nombre ? "border-red-500" : ""}`}
                value={form.nombre}
                onChange={(e) => updateField("nombre", e.target.value)}
                placeholder="Nombre comercial"
              />
              {errors.nombre && (
                <p className="mt-1 text-xs text-red-600">{errors.nombre}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="descripcion" className="label">
              Descripción
            </label>
            <textarea
              id="descripcion"
              rows={3}
              className="input resize-none"
              value={form.descripcion}
              onChange={(e) => updateField("descripcion", e.target.value)}
              placeholder="Descripción detallada del producto..."
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="precioVenta" className="label">
                Precio de venta
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  $
                </span>
                <input
                  id="precioVenta"
                  type="number"
                  min="0"
                  step="0.01"
                  className={`input pl-7 ${errors.precioVenta ? "border-red-500" : ""}`}
                  value={form.precioVenta || ""}
                  onChange={(e) =>
                    updateField("precioVenta", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              {errors.precioVenta && (
                <p className="mt-1 text-xs text-red-600">{errors.precioVenta}</p>
              )}
            </div>

            <div>
              <label htmlFor="costoCompra" className="label">
                Costo de compra
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  $
                </span>
                <input
                  id="costoCompra"
                  type="number"
                  min="0"
                  step="0.01"
                  className={`input pl-7 ${errors.costoCompra ? "border-red-500" : ""}`}
                  value={form.costoCompra || ""}
                  onChange={(e) =>
                    updateField("costoCompra", parseFloat(e.target.value) || 0)
                  }
                />
              </div>
              {errors.costoCompra && (
                <p className="mt-1 text-xs text-red-600">{errors.costoCompra}</p>
              )}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor="impuestoIva" className="label">
                Impuesto (IVA %)
              </label>
              <select
                id="impuestoIva"
                className="input"
                value={form.impuestoIva}
                onChange={(e) =>
                  updateField("impuestoIva", parseInt(e.target.value, 10))
                }
              >
                {TAX_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cantidad" className="label">
                Cantidad (Stock)
              </label>
              <input
                id="cantidad"
                type="number"
                min="0"
                step="1"
                className={`input ${errors.cantidad ? "border-red-500" : ""}`}
                value={form.cantidad || ""}
                onChange={(e) =>
                  updateField("cantidad", parseInt(e.target.value, 10) || 0)
                }
              />
              {errors.cantidad && (
                <p className="mt-1 text-xs text-red-600">{errors.cantidad}</p>
              )}
            </div>

            <div>
              <label htmlFor="unidadMedida" className="label">
                Unidad de medida
              </label>
              <select
                id="unidadMedida"
                className="input"
                value={form.unidadMedida}
                onChange={(e) =>
                  updateField(
                    "unidadMedida",
                    e.target.value as ProductFormData["unidadMedida"]
                  )
                }
              >
                {UNIT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="estado" className="label">
              Estado
            </label>
            <select
              id="estado"
              className="input sm:w-48"
              value={form.estado}
              onChange={(e) =>
                updateField("estado", e.target.value as ProductFormData["estado"])
              }
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Guardando...
                </>
              ) : isEditing ? (
                "Actualizar producto"
              ) : (
                "Crear producto"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
