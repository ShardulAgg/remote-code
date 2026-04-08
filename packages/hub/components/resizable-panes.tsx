"use client";

import { useState, useRef, useCallback, useEffect, ReactNode } from "react";

interface PaneConfig {
  id: string;
  /** Flex ratio (default 1) */
  size: number;
}

interface ResizablePanesProps {
  direction: "horizontal" | "vertical";
  panes: PaneConfig[];
  onPanesChange: (panes: PaneConfig[]) => void;
  children: ReactNode[];
}

/**
 * A container that lays out children with draggable dividers between them.
 * Each pane has a flex ratio (`size`) that the user can adjust by dragging.
 */
export function ResizablePanes({ direction, panes, onPanesChange, children }: ResizablePanesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ index: number; startPos: number; startSizes: number[] } | null>(null);

  const isHorizontal = direction === "horizontal";

  const handleMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      const startPos = isHorizontal ? e.clientX : e.clientY;
      draggingRef.current = {
        index,
        startPos,
        startSizes: panes.map((p) => p.size),
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current || !containerRef.current) return;
        const { index: idx, startPos: sp, startSizes } = draggingRef.current;

        const containerRect = containerRef.current.getBoundingClientRect();
        const totalPx = isHorizontal ? containerRect.width : containerRect.height;
        const delta = (isHorizontal ? ev.clientX : ev.clientY) - sp;
        const totalSize = startSizes.reduce((a, b) => a + b, 0);
        const deltaProportion = (delta / totalPx) * totalSize;

        const newSizes = [...startSizes];
        const minSize = 0.1;

        newSizes[idx] = Math.max(minSize, startSizes[idx] + deltaProportion);
        newSizes[idx + 1] = Math.max(minSize, startSizes[idx + 1] - deltaProportion);

        // Clamp: if one hit min, adjust the other
        if (newSizes[idx] <= minSize) {
          newSizes[idx] = minSize;
          newSizes[idx + 1] = startSizes[idx] + startSizes[idx + 1] - minSize;
        }
        if (newSizes[idx + 1] <= minSize) {
          newSizes[idx + 1] = minSize;
          newSizes[idx] = startSizes[idx] + startSizes[idx + 1] - minSize;
        }

        onPanesChange(panes.map((p, i) => ({ ...p, size: newSizes[i] ?? p.size })));
      };

      const handleMouseUp = () => {
        draggingRef.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panes, onPanesChange, isHorizontal]
  );

  return (
    <div
      ref={containerRef}
      className="flex overflow-hidden"
      style={{
        flexDirection: isHorizontal ? "row" : "column",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {panes.map((pane, i) => (
        <div key={pane.id} className="flex" style={{ display: "contents" }}>
          {/* Pane content */}
          <div
            style={{ flex: pane.size, minWidth: 0, minHeight: 0 }}
            className="flex overflow-hidden"
          >
            {children[i]}
          </div>

          {/* Divider */}
          {i < panes.length - 1 && (
            <div
              onMouseDown={(e) => handleMouseDown(i, e)}
              className={`shrink-0 transition-colors ${
                isHorizontal
                  ? "w-1 cursor-col-resize hover:bg-accent/50 active:bg-accent"
                  : "h-1 cursor-row-resize hover:bg-accent/50 active:bg-accent"
              } bg-border`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
