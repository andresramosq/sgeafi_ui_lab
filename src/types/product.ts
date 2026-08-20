export type UnitOfMeasure = "unidades" | "kg" | "litros" | "cajas";

export type ProductStatus = "activo" | "inactivo";

export interface Product {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  precioVenta: number;
  costoCompra: number;
  impuestoIva: number;
  cantidad: number;
  unidadMedida: UnitOfMeasure;
  estado: ProductStatus;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductFormData = Omit<Product, "id" | "createdAt" | "updatedAt">;

export const UNIT_OPTIONS: { value: UnitOfMeasure; label: string }[] = [
  { value: "unidades", label: "Unidades" },
  { value: "kg", label: "Kg" },
  { value: "litros", label: "Litros" },
  { value: "cajas", label: "Cajas" },
];

export const TAX_OPTIONS = [
  { value: 0, label: "0%" },
  { value: 5, label: "5%" },
  { value: 19, label: "19%" },
];

export const EMPTY_PRODUCT_FORM: ProductFormData = {
  codigo: "",
  nombre: "",
  descripcion: "",
  precioVenta: 0,
  costoCompra: 0,
  impuestoIva: 19,
  cantidad: 0,
  unidadMedida: "unidades",
  estado: "activo",
};
