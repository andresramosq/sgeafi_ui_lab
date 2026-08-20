"use client";

import type { ProductStatus } from "@/types/product";

export interface ProductFiltersState {
  search: string;
  estado: ProductStatus | "todos";
}

interface ProductFiltersProps {
  filters: ProductFiltersState;
  onChange: (filters: ProductFiltersState) => void;
  totalCount: number;
  filteredCount: number;
}

export default function ProductFilters({
  filters,
  onChange,
  totalCount,
  filteredCount,
}: ProductFiltersProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-1 flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="search" className="label">
            Buscar
          </label>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              id="search"
              type="text"
              placeholder="Código, nombre o descripción..."
              className="input pl-10"
              value={filters.search}
              onChange={(e) =>
                onChange({ ...filters, search: e.target.value })
              }
            />
          </div>
        </div>

        <div className="w-full sm:w-48">
          <label htmlFor="estado-filter" className="label">
            Estado
          </label>
          <select
            id="estado-filter"
            className="input"
            value={filters.estado}
            onChange={(e) =>
              onChange({
                ...filters,
                estado: e.target.value as ProductFiltersState["estado"],
              })
            }
          >
            <option value="todos">Todos</option>
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Mostrando <span className="font-medium text-slate-700">{filteredCount}</span> de{" "}
        <span className="font-medium text-slate-700">{totalCount}</span> productos
      </p>
    </div>
  );
}
