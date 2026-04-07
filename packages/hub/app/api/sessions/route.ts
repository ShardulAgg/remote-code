import { NextResponse } from "next/server";
import { getActiveSessions } from "../../../src/db/queries";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nodeId = url.searchParams.get("nodeId") || "";
  const sessions = getActiveSessions();
  const filtered = nodeId
    ? sessions.filter((s) => s.nodeId === nodeId)
    : sessions;
  return NextResponse.json({ sessions: filtered });
}
