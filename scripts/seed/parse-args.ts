// ============================================================
// CLI 공통 인자 파싱 — G-2: 8개 CLI에서 공유
// P-9: scripts/ 내부만. server/ import 금지.
// ============================================================

/** process.argv에서 --key=value / --flag 추출 */
export function parseArgs(argv: string[] = process.argv.slice(2)): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? "true";
  }
  return args;
}

/** 콤마 구분 문자열 → 배열 (빈 문자열 → []) */
export function splitArg(value: string | undefined): string[] {
  if (!value || !value.trim()) return [];
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

/** 필수 인자 검증 + 사용법 출력 */
export function requireArg(
  args: Record<string, string>,
  key: string,
  usage: string,
): string {
  const value = args[key];
  if (!value || value === "true") {
    console.error(`Error: --${key} is required.\n\nUsage: ${usage}`);
    process.exit(1);
  }
  return value;
}
