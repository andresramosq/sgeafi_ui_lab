"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const SCANNER_DIV = "barcode-live-scanner";

const HTML5_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
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

type QuaggaResult = { codeResult?: { code?: string } };

type QuaggaAPI = {
  decodeSingle: (
    config: Record<string, unknown>,
    cb?: (r: QuaggaResult) => void
  ) => Promise<QuaggaResult>;
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
  const foundRef = useRef(false);
  const busyRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning">("idle");

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopAll = useCallback(async () => {
    if (decodeTimerRef.current) {
      clearInterval(decodeTimerRef.current);
      decodeTimerRef.current = null;
    }
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
    busyRef.current = false;
  }, []);

  const onCodeFound = useCallback(
    async (code: string) => {
      if (foundRef.current) return;
      const trimmed = code.trim();
      if (!trimmed) return;
      foundRef.current = true;
      await stopAll();
      onScanRef.current(trimmed);
      onCloseRef.current();
    },
    [stopAll]
  );

  const decodeVideoFrame = useCallback(
    async (video: HTMLVideoElement, Quagga: QuaggaAPI) => {
      if (busyRef.current || foundRef.current) return;
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
            const detector = new Detector({
              formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"],
            });
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              await onCodeFound(codes[0].rawValue);
              return;
            }
          } catch {
            // continuar con Quagga
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);

        const result = await Quagga.decodeSingle({
          src: canvas.toDataURL("image/jpeg", 0.92),
          numOfWorkers: 0,
          locate: true,
          locator: { patchSize: "large", halfSample: false },
          decoder: { readers: QUAGGA_READERS },
        });

        if (result.codeResult?.code) {
          await onCodeFound(result.codeResult.code);
        }
      } catch {
        // frame sin lectura
      } finally {
        busyRef.current = false;
      }
    },
    [onCodeFound]
  );

  useEffect(() => {
    if (!isOpen) {
      void stopAll();
      setStatus("idle");
      return;
    }

    foundRef.current = false;
    let cancelled = false;

    const start = async () => {
      setStatus("starting");
      setError(null);

      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;

      try {
        await stopAll();
        const Quagga = await loadQuaggaScript();
        if (cancelled) return;

        const camera = new Html5Qrcode(SCANNER_DIV, {
          verbose: false,
          formatsToSupport: HTML5_FORMATS,
          useBarCodeDetectorIfSupported: false,
        });
        cameraRef.current = camera;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) throw new Error("No hay cámara");

        const cameraId = cameras[cameras.length - 1].id;

        await camera.start(
          cameraId,
          { fps: 15, aspectRatio: 1.777778 },
          (text) => {
            if (!cancelled) void onCodeFound(text);
          },
          () => {}
        );

        if (cancelled) {
          await stopAll();
          return;
        }

        const video = document.querySelector<HTMLVideoElement>(`#${SCANNER_DIV} video`);
        if (video) {
          decodeTimerRef.current = setInterval(() => {
            void decodeVideoFrame(video, Quagga);
          }, 200);
        }

        setStatus("scanning");
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
  }, [isOpen, stopAll, decodeVideoFrame, onCodeFound]);

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
          {status === "scanning" && (
            <p className="mb-3 text-sm font-medium text-green-700">
              Escaneando — coloca el código en horizontal frente a la cámara
            </p>
          )}
          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div
            id={SCANNER_DIV}
            className="scanner-live overflow-hidden rounded-lg border-2 border-slate-300 bg-black"
          />
        </div>
      </div>
    </div>
  );
}
