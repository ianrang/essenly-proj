// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateProductSlug } from "./slug";

describe("generateProductSlug", () => {
  it("기본 영문 이름 → kebab-case 슬러그", () => {
    expect(generateProductSlug("Innisfree Green Tea Seed Hyaluronic Cream"))
      .toBe("prod-innisfree-green-tea-seed-hyaluronic-cream");
  });

  it("특수문자 & 제거", () => {
    expect(generateProductSlug("rom&nd Juicy Lasting Tint"))
      .toBe("prod-romnd-juicy-lasting-tint");
  });

  it("특수문자 . 제거", () => {
    expect(generateProductSlug("Dr.G Red Blemish Clear Soothing Cream"))
      .toBe("prod-drg-red-blemish-clear-soothing-cream");
  });

  it("특수문자 ' 제거", () => {
    expect(generateProductSlug("d'Alba White Truffle Return Oil Cream"))
      .toBe("prod-dalba-white-truffle-return-oil-cream");
  });

  it("특수문자 : + 제거", () => {
    expect(generateProductSlug("Beauty of Joseon Glow Serum: Rice + Alpha-Arbutin"))
      .toBe("prod-beauty-of-joseon-glow-serum-rice-alpha-arbutin");
  });

  it("% 제거, 숫자 보존", () => {
    expect(generateProductSlug("Anua Heartleaf 77% Soothing Toner"))
      .toBe("prod-anua-heartleaf-77-soothing-toner");
  });

  it("기존 하이픈 보존", () => {
    expect(generateProductSlug("Torriden DIVE-IN Low Molecular Hyaluronic Acid Serum"))
      .toBe("prod-torriden-dive-in-low-molecular-hyaluronic-acid-serum");
  });

  it("대소문자 통일 (toLowerCase)", () => {
    expect(generateProductSlug("COSRX Advanced Snail 92 All in One Cream"))
      .toBe("prod-cosrx-advanced-snail-92-all-in-one-cream");
  });

  it("숫자로 시작하는 브랜드", () => {
    expect(generateProductSlug("3CE Velvet Lip Tint"))
      .toBe("prod-3ce-velvet-lip-tint");
  });

  it("SPF 숫자 보존", () => {
    expect(generateProductSlug("MISSHA M Perfect Cover BB Cream SPF42"))
      .toBe("prod-missha-m-perfect-cover-bb-cream-spf42");
  });

  it("연속 특수문자 → 단일 하이픈", () => {
    expect(generateProductSlug("Test & More: Product + Extra"))
      .toBe("prod-test-more-product-extra");
  });

  it("결정론적: 동일 입력 → 동일 출력", () => {
    const a = generateProductSlug("COSRX Snail Cream");
    const b = generateProductSlug("COSRX Snail Cream");
    expect(a).toBe(b);
  });

  it("빈 문자열 → prod- 접두사만 반환", () => {
    expect(generateProductSlug("")).toBe("prod-");
  });
});
