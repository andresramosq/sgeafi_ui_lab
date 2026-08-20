"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { normalizeRetailBarcode } from "@/lib/barcode";

const SCANNER_DIV = "barcode-live-scanner";
const CONFIRM_READS = 3;
const PENDING_RESET_MS = 2500;

// Solo formatos retail de caja principal (13 o 12 dígitos) — sin EAN-8
const HTML5_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

const QUAGGA_READERS = ["ean_reader", "upc_reader", "upc_e_reader"];

const NATIVE_FORMATS = ["ean_13", "upc_a", "upc_e"];

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

function captureBarcodeStrip(
  video: HTMLVideoElement,
  centerRatio = 0.5
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const stripHeight = Math.floor(video.videoHeight * 0.5);
  const stripY = Math.max(
    0,
    Math.floor(video.videoHeight * centerRatio - stripHeight / 2)
  );
  canvas.width = video.videoWidth;
  canvas.height = stripHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx) {
    ctx.drawImage(
      video,
      0,
      stripY,
      video.videoWidth,
      Math.min(stripHeight, video.videoHeight - stripY),
      0,
      0,
      video.videoWidth,
      canvas.height
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
  const foundRef = useRef(false);
  const busyRef = useRef(false);
  const pendingRef = useRef({ code: "", hits: 0, lastAt: 0 });
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning">("idle");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [confirmProgress, setConfirmProgress] = useState(0);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopAll = useCallback(async () => {
    if (decodeTimerRef.current) {
      clearInterval(decodeTimerRef.current);
      decodeTimerRef.current = null;
    }
    pendingRef.current = { code: "", hits: 0, lastAt: 0 };
    setPendingCode(null);
    setConfirmProgress(0);

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

  const tryAcceptCode = useCallback(
    async (raw: string) => {
      if (foundRef.current) return;

      const normalized = normalizeRetailBarcode(raw);
      if (!normalized) return;

      const now = Date.now();
      if (
        pendingRef.current.code &&
        pendingRef.current.code !== normalized &&
        now - pendingRef.current.lastAt > PENDING_RESET_MS
      ) {
        pendingRef.current = { code: "", hits: 0, lastAt: 0 };
        setConfirmProgress(0);
      }

      if (pendingRef.current.code === normalized) {
        pendingRef.current.hits += 1;
      } else {
        pendingRef.current = { code: normalized, hits: 1, lastAt: now };
      }
      pendingRef.current.lastAt = now;

      setPendingCode(normalized);
      setConfirmProgress(pendingRef.current.hits);

      if (pendingRef.current.hits >= CONFIRM_READS) {
        foundRef.current = true;
        await stopAll();
        onScanRef.current(normalized);
        onCloseRef.current();
      }
    },
    [stopAll]
  );

  const decodeWithQuagga = useCallback(
    async (video: HTMLVideoElement, Quagga: QuaggaAPI) => {
      const centers = [0.42, 0.5, 0.58];
      for (const center of centers) {
        const canvas = captureBarcodeStrip(video, center);
        try {
          const result = await Quagga.decodeSingle({
            src: canvas.toDataURL("image/jpeg", 0.95),
            numOfWorkers: 0,
            locate: true,
            locator: { patchSize: "large", halfSample: false },
            decoder: { readers: QUAGGA_READERS },
          });
          if (result.codeResult?.code) {
            await tryAcceptCode(result.codeResult.code);
            if (foundRef.current) return;
          }
        } catch {
          // probar siguiente franja
        }
      }
    },
    [tryAcceptCode]
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
            const detector = new Detector({ formats: NATIVE_FORMATS });
            const codes = await detector.detect(video);

            const valid = codes
              .map((c) => normalizeRetailBarcode(c.rawValue))
              .filter((c): c is string => c !== null)
              .sort((a, b) => b.length - a.length);

            if (valid[0]) {
              await tryAcceptCode(valid[0]);
              return;
            }
          } catch {
            // continuar con Quagga
          }
        }

        await decodeWithQuagga(video, Quagga);
      } catch {
        // frame sin lectura válida
      } finally {
        busyRef.current = false;
      }
    },
    [tryAcceptCode, decodeWithQuagga]
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
            if (!cancelled) void tryAcceptCode(text);
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
          }, 180);
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
  }, [isOpen, stopAll, decodeVideoFrame, tryAcceptCode]);

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
              {pendingCode
                ? `Código: ${pendingCode} — confirmando ${confirmProgress}/${CONFIRM_READS}...`
                : "Escaneando EAN-13 — centra toda la barra en la cámara"}
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
          <p className="mt-2 text-xs text-slate-500">
            Solo acepta códigos de 13 dígitos (EAN-13). Ignora lecturas cortas incorrectas.
          </p>
        </div>
      </div>
    </div>
  );
}
