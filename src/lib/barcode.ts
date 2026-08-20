/** Validación y normalización de códigos de barras */

export function digitsOnly(code: string): string {
  return code.replace(/\D/g, "");
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function isValidEan8(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export function isValidUpcA(code: string): boolean {
  if (!/^\d{12}$/.test(code)) return false;
  const d = code.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Rechaza lecturas basura; valida checksum en EAN/UPC */
export function isValidBarcode(code: string): boolean {
  if (/^\d{13}$/.test(code)) return isValidEan13(code);
  if (/^\d{8}$/.test(code)) return isValidEan8(code);
  if (/^\d{12}$/.test(code)) return isValidUpcA(code);
  if (/^\d{6,}$/.test(code)) return true;
  if (/^[A-Za-z0-9\-.$/+%]+$/.test(code) && code.length >= 4) return true;
  return false;
}

export function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = digitsOnly(trimmed);

  if (digits.length >= 6 && digits.length === trimmed.replace(/\s/g, "").length) {
    return digits;
  }

  if (/^[A-Za-z0-9\-.$/+%]+$/.test(trimmed.replace(/\s/g, "")) && trimmed.length >= 4) {
    return trimmed.replace(/\s/g, "");
  }

  return null;
}
