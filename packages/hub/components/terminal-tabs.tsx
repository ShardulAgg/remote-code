"use client";

export interface TabInfo {
  id: string;
  nodeId: string;
  nodeName: string;
  sessionId: string;
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
    <div className="flex items-center gap-0 border-b border-border bg-surface-light overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <div
            key={tab.id}
            className={`flex items-center gap-2 px-3 py-2 cursor-pointer select-none border-b-2 transition-colors whitespace-nowrap ${
              isActive
                ? "border-accent text-white bg-surface"
                : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-surface-lighter"
            }`}
            onClick={() => onSelect(tab.id)}
          >
            <span className="text-sm">{tab.nodeName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.id);
              }}
              className="ml-1 text-gray-500 hover:text-danger rounded transition-colors text-xs leading-none"
              aria-label={`Close ${tab.nodeName} tab`}
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="px-3 py-2 text-gray-400 hover:text-white hover:bg-surface-lighter transition-colors text-lg leading-none"
        aria-label="Add terminal tab"
      >
        +
      </button>
    </div>
  );
}
