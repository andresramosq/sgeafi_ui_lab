"use client";

import { useEffect, useRef, useState } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";

const SCANNER_DIV_ID = "barcode-scanner-region";

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
  const sessionRef = useRef(0);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const lastScanRef = useRef({ code: "", time: 0 });

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "starting" | "scanning" | "error"
  >("idle");
  const [manualCode, setManualCode] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      scanner.clear();
    } catch {
      try {
        scanner.clear();
      } catch {
        // ignorar
      }
    }
  };

  const handleDetectedCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (
      lastScanRef.current.code === trimmed &&
      now - lastScanRef.current.time < 2000
    ) {
      return;
    }
    lastScanRef.current = { code: trimmed, time: now };

    await stopScanner();
    onScanRef.current(trimmed);
    onCloseRef.current();
  };

  useEffect(() => {
    if (!isOpen) {
      void stopScanner();
      setStatus("idle");
      return;
    }

    const session = ++sessionRef.current;
    let cancelled = false;

    const startScanner = async () => {
      setStatus("starting");
      setError(null);
      setManualCode("");

      // Esperar montaje del DOM (y sobrevivir React Strict Mode)
      await new Promise((r) => setTimeout(r, 150));
      if (cancelled || session !== sessionRef.current) return;

      try {
        await stopScanner();
        if (cancelled || session !== sessionRef.current) return;

        const scanner = new Html5Qrcode(SCANNER_DIV_ID, {
          verbose: false,
          formatsToSupport: BARCODE_FORMATS,
          useBarCodeDetectorIfSupported: false,
        });
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (cancelled || session !== sessionRef.current) {
          await stopScanner();
          return;
        }

        if (!cameras.length) {
          throw new Error("No se encontraron cámaras en este dispositivo");
        }

        const cameraId =
          cameras.find((c) => /back|rear|environment/i.test(c.label))?.id ??
          cameras[cameras.length - 1].id;

        await scanner.start(
          cameraId,
          {
            fps: 10,
            // Sin qrbox = escanea todo el frame (mejor para barras 1D)
            aspectRatio: 1.777778,
            disableFlip: false,
          },
          (decodedText) => {
            if (cancelled || session !== sessionRef.current) return;
            void handleDetectedCode(decodedText);
          },
          () => {
            // Sin código en este frame — normal, seguir escaneando
          }
        );

        if (cancelled || session !== sessionRef.current) {
          await stopScanner();
          return;
        }

        setStatus("scanning");
      } catch (err) {
        if (!cancelled && session === sessionRef.current) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          if (/permission|denied|not allowed/i.test(msg)) {
            setError(
              "Permiso de cámara denegado. Actívalo en el navegador y recarga la página."
            );
          } else {
            setError(`No se pudo iniciar la cámara: ${msg}`);
          }
          setStatus("error");
        }
        await stopScanner();
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [isOpen]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    void stopScanner();
    onScan(code);
    onClose();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageLoading(true);
    setError(null);

    try {
      let scanner = scannerRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(SCANNER_DIV_ID, {
          verbose: false,
          formatsToSupport: BARCODE_FORMATS,
          useBarCodeDetectorIfSupported: false,
        });
      }
      const result = await scanner.scanFile(file, false);
      await handleDetectedCode(result);
    } catch {
      setError(
        "No se detectó código en la imagen. Intenta con mejor luz y el código más grande."
      );
      setStatus("error");
    } finally {
      setImageLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${
        isOpen ? "" : "hidden"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Escanear código de barras
            </h2>
            <p className="text-sm text-slate-500">
              Apunta la cámara al código de barras del producto
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void stopScanner();
              onClose();
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Cerrar escáner"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {status === "starting" && (
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              Iniciando cámara...
            </div>
          )}

          {status === "scanning" && !error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-green-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Cámara activa — acerca el código lentamente
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* html5-qrcode inyecta su propio <video> aquí */}
          <div
            id={SCANNER_DIV_ID}
            className="scanner-container overflow-hidden rounded-lg border border-slate-200 bg-black"
          />

          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            <li>• Código en horizontal, a 15–25 cm de la cámara</li>
            <li>• Buena iluminación, sin reflejos</li>
            <li>• Mueve el código despacio si no detecta de inmediato</li>
          </ul>

          <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4">
            <label className="btn-secondary cursor-pointer justify-center">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageUpload}
                disabled={imageLoading}
              />
              {imageLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  Analizando imagen...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Tomar foto / subir imagen del código
                </>
              )}
            </label>

            <form onSubmit={handleManualSubmit}>
              <label htmlFor="manual-code" className="label">
                O ingresa el código manualmente
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
                <button
                  type="submit"
                  className="btn-primary shrink-0"
                  disabled={!manualCode.trim()}
                >
                  Usar
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              void stopScanner();
              onClose();
            }}
            className="btn-secondary"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
