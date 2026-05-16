import CryptoJS from 'crypto-js';

const KEY = 'shopnow-secure-storage-key';

export function setSecure(key: string, value: string): void {
  const encrypted = CryptoJS.AES.encrypt(value, KEY).toString();
  localStorage.setItem(key, encrypted);
}

export function getSecure(key: string): string {
  const raw = localStorage.getItem(key);
  if (!raw) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(raw, KEY);
    return bytes.toString(CryptoJS.enc.Utf8) || '';
  } catch {
    return '';
  }
}

export function removeSecure(key: string): void {
  localStorage.removeItem(key);
}
