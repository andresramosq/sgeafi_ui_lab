"use client";

import { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
];

export default function BarcodeScanner({
  isOpen,
  onClose,
  onScan,
}: BarcodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

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
      setManualCode("");

      try {
        const scanner = new Html5Qrcode(scannerId, {
          verbose: false,
          formatsToSupport: BARCODE_FORMATS,
          // ZXing suele leer mejor códigos 1D en webcam de PC que BarcodeDetector nativo
          useBarCodeDetectorIfSupported: false,
        });
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) {
          throw new Error("No se encontraron cámaras disponibles");
        }

        const preferredCamera =
          cameras.find((c) => /back|rear|environment/i.test(c.label)) ??
          cameras[cameras.length - 1];

        await scanner.start(
          preferredCamera.id,
          {
            fps: 20,
            // Sin qrbox: escanea todo el frame (mejor para barras 1D en webcam)
            disableFlip: true,
            videoConstraints: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          (decodedText) => {
            onScanRef.current(decodedText.trim());
            void stopScanner();
            onCloseRef.current();
          },
          () => {
            // Sin código en este frame; continuar escaneando
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
  }, [isOpen]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    onScan(code);
    onClose();
  };

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
              Centra el código de barras en la imagen de la cámara
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
            className="overflow-hidden rounded-lg border border-slate-200 bg-slate-900 [&_video]:!object-cover"
          />

          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            <li>• Mantén el código paralelo a la pantalla, a 15–25 cm</li>
            <li>• Asegúrate de tener buena iluminación</li>
            <li>• Evita reflejos sobre el plástico del código</li>
          </ul>

          <form onSubmit={handleManualSubmit} className="mt-5 border-t border-slate-200 pt-4">
            <label htmlFor="manual-code" className="label">
              ¿No lee? Ingresa el código manualmente
            </label>
            <div className="flex gap-2">
              <input
                id="manual-code"
                type="text"
                className="input font-mono"
                placeholder="Ej: 7701234567890"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                autoComplete="off"
              />
              <button type="submit" className="btn-primary shrink-0" disabled={!manualCode.trim()}>
                Usar
              </button>
            </div>
          </form>
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
