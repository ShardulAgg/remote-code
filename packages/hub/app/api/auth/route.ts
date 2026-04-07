import { NextResponse } from "next/server";
import { generateToken, hashToken } from "../../../src/auth/tokens";
import {
  insertAuthToken,
  findAuthToken,
} from "../../../src/db/queries";

export async function POST(req: Request) {
  const body = await req.json();

  if (body.action === "generate") {
    const label: string = body.label || "api-generated";
    const token = generateToken();
    insertAuthToken(hashToken(token), label);
    return NextResponse.json({ token, label });
  }

  if (body.action === "validate") {
    const valid = findAuthToken(hashToken(body.token));
    return NextResponse.json({ valid });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
