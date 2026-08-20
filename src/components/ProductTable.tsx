"use client";

import type { Product } from "@/types/product";
import { UNIT_OPTIONS } from "@/types/product";

interface ProductTableProps {
  products: Product[];
  loading: boolean;
  onEdit: (product: Product) => void;
  onDeactivate: (product: Product) => void;
  onDelete: (product: Product) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function getUnitLabel(value: string): string {
  return UNIT_OPTIONS.find((u) => u.value === value)?.label ?? value;
}

export default function ProductTable({
  products,
  loading,
  onEdit,
  onDeactivate,
  onDelete,
}: ProductTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          Cargando productos...
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 rounded-full bg-slate-100 p-4">
          <svg
            className="h-8 w-8 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-700">
          No hay productos registrados
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Crea tu primer producto o escanea un código de barras
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              Código
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
              Producto
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
              Precio venta
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
              Costo
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
              IVA
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
              Stock
            </th>
            <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">
              Estado
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {products.map((product) => (
            <tr
              key={product.id}
              className={`transition-colors hover:bg-slate-50 ${
                product.estado === "inactivo" ? "opacity-60" : ""
              }`}
            >
              <td className="whitespace-nowrap px-4 py-3">
                <span className="font-mono text-sm font-medium text-slate-900">
                  {product.codigo}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="max-w-xs">
                  <p className="text-sm font-medium text-slate-900">
                    {product.nombre}
                  </p>
                  {product.descripcion && (
                    <p className="truncate text-xs text-slate-500">
                      {product.descripcion}
                    </p>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                {formatCurrency(product.precioVenta)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-500">
                {formatCurrency(product.costoCompra)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-slate-600">
                {product.impuestoIva}%
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <span
                  className={`text-sm font-medium ${
                    product.cantidad <= 5
                      ? "text-amber-600"
                      : "text-slate-700"
                  }`}
                >
                  {product.cantidad}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {getUnitLabel(product.unidadMedida)}
                  </span>
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-center">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    product.estado === "activo"
                      ? "bg-green-100 text-green-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {product.estado === "activo" ? "Activo" : "Inactivo"}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(product)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-brand-50 hover:text-brand-600"
                    title="Editar"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {product.estado === "activo" && (
                    <button
                      type="button"
                      onClick={() => onDeactivate(product)}
                      className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-600"
                      title="Desactivar"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(product)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    title="Eliminar"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
