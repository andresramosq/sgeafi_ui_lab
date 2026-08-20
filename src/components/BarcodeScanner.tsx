"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeBarcode } from "@/lib/barcode";

const CONFIRM_TIMEOUT_SEC = 5;
const MAX_ATTEMPTS = 3;
const MATCH_COUNT = 3;

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
];

type QuaggaResult = { codeResult?: { code?: string } };

type QuaggaAPI = {
  decodeSingle: (config: Record<string, unknown>) => Promise<QuaggaResult>;
};

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

function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return true;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
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
  const autoConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<"scanning" | "confirm">("scanning");
  const attemptRef = useRef(0);
  const busyRef = useRef(false);
  const foundRef = useRef(false);
  const matchCodeRef = useRef<string | null>(null);
  const matchCountRef = useRef(0);
  const quaggaRef = useRef<QuaggaAPI | null>(null);
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

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (autoConfirmTimerRef.current) {
      clearTimeout(autoConfirmTimerRef.current);
      autoConfirmTimerRef.current = null;
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
  }, [stopDecodeLoop]);

  const stopAll = useCallback(() => {
    clearCountdown();
    phaseRef.current = "scanning";
    attemptRef.current = 0;
    quaggaRef.current = null;
    stopCamera();
  }, [clearCountdown, stopCamera]);

  const finalizeCode = useCallback(
    (code: string) => {
      if (foundRef.current) return;
      foundRef.current = true;
      clearCountdown();
      stopAll();
      onScanRef.current(code);
      onCloseRef.current();
    },
    [clearCountdown, stopAll]
  );

  const showDetection = useCallback(
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
      stopDecodeLoop();
      clearCountdown();
      matchCodeRef.current = null;
      matchCountRef.current = 0;

      let remaining = CONFIRM_TIMEOUT_SEC;
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
      }, 1000);

      autoConfirmTimerRef.current = setTimeout(() => {
        if (foundRef.current) return;
        if (last) finalizeCode(code);
        else {
          phaseRef.current = "scanning";
          setPhase("scanning");
          setDetectedCode(null);
          setCountdown(CONFIRM_TIMEOUT_SEC);
          startDecodeLoopRef.current?.();
        }
      }, CONFIRM_TIMEOUT_SEC * 1000);
    },
    [clearCountdown, finalizeCode, stopDecodeLoop]
  );

  const acceptReading = useCallback(
    (raw: string) => {
      if (foundRef.current || phaseRef.current !== "scanning") return;
      const code = normalizeBarcode(raw);
      if (!code || !isValidEan13(code)) return;

      if (matchCodeRef.current === code) {
        matchCountRef.current += 1;
      } else {
        matchCodeRef.current = code;
        matchCountRef.current = 1;
      }

      if (matchCountRef.current >= MATCH_COUNT) {
        showDetection(code);
      }
    },
    [showDetection]
  );

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
          acceptReading(codes[0].rawValue);
          return;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);

      const result = await Quagga.decodeSingle({
        src: canvas.toDataURL("image/jpeg", 0.95),
        numOfWorkers: 0,
        locate: true,
        locator: { patchSize: "large", halfSample: false },
        decoder: { readers: QUAGGA_READERS, multiple: false },
      });

      if (result.codeResult?.code) {
        acceptReading(result.codeResult.code);
      }
    } catch {
      /* frame sin lectura */
    } finally {
      busyRef.current = false;
    }
  }, [acceptReading]);

  const startDecodeLoopRef = useRef<(() => void) | null>(null);

  startDecodeLoopRef.current = () => {
    if (decodeTimerRef.current) return;
    decodeTimerRef.current = setInterval(() => {
      void decodeFrame();
    }, 300);
  };

  useEffect(() => {
    if (!isOpen) {
      stopAll();
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

      try {
        stopAll();
        if (cancelled) return;

        const Quagga = await loadQuagga();
        quaggaRef.current = Quagga;
        if (cancelled) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: { ideal: "environment" },
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
          startDecodeLoopRef.current?.();
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
          {!ready && !error && (
            <p className="mb-3 text-sm text-slate-600">Iniciando cámara...</p>
          )}
          {ready && phase === "scanning" && (
            <p className="mb-3 text-sm text-green-700">
              Centra el código en horizontal — buena luz, 15–25 cm
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
                  ? `Último intento — confirma o se usará en ${countdown}s`
                  : `Intento ${attempt}/${MAX_ATTEMPTS} — confirma en ${countdown}s`}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => finalizeCode(detectedCode)}
                  className="btn-primary flex-1"
                >
                  Confirmar
                </button>
                {!isLastAttempt && (
                  <button
                    type="button"
                    onClick={() => {
                      clearCountdown();
                      phaseRef.current = "scanning";
                      setPhase("scanning");
                      setDetectedCode(null);
                      matchCodeRef.current = null;
                      matchCountRef.current = 0;
                      startDecodeLoopRef.current?.();
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
            className={`overflow-hidden rounded-lg border-2 border-slate-300 bg-black ${
              phase === "confirm" ? "opacity-60" : ""
            }`}
          >
            <video
              ref={videoRef}
              className="scanner-video"
              playsInline
              muted
            />
          </div>
        </div>
      </div>
    </div>
  );
}
