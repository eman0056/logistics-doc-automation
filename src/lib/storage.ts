import fs from 'fs';
import path from 'path';

export interface StorageDriver {
  saveFile(customerId: string, documentId: string, fileName: string, buffer: Buffer): Promise<string>;
  getFile(storagePath: string): Promise<Buffer>;
  deleteFile(storagePath: string): Promise<boolean>;
}

export class LocalStorageDriver implements StorageDriver {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), 'storage');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async saveFile(customerId: string, documentId: string, fileName: string, buffer: Buffer): Promise<string> {
    const targetDir = path.join(this.baseDir, customerId, documentId);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const targetPath = path.join(targetDir, fileName);
    await fs.promises.writeFile(targetPath, buffer);
    return path.relative(process.cwd(), targetPath);
  }

  async getFile(storagePath: string): Promise<Buffer> {
    const fullPath = path.join(process.cwd(), storagePath);
    return await fs.promises.readFile(fullPath);
  }

  async deleteFile(storagePath: string): Promise<boolean> {
    const fullPath = path.join(process.cwd(), storagePath);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      return true;
    }
    return false;
  }
}

// Configurable storage driver singleton (swappable for S3/MinIO later via env flag)
const storageDriverType = process.env.STORAGE_DRIVER || 'LOCAL';
export const storageDriver: StorageDriver = new LocalStorageDriver();
