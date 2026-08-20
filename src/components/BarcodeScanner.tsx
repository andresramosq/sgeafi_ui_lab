"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatOneDReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

const DETECTOR_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "codabar",
  "itf",
];

function createZxingReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatOneDReader(hints);
}

type NativeDetector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

function getNativeDetector(): NativeDetector | null {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
  try {
    const Detector = (window as Window & { BarcodeDetector: new (o: { formats: string[] }) => NativeDetector }).BarcodeDetector;
    return new Detector({ formats: DETECTOR_FORMATS });
  } catch {
    return null;
  }
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);
  const foundRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [manualCode, setManualCode] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [engine, setEngine] = useState<string>("");

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopCamera = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    busyRef.current = false;
  }, []);

  const emitCode = useCallback(
    (code: string) => {
      if (foundRef.current) return;
      const trimmed = code.trim();
      if (!trimmed) return;
      foundRef.current = true;
      stopCamera();
      onScanRef.current(trimmed);
      onCloseRef.current();
    },
    [stopCamera]
  );

  const decodeFrame = useCallback(
    async (source: HTMLVideoElement | HTMLCanvasElement) => {
      if (busyRef.current || foundRef.current) return;
      busyRef.current = true;
      try {
        const native = getNativeDetector();
        if (native) {
          const codes = await native.detect(source);
          if (codes[0]?.rawValue) {
            emitCode(codes[0].rawValue);
            return;
          }
        }

        if (source instanceof HTMLVideoElement) {
          if (source.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !source.videoWidth) return;
          const canvas = document.createElement("canvas");
          canvas.width = source.videoWidth;
          canvas.height = source.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(source, 0, 0);
          const result = await createZxingReader().decodeFromImageUrl(
            canvas.toDataURL("image/jpeg", 0.9)
          );
          emitCode(result.getText());
        }
      } catch {
        // sin código en este frame
      } finally {
        busyRef.current = false;
      }
    },
    [emitCode]
  );

  const decodeFile = useCallback(
    async (file: File) => {
      const native = getNativeDetector();
      if (native) {
        const bitmap = await createImageBitmap(file);
        try {
          const codes = await native.detect(bitmap);
          if (codes[0]?.rawValue) return codes[0].rawValue;
        } finally {
          bitmap.close();
        }
      }
      const url = URL.createObjectURL(file);
      try {
        const result = await createZxingReader().decodeFromImageUrl(url);
        return result.getText();
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    []
  );

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setStatus("idle");
      return;
    }

    foundRef.current = false;
    let cancelled = false;

    const start = async () => {
      setStatus("starting");
      setError(null);
      setManualCode("");

      await new Promise((r) => requestAnimationFrame(r));
      const video = videoRef.current;
      if (cancelled || !video) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();

        const usingNative = getNativeDetector() !== null;
        setEngine(usingNative ? "BarcodeDetector (nativo)" : "ZXing");

        timerRef.current = setInterval(() => {
          void decodeFrame(video);
        }, usingNative ? 200 : 350);

        if (!cancelled) setStatus("scanning");
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Error";
          setError(
            /permission|denied|notallowed/i.test(msg)
              ? "Permiso de cámara denegado."
              : `No se pudo abrir la cámara: ${msg}`
          );
          setStatus("error");
        }
        stopCamera();
      }
    };

    void start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, stopCamera, decodeFrame]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    stopCamera();
    onScan(code);
    onClose();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageLoading(true);
    setError(null);
    try {
      const code = await decodeFile(file);
      emitCode(code);
    } catch {
      setError("No se detectó código en la imagen.");
      setStatus("error");
    } finally {
      setImageLoading(false);
      e.target.value = "";
    }
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 ${
        isOpen ? "" : "hidden"
      }`}
      aria-hidden={!isOpen}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Escanear código de barras</h2>
            <p className="text-sm text-slate-500">Coloca el código en horizontal frente a la cámara</p>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="p-5">
          {status === "starting" && <p className="mb-3 text-sm text-slate-600">Abriendo cámara...</p>}
          {status === "scanning" && (
            <p className="mb-3 text-sm text-green-700">
              Cámara activa ({engine}) — acerca el código despacio
            </p>
          )}
          {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-300 bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-20 w-[88%] rounded border-2 border-green-400" />
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            Usa Chrome o Edge. Centra el código en el recuadro verde, con buena luz.
          </p>

          <form onSubmit={handleManualSubmit} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <label className="btn-secondary cursor-pointer justify-center">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} disabled={imageLoading} />
              {imageLoading ? "Analizando foto..." : "Subir foto del código"}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input font-mono"
                placeholder="Código manual"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
              <button type="submit" className="btn-primary shrink-0" disabled={!manualCode.trim()}>
                Usar
              </button>
            </div>
          </form>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={handleClose} className="btn-secondary">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
