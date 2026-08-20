"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { normalizeBarcode } from "@/lib/barcode";

const SCANNER_DIV = "barcode-live-scanner";
const CONFIRM_TIMEOUT_SEC = 5;
const MAX_ATTEMPTS = 3;

const FORMATS = [
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
  const cameraRef = useRef<Html5Qrcode | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<"scanning" | "confirm">("scanning");
  const attemptRef = useRef(0);
  const foundRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<"scanning" | "confirm">("scanning");
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [countdown, setCountdown] = useState(CONFIRM_TIMEOUT_SEC);
  const [isLastAttempt, setIsLastAttempt] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const clearTimers = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(async () => {
    clearTimers();
    phaseRef.current = "scanning";
    attemptRef.current = 0;

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
  }, [clearTimers]);

  const finalize = useCallback(
    async (code: string) => {
      if (foundRef.current) return;
      foundRef.current = true;
      clearTimers();
      await stopCamera();
      onScanRef.current(code);
      onCloseRef.current();
    },
    [clearTimers, stopCamera]
  );

  const showConfirm = useCallback(
    (code: string) => {
      const n = attemptRef.current + 1;
      attemptRef.current = n;
      const last = n >= MAX_ATTEMPTS;

      phaseRef.current = "confirm";
      setPhase("confirm");
      setDetectedCode(code);
      setAttempt(n);
      setIsLastAttempt(last);
      setCountdown(CONFIRM_TIMEOUT_SEC);
      clearTimers();

      let sec = CONFIRM_TIMEOUT_SEC;
      countdownTimerRef.current = setInterval(() => {
        sec -= 1;
        setCountdown(sec);
      }, 1000);

      autoTimerRef.current = setTimeout(() => {
        if (foundRef.current) return;
        if (last) {
          void finalize(code);
        } else {
          phaseRef.current = "scanning";
          setPhase("scanning");
          setDetectedCode(null);
          setCountdown(CONFIRM_TIMEOUT_SEC);
        }
      }, CONFIRM_TIMEOUT_SEC * 1000);
    },
    [clearTimers, finalize]
  );

  const onDetected = useCallback(
    (raw: string) => {
      if (foundRef.current || phaseRef.current !== "scanning") return;
      const code = normalizeBarcode(raw);
      if (code) showConfirm(code);
    },
    [showConfirm]
  );

  useEffect(() => {
    if (!isOpen) {
      void stopCamera();
      setReady(false);
      setPhase("scanning");
      setDetectedCode(null);
      foundRef.current = false;
      return;
    }

    foundRef.current = false;
    attemptRef.current = 0;
    phaseRef.current = "scanning";
    let cancelled = false;

    const start = async () => {
      setReady(false);
      setError(null);
      setPhase("scanning");
      setDetectedCode(null);

      await new Promise((r) => setTimeout(r, 80));
      if (cancelled) return;

      try {
        await stopCamera();
        if (cancelled) return;

        const camera = new Html5Qrcode(SCANNER_DIV, {
          verbose: false,
          formatsToSupport: FORMATS,
          useBarCodeDetectorIfSupported: true,
        });
        cameraRef.current = camera;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) throw new Error("No hay cámara disponible");

        const cameraId =
          cameras.find((c) => /back|rear|environment/i.test(c.label))?.id ??
          cameras[cameras.length - 1].id;

        await camera.start(
          cameraId,
          {
            fps: 20,
            // Sin qrbox = escanea todo el video, más rápido y fiable
            disableFlip: false,
          },
          (text) => {
            if (!cancelled) onDetected(text);
          },
          () => {}
        );

        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al abrir cámara");
        }
        await stopCamera();
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopCamera();
    };
  }, [isOpen, stopCamera, onDetected]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${
        isOpen ? "" : "hidden"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Escanear código de barras</h2>
          <button
            type="button"
            onClick={() => {
              void stopCamera();
              onClose();
            }}
            className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        <div className="p-5">
          {!ready && !error && (
            <p className="mb-3 text-sm text-slate-600">Iniciando cámara...</p>
          )}
          {ready && phase === "scanning" && (
            <p className="mb-3 text-sm text-green-700">
              Escaneando — apunta al código de barras
            </p>
          )}

          {phase === "confirm" && detectedCode && (
            <div className="mb-4 rounded-lg border-2 border-brand-500 bg-brand-50 p-4">
              <p className="text-sm font-medium text-slate-700">Código detectado</p>
              <p className="mt-1 break-all font-mono text-2xl font-bold text-slate-900">
                {detectedCode}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {isLastAttempt
                  ? `Último intento — confirma o se usa en ${countdown}s`
                  : `Intento ${attempt}/${MAX_ATTEMPTS} — confirma en ${countdown}s`}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void finalize(detectedCode)}
                  className="btn-primary flex-1"
                >
                  Confirmar
                </button>
                {!isLastAttempt && (
                  <button
                    type="button"
                    onClick={() => {
                      clearTimers();
                      phaseRef.current = "scanning";
                      setPhase("scanning");
                      setDetectedCode(null);
                    }}
                    className="btn-secondary"
                  >
                    No es este
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div
            id={SCANNER_DIV}
            className={`scanner-live overflow-hidden rounded-lg border-2 border-slate-300 bg-black ${
              phase === "confirm" ? "opacity-50" : ""
            }`}
          />
        </div>
      </div>
    </div>
  );
}
