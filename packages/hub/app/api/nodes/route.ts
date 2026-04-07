import { NextResponse } from "next/server";
import { getAllNodes } from "../../../src/db/queries";

export async function GET() {
  return NextResponse.json({ nodes: getAllNodes() });
}
