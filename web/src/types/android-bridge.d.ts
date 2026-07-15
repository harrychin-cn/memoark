interface MemoArkAndroidBridge {
  saveFile(token: string, dataUrl: string, filename: string, mimeType: string): void;
  shareFile(token: string, dataUrl: string, filename: string, mimeType: string, title: string): void;
  shareText(token: string, text: string, title: string): void;
}

interface Window {
  MemoArkAndroid?: MemoArkAndroidBridge;
  __MEMOARK_BRIDGE_TOKEN?: string;
}
