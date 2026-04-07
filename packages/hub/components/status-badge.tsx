"use client";

interface StatusBadgeProps {
  status: "online" | "offline";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === "online") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        <span className="text-success text-sm font-medium">online</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-flex rounded-full h-2 w-2 bg-gray-500" />
      <span className="text-gray-500 text-sm font-medium">offline</span>
    </span>
  );
}
