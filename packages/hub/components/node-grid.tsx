"use client";

import { NodeInfo } from "@remote-code/protocol";
import { NodeCard } from "./node-card";

interface NodeGridProps {
  nodes: NodeInfo[];
}

export function NodeGrid({ nodes }: NodeGridProps) {
  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="text-4xl mb-4 text-gray-600">&#9711;</div>
        <p className="text-gray-400 text-lg font-medium">No nodes connected</p>
        <p className="text-gray-600 text-sm mt-1">
          Start the agent on a machine to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {nodes.map((node) => (
        <NodeCard key={node.nodeId} node={node} />
      ))}
    </div>
  );
}
