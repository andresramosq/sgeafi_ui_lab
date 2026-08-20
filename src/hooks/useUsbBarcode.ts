import { useEffect, useRef } from "react";
import { normalizeBarcode } from "@/lib/barcode";

const SCAN_GAP_MS = 80;
const MIN_SCAN_LENGTH = 4;

/**
 * Escáner USB (modo teclado): detecta tecleo rápido terminado en Enter.
 * Es el método que usan Odoo, Alegra y la mayoría de POS.
 */
export function useUsbBarcode(
  enabled: boolean,
  onScan: (code: string) => void
) {
  const bufferRef = useRef("");
  const lastKeyRef = useRef(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const reset = () => {
      bufferRef.current = "";
      lastKeyRef.current = 0;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (e.key === "Enter") {
        const code = normalizeBarcode(bufferRef.current);
        if (code && code.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          onScanRef.current(code);
        }
        reset();
        return;
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      if (lastKeyRef.current && now - lastKeyRef.current > SCAN_GAP_MS) {
        bufferRef.current = "";
      }

      // Si el usuario escribe lento en un input, no interferir
      if (isInput && bufferRef.current === "") return;

      bufferRef.current += e.key;
      lastKeyRef.current = now;
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      reset();
    };
  }, [enabled]);
}
