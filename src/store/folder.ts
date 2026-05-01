import { create } from 'zustand';

const FOLDER_KEY = 'household.drive.folder';
const ASSET_FOLDER_KEY = 'household.drive.assetFolder';

export interface FolderInfo {
  id: string;
  name: string;
}

interface FolderState {
  folder: FolderInfo | null;
  assetFolder: FolderInfo | null;
  setFolder: (f: FolderInfo) => void;
  clearFolder: () => void;
  setAssetFolder: (f: FolderInfo) => void;
  clearAssetFolder: () => void;
}

function loadFromKey(key: string): FolderInfo | null {
  try {
    const v = localStorage.getItem(key);
    if (!v) return null;
    const parsed = JSON.parse(v) as FolderInfo;
    return parsed && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

function persist(key: string, value: FolderInfo | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export const useFolderStore = create<FolderState>((set) => ({
  folder: loadFromKey(FOLDER_KEY),
  assetFolder: loadFromKey(ASSET_FOLDER_KEY),
  setFolder: (folder) => {
    persist(FOLDER_KEY, folder);
    set({ folder });
  },
  clearFolder: () => {
    persist(FOLDER_KEY, null);
    set({ folder: null });
  },
  setAssetFolder: (assetFolder) => {
    persist(ASSET_FOLDER_KEY, assetFolder);
    set({ assetFolder });
  },
  clearAssetFolder: () => {
    persist(ASSET_FOLDER_KEY, null);
    set({ assetFolder: null });
  },
}));
