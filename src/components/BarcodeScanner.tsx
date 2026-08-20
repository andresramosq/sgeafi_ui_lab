"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUsbBarcode } from "@/hooks/useUsbBarcode";
import { normalizeBarcode } from "@/lib/barcode";

const SCANNER_DIV = "barcode-live-scanner";
const CONFIRM_TIMEOUT_SEC = 5;
const MAX_ATTEMPTS = 3;

const QUAGGA_READERS = [
  "ean_reader",
  "ean_8_reader",
  "upc_reader",
  "upc_e_reader",
  "code_128_reader",
  "code_39_reader",
];

type QuaggaResult = { codeResult?: { code?: string } };

type QuaggaAPI = {
  init: (
    config: Record<string, unknown>,
    cb: (err: Error | null) => void
  ) => void;
  start: () => void;
  stop: () => void;
  onDetected: (cb: (result: QuaggaResult) => void) => void;
  offDetected: (cb: (result: QuaggaResult) => void) => void;
};

declare global {
  interface Window {
    Quagga?: QuaggaAPI;
  }
}

function loadQuaggaScript(): Promise<QuaggaAPI> {
  if (window.Quagga) return Promise.resolve(window.Quagga);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-quagga="1"]');
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Quagga) resolve(window.Quagga);
        else reject(new Error("Quagga no disponible"));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "/quagga.min.js";
    script.async = true;
    script.dataset.quagga = "1";
    script.onload = () => {
      if (window.Quagga) resolve(window.Quagga);
      else reject(new Error("Quagga no disponible"));
    };
    script.onerror = () => reject(new Error("Error cargando motor de barras"));
    document.head.appendChild(script);
  });
}

async function requestCamera(): Promise<MediaTrackConstraints> {
  await navigator.mediaDevices.getUserMedia({ video: true });
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === "videoinput");
  const preferred =
    cameras.find((c) => /back|rear|environment/i.test(c.label)) ??
    cameras[cameras.length - 1];

  return {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(preferred?.deviceId ? { deviceId: preferred.deviceId } : {}),
    facingMode: preferred ? undefined : "environment",
  };
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const quaggaRef = useRef<QuaggaAPI | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<"scanning" | "confirm">("scanning");
  const attemptRef = useRef(0);
  const foundRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const quaggaHandlerRef = useRef<(result: QuaggaResult) => void>(() => {});

  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
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

  const stopCamera = useCallback(() => {
    const quagga = quaggaRef.current;
    if (quagga && quaggaHandlerRef.current) {
      try {
        quagga.offDetected(quaggaHandlerRef.current);
      } catch {
        /* noop */
      }
    }
    quaggaRef.current = null;

    try {
      window.Quagga?.stop();
    } catch {
      /* noop */
    }

    const container = document.getElementById(SCANNER_DIV);
    if (container) container.innerHTML = "";
    setCameraReady(false);
  }, []);

  const stopAll = useCallback(() => {
    clearTimers();
    phaseRef.current = "scanning";
    attemptRef.current = 0;
    stopCamera();
  }, [clearTimers, stopCamera]);

  const finalize = useCallback(
    (code: string) => {
      if (foundRef.current) return;
      foundRef.current = true;
      clearTimers();
      stopAll();
      onScanRef.current(code);
      onCloseRef.current();
    },
    [clearTimers, stopAll]
  );

  const resumeScanning = useCallback(() => {
    phaseRef.current = "scanning";
    setPhase("scanning");
    setDetectedCode(null);
    setCountdown(CONFIRM_TIMEOUT_SEC);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

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
        if (last) finalize(code);
        else resumeScanning();
      }, CONFIRM_TIMEOUT_SEC * 1000);
    },
    [clearTimers, finalize, resumeScanning]
  );

  const handleRawCode = useCallback(
    (raw: string) => {
      if (foundRef.current || phaseRef.current !== "scanning") return;
      const code = normalizeBarcode(raw);
      if (code) showConfirm(code);
    },
    [showConfirm]
  );

  useUsbBarcode(isOpen && phase === "scanning", handleRawCode);

  const submitManual = () => {
    const code = normalizeBarcode(manualCode);
    if (!code) {
      setError("Código inválido");
      return;
    }
    setError(null);
    handleRawCode(code);
  };

  useEffect(() => {
    if (!isOpen) {
      stopAll();
      setPhase("scanning");
      setDetectedCode(null);
      setManualCode("");
      setError(null);
      setCameraError(null);
      foundRef.current = false;
      return;
    }

    foundRef.current = false;
    attemptRef.current = 0;
    phaseRef.current = "scanning";
    let cancelled = false;

    setTimeout(() => inputRef.current?.focus(), 100);

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Este navegador no soporta cámara");
        return;
      }

      try {
        const Quagga = await loadQuaggaScript();
        if (cancelled) return;

        const constraints = await requestCamera();
        if (cancelled) return;

        const target = document.getElementById(SCANNER_DIV);
        if (!target) return;

        await new Promise<void>((resolve, reject) => {
          Quagga.init(
            {
              inputStream: {
                name: "Live",
                type: "LiveStream",
                target,
                constraints,
                area: { top: "30%", right: "5%", left: "5%", bottom: "30%" },
              },
              locator: { patchSize: "large", halfSample: false },
              numOfWorkers: 0,
              frequency: 10,
              decoder: { readers: QUAGGA_READERS, multiple: false },
              locate: true,
            },
            (err) => (err ? reject(err) : resolve())
          );
        });

        if (cancelled) {
          Quagga.stop();
          return;
        }

        quaggaRef.current = Quagga;
        const handler = (result: QuaggaResult) => {
          if (result.codeResult?.code) handleRawCode(result.codeResult.code);
        };
        quaggaHandlerRef.current = handler;
        Quagga.onDetected(handler);
        Quagga.start();
        if (!cancelled) setCameraReady(true);
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err instanceof Error ? err.message : "Cámara no disponible"
          );
        }
        stopCamera();
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [isOpen, stopAll, stopCamera, handleRawCode]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${
        isOpen ? "" : "hidden"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Escanear código
          </h2>
          <button
            type="button"
            onClick={() => {
              stopAll();
              onClose();
            }}
            className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        <div className="space-y-4 p-5">
          {phase === "scanning" && (
            <div>
              <label htmlFor="barcode-input" className="label">
                Lector USB o escribir código
              </label>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  id="barcode-input"
                  type="text"
                  className="input font-mono"
                  value={manualCode}
                  onChange={(e) => {
                    setManualCode(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitManual();
                    }
                  }}
                  placeholder="Escanea aquí o escribe y Enter"
                  autoComplete="off"
                  autoFocus
                />
                <button type="button" onClick={submitManual} className="btn-primary shrink-0">
                  OK
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Con lector USB: apunta y escanea — no hace falta hacer clic.
              </p>
            </div>
          )}

          {phase === "confirm" && detectedCode && (
            <div className="rounded-lg border-2 border-brand-500 bg-brand-50 p-4">
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
                  onClick={() => finalize(detectedCode)}
                  className="btn-primary flex-1"
                >
                  Confirmar
                </button>
                {!isLastAttempt && (
                  <button
                    type="button"
                    onClick={() => {
                      clearTimers();
                      resumeScanning();
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
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {phase === "scanning" && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Cámara (opcional)
              </p>
              {cameraError && (
                <p className="mb-2 text-sm text-amber-700">{cameraError}</p>
              )}
              {!cameraReady && !cameraError && (
                <p className="mb-2 text-sm text-slate-500">Iniciando cámara...</p>
              )}
              {cameraReady && (
                <p className="mb-2 text-sm text-slate-600">
                  Código en horizontal, buena luz, 15–25 cm
                </p>
              )}
              <div
                id={SCANNER_DIV}
                className="scanner-live overflow-hidden rounded-lg border border-slate-200 bg-black"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
