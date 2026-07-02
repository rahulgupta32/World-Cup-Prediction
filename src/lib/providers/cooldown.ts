import { promises as fs } from "fs";
import path from "path";
import os from "os";

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

export async function checkCooldown(): Promise<{ allowed: boolean; remainingSec: number }> {
  const now = Date.now();
  
  // 1. Check in-memory global
  const globalAny = global as any;
  if (globalAny.lastFotMobFetchTime) {
    const elapsed = now - globalAny.lastFotMobFetchTime;
    if (elapsed < COOLDOWN_MS) {
      return { allowed: false, remainingSec: Math.ceil((COOLDOWN_MS - elapsed) / 1000) };
    }
  }

  // 2. Check file-based cache in os temp dir
  const tempFile = path.join(os.tmpdir(), ".fotmob-cooldown");
  try {
    const data = await fs.readFile(tempFile, "utf-8");
    const mtime = parseInt(data.trim());
    if (!isNaN(mtime)) {
      const elapsed = now - mtime;
      if (elapsed < COOLDOWN_MS) {
        return { allowed: false, remainingSec: Math.ceil((COOLDOWN_MS - elapsed) / 1000) };
      }
    }
  } catch (_) {
    // File doesn't exist or is not readable
  }

  return { allowed: true, remainingSec: 0 };
}

export async function setCooldown(): Promise<void> {
  const now = Date.now();
  (global as any).lastFotMobFetchTime = now;

  const tempFile = path.join(os.tmpdir(), ".fotmob-cooldown");
  try {
    await fs.writeFile(tempFile, String(now), "utf-8");
  } catch (_) {
    // Ignore write errors (e.g. read-only filesystem in cloud deployment)
  }
}
