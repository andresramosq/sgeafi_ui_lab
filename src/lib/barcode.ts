/** Validación y normalización de códigos EAN-13 / UPC para productos retail */

export function digitsOnly(code: string): string {
  return code.replace(/\D/g, "");
}

/** Verifica dígito de control EAN-8, UPC-A (12) o EAN-13 */
export function isValidEanChecksum(digits: string): boolean {
  const n = digits.length;
  if (n !== 8 && n !== 12 && n !== 13) return false;

  let sum = 0;
  if (n === 8) {
    for (let i = 0; i < 7; i++) {
      sum += parseInt(digits[i], 10) * (i % 2 === 0 ? 3 : 1);
    }
  } else {
    for (let i = 0; i < n - 1; i++) {
      sum += parseInt(digits[i], 10) * (i % 2 === 0 ? 1 : 3);
    }
  }

  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(digits[n - 1], 10);
}

/**
 * Normaliza a EAN-13 válido. Rechaza EAN-8 y lecturas incompletas.
 * UPC-A (12 dígitos) → EAN-13 con cero al inicio.
 */
export function normalizeRetailBarcode(raw: string): string | null {
  const digits = digitsOnly(raw);

  if (digits.length === 12 && isValidEanChecksum(digits)) {
    return `0${digits}`;
  }

  if (digits.length === 13 && isValidEanChecksum(digits)) {
    return digits;
  }

  return null;
}

export function isRetailBarcodeLength(digits: string): boolean {
  return digits.length === 12 || digits.length === 13;
}
