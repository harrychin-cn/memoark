export function absolutifyLink(rel: string): string {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", rel);
  return anchor.href;
}

export function getSystemColorScheme() {
  if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  } else {
    return "light";
  }
}

export function convertFileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result?.toString() || "");
    reader.onerror = (error) => reject(error);
  });
}

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const downloadFileFromUrl = (url: string, filename: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  a.remove();
};

const getAndroidBridge = () => {
  if (typeof window === "undefined" || !window.MemoArkAndroid || !window.__MEMOARK_BRIDGE_TOKEN) {
    return undefined;
  }
  return {
    bridge: window.MemoArkAndroid,
    token: window.__MEMOARK_BRIDGE_TOKEN,
  };
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsDataURL(blob);
  });

export const hasAndroidNativeBridge = () => typeof window !== "undefined" && Boolean(window.MemoArkAndroid);

export const downloadFileFromBlob = async (blob: Blob, filename: string) => {
  const androidBridge = getAndroidBridge();
  if (androidBridge) {
    androidBridge.bridge.saveFile(androidBridge.token, await blobToDataUrl(blob), filename, blob.type || "application/octet-stream");
    return;
  }

  const url = URL.createObjectURL(blob);
  downloadFileFromUrl(url, filename);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const shareFileWithNativeHost = async (blob: Blob, filename: string, title: string) => {
  const androidBridge = getAndroidBridge();
  if (!androidBridge) {
    return false;
  }
  androidBridge.bridge.shareFile(androidBridge.token, await blobToDataUrl(blob), filename, blob.type || "application/octet-stream", title);
  return true;
};
