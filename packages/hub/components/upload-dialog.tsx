"use client";

import { useRef, useState } from "react";

interface UploadDialogProps {
  currentPath: string;
  onUpload: (path: string, base64data: string) => void;
  onClose: () => void;
}

export function UploadDialog({ currentPath, onUpload, onClose }: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploading(true);
    const total = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProgress(`Uploading ${i + 1} / ${total}: ${file.name}`);

      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let j = 0; j < bytes.byteLength; j++) {
          binary += String.fromCharCode(bytes[j]);
        }
        const base64 = btoa(binary);

        const destPath =
          currentPath.endsWith("/")
            ? `${currentPath}${file.name}`
            : `${currentPath}/${file.name}`;

        onUpload(destPath, base64);
      } catch {
        setProgress(`Failed to read ${file.name}`);
      }
    }

    setUploading(false);
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={!uploading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-surface-light border border-border rounded-lg p-6 w-full max-w-md shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Upload Files</h2>
            {!uploading && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
              >
                x
              </button>
            )}
          </div>

          <p className="text-gray-400 text-sm mb-4">
            Uploading to: <span className="text-gray-200 font-mono">{currentPath}</span>
          </p>

          {uploading ? (
            <div className="text-gray-300 text-sm py-4 text-center">
              {progress}
            </div>
          ) : (
            <>
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-accent transition-colors"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
              >
                <p className="text-gray-400 text-sm">
                  Click to select files or drag and drop
                </p>
              </div>

              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />

              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm rounded border border-border text-gray-300 hover:bg-surface-lighter transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
