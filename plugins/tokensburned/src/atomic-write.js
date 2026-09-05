import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Exclusive creation prevents pre-existing files or symlinks from receiving
// secrets. A unique name also isolates simultaneous writes in one process.
export async function atomicWrite(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content);
    await handle.close();
    await fs.rename(temporary, file);
  } finally {
    await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
  }
}
