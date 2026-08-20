"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { normalizeBarcode } from "@/lib/barcode";

const SCANNER_DIV = "barcode-live-scanner";
const CONFIRM_TIMEOUT_SEC = 5;
const MAX_ATTEMPTS = 3;

const HTML5_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

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
  decodeSingle: (
    config: Record<string, unknown>,
    cb?: (r: QuaggaResult) => void
  ) => Promise<QuaggaResult>;
};

type ScannerPhase = "scanning" | "confirm";

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
      existing.addEventListener("load", () => resolve(window.Quagga!));
      existing.addEventListener("error", () => reject(new Error("Quagga no cargó")));
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

function captureBarcodeStrip(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const stripHeight = Math.floor(video.videoHeight * 0.5);
  const stripY = Math.floor((video.videoHeight - stripHeight) / 2);
  canvas.width = video.videoWidth;
  canvas.height = stripHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(
      video,
      0,
      stripY,
      video.videoWidth,
      stripHeight,
      0,
      0,
      video.videoWidth,
      stripHeight
    );
  }
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
  const cameraRef = useRef<Html5Qrcode | null>(null);
  const decodeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<ScannerPhase>("scanning");
  const attemptRef = useRef(0);
  const busyRef = useRef(false);
  const foundRef = useRef(false);
  const quaggaRef = useRef<QuaggaAPI | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "ready">("idle");
  const [phase, setPhase] = useState<ScannerPhase>("scanning");
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

  const pauseDecodeLoop = useCallback(() => {
    if (decodeTimerRef.current) {
      clearInterval(decodeTimerRef.current);
      decodeTimerRef.current = null;
    }
  }, []);

  const stopAll = useCallback(async () => {
    clearCountdown();
    pauseDecodeLoop();
    phaseRef.current = "scanning";
    attemptRef.current = 0;

    const cam = cameraRef.current;
    cameraRef.current = null;
    quaggaRef.current = null;

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
    busyRef.current = false;
  }, [clearCountdown, pauseDecodeLoop]);

  const finalizeCode = useCallback(
    async (code: string) => {
      if (foundRef.current) return;
      foundRef.current = true;
      clearCountdown();
      await stopAll();
      onScanRef.current(code);
      onCloseRef.current();
    },
    [clearCountdown, stopAll]
  );

  const showDetection = useCallback(
    (code: string) => {
      const currentAttempt = attemptRef.current + 1;
      attemptRef.current = currentAttempt;
      const last = currentAttempt >= MAX_ATTEMPTS;

      phaseRef.current = "confirm";
      setPhase("confirm");
      setDetectedCode(code);
      setAttempt(currentAttempt);
      setIsLastAttempt(last);
      setCountdown(CONFIRM_TIMEOUT_SEC);
      pauseDecodeLoop();
      clearCountdown();

      let remaining = CONFIRM_TIMEOUT_SEC;
      countdownTimerRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0 && countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
      }, 1000);

      autoConfirmTimerRef.current = setTimeout(() => {
        if (foundRef.current) return;
        if (last) {
          void finalizeCode(code);
        } else {
          phaseRef.current = "scanning";
          setPhase("scanning");
          setDetectedCode(null);
          setCountdown(CONFIRM_TIMEOUT_SEC);
          startDecodeLoopRef.current?.();
        }
      }, CONFIRM_TIMEOUT_SEC * 1000);
    },
    [clearCountdown, pauseDecodeLoop, finalizeCode]
  );

  const onRawCodeDetected = useCallback(
    (raw: string) => {
      if (foundRef.current || phaseRef.current !== "scanning") return;
      const normalized = normalizeBarcode(raw);
      if (!normalized) return;
      showDetection(normalized);
    },
    [showDetection]
  );

  const decodeVideoFrame = useCallback(
    async (video: HTMLVideoElement, Quagga: QuaggaAPI) => {
      if (busyRef.current || foundRef.current || phaseRef.current !== "scanning") return;
      if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !video.videoWidth) return;

      busyRef.current = true;
      try {
        if ("BarcodeDetector" in window) {
          try {
            const Detector = (window as Window & {
              BarcodeDetector: new (o: { formats: string[] }) => {
                detect: (s: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
              };
            }).BarcodeDetector;
            const detector = new Detector({ formats: NATIVE_FORMATS });
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              onRawCodeDetected(codes[0].rawValue);
              return;
            }
          } catch {
            /* continuar */
          }
        }

        const canvas = captureBarcodeStrip(video);
        const result = await Quagga.decodeSingle({
          src: canvas.toDataURL("image/jpeg", 0.92),
          numOfWorkers: 0,
          locate: true,
          locator: { patchSize: "large", halfSample: false },
          decoder: { readers: QUAGGA_READERS },
        });

        if (result.codeResult?.code) {
          onRawCodeDetected(result.codeResult.code);
        }
      } catch {
        /* sin lectura */
      } finally {
        busyRef.current = false;
      }
    },
    [onRawCodeDetected]
  );

  const startDecodeLoopRef = useRef<(() => void) | null>(null);

  startDecodeLoopRef.current = () => {
    if (decodeTimerRef.current) return;
    const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_DIV} video`);
    const Quagga = quaggaRef.current;
    if (!video || !Quagga) return;
    decodeTimerRef.current = setInterval(() => {
      void decodeVideoFrame(video, Quagga);
    }, 200);
  };

  const handleConfirm = () => {
    if (!detectedCode) return;
    void finalizeCode(detectedCode);
  };

  const handleReject = () => {
    clearCountdown();
    phaseRef.current = "scanning";
    setPhase("scanning");
    setDetectedCode(null);
    setCountdown(CONFIRM_TIMEOUT_SEC);
    startDecodeLoopRef.current?.();
  };

  useEffect(() => {
    if (!isOpen) {
      void stopAll();
      setStatus("idle");
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
      setStatus("starting");
      setError(null);
      setPhase("scanning");
      setDetectedCode(null);
      setAttempt(0);

      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;

      try {
        await stopAll();
        const Quagga = await loadQuaggaScript();
        quaggaRef.current = Quagga;
        if (cancelled) return;

        const camera = new Html5Qrcode(SCANNER_DIV, {
          verbose: false,
          formatsToSupport: HTML5_FORMATS,
          useBarCodeDetectorIfSupported: false,
        });
        cameraRef.current = camera;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) throw new Error("No hay cámara");

        await camera.start(
          cameras[cameras.length - 1].id,
          { fps: 15, aspectRatio: 1.777778 },
          (text) => {
            if (!cancelled) onRawCodeDetected(text);
          },
          () => {}
        );

        if (cancelled) {
          await stopAll();
          return;
        }

        startDecodeLoopRef.current?.();
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al iniciar escáner");
        }
        await stopAll();
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopAll();
    };
  }, [isOpen, stopAll, decodeVideoFrame, onRawCodeDetected]);

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
              void stopAll();
              onClose();
            }}
            className="rounded-lg px-3 py-1 text-slate-500 hover:bg-slate-100"
          >
            Cerrar
          </button>
        </div>

        <div className="p-5">
          {status === "starting" && (
            <p className="mb-3 text-sm text-slate-600">Iniciando cámara...</p>
          )}

          {phase === "scanning" && status === "ready" && (
            <p className="mb-3 text-sm text-green-700">
              Escaneando — centra el código en la cámara
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
                  : `Intento ${attempt}/${MAX_ATTEMPTS} — confirma en ${countdown}s o vuelve a escanear`}
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={handleConfirm} className="btn-primary flex-1">
                  Confirmar código
                </button>
                {!isLastAttempt && (
                  <button type="button" onClick={handleReject} className="btn-secondary">
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
              phase === "confirm" ? "opacity-60" : ""
            }`}
          />
        </div>
      </div>
    </div>
  );
}
