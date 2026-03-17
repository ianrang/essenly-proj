import { NextResponse } from "next/server";

// TODO: Implement — TDD §4.1
// POST /api/auth/anonymous — 익명 세션 생성
export async function POST() {
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}
