import { NextResponse } from "next/server";

// TODO: Implement — TDD §4.1
// GET /api/chat/history — 대화 히스토리 조회
export async function GET() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
