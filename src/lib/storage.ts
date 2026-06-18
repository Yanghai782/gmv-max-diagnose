// IndexedDB persistence for historical uploads and cross-session comparison
// Supports lifecycle curve data accumulation

export interface StoredUpload {
  id: string;
  timestamp: number;
  dateLabel: string;
  creativeCount: number;
  totalOrders: number;
  totalSpend: number;
  totalGmv: number;
  avgRoi: number;
  avgCpm: number;
  avgCtr: number;
  avgCvr: number;
  totalImp: number;
  summary: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("GMVMaxHistory", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("uploads")) {
        const store = db.createObjectStore("uploads", { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveUpload(entry: StoredUpload): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("uploads", "readwrite");
    tx.objectStore("uploads").put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    db.close();
  });
}

export async function getAllUploads(): Promise<StoredUpload[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("uploads", "readonly");
    const req = tx.objectStore("uploads").getAll();
    req.onsuccess = () => {
      const results = (req.result as StoredUpload[]).sort((a, b) => a.timestamp - b.timestamp);
      resolve(results);
    };
    req.onerror = () => reject(req.error);
    db.close();
  });
}

export async function clearHistory(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("uploads", "readwrite");
    tx.objectStore("uploads").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    db.close();
  });
}
