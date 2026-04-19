const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const SECRET_SEED = 'toolary-ai-key-salt-v1';
let cryptoKeyPromise = null;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getCryptoKey() {
  if (!cryptoKeyPromise) {
    cryptoKeyPromise = (async () => {
      const runtimeId = chrome?.runtime?.id || 'toolary-extension';
      const seed = `${runtimeId}:${SECRET_SEED}`;
      const hash = await crypto.subtle.digest('SHA-256', ENCODER.encode(seed));
      return crypto.subtle.importKey(
        'raw',
        hash,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );
    })();
  }
  return cryptoKeyPromise;
}

export async function encryptString(value) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = ENCODER.encode(value || '');
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(cipherBuffer)
  };
}

export async function decryptString(record) {
  if (!record || !record.iv || !record.data) {
    return '';
  }

  const key = await getCryptoKey();
  const iv = new Uint8Array(base64ToArrayBuffer(record.iv));
  const cipherBuffer = base64ToArrayBuffer(record.data);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBuffer
  );

  return DECODER.decode(plainBuffer);
}

export async function encryptAIKeyEntries(entries = []) {
  const results = [];
  for (const entry of entries) {
    const value = typeof entry?.value === 'string' ? entry.value : '';
    const encryptedValue = await encryptString(value);
    results.push({
      version: 1,
      encryptedValue,
      createdAt: entry?.createdAt || Date.now()
    });
  }
  return results;
}

export async function decryptAIKeyEntries(entries = []) {
  const results = [];
  for (const entry of entries) {
    try {
      if (entry?.encryptedValue) {
        const value = await decryptString(entry.encryptedValue);
        results.push({
          value,
          createdAt: entry?.createdAt || Date.now()
        });
        continue;
      }
      if (typeof entry?.value === 'string') {
        results.push({
          value: entry.value,
          createdAt: entry?.createdAt || Date.now()
        });
        continue;
      }
      if (typeof entry === 'string') {
        results.push({
          value: entry,
          createdAt: Date.now()
        });
      }
    } catch (error) {
      console.warn('Toolboard secure storage: failed to decrypt entry', error);
      results.push({
        value: '',
        createdAt: entry?.createdAt || Date.now()
      });
    }
  }
  return results;
}
