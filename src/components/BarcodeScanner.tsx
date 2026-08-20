"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

export default function BarcodeScanner({
  isOpen,
  onClose,
  onScan,
}: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const scannerId = "barcode-scanner-region";
    let mounted = true;

    const stopScanner = async () => {
      if (scannerRef.current?.isScanning) {
        try {
          await scannerRef.current.stop();
          scannerRef.current.clear();
        } catch {
          // Scanner ya detenido
        }
      }
      scannerRef.current = null;
    };

    const startScanner = async () => {
      setIsStarting(true);
      setError(null);

      try {
        const scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) {
          throw new Error("No se encontraron cámaras disponibles");
        }

        const rearCamera =
          cameras.find((c) => /back|rear|environment/i.test(c.label)) ??
          cameras[0];

        await scanner.start(
          rearCamera.id,
          {
            fps: 10,
            qrbox: { width: 280, height: 160 },
            aspectRatio: 1.5,
          },
          (decodedText) => {
            onScan(decodedText.trim());
            void stopScanner();
            onClose();
          },
          () => {
            // Ignorar errores de escaneo continuo (sin código detectado)
          }
        );
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo iniciar la cámara. Verifica los permisos."
          );
        }
      } finally {
        if (mounted) setIsStarting(false);
      }
    };

    void startScanner();

    return () => {
      mounted = false;
      void stopScanner();
    };
  }, [isOpen, onClose, onScan]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Escanear código de barras
            </h2>
            <p className="text-sm text-slate-500">
              Apunta la cámara al código de barras o QR del producto
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar escáner"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {isStarting && (
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              Iniciando cámara...
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div
            id="barcode-scanner-region"
            className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900"
          />

          <p className="mt-4 text-center text-xs text-slate-500">
            Compatible con códigos de barras EAN, UPC, Code 128 y QR
          </p>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
