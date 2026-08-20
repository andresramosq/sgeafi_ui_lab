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

/** Acepta cualquier longitud de código de barras (mínimo 3 caracteres) */
export function isValidBarcode(code: string): boolean {
  if (!code || code.length < 3) return false;
  if (/^\d+$/.test(code)) return true;
  if (/^[A-Za-z0-9\-.$/+%]+$/.test(code)) return true;
  return false;
}

export function normalizeBarcode(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const digits = digitsOnly(trimmed);
  const clean = trimmed.replace(/\s/g, "");

  if (digits.length >= 3 && digits.length === clean.length) {
    return digits;
  }

  if (/^[A-Za-z0-9\-.$/+%]+$/.test(clean) && clean.length >= 3) {
    return clean;
  }

  if (digits.length >= 3) return digits;

  return null;
}
