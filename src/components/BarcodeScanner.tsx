"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isValidBarcode, normalizeBarcode } from "@/lib/barcode";

const CONFIRM_TIMEOUT_SEC = 5;
const MAX_ATTEMPTS = 3;
const READS_NEEDED = 2;

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
  decodeSingle: (config: Record<string, unknown>) => Promise<QuaggaResult>;
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

function acceptCode(raw: string): string | null {
  const code = normalizeBarcode(raw);
  if (!code || !isValidBarcode(code)) return null;
  return code;
}

function captureCenterStrip(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const h = Math.floor(video.videoHeight * 0.35);
  const y = Math.floor((video.videoHeight - h) / 2);
  canvas.width = video.videoWidth;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx) ctx.drawImage(video, 0, y, video.videoWidth, h, 0, 0, video.videoWidth, h);
  return canvas;
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const decodeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<"scanning" | "confirm">("scanning");
  const attemptRef = useRef(0);
  const busyRef = useRef(false);
  const foundRef = useRef(false);
  const matchCodeRef = useRef<string | null>(null);
  const matchCountRef = useRef(0);
  const quaggaRef = useRef<QuaggaAPI | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const acceptRef = useRef<(raw: string) => void>(() => {});

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

  const stopDecodeLoop = useCallback(() => {
    if (decodeTimerRef.current) {
      clearInterval(decodeTimerRef.current);
      decodeTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopDecodeLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    matchCodeRef.current = null;
    matchCountRef.current = 0;
    busyRef.current = false;
    setVisual("idle");
    setCandidate(null);
    setReads(0);
  }, [stopDecodeLoop]);

  const stopAll = useCallback(() => {
    clearTimers();
    phaseRef.current = "scanning";
    attemptRef.current = 0;
    quaggaRef.current = null;
    stopCamera();
    setReady(false);
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
    setNotify(null);
    matchCodeRef.current = null;
    matchCountRef.current = 0;
    setCandidate(null);
    setReads(0);
    setVisual("idle");
    startLoopRef.current?.();
  }, []);

  const showConfirm = useCallback(
    (code: string) => {
      stopDecodeLoop();
      setVisual("captured");
      setNotify(`Código capturado: ${code}`);

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
    [clearTimers, finalize, resumeScanning, stopDecodeLoop]
  );

  const acceptReading = useCallback(
    (raw: string) => {
      if (foundRef.current || phaseRef.current !== "scanning") return;
      const code = acceptCode(raw);
      if (!code) return;

      setVisual("analyzing");
      setCandidate(code);

      if (matchCodeRef.current === code) {
        matchCountRef.current += 1;
      } else {
        matchCodeRef.current = code;
        matchCountRef.current = 1;
      }
      setReads(matchCountRef.current);

      if (matchCountRef.current >= READS_NEEDED) {
        showConfirm(code);
      }
    },
    [showConfirm]
  );

  acceptRef.current = acceptReading;

  const decodeFrame = useCallback(async () => {
    const video = videoRef.current;
    const Quagga = quaggaRef.current;
    if (!video || !Quagga || busyRef.current || foundRef.current) return;
    if (phaseRef.current !== "scanning") return;
    if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !video.videoWidth) return;

    busyRef.current = true;
    try {
      if ("BarcodeDetector" in window) {
        const Detector = (
          window as Window & {
            BarcodeDetector: new (o: { formats: string[] }) => {
              detect: (s: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
            };
          }
        ).BarcodeDetector;
        const detector = new Detector({ formats: NATIVE_FORMATS });
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) {
          acceptRef.current(codes[0].rawValue);
          return;
        }
      }

      const canvas = captureCenterStrip(video);
      const result = await Quagga.decodeSingle({
        src: canvas.toDataURL("image/jpeg", 0.95),
        numOfWorkers: 0,
        locate: true,
        locator: { patchSize: "large", halfSample: false },
        decoder: { readers: QUAGGA_READERS, multiple: false },
      });

      if (result.codeResult?.code) {
        acceptRef.current(result.codeResult.code);
      }
    } catch {
      /* sin lectura en este frame */
    } finally {
      busyRef.current = false;
    }
  }, []);

  const startLoopRef = useRef<(() => void) | null>(null);

  startLoopRef.current = () => {
    if (decodeTimerRef.current) return;
    decodeTimerRef.current = setInterval(() => {
      void decodeFrame();
    }, 350);
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

      try {
        stopAll();
        if (cancelled) return;

        const Quagga = await loadQuagga();
        quaggaRef.current = Quagga;
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) throw new Error("Video no disponible");

        video.srcObject = stream;
        await video.play();

        if (!cancelled) {
          startLoopRef.current?.();
          setReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al abrir cámara");
        }
        stopAll();
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [isOpen, stopAll, decodeFrame]);

  const borderClass =
    visual === "captured"
      ? "border-green-500 shadow-[0_0_24px_rgba(34,197,94,0.7)]"
      : visual === "analyzing"
        ? "border-green-400 shadow-[0_0_16px_rgba(74,222,128,0.6)] animate-pulse"
        : ready
          ? "border-yellow-400"
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
              {ready && !candidate && (
                <p className="mb-3 text-sm text-yellow-700">
                  Coloca el código de barras en la línea verde del centro
                </p>
              )}
              {ready && candidate && (
                <p className="mb-3 text-sm font-semibold text-green-700">
                  Analizando: {candidate} — lectura {reads}/{READS_NEEDED}
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
            className={`relative overflow-hidden rounded-lg border-4 bg-black transition-all duration-150 ${borderClass} ${
              phase === "confirm" ? "opacity-50" : ""
            }`}
          >
            <video ref={videoRef} className="scanner-video" playsInline muted />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className={`w-[90%] border-2 border-dashed ${
                  visual === "analyzing" ? "border-green-400" : "border-green-500/60"
                }`}
                style={{ height: "35%" }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
