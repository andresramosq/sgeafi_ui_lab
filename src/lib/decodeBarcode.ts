import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

const H5_FORMATS = [
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

type QuaggaAPI = {
  decodeSingle: (config: Record<string, unknown>) => Promise<{
    codeResult?: { code?: string };
  }>;
};

function loadQuagga(): Promise<QuaggaAPI> {
  if (typeof window !== "undefined" && window.Quagga) {
    return Promise.resolve(window.Quagga as QuaggaAPI);
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/quagga.min.js";
    s.onload = () => {
      if (window.Quagga) resolve(window.Quagga as QuaggaAPI);
      else reject(new Error("Quagga no cargó"));
    };
    s.onerror = () => reject(new Error("Quagga no cargó"));
    document.head.appendChild(s);
  });
}

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
  return new BrowserMultiFormatReader(hints);
}

async function decodeWithNativeDetector(source: ImageBitmapSource): Promise<string | null> {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) return null;
  try {
    const Detector = (window as Window & {
      BarcodeDetector: new (o: { formats: string[] }) => {
        detect: (s: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
      };
    }).BarcodeDetector;
    const detector = new Detector({ formats: NATIVE_FORMATS });
    const codes = await detector.detect(source);
    return codes[0]?.rawValue ?? null;
  } catch {
    return null;
  }
}

async function decodeWithZxing(url: string): Promise<string | null> {
  try {
    const result = await createZxingReader().decodeFromImageUrl(url);
    return result.getText();
  } catch {
    return null;
  }
}

async function decodeWithHtml5(file: File): Promise<string | null> {
  const tempId = "h5-decode-temp";
  let el = document.getElementById(tempId);
  if (!el) {
    el = document.createElement("div");
    el.id = tempId;
    el.style.display = "none";
    document.body.appendChild(el);
  }
  try {
    const scanner = new Html5Qrcode(tempId, {
      verbose: false,
      formatsToSupport: H5_FORMATS,
      useBarCodeDetectorIfSupported: true,
    });
    const result = await scanner.scanFile(file, false);
    return result;
  } catch {
    return null;
  }
}

async function decodeWithQuagga(url: string): Promise<string | null> {
  try {
    const Quagga = await loadQuagga();
    const result = await Quagga.decodeSingle({
      src: url,
      numOfWorkers: 0,
      locate: true,
      locator: { patchSize: "large", halfSample: false },
      decoder: { readers: QUAGGA_READERS },
    });
    return result.codeResult?.code ?? null;
  } catch {
    return null;
  }
}

/** Intenta 4 motores distintos sobre la misma imagen */
export async function decodeBarcodeFromFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const native = await decodeWithNativeDetector(bitmap);
    if (native) return native.trim();
  } finally {
    bitmap.close();
  }

  const url = URL.createObjectURL(file);
  try {
    const zxing = await decodeWithZxing(url);
    if (zxing) return zxing.trim();

    const h5 = await decodeWithHtml5(file);
    if (h5) return h5.trim();

    const quagga = await decodeWithQuagga(url);
    if (quagga) return quagga.trim();
  } finally {
    URL.revokeObjectURL(url);
  }

  throw new Error(
    "No se detectó código. Acerca más la cámara, usa buena luz y que el código llene la foto."
  );
}

export async function captureVideoFrame(video: HTMLVideoElement): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo capturar");
  ctx.drawImage(video, 0, 0);
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", 0.95)
  );
  if (!blob) throw new Error("No se pudo capturar");
  return new File([blob], "frame.jpg", { type: "image/jpeg" });
}

declare global {
  interface Window {
    Quagga?: QuaggaAPI;
  }
}
