"use client";

import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatOneDReader,
  type IScannerControls,
} from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

function createReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);

  return new BrowserMultiFormatOneDReader(hints, {
    delayBetweenScanAttempts: 80,
    delayBetweenScanSuccess: 1500,
  });
}

function stopCamera(
  controls: IScannerControls | null,
  video: HTMLVideoElement | null
) {
  controls?.stop();
  if (video?.srcObject) {
    (video.srcObject as MediaStream)
      .getTracks()
      .forEach((track) => track.stop());
    video.srcObject = null;
  }
}

export default function BarcodeScanner({
  isOpen,
  onClose,
  onScan,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatOneDReader | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const lastScanRef = useRef({ code: "", time: 0 });

  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const handleDetectedCode = (code: string) => {
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

    stopCamera(controlsRef.current, videoRef.current);
    controlsRef.current = null;
    onScanRef.current(trimmed);
    onCloseRef.current();
  };

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const reader = createReader();
    readerRef.current = reader;

    const startScanner = async () => {
      setIsStarting(true);
      setIsScanning(false);
      setError(null);
      setManualCode("");

      const video = videoRef.current;
      if (!video) {
        setError("No se pudo inicializar el visor de cámara");
        setIsStarting(false);
        return;
      }

      try {
        const controls = await reader.decodeFromConstraints(
          {
            video: {
              width: { min: 640, ideal: 1920 },
              height: { min: 480, ideal: 1080 },
              facingMode: { ideal: "environment" },
            } as MediaTrackConstraints,
          },
          video,
          (result) => {
            if (!mounted || !result) return;
            handleDetectedCode(result.getText());
          }
        );

        if (!mounted) {
          stopCamera(controls, video);
          return;
        }

        controlsRef.current = controls;
        setIsScanning(true);
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo iniciar la cámara. Verifica los permisos del navegador."
          );
        }
      } finally {
        if (mounted) setIsStarting(false);
      }
    };

    void startScanner();

    return () => {
      mounted = false;
      const video = videoRef.current;
      stopCamera(controlsRef.current, video);
      controlsRef.current = null;
      readerRef.current = null;
    };
  }, [isOpen]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    stopCamera(controlsRef.current, videoRef.current);
    onScan(code);
    onClose();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !readerRef.current) return;

    setImageLoading(true);
    setError(null);

    const url = URL.createObjectURL(file);
    try {
      const result = await readerRef.current.decodeFromImageUrl(url);
      handleDetectedCode(result.getText());
    } catch {
      setError(
        "No se detectó código en la imagen. Intenta con mejor luz y el código más grande."
      );
    } finally {
      URL.revokeObjectURL(url);
      setImageLoading(false);
      e.target.value = "";
    }
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
              Alinea el código en horizontal dentro del recuadro verde
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

          {isScanning && !error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-green-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Escaneando... mueve el código lentamente
            </div>
          )}

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-black">
            <video
              ref={videoRef}
              className="block w-full object-cover"
              style={{ minHeight: 240, maxHeight: 360 }}
              playsInline
              muted
              autoPlay
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-[85%] rounded border-2 border-green-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            </div>
          </div>

          <ul className="mt-3 space-y-1 text-xs text-slate-500">
            <li>• Código en horizontal, dentro del recuadro verde</li>
            <li>• Distancia: 10–20 cm, con buena iluminación</li>
            <li>• Acerca o aleja lentamente si no detecta</li>
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
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
