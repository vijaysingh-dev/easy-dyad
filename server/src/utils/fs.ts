import * as fs from 'fs/promises';
import path from 'path';

export async function copyDir(src: string, dest: string, filter?: (src: string) => boolean) {
  const stats = await fs.stat(src);

  if (!stats.isDirectory()) {
    throw new Error('Source path must be a directory');
  }

  // Create destination directory if it doesn't exist
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (filter && !filter(srcPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, filter);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}