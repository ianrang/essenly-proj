# Kit CTA 테스트 커버리지 갭 수정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kit CTA E2E 플로우의 테스트 커버리지 갭 전체 수정 — KitCtaSheet 테스트 신규 작성, kit.test.ts 누락 케이스 추가, conversation_id/locale 스키마 정합성 수정

**Architecture:** 3개 영역 수정: (1) 서버 API 테스트 보강 + conversation_id/locale 전달 (2) KitCtaSheet 클라이언트 테스트 신규 작성 (3) ProductCard default variant 의도적 미노출 문서화 테스트. TDD로 테스트 먼저 작성 후 필요한 코드 수정.

**Tech Stack:** Vitest · @testing-library/react · react-hook-form · Hono · Supabase

---

## 변경 파일 맵

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/server/features/api/routes/kit.test.ts` | 수정 | 누락 테스트 5건 추가 |
| `src/server/features/api/routes/kit.ts` | 수정 | conversation_id, locale 파라미터 추가 |
| `src/client/features/chat/KitCtaSheet.test.tsx` | 신규 | 전체 UI 상태 머신 테스트 |
| `src/client/features/chat/KitCtaSheet.tsx` | 수정 | conversationId, locale props 추가 + POST body 포함 |
| `src/client/features/chat/MessageList.tsx` | 수정 | conversationId, locale props를 KitCtaSheet에 전달 |
| `src/client/features/chat/ChatContent.tsx` | 수정 | conversationId, locale을 MessageList에 전달 |
| `src/client/features/cards/ProductCard.test.tsx` | 수정 | default variant Kit CTA 미노출 테스트 1건 추가 |

---

### Task 1: kit.test.ts — 서버 API 누락 테스트 5건 추가

**Files:**
- Modify: `src/server/features/api/routes/kit.test.ts`

기존 5개 테스트에 5개를 추가. 기존 mock 구조(mockKitInsert, mockConsentUpdate, mockConsentEq, mockCheckRateLimit)를 재사용.

- [ ] **Step 1: marketing_consent false → consent UPDATE 미호출 테스트 작성**

`kit.test.ts` 파일 끝 `});` 직전에 추가:

```typescript
  it('marketing_consent false → consent_records UPDATE 미호출', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', marketing_consent: false }),
    });

    expect(mockConsentUpdate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: consent UPDATE 실패 시에도 201 반환 테스트 (Q-15)**

```typescript
  it('Q-15: consent UPDATE 실패 → kit 등록 성공 (201) 유지', async () => {
    mockConsentEq.mockResolvedValue({ error: { message: 'consent update failed' } });

    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });

    expect(res.status).toBe(201);
  });
```

- [ ] **Step 3: DB insert 비-23505 에러 → 500 테스트**

```typescript
  it('DB insert 에러 (비-중복) → 500 KIT_CLAIM_FAILED', async () => {
    mockKitInsert.mockResolvedValue({ error: { code: '42P01', message: 'relation does not exist' } });

    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('KIT_CLAIM_FAILED');
  });
```

- [ ] **Step 4: 이메일 hash 대소문자 정규화 확인 테스트**

```typescript
  it('이메일 hash 시 toLowerCase + trim 정규화 적용', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'TEST@Example.COM', marketing_consent: true }),
    });

    // encrypt는 원본 이메일 사용
    expect(mockEncrypt).toHaveBeenCalledWith('TEST@Example.COM');
    // hash는 정규화된 이메일 사용
    expect(mockHash).toHaveBeenCalledWith('test@example.com');
  });
```

- [ ] **Step 5: 공백 포함 이메일 → 400 거부 테스트**

```typescript
  it('공백 포함 이메일 → 400 (zod email 검증 거부)', async () => {
    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '  test@example.com  ', marketing_consent: true }),
    });

    expect(res.status).toBe(400);
  });
```

- [ ] **Step 6: marketing_consent 필드 누락 → 400 테스트**

```typescript
  it('marketing_consent 필드 누락 → 400', async () => {
    const res = await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });

    expect(res.status).toBe(400);
  });
```

- [ ] **Step 7: 테스트 실행 확인**

Run: `npx vitest run src/server/features/api/routes/kit.test.ts`
Expected: 11 passed (기존 5 + 신규 6)

- [ ] **Step 8: 커밋**

```bash
git add src/server/features/api/routes/kit.test.ts
git commit -m "test: kit.test.ts 누락 케이스 6건 추가 — consent false, Q-15, DB 에러, 정규화, 공백 거부, 필드 누락"
```

---

### Task 2: KitCtaSheet.test.tsx — 클라이언트 UI 테스트 신규 작성

**Files:**
- Create: `src/client/features/chat/KitCtaSheet.test.tsx`

테스트 패턴은 기존 `OnboardingChips.test.tsx` 패턴을 따름: `vi.mock("client-only")`, `vi.mock("@/client/core/auth-fetch")`, `vi.stubGlobal("fetch")`.

- [ ] **Step 1: 테스트 파일 생성 — 셋업 + 초기 렌더링 테스트**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("client-only", () => ({}));

// authFetch mock — KitCtaSheet가 사용하는 authFetch를 mock
const mockAuthFetch = vi.fn();
vi.mock("@/client/core/auth-fetch", () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

// sonner toast mock
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import KitCtaSheet from "./KitCtaSheet";

beforeEach(() => {
  mockAuthFetch.mockReset();
  mockToastError.mockReset();
});

const renderSheet = (open = true) => {
  const onOpenChange = vi.fn();
  const utils = render(
    <KitCtaSheet open={open} onOpenChange={onOpenChange} />,
  );
  return { ...utils, onOpenChange };
};

describe("KitCtaSheet", () => {
  it("open=true → 이메일 입력 + Claim 버튼 렌더링", () => {
    renderSheet(true);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claim my free kit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to chat/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 초기 렌더링 PASS 확인**

Run: `npx vitest run src/client/features/chat/KitCtaSheet.test.tsx`
Expected: 1 passed

- [ ] **Step 3: 이메일 검증 테스트 추가**

```tsx
  it("빈 이메일 제출 → 'Email is required' 에러 메시지", async () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it("잘못된 이메일 제출 → 'Please enter a valid email' 에러 메시지", async () => {
    renderSheet();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "not-valid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(screen.getByText("Please enter a valid email")).toBeInTheDocument();
    });
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: 성공 제출 (201) 테스트**

```tsx
  it("유효한 이메일 제출 → 201 → 성공 화면 표시", async () => {
    mockAuthFetch.mockResolvedValue({
      status: 201,
      ok: true,
      json: () => Promise.resolve({ data: { status: "claimed" } }),
    });

    renderSheet();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(screen.getByText("Thank you!")).toBeInTheDocument();
    });
    expect(mockAuthFetch).toHaveBeenCalledWith(
      "/api/kit/claim",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "user@example.com", marketing_consent: false }),
      }),
    );
  });
```

- [ ] **Step 5: 409 멱등 처리 테스트**

```tsx
  it("409 응답 → 성공으로 처리 (Q-12 멱등성)", async () => {
    mockAuthFetch.mockResolvedValue({
      status: 409,
      ok: false,
    });

    renderSheet();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "dup@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(screen.getByText("Thank you!")).toBeInTheDocument();
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: 500 에러 → toast 테스트**

```tsx
  it("500 응답 → toast.error 표시", async () => {
    mockAuthFetch.mockResolvedValue({
      status: 500,
      ok: false,
      json: () => Promise.resolve({
        error: { message: "Failed to process kit claim" },
      }),
    });

    renderSheet();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to process kit claim");
    });
  });

  it("네트워크 에러 → 폴백 toast.error 표시", async () => {
    mockAuthFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    renderSheet();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to fetch");
    });
  });
```

- [ ] **Step 7: Back to chat 버튼 테스트**

```tsx
  it("Back to chat 클릭 → onOpenChange(false) 호출", () => {
    const { onOpenChange } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /Back to chat/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("성공 후 Back to chat 클릭 → onOpenChange(false) 호출", async () => {
    mockAuthFetch.mockResolvedValue({ status: 201, ok: true, json: () => Promise.resolve({}) });

    const { onOpenChange } = renderSheet();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(screen.getByText("Thank you!")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Back to chat/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
```

- [ ] **Step 8: marketing consent 체크박스 테스트**

```tsx
  it("marketing consent 체크 → POST body에 marketing_consent: true", async () => {
    mockAuthFetch.mockResolvedValue({ status: 201, ok: true, json: () => Promise.resolve({}) });

    renderSheet();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    // Checkbox 클릭 (Radix Checkbox → role="checkbox")
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(mockAuthFetch).toHaveBeenCalledWith(
        "/api/kit/claim",
        expect.objectContaining({
          body: JSON.stringify({ email: "user@example.com", marketing_consent: true }),
        }),
      );
    });
  });
```

- [ ] **Step 9: 재오픈 시 claimed 상태 유지 테스트 (Radix Portal 언마운트 안 함)**

```tsx
  it("성공 후 sheet close → reopen → 성공 화면 유지 (claimed state preserved)", async () => {
    mockAuthFetch.mockResolvedValue({ status: 201, ok: true, json: () => Promise.resolve({}) });

    const onOpenChange = vi.fn();
    const { rerender } = render(
      <KitCtaSheet open={true} onOpenChange={onOpenChange} />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Claim my free kit/i }));

    await waitFor(() => {
      expect(screen.getByText("Thank you!")).toBeInTheDocument();
    });

    // close → reopen (Radix keeps component mounted)
    rerender(<KitCtaSheet open={false} onOpenChange={onOpenChange} />);
    rerender(<KitCtaSheet open={true} onOpenChange={onOpenChange} />);

    // claimed 상태 유지 → 성공 화면 표시
    expect(screen.getByText("Thank you!")).toBeInTheDocument();
  });
```

- [ ] **Step 10: 전체 테스트 실행 확인**

Run: `npx vitest run src/client/features/chat/KitCtaSheet.test.tsx`
Expected: 11 passed

- [ ] **Step 11: 커밋**

```bash
git add src/client/features/chat/KitCtaSheet.test.tsx
git commit -m "test: KitCtaSheet 테스트 신규 작성 — 폼 검증, 201/409/500 처리, consent, 닫기, 재오픈"
```

---

### Task 3: conversation_id / locale 스키마 정합성 수정 (V-22)

**Files:**
- Modify: `src/server/features/api/routes/kit.ts:20-23,83-89` — zod 스키마 + insert 로직
- Modify: `src/server/features/api/routes/kit.test.ts` — 신규 필드 검증 테스트
- Modify: `src/client/features/chat/KitCtaSheet.tsx:23-26,48-57` — props 추가 + POST body 포함
- Modify: `src/client/features/chat/MessageList.tsx:30,47,54` — conversationId/locale 전달
- Modify: `src/client/features/chat/ChatContent.tsx:146` — conversationId/locale 전달

정본: `docs/03-design/schema.dbml` Table kit_subscribers — `conversation_id`(제출 시점 대화 컨텍스트), `locale`(제출 시점 유저 로케일).

**설계 결정:**
- `conversation_id`: optional (대화 진입 전 Kit CTA가 노출될 수 있음). 클라이언트에서 전달.
- `locale`: optional. 클라이언트에서 현재 locale 전달. 서버에서 별도 추출 불필요 (클라이언트가 이미 알고 있음).
- 두 필드 모두 DB에서 nullable이므로 기존 레코드 호환성 유지.

- [ ] **Step 1: kit.ts zod 스키마에 optional 필드 추가**

`src/server/features/api/routes/kit.ts:20-23` 수정:

```typescript
const kitClaimBodySchema = z.object({
  email: z.string().email().max(320),
  marketing_consent: z.boolean(),
  conversation_id: z.string().uuid().nullish(),
  locale: z.string().max(10).nullish(),
});
```

- [ ] **Step 2: kit.ts insert 로직에 conversation_id, locale 추가**

`src/server/features/api/routes/kit.ts:83-89` 수정:

```typescript
      const { error: insertError } = await client
        .from('kit_subscribers')
        .insert({
          user_id: user.id,
          email_encrypted: emailEncrypted,
          email_hash: emailHash,
          marketing_consent: parsed.marketing_consent,
          conversation_id: parsed.conversation_id ?? null,
          locale: parsed.locale ?? null,
        });
```

- [ ] **Step 3: kit.test.ts에 conversation_id / locale 전달 테스트 추가**

```typescript
  it('conversation_id + locale 전달 → insert에 포함', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        marketing_consent: true,
        conversation_id: '550e8400-e29b-41d4-a716-446655440000',
        locale: 'en',
      }),
    });

    expect(mockKitInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: '550e8400-e29b-41d4-a716-446655440000',
        locale: 'en',
      }),
    );
  });

  it('conversation_id / locale 미전달 → null로 insert', async () => {
    await app.request('/api/kit/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });

    expect(mockKitInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: null,
        locale: null,
      }),
    );
  });
```

- [ ] **Step 4: 서버 테스트 실행 확인**

Run: `npx vitest run src/server/features/api/routes/kit.test.ts`
Expected: 12 passed (Task 1의 5 + 기존 5 + 신규 2)

- [ ] **Step 5: KitCtaSheet props에 conversationId, locale 추가**

`src/client/features/chat/KitCtaSheet.tsx:23-26` 수정:

```typescript
type KitCtaSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  locale: string;
};
```

- [ ] **Step 6: KitCtaSheet onSubmit에서 conversation_id, locale POST body에 포함**

`src/client/features/chat/KitCtaSheet.tsx:33` 수정 — props destructure에 추가:

```typescript
export default function KitCtaSheet({ open, onOpenChange, conversationId, locale }: KitCtaSheetProps) {
```

`src/client/features/chat/KitCtaSheet.tsx:53-57` 수정 — body에 추가:

```typescript
        body: JSON.stringify({
          email: data.email,
          marketing_consent: data.marketingConsent,
          conversation_id: conversationId,
          locale,
        }),
```

- [ ] **Step 7: MessageList에 conversationId, locale props 추가 및 전달**

`src/client/features/chat/MessageList.tsx:25-29` 수정:

```typescript
type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  locale: string;
  conversationId: string | null;
};
```

`src/client/features/chat/MessageList.tsx:31` 수정:

```typescript
export default function MessageList({ messages, isStreaming, locale, conversationId }: MessageListProps) {
```

`src/client/features/chat/MessageList.tsx:54` 수정:

```typescript
      <KitCtaSheet open={sheetOpen} onOpenChange={setSheetOpen} conversationId={conversationId} locale={locale} />
```

- [ ] **Step 8: ChatContent에서 conversationId를 MessageList에 전달**

`src/client/features/chat/ChatContent.tsx:146` 수정:

```tsx
          <MessageList messages={chatMessages} isStreaming={isStreaming} locale={locale} conversationId={conversationId} />
```

- [ ] **Step 9: KitCtaSheet.test.tsx 업데이트 — renderSheet에 props 추가**

`renderSheet` 헬퍼 수정:

```tsx
const renderSheet = (open = true) => {
  const onOpenChange = vi.fn();
  const utils = render(
    <KitCtaSheet
      open={open}
      onOpenChange={onOpenChange}
      conversationId="conv-123"
      locale="en"
    />,
  );
  return { ...utils, onOpenChange };
};
```

201 성공 테스트의 `expect(mockAuthFetch)` assertion 수정:

```tsx
    expect(mockAuthFetch).toHaveBeenCalledWith(
      "/api/kit/claim",
      expect.objectContaining({
        body: JSON.stringify({
          email: "user@example.com",
          marketing_consent: false,
          conversation_id: "conv-123",
          locale: "en",
        }),
      }),
    );
```

marketing consent 테스트의 assertion도 동일 패턴으로 수정:

```tsx
        body: JSON.stringify({
          email: "user@example.com",
          marketing_consent: true,
          conversation_id: "conv-123",
          locale: "en",
        }),
```

- [ ] **Step 10: 전체 관련 테스트 실행**

Run: `npx vitest run src/server/features/api/routes/kit.test.ts src/client/features/chat/KitCtaSheet.test.tsx`
Expected: all pass

- [ ] **Step 11: tsc --noEmit 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 12: 커밋**

```bash
git add src/server/features/api/routes/kit.ts src/server/features/api/routes/kit.test.ts \
  src/client/features/chat/KitCtaSheet.tsx src/client/features/chat/KitCtaSheet.test.tsx \
  src/client/features/chat/MessageList.tsx src/client/features/chat/ChatContent.tsx
git commit -m "fix: kit/claim에 conversation_id + locale 전달 — V-22 스키마 정합성 수정"
```

---

### Task 4: ProductCard default variant — Kit CTA 미노출 문서화 테스트

**Files:**
- Modify: `src/client/features/cards/ProductCard.test.tsx`

정본(§2.2): 통합 카드 방식은 compact variant(가로 스크롤 카드) 전용. default variant(전체 크기 카드)는 HighlightBadge + border 강조만 하고 "Get free kit" 버튼은 미노출. 이 의도적 설계를 테스트로 문서화.

- [ ] **Step 1: default variant + is_highlighted + onKitClaim → Kit CTA 미노출 테스트**

`ProductCard.test.tsx`의 `describe("ProductCard Kit CTA integration")` 블록에 추가:

```tsx
  it("default variant + is_highlighted + onKitClaim → Get free kit 미노출 (compact 전용 설계)", () => {
    const product = makeProduct({
      is_highlighted: true,
      highlight_badge: { en: "Essenly Pick" },
      purchase_links: [{ platform: "coupang", url: "https://coupang.com/p/123" }],
    });
    const onKitClaim = vi.fn();

    // variant 미지정 = default
    render(
      <ProductCard
        product={product}
        locale="en"
        onKitClaim={onKitClaim}
      />
    );

    // default variant에서는 Get free kit 버튼이 없음 — compact 전용 설계
    expect(screen.queryByRole("button", { name: /Get free kit/i })).not.toBeInTheDocument();
    // border-primary 강조와 HighlightBadge는 표시됨
    expect(screen.getByText("Product Details")).toBeInTheDocument();
  });
```

- [ ] **Step 2: 테스트 실행 확인**

Run: `npx vitest run src/client/features/cards/ProductCard.test.tsx`
Expected: all pass (기존 + 신규 1)

- [ ] **Step 3: 커밋**

```bash
git add src/client/features/cards/ProductCard.test.tsx
git commit -m "test: ProductCard default variant Kit CTA 미노출 의도적 설계 문서화"
```

---

### Task 5: MessageList 통합 테스트 — onKitClaim → KitCtaSheet 연결

**Files:**
- Modify: `src/client/features/chat/MessageList.test.ts` → `.test.tsx`로 확장자 변경 (JSX 렌더링 필요)

MessageList → GroupedParts → CardPart → ProductCard → onKitClaim → setSheetOpen(true) → KitCtaSheet open 체인 검증.

- [ ] **Step 1: MessageList.test.ts를 .test.tsx로 이름 변경 + 렌더링 테스트 추가**

기존 groupParts 테스트는 유지. 새로운 describe 블록 추가:

```tsx
// 기존 import 유지하고 추가:
import { render, screen, fireEvent } from "@testing-library/react";
import MessageList from "./MessageList";
import type { ChatMessage } from "./MessageList";

// MessageList 렌더링에 필요한 추가 mock
vi.mock("./MessageBubble", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="bubble">{children}</div>,
}));
vi.mock("./StreamingIndicator", () => ({
  default: () => <div data-testid="streaming" />,
}));
vi.mock("./MarkdownMessage", () => ({
  default: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock("@/client/features/cards/TreatmentCard", () => ({
  default: () => <div data-testid="treatment-card" />,
}));

describe("MessageList integration — Kit CTA sheet", () => {
  const highlightedProduct = {
    id: "p-highlighted",
    name: { en: "Essenly Mask" },
    description: null,
    brand_id: "b1",
    category: "hair_mask",
    subcategory: null,
    skin_types: [],
    hair_types: [],
    concerns: [],
    key_ingredients: [],
    price: 35000,
    volume: "200ml",
    purchase_links: null,
    english_label: false,
    tourist_popular: false,
    is_highlighted: true,
    highlight_badge: { en: "Essenly Pick" },
    rating: null,
    review_count: null,
    review_summary: null,
    images: [],
    tags: [],
    status: "active" as const,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  const messages: ChatMessage[] = [
    {
      id: "msg-1",
      role: "assistant",
      parts: [
        {
          type: "product-card" as const,
          product: highlightedProduct,
          brand: null,
          store: null,
          whyRecommended: undefined,
        },
      ],
    },
  ];

  it("highlighted product의 'Get free kit' 클릭 → KitCtaSheet 열림", () => {
    render(
      <MessageList
        messages={messages}
        isStreaming={false}
        locale="en"
        conversationId="conv-1"
      />,
    );

    const kitButton = screen.getByRole("button", { name: /Get free kit/i });
    fireEvent.click(kitButton);

    // KitCtaSheet가 열리면 시트 내부 UI가 렌더링됨
    expect(screen.getByText(/personalized K-Beauty Starter Kit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행 확인**

Run: `npx vitest run src/client/features/chat/MessageList.test.tsx`
Expected: all pass (기존 groupParts 12 + 신규 1)

- [ ] **Step 3: 커밋**

```bash
git mv src/client/features/chat/MessageList.test.ts src/client/features/chat/MessageList.test.tsx
git add src/client/features/chat/MessageList.test.tsx
git commit -m "test: MessageList → KitCtaSheet 통합 테스트 — onKitClaim 콜백 체인 검증"
```

---

## 검증 체크리스트

```
□ V-1   의존성 방향 위반 없음 (KitCtaSheet → authFetch → server API)
□ V-4   features 독립: MessageList → KitCtaSheet 동일 도메인 내부
□ V-12  any 타입 없음
□ V-22  스키마 정합성: kit_subscribers.conversation_id, locale 전달 (Task 3)
□ V-24  수정 영향 분석: ChatContent → MessageList → KitCtaSheet props 체인만 수정
```

## 실행 순서

Task 1 → Task 2 → Task 3 → Task 4 → Task 5 (순차적 — Task 3이 Task 2의 renderSheet를 수정, Task 5가 Task 3의 MessageList props를 사용)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 3 | CLEAR | 1 issue (email normalization test bug, fixed), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG CLEARED — ready to implement. Run `/gstack-ship` when done.
