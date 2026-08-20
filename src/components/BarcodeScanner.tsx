"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatOneDReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const SCANNER_DIV_ID = "barcode-scanner-region";

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
  Html5QrcodeSupportedFormats.QR_CODE,
];

interface BarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

function createBarcodeReader() {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.CODE_93,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatOneDReader(hints);
}

export default function BarcodeScanner({
  isOpen,
  onClose,
  onScan,
}: BarcodeScannerProps) {
  const cameraRef = useRef<Html5Qrcode | null>(null);
  const decodeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(0);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const lastScanRef = useRef({ code: "", time: 0 });

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [manualCode, setManualCode] = useState("");
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopDecodeLoop = useCallback(() => {
    if (decodeTimerRef.current) {
      clearInterval(decodeTimerRef.current);
      decodeTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(async () => {
    stopDecodeLoop();
    const camera = cameraRef.current;
    cameraRef.current = null;
    if (!camera) return;

    try {
      if (camera.isScanning) await camera.stop();
      camera.clear();
    } catch {
      try {
        camera.clear();
      } catch {
        // ignorar
      }
    }
  }, [stopDecodeLoop]);

  const emitCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;

      const now = Date.now();
      if (lastScanRef.current.code === trimmed && now - lastScanRef.current.time < 2000) {
        return;
      }
      lastScanRef.current = { code: trimmed, time: now };

      await stopCamera();
      onScanRef.current(trimmed);
      onCloseRef.current();
    },
    [stopCamera]
  );

  const startDecodeLoop = useCallback(
    (video: HTMLVideoElement, session: number) => {
      const reader = createBarcodeReader();
      const canvas = document.createElement("canvas");
      let busy = false;

      decodeTimerRef.current = setInterval(() => {
        if (busy || session !== sessionRef.current) return;
        if (video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA || !video.videoWidth) return;

        busy = true;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          busy = false;
          return;
        }
        ctx.drawImage(video, 0, 0);

        reader
          .decodeFromImageUrl(canvas.toDataURL("image/jpeg", 0.85))
          .then((result) => {
            if (session === sessionRef.current) {
              void emitCode(result.getText());
            }
          })
          .catch(() => {
            // frame sin código — continuar
          })
          .finally(() => {
            busy = false;
          });
      }, 250);
    },
    [emitCode]
  );

  useEffect(() => {
    if (!isOpen) {
      void stopCamera();
      setStatus("idle");
      return;
    }

    const session = ++sessionRef.current;
    let cancelled = false;

    const start = async () => {
      setStatus("starting");
      setError(null);
      setManualCode("");

      await new Promise((r) => setTimeout(r, 100));
      if (cancelled || session !== sessionRef.current) return;

      try {
        await stopCamera();
        if (cancelled || session !== sessionRef.current) return;

        const camera = new Html5Qrcode(SCANNER_DIV_ID, {
          verbose: false,
          formatsToSupport: HTML5_FORMATS,
          useBarCodeDetectorIfSupported: false,
        });
        cameraRef.current = camera;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras.length) throw new Error("No hay cámara disponible");

        const cameraId =
          cameras.find((c) => /back|rear|environment/i.test(c.label))?.id ??
          cameras[cameras.length - 1].id;

        // html5-qrcode maneja la cámara (preview estable en PC)
        await camera.start(
          cameraId,
          { fps: 10, aspectRatio: 1.777778 },
          (text) => {
            if (!cancelled && session === sessionRef.current) void emitCode(text);
          },
          () => {}
        );

        if (cancelled || session !== sessionRef.current) {
          await stopCamera();
          return;
        }

        // ZXing lee barras 1D frame a frame (más fiable que html5-qrcode solo)
        const video = document.querySelector<HTMLVideoElement>(
          `#${SCANNER_DIV_ID} video`
        );
        if (video) startDecodeLoop(video, session);

        setStatus("scanning");
      } catch (err) {
        if (!cancelled && session === sessionRef.current) {
          const msg = err instanceof Error ? err.message : "Error desconocido";
          setError(
            /permission|denied|not allowed/i.test(msg)
              ? "Permiso de cámara denegado. Actívalo en el navegador."
              : `No se pudo iniciar la cámara: ${msg}`
          );
          setStatus("error");
        }
        await stopCamera();
      }
    };

    void start();

    return () => {
      cancelled = true;
      void stopCamera();
    };
  }, [isOpen, stopCamera, startDecodeLoop, emitCode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    void stopCamera();
    onScan(code);
    onClose();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageLoading(true);
    setError(null);

    const url = URL.createObjectURL(file);
    try {
      const result = await createBarcodeReader().decodeFromImageUrl(url);
      await emitCode(result.getText());
    } catch {
      setError("No se detectó código en la imagen.");
      setStatus("error");
    } finally {
      URL.revokeObjectURL(url);
      setImageLoading(false);
      e.target.value = "";
    }
  };

  const handleClose = () => {
    void stopCamera();
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
            <p className="text-sm text-slate-500">Apunta la cámara al código del producto</p>
          </div>
          <button type="button" onClick={handleClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {status === "starting" && (
            <p className="mb-4 text-sm text-slate-600">Iniciando cámara...</p>
          )}
          {status === "scanning" && !error && (
            <p className="mb-4 text-sm text-green-700">Cámara activa — acerca el código</p>
          )}
          {error && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          <div id={SCANNER_DIV_ID} className="scanner-container overflow-hidden rounded-lg border border-slate-200 bg-black" />

          <form onSubmit={handleManualSubmit} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            <label className="btn-secondary cursor-pointer justify-center">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageUpload} disabled={imageLoading} />
              {imageLoading ? "Analizando imagen..." : "Subir foto del código"}
            </label>
            <div>
              <label htmlFor="manual-code" className="label">Código manual</label>
              <div className="flex gap-2">
                <input id="manual-code" type="text" className="input font-mono" placeholder="7701234567890" value={manualCode} onChange={(e) => setManualCode(e.target.value)} />
                <button type="submit" className="btn-primary shrink-0" disabled={!manualCode.trim()}>Usar</button>
              </div>
            </div>
          </form>
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={handleClose} className="btn-secondary">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
