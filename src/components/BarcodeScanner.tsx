"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "codabar",
  "itf",
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
      existing.addEventListener("error", () =>
        reject(new Error("Error cargando motor de barras"))
      );
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

async function pickCameraId(): Promise<string | undefined> {
  if (!navigator.mediaDevices?.enumerateDevices) return undefined;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((d) => d.kind === "videoinput");
  if (!cameras.length) return undefined;
  return (
    cameras.find((c) => /back|rear|environment/i.test(c.label))?.deviceId ??
    cameras[cameras.length - 1].deviceId
  );
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
  const quaggaRef = useRef<QuaggaAPI | null>(null);
  const nativeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<"scanning" | "confirm">("scanning");
  const attemptRef = useRef(0);
  const foundRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const onDetectedRef = useRef<(raw: string) => void>(() => {});
  const quaggaHandlerRef = useRef<(result: QuaggaResult) => void>(() => {});

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

  const stopNativeLoop = useCallback(() => {
    if (nativeTimerRef.current) {
      clearInterval(nativeTimerRef.current);
      nativeTimerRef.current = null;
    }
  }, []);

  const stopScanner = useCallback(() => {
    clearTimers();
    stopNativeLoop();
    phaseRef.current = "scanning";
    attemptRef.current = 0;

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
  }, [clearTimers, stopNativeLoop]);

  const finalize = useCallback(
    (code: string) => {
      if (foundRef.current) return;
      foundRef.current = true;
      clearTimers();
      stopScanner();
      onScanRef.current(code);
      onCloseRef.current();
    },
    [clearTimers, stopScanner]
  );

  const resumeScanning = useCallback(() => {
    phaseRef.current = "scanning";
    setPhase("scanning");
    setDetectedCode(null);
    setCountdown(CONFIRM_TIMEOUT_SEC);
    startNativeLoopRef.current?.();
  }, []);

  const showConfirm = useCallback(
    (code: string) => {
      stopNativeLoop();

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
          finalize(code);
        } else {
          resumeScanning();
        }
      }, CONFIRM_TIMEOUT_SEC * 1000);
    },
    [clearTimers, finalize, resumeScanning, stopNativeLoop]
  );

  const onDetected = useCallback(
    (raw: string) => {
      if (foundRef.current || phaseRef.current !== "scanning") return;
      const code = normalizeBarcode(raw);
      if (code) showConfirm(code);
    },
    [showConfirm]
  );

  onDetectedRef.current = onDetected;

  const startNativeLoopRef = useRef<(() => void) | null>(null);

  startNativeLoopRef.current = () => {
    stopNativeLoop();
    if (typeof window === "undefined" || !("BarcodeDetector" in window)) return;

    const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_DIV} video`);
    if (!video) return;

    try {
      const Detector = (
        window as Window & {
          BarcodeDetector: new (o: { formats: string[] }) => {
            detect: (s: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;
      const detector = new Detector({ formats: NATIVE_FORMATS });

      nativeTimerRef.current = setInterval(() => {
        if (phaseRef.current !== "scanning" || foundRef.current) return;
        if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) return;
        detector
          .detect(video)
          .then((codes) => {
            if (codes[0]?.rawValue) onDetectedRef.current(codes[0].rawValue);
          })
          .catch(() => {});
      }, 200);
    } catch {
      /* BarcodeDetector no disponible */
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
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

      await new Promise((r) => setTimeout(r, 100));
      if (cancelled) return;

      try {
        stopScanner();
        if (cancelled) return;

        const Quagga = await loadQuaggaScript();
        if (cancelled) return;

        const cameraId = await pickCameraId();
        const constraints: MediaTrackConstraints = {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };
        if (cameraId) constraints.deviceId = { exact: cameraId };

        await new Promise<void>((resolve, reject) => {
          Quagga.init(
            {
              inputStream: {
                name: "Live",
                type: "LiveStream",
                target: document.querySelector(`#${SCANNER_DIV}`),
                constraints,
              },
              locator: {
                patchSize: "medium",
                halfSample: true,
              },
              numOfWorkers: 0,
              frequency: 10,
              decoder: {
                readers: QUAGGA_READERS,
                multiple: false,
              },
              locate: true,
            },
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        if (cancelled) {
          Quagga.stop();
          return;
        }

        quaggaRef.current = Quagga;

        const handler = (result: QuaggaResult) => {
          if (result.codeResult?.code) {
            onDetectedRef.current(result.codeResult.code);
          }
        };
        quaggaHandlerRef.current = handler;
        Quagga.onDetected(handler);
        Quagga.start();

        // BarcodeDetector nativo en paralelo (Chrome/Edge)
        setTimeout(() => {
          if (!cancelled) startNativeLoopRef.current?.();
        }, 500);

        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Error al abrir la cámara"
          );
        }
        stopScanner();
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [isOpen, stopScanner]);

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
            Escanear código de barras
          </h2>
          <button
            type="button"
            onClick={() => {
              stopScanner();
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
              Apunta el código en horizontal — buena luz, a 15–25 cm
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
