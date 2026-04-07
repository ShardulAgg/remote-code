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

  // Disk: parse `df -B1 /` output
  let diskTotal = 0;
  let diskUsed = 0;
  try {
    const output = execFileSync("df", ["-B1", "/"], { encoding: "utf8" });
    // Output format:
    // Filesystem     1B-blocks      Used Available Use% Mounted on
    // /dev/sda1      1000000000 400000000 600000000  40% /
    const lines = output.trim().split("\n");
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      // parts: [filesystem, 1B-blocks, used, available, use%, mount]
      diskTotal = parseInt(parts[1], 10) || 0;
      diskUsed = parseInt(parts[2], 10) || 0;
    }
  } catch (err) {
    console.error("[stats] Failed to get disk stats:", err);
  }

  return { cpu, memTotal, memUsed, diskTotal, diskUsed };
}
