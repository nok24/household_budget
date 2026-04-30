import { create } from 'zustand';

const FOLDER_KEY = 'household.drive.folder';

export interface FolderInfo {
  id: string;
  name: string;
}

interface FolderState {
  folder: FolderInfo | null;
  setFolder: (f: FolderInfo) => void;
  clearFolder: () => void;
}

function loadInitial(): FolderInfo | null {
  try {
    const v = localStorage.getItem(FOLDER_KEY);
    if (!v) return null;
    const parsed = JSON.parse(v) as FolderInfo;
    return parsed && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

export const useFolderStore = create<FolderState>((set) => ({
  folder: loadInitial(),
  setFolder: (folder) => {
    try {
      localStorage.setItem(FOLDER_KEY, JSON.stringify(folder));
    } catch {
      /* noop */
    }
    set({ folder });
  },
  clearFolder: () => {
    try {
      localStorage.removeItem(FOLDER_KEY);
    } catch {
      /* noop */
    }
    set({ folder: null });
  },
}));
