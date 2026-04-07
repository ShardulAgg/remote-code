"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFiles, FileEntry } from "../../../hooks/use-files";
import { FileList } from "../../../components/file-list";
import { FileActions } from "../../../components/file-actions";
import { UploadDialog } from "../../../components/upload-dialog";

function parentPath(path: string): string {
  if (path === "/" || path === "") return "/";
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

function BreadcrumbNav({
  currentPath,
  onNavigate,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const parts = currentPath === "/" ? [""] : currentPath.split("/");

  return (
    <nav className="flex items-center gap-1 text-sm font-mono text-gray-400 flex-wrap">
      {parts.map((part, idx) => {
        const segPath = idx === 0 ? "/" : parts.slice(0, idx + 1).join("/");
        const isLast = idx === parts.length - 1;
        return (
          <span key={idx} className="flex items-center gap-1">
            {idx > 0 && <span className="text-gray-600">/</span>}
            {isLast ? (
              <span className="text-white">{part || "/"}</span>
            ) : (
              <button
                onClick={() => onNavigate(segPath)}
                className="hover:text-accent transition-colors"
              >
                {part || "/"}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export default function FilesPage() {
  const params = useParams();
  const router = useRouter();
  const nodeId = Array.isArray(params.nodeId) ? params.nodeId[0] : params.nodeId ?? "";

  const { entries, currentPath, loading, listDir, readFile, writeFile, deleteEntry } =
    useFiles(nodeId);

  const [actionEntry, setActionEntry] = useState<FileEntry | null>(null);
  const [actionPos, setActionPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    listDir("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  function handleNavigate(path: string) {
    listDir(path);
  }

  function handleAction(entry: FileEntry, position: { x: number; y: number }) {
    setActionEntry(entry);
    setActionPos(position);
  }

  function handleTerminalHere(entry: FileEntry) {
    router.push(`/terminal?node=${encodeURIComponent(nodeId)}&cwd=${encodeURIComponent(entry.path)}`);
  }

  function handleClaudeHere(entry: FileEntry) {
    router.push(
      `/terminal?node=${encodeURIComponent(nodeId)}&cwd=${encodeURIComponent(entry.path)}&command=claude`
    );
  }

  async function handleDownload(entry: FileEntry) {
    try {
      const { content } = await readFile(entry.path);
      // content is expected to be base64
      const binary = atob(content);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(`Download failed: ${String(err)}`);
    }
  }

  async function handleDelete(entry: FileEntry) {
    const confirmed = window.confirm(
      `Delete "${entry.name}"? This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await deleteEntry(entry.path);
      await listDir(currentPath);
    } catch (err) {
      window.alert(`Delete failed: ${String(err)}`);
    }
  }

  async function handleUpload(path: string, base64data: string) {
    try {
      await writeFile(path, base64data);
      await listDir(currentPath);
    } catch (err) {
      window.alert(`Upload failed: ${String(err)}`);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-semibold text-white shrink-0">Files</h1>
          <span className="text-gray-600 shrink-0">/</span>
          <span className="text-gray-400 text-sm font-mono truncate">{nodeId}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowUpload(true)}
            className="px-3 py-1.5 text-sm rounded bg-surface-lighter border border-border text-gray-300 hover:bg-accent hover:text-white hover:border-accent transition-colors"
          >
            Upload
          </button>
        </div>
      </div>

      {/* Path breadcrumb + up button */}
      <div className="flex items-center gap-3 mb-4 bg-surface-light border border-border rounded-lg px-3 py-2">
        <button
          onClick={() => handleNavigate(parentPath(currentPath))}
          disabled={currentPath === "/"}
          className="text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          .. up
        </button>
        <span className="text-gray-600">|</span>
        <BreadcrumbNav currentPath={currentPath} onNavigate={handleNavigate} />
      </div>

      {/* File list */}
      <div className="bg-surface-light border border-border rounded-lg px-4 py-3 min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
            Loading...
          </div>
        ) : (
          <FileList
            entries={entries}
            onNavigate={handleNavigate}
            onAction={handleAction}
          />
        )}
      </div>

      {/* Context menu */}
      {actionEntry && (
        <FileActions
          entry={actionEntry}
          position={actionPos}
          onClose={() => setActionEntry(null)}
          onTerminalHere={handleTerminalHere}
          onClaudeHere={handleClaudeHere}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      )}

      {/* Upload dialog */}
      {showUpload && (
        <UploadDialog
          currentPath={currentPath}
          onUpload={handleUpload}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  );
}
