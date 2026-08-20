/** Normalización básica de códigos de barras — acepta EAN, UPC, Code 128, etc. */

export function digitsOnly(code: string): string {
  return code.replace(/\D/g, "");
}

/** Limpia y valida longitud mínima. No restringe a solo EAN-13. */
export function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = digitsOnly(trimmed);

  // Códigos numéricos (EAN-8, UPC, EAN-13, etc.)
  if (digits.length >= 4 && digits.length === trimmed.replace(/\s/g, "").length) {
    return digits;
  }

  // Alfanuméricos (Code 128, Code 39)
  if (/^[A-Za-z0-9\-.$/+% ]+$/.test(trimmed) && trimmed.length >= 4) {
    return trimmed.replace(/\s/g, "");
  }

  if (digits.length >= 4) return digits;

  return null;
}
