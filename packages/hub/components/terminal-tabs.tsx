"use client";

export interface TabInfo {
  id: string;
  nodeId: string;
  nodeName: string;
  sessionId: string;
  label?: string; // e.g. "Session 1", "Claude Code"
}

interface TerminalTabsProps {
  tabs: TabInfo[];
  activeTab: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

export function TerminalTabs({
  tabs,
  activeTab,
  onSelect,
  onClose,
  onAdd,
}: TerminalTabsProps) {
  return (
    <div className="flex items-center gap-0 border-b border-border bg-surface-light overflow-x-auto shrink-0">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab;
        const label = tab.label || `Session ${index + 1}`;
        return (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none border-b-2 transition-colors whitespace-nowrap text-sm ${
              isActive
                ? "border-accent text-white bg-surface"
                : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-surface-lighter"
            }`}
            onClick={() => onSelect(tab.id)}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
            <span>{label}</span>
            <span className="text-[10px] text-gray-600 font-mono">{tab.sessionId.slice(0, 6)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="ml-0.5 text-gray-500 hover:text-danger rounded transition-colors text-xs leading-none"
              aria-label={`Close ${label}`}
            >
              x
            </button>
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="px-3 py-2 text-gray-400 hover:text-accent hover:bg-surface-lighter transition-colors text-sm"
        aria-label="New session"
        title="New session"
      >
        + New
      </button>
    </div>
  );
}
