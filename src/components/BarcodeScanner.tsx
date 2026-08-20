"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { captureVideoFrame, decodeBarcodeFromFile } from "@/lib/decodeBarcode";
import { normalizeBarcode } from "@/lib/barcode";

const SCANNER_DIV = "barcode-camera";

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
  const cameraRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopCamera = useCallback(async () => {
    const cam = cameraRef.current;
    cameraRef.current = null;
    if (cam?.isScanning) {
      try {
        await cam.stop();
        cam.clear();
      } catch {
        try {
          cam.clear();
        } catch {
          /* noop */
        }
      }
    }
    setCameraReady(false);
  }, []);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setDetectedCode(null);
    setPreview(URL.createObjectURL(file));

    try {
      const raw = await decodeBarcodeFromFile(file);
      const code = normalizeBarcode(raw);
      if (!code) throw new Error("Código leído pero formato no válido");
      setDetectedCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se detectó código");
    } finally {
      setLoading(false);
    }
  }, []);

  const captureFromCamera = useCallback(async () => {
    const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_DIV} video`);
    if (!video?.videoWidth) {
      setError("La cámara no está lista. Espera un momento.");
      return;
    }
    try {
      const file = await captureVideoFrame(video);
      await processFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al capturar");
    }
  }, [processFile]);

  const handlePhotoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    e.target.value = "";
  };

  const handleConfirm = async () => {
    if (!detectedCode) return;
    await stopCamera();
    onScanRef.current(detectedCode);
    onCloseRef.current();
  };

  const handleRetry = () => {
    setPreview(null);
    setDetectedCode(null);
    setError(null);
  };

  useEffect(() => {
    if (!isOpen) {
      void stopCamera();
      setPreview(null);
      setDetectedCode(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      setCameraReady(false);
      setError(null);
      await new Promise((r) => setTimeout(r, 100));
      if (cancelled) return;

      try {
        await stopCamera();
        const camera = new Html5Qrcode(SCANNER_DIV, { verbose: false });
        cameraRef.current = camera;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) throw new Error("No hay cámara");

        const id =
          cameras.find((c) => /back|rear|environment/i.test(c.label))?.id ??
          cameras[cameras.length - 1].id;

        await camera.start(id, { fps: 15, aspectRatio: 1.777778 }, () => {}, () => {});
        if (!cancelled) setCameraReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error de cámara");
        }
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      void stopCamera();
    };
  }, [isOpen, stopCamera]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Escanear código de barras</h2>
          <button
            type="button"
            onClick={() => {
              void stopCamera();
              onClose();
            }}
            className="text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* MÉTODO 1: Tomar foto — el más fiable */}
          <label className="btn-primary w-full cursor-pointer justify-center py-3 text-base">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoInput}
              disabled={loading}
            />
            📷 Tomar foto del código de barras
          </label>

          <p className="text-center text-xs text-slate-500">
            Recomendado: toma la foto con el código grande y nítido
          </p>

          <div className="relative text-center text-xs text-slate-400">
            <span className="bg-white px-2">o usar cámara en vivo</span>
            <div className="absolute left-0 right-0 top-1/2 -z-10 border-t border-slate-200" />
          </div>

          {/* Cámara en vivo */}
          <div
            id={SCANNER_DIV}
            className="scanner-live overflow-hidden rounded-lg border-2 border-slate-300 bg-black"
          />

          {cameraReady && !preview && (
            <button
              type="button"
              onClick={() => void captureFromCamera()}
              disabled={loading}
              className="btn-secondary w-full justify-center py-3 text-base"
            >
              {loading ? "Analizando..." : "📸 Capturar ahora (congelar frame)"}
            </button>
          )}

          {/* Preview + resultado */}
          {loading && (
            <p className="text-center text-sm text-slate-600">Analizando imagen...</p>
          )}

          {preview && (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Foto del código" className="w-full object-contain" />
            </div>
          )}

          {detectedCode && (
            <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4">
              <p className="text-sm font-medium text-green-800">Código detectado</p>
              <p className="mt-1 break-all font-mono text-2xl font-bold text-slate-900">
                {detectedCode}
              </p>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                className="btn-primary mt-3 w-full justify-center py-3"
              >
                Confirmar y usar este código
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
              <button
                type="button"
                onClick={handleRetry}
                className="mt-2 block font-medium underline"
              >
                Intentar de nuevo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
