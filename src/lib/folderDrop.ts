// Lê a pasta FOTOS_SITE arrastada (ou escolhida com <input webkitdirectory>) e separa o
// ficheiro de dados (produtos_site.json/.csv) das fotos da subpasta imagens/.
export type DroppedFolder = {
  dataFile: File | null;
  dataFileType: 'json' | 'csv' | null;
  images: Map<string, File>;
};

function classify(relPath: string, file: File, out: DroppedFolder) {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('produtos_site.json')) {
    out.dataFile = file;
    out.dataFileType = 'json';
  } else if (lower.endsWith('produtos_site.csv') && out.dataFileType !== 'json') {
    out.dataFile = file;
    out.dataFileType = 'csv';
  } else if (/\/imagens\//.test(`/${lower}`) && /\.(jpe?g|png|webp)$/.test(lower)) {
    out.images.set(file.name, file);
  }
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file?(cb: (f: File) => void, errCb?: (e: unknown) => void): void;
  createReader?(): { readEntries(cb: (entries: FileSystemEntryLike[]) => void, errCb?: (e: unknown) => void): void };
}

async function walkEntry(entry: FileSystemEntryLike, out: DroppedFolder): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
    classify(entry.fullPath.replace(/^\//, ''), file, out);
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const readAll = async (): Promise<FileSystemEntryLike[]> => {
      const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) return [];
      return [...batch, ...(await readAll())];
    };
    const entries = await readAll();
    for (const child of entries) await walkEntry(child, out);
  }
}

export async function readDroppedItems(items: DataTransferItemList): Promise<DroppedFolder> {
  const out: DroppedFolder = { dataFile: null, dataFileType: null, images: new Map() };
  const roots: FileSystemEntryLike[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = (items[i] as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  for (const root of roots) await walkEntry(root, out);
  return out;
}

export function readFileList(files: FileList): DroppedFolder {
  const out: DroppedFolder = { dataFile: null, dataFileType: null, images: new Map() };
  for (const file of Array.from(files)) {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    classify(relPath, file, out);
  }
  return out;
}
