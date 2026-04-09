import os from "os";
import { execFileSync } from "child_process";

export interface Stats {
  cpu: number;
  memTotal: number;
  memUsed: number;
  diskTotal: number;
  diskUsed: number;
}

export function getStats(): Stats {
  // CPU: 1-minute load average as a percentage of total cores
  const loadAvg = os.loadavg()[0];
  const cpuCount = os.cpus().length;
  const cpu = Math.min((loadAvg / cpuCount) * 100, 100);

  // Memory
  const memTotal = os.totalmem();
  const memUsed = memTotal - os.freemem();

  // Disk: parse df output (cross-platform)
  let diskTotal = 0;
  let diskUsed = 0;
  try {
    const isMac = os.platform() === "darwin";
    // macOS: df -k / (1K blocks), Linux: df -B1 / (1-byte blocks)
    const args = isMac ? ["-k", "/"] : ["-B1", "/"];
    const output = execFileSync("df", args, { encoding: "utf8" });
    const lines = output.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      // parts: [filesystem, blocks, used, available, use%, mount]
      const multiplier = isMac ? 1024 : 1; // macOS reports in 1K blocks
      diskTotal = (parseInt(parts[1], 10) || 0) * multiplier;
      diskUsed = (parseInt(parts[2], 10) || 0) * multiplier;
    }
  } catch (err) {
    // Silently ignore — disk stats will be 0
  }

  return { cpu, memTotal, memUsed, diskTotal, diskUsed };
}
