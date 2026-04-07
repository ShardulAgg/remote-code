"use client";

import { useState } from "react";
import { v4 as uuid } from "uuid";
import { wsClient } from "../lib/ws-client";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

interface ListResponseData {
  entries: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    modified: number;
  }>;
}

interface ReadResponseData {
  content: string;
  size: number;
}

function sendFsRequest(
  nodeId: string,
  action: "list" | "read" | "write" | "stat" | "mkdir" | "delete",
  path: string,
  data?: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = uuid();

    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type === "browser-fs-response" && msg.requestId === requestId) {
        unsubscribe();
        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.data);
        }
      }
    });

    wsClient.send({
      type: "browser-fs-request",
      nodeId,
      requestId,
      action,
      path,
      ...(data !== undefined ? { data } : {}),
    });
  });
}

export function useFiles(nodeId: string) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [loading, setLoading] = useState<boolean>(false);

  async function listDir(path: string): Promise<void> {
    setLoading(true);
    try {
      const result = await sendFsRequest(nodeId, "list", path);
      // Agent returns the array directly, not wrapped in { entries: [...] }
      const rawEntries = Array.isArray(result) ? result : (result as ListResponseData).entries ?? [];
      const mapped: FileEntry[] = rawEntries.map((e: any) => ({
        name: e.name,
        path: e.path,
        isDirectory: e.isDirectory,
        size: e.size ?? 0,
        modified: e.modified ?? 0,
      }));
      setEntries(mapped);
      setCurrentPath(path);
    } finally {
      setLoading(false);
    }
  }

  async function readFile(path: string): Promise<{ content: string; size: number }> {
    const result = await sendFsRequest(nodeId, "read", path);
    const data = result as ReadResponseData;
    return { content: data.content, size: data.size };
  }

  async function writeFile(path: string, data: string): Promise<void> {
    await sendFsRequest(nodeId, "write", path, data);
  }

  async function deleteEntry(path: string): Promise<void> {
    await sendFsRequest(nodeId, "delete", path);
  }

  return {
    entries,
    currentPath,
    loading,
    listDir,
    readFile,
    writeFile,
    deleteEntry,
  };
}
