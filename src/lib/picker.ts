import type { PickerCallbackData } from '@/types/google-api';

const GAPI_SRC = 'https://apis.google.com/js/api.js';

let gapiPromise: Promise<void> | null = null;
let pickerLoadedPromise: Promise<void> | null = null;

function loadGapiScript(): Promise<void> {
  if (gapiPromise) return gapiPromise;
  gapiPromise = new Promise((resolve, reject) => {
    if (window.gapi) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GAPI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('gapi load failed')), {
        once: true,
      });
      return;
    }
    const s = document.createElement('script');
    s.src = GAPI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gapi load failed'));
    document.head.appendChild(s);
  });
  return gapiPromise;
}

async function loadPickerLibrary(): Promise<void> {
  if (pickerLoadedPromise) return pickerLoadedPromise;
  await loadGapiScript();
  pickerLoadedPromise = new Promise((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error('gapi not available'));
      return;
    }
    window.gapi.load('picker', {
      callback: () => resolve(),
      onerror: () => reject(new Error('picker library load failed')),
    });
  });
  return pickerLoadedPromise;
}

export interface PickedFolder {
  id: string;
  name: string;
}

export async function pickFolder(opts: {
  accessToken: string;
  apiKey: string;
}): Promise<PickedFolder | null> {
  await loadPickerLibrary();
  const picker = window.google?.picker;
  if (!picker) throw new Error('google.picker not available');

  return new Promise((resolve) => {
    const view = new picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes('application/vnd.google-apps.folder');

    const instance = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(opts.accessToken)
      .setDeveloperKey(opts.apiKey)
      .setOrigin(window.location.protocol + '//' + window.location.host)
      .setTitle('家計簿フォルダを選択')
      .enableFeature(picker.Feature.NAV_HIDDEN)
      .setCallback((data: PickerCallbackData) => {
        if (data.action === 'picked') {
          const doc = data.docs?.[0];
          if (doc) {
            resolve({ id: doc.id, name: doc.name });
            instance.dispose();
            return;
          }
        }
        if (data.action === 'cancel') {
          resolve(null);
          instance.dispose();
        }
      })
      .build();

    instance.setVisible(true);
  });
}
