"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isValidBarcode, normalizeBarcode } from "@/lib/barcode";

const SCANNER_ID = "quagga-scanner";
const CONFIRM_TIMEOUT_SEC = 5;
const MAX_ATTEMPTS = 3;
const READS_NEEDED = 2;

const QUAGGA_READERS = ["ean_reader", "ean_8_reader", "upc_reader", "upc_e_reader"];

const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

type QuaggaResult = {
  codeResult?: { code?: string };
  boxes?: Array<{ x: number; y: number }[]>;
};

type QuaggaAPI = {
  init: (config: Record<string, unknown>, cb: (err: Error | null) => void) => void;
  start: () => void;
  stop: () => void;
  onDetected: (cb: (result: QuaggaResult) => void) => void;
  offDetected: (cb: (result: QuaggaResult) => void) => void;
  onProcessed: (cb: (result: QuaggaResult) => void) => void;
  offProcessed: (cb: (result: QuaggaResult) => void) => void;
};

type ScanVisual = "idle" | "analyzing" | "captured";

declare global {
  interface Window {
    Quagga?: QuaggaAPI;
  }
}

function loadQuagga(): Promise<QuaggaAPI> {
  if (window.Quagga) return Promise.resolve(window.Quagga);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/quagga.min.js";
    script.async = true;
    script.onload = () =>
      window.Quagga ? resolve(window.Quagga) : reject(new Error("Quagga no cargó"));
    script.onerror = () => reject(new Error("Quagga no cargó"));
    document.head.appendChild(script);
  });
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
  const detectedHandlerRef = useRef<(r: QuaggaResult) => void>(() => {});
  const processedHandlerRef = useRef<(r: QuaggaResult) => void>(() => {});
  const nativeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<"scanning" | "confirm">("scanning");
  const attemptRef = useRef(0);
  const foundRef = useRef(false);
  const matchCodeRef = useRef<string | null>(null);
  const matchCountRef = useRef(0);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const acceptRef = useRef<(raw: string) => void>(() => {});
  const setVisualRef = useRef<(v: ScanVisual) => void>(() => {});
  const setCandidateRef = useRef<(c: string | null) => void>(() => {});
  const setReadsRef = useRef<(n: number) => void>(() => {});

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<"scanning" | "confirm">("scanning");
  const [visual, setVisual] = useState<ScanVisual>("idle");
  const [candidate, setCandidate] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [countdown, setCountdown] = useState(CONFIRM_TIMEOUT_SEC);
  const [isLastAttempt, setIsLastAttempt] = useState(false);
  const [notify, setNotify] = useState<string | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  setVisualRef.current = setVisual;
  setCandidateRef.current = setCandidate;
  setReadsRef.current = setReads;

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
    const quagga = quaggaRef.current;
    if (quagga) {
      try {
        quagga.offDetected(detectedHandlerRef.current);
        quagga.offProcessed(processedHandlerRef.current);
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
    const el = document.getElementById(SCANNER_ID);
    if (el) el.innerHTML = "";
    setReady(false);
    setVisual("idle");
    setCandidate(null);
    setReads(0);
    matchCodeRef.current = null;
    matchCountRef.current = 0;
  }, [clearTimers, stopNativeLoop]);

  const stopAll = useCallback(() => {
    phaseRef.current = "scanning";
    attemptRef.current = 0;
    stopScanner();
  }, [stopScanner]);

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
    setNotify(null);
    setVisual("idle");
    setCandidate(null);
    setReads(0);
    matchCodeRef.current = null;
    matchCountRef.current = 0;
    startNativeLoopRef.current?.();
  }, []);

  const showConfirm = useCallback(
    (code: string) => {
      stopNativeLoop();
      setVisual("captured");
      setNotify(`¡Código capturado! ${code}`);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(200);
      }

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
    [clearTimers, finalize, resumeScanning, stopNativeLoop]
  );

  const acceptReading = useCallback(
    (raw: string) => {
      if (foundRef.current || phaseRef.current !== "scanning") return;
      const code = normalizeBarcode(raw);
      if (!code || !isValidBarcode(code)) return;

      if (matchCodeRef.current === code) {
        matchCountRef.current += 1;
      } else {
        matchCodeRef.current = code;
        matchCountRef.current = 1;
      }

      setCandidateRef.current(code);
      setReadsRef.current(matchCountRef.current);
      setVisualRef.current("analyzing");

      if (matchCountRef.current >= READS_NEEDED) {
        showConfirm(code);
      }
    },
    [showConfirm]
  );

  acceptRef.current = acceptReading;

  const startNativeLoopRef = useRef<(() => void) | null>(null);

  startNativeLoopRef.current = () => {
    stopNativeLoop();
    if (!("BarcodeDetector" in window)) return;
    const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_ID} video`);
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
            if (codes[0]?.rawValue) acceptRef.current(codes[0].rawValue);
          })
          .catch(() => {});
      }, 250);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopAll();
      setPhase("scanning");
      setDetectedCode(null);
      setNotify(null);
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
      setNotify(null);
      setVisual("idle");

      await new Promise((r) => setTimeout(r, 150));
      if (cancelled) return;

      try {
        stopAll();
        if (cancelled) return;

        const Quagga = await loadQuagga();
        if (cancelled) return;

        const target = document.getElementById(SCANNER_ID);
        if (!target) throw new Error("Contenedor no encontrado");

        await new Promise<void>((resolve, reject) => {
          Quagga.init(
            {
              inputStream: {
                name: "Live",
                type: "LiveStream",
                target,
                constraints: {
                  width: { min: 640, ideal: 1280 },
                  height: { min: 480, ideal: 720 },
                },
                area: { top: "25%", right: "8%", left: "8%", bottom: "25%" },
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

        const onProcessed = (result: QuaggaResult) => {
          if (phaseRef.current !== "scanning") return;
          const hasBox = Boolean(result?.boxes?.length);
          setVisualRef.current(hasBox ? "analyzing" : "idle");
        };
        processedHandlerRef.current = onProcessed;
        Quagga.onProcessed(onProcessed);

        const onDetected = (result: QuaggaResult) => {
          if (result.codeResult?.code) acceptRef.current(result.codeResult.code);
        };
        detectedHandlerRef.current = onDetected;
        Quagga.onDetected(onDetected);

        Quagga.start();

        setTimeout(() => {
          if (!cancelled) startNativeLoopRef.current?.();
        }, 600);

        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al abrir cámara");
        }
        stopScanner();
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [isOpen, stopAll, stopScanner]);

  const borderClass =
    visual === "captured"
      ? "border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)]"
      : visual === "analyzing"
        ? "border-green-400 shadow-[0_0_12px_rgba(74,222,128,0.5)]"
        : "border-slate-300";

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
              stopAll();
              onClose();
            }}
            className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        <div className="p-5">
          {notify && (
            <div className="mb-3 rounded-lg border border-green-400 bg-green-100 px-3 py-2 text-sm font-medium text-green-800">
              {notify}
            </div>
          )}

          {phase === "confirm" && detectedCode ? (
            <div className="mb-4 rounded-lg border-2 border-brand-500 bg-brand-50 p-4">
              <p className="text-sm font-medium text-slate-700">Código detectado</p>
              <p className="mt-1 break-all font-mono text-2xl font-bold text-slate-900">
                {detectedCode}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {isLastAttempt
                  ? `Último intento — confirma o se usará en ${countdown}s`
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
          ) : (
            <>
              {!ready && !error && (
                <p className="mb-3 text-sm text-slate-600">Iniciando cámara...</p>
              )}
              {ready && visual === "idle" && (
                <p className="mb-3 text-sm text-slate-600">
                  Apunta al código en horizontal — el borde se pone verde al detectarlo
                </p>
              )}
              {ready && visual === "analyzing" && (
                <p className="mb-3 text-sm font-medium text-green-700">
                  {candidate
                    ? `Analizando: ${candidate} (${reads}/${READS_NEEDED})`
                    : "Detectando forma de código..."}
                </p>
              )}
            </>
          )}

          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div
            id={SCANNER_ID}
            className={`quagga-scanner overflow-hidden rounded-lg border-4 bg-black transition-all duration-200 ${borderClass} ${
              phase === "confirm" ? "opacity-50" : ""
            }`}
          />
        </div>
      </div>
    </div>
  );
}
