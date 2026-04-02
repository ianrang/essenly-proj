# 에센리 K-뷰티 AI 에이전트 — 성공 지표 측정 설계

> 버전: 0.2
> 최종 갱신: 2026-03-22
> 상위 문서: PRD §5.6, MASTER-PLAN §2
> 범위: MVP 6개 KPI 측정 방법 + 분석 도구 결정 (U-10)

---

## 목차

1. [§1 목적](#1-목적)
2. [§2 KPI별 이벤트 요구사항](#2-kpi별-이벤트-요구사항)
3. [§3 수집 이벤트 정의](#3-수집-이벤트-정의)
4. [§4 분석 도구 결정 (U-10)](#4-분석-도구-결정-u-10)
5. [§5 KPI별 측정 방법](#5-kpi별-측정-방법)
6. [§6 동의/법적 경계](#6-동의법적-경계)
7. [§7 MVP 범위 vs v0.2+](#7-mvp-범위-vs-v02)
8. [§8 의존성 + 미결정 메모](#8-의존성--미결정-메모)

---

# §1 목적

PRD §5.6에 정의된 6개 MVP 성공 지표(KPI)의 **측정 도구와 구현 방법**을 확정한다.

- **입력**: PRD §5.6 KPI 정의 (지표명, 목표값, 계산식)
- **산출물**: 이벤트 요구사항, 도구 결정, KPI별 측정 방법
- **범위**: 측정 설계 + 이벤트 상세 스키마 (P1-56 반영 완료). 구현은 P2-26에서 수행
- **전제**: PRD §5.6의 "세션"은 MVP에서 `conversations` 레코드(대화 단위)로 구현한다. MVP는 토큰 기반 anonymous 사용이며 세션 타임아웃을 구현하지 않으므로, 1 conversation = 1 측정 단위로 사용한다.

---

# §2 KPI별 이벤트 요구사항

## 6개 KPI → 필요 데이터 매핑

> KPI 지표명·목표값·계산식의 정본은 **PRD §5.6**. 아래는 측정에 필요한 데이터 소스 매핑만 기술.

| # | KPI (PRD §5.6) | 분자 | 분모 | 필요 데이터 |
|---|----------------|------|------|------------|
| K1 | 온보딩 완료율 | 프로필 생성 완료 | 경로A 진입 | ① `path_a_entry` 이벤트 ② `user_profiles` 생성 기록 |
| K2 | 대화 턴 수 | 사용자 메시지 합계 | 대화 수 | `messages` 테이블 (role='user') — 기존 DB |
| K3 | 카드 클릭률 | 카드 클릭 | 카드 노출 | ① `card_exposure` 이벤트 ② `card_click` 이벤트 |
| K4 | Kit CTA 전환 | 이메일 제출 | 전체 대화 수 | ① `kit_cta_submit` 이벤트 ② `conversations` 레코드 수 |
| K5 | 외부 링크 클릭 | 외부 링크 클릭 | 카드 노출 | ① `external_link_click` 이벤트 ② K3의 `card_exposure` 공유 |
| K6 | 다국어 사용 | 비영어 대화 | 전체 대화 수 | `conversations.locale` (URL `[locale]` 파라미터에서 기록) |

## 데이터 소스 분류

- **기존 DB/라우팅으로 측정 가능**: K2 (`messages` 테이블), K6 (URL locale → `conversations.locale`)
- **`behavior_logs` 이벤트 필요**: K1, K3, K4, K5 → 5개 이벤트 타입

---

# §3 수집 이벤트 정의

## 3.1 이벤트 기록 규칙

> 테이블 스키마 정본: `docs/03-design/schema.dbml` → `behavior_logs`. 아래는 스키마에 없는 **애플리케이션 레벨 기록 규칙**만 기술.

- **user_id**: anonymous 사용자 포함. 모든 이벤트에 필수 기록
- **target_id + target_type**: 카드 관련 이벤트(card_exposure, card_click, external_link_click)에서만 사용. target_id 기록 시 target_type 필수 동반
- **metadata**: DB 스키마상 nullable이나, 본 문서의 모든 이벤트는 metadata를 **필수 포함**해야 함 (§3.2 각 이벤트의 zod 스키마로 검증)

## 3.2 KPI 이벤트 상세 (5개) — P1-56

### `path_a_entry` — 온보딩 경로 진입

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| target_id | — | null | — | 대상 엔티티 없음 |
| target_type | — | null | — | — |

**metadata 스키마:**

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| source | string | 필수 | `"landing"` | 진입 경로 출처 |

**발화 시점**: Landing 페이지에서 "Set up my profile" (보조 CTA, 선택적 사전 프로필) 클릭 즉시.

**zod 검증:**
```typescript
z.object({ source: z.literal("landing") })
```

---

### `card_exposure` — 카드 노출

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| target_id | UUID | 필수 | 해당 엔티티 PK | 노출된 카드의 엔티티 ID |
| target_type | string | 필수 | `product` / `treatment` | 카드 유형 |

**metadata 스키마:**

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| card_id | string | 필수 | `"{target_type}_{target_id}"` | 카드 고유 식별자 |
| domain | string | 필수 | `"shopping"` / `"treatment"` | 도메인 분류 |
| position | number | 필수 | >= 0 | 카드 노출 순서 (0-based) |
| conversation_id | string | 필수 | UUID | 대화 컨텍스트 |

**발화 시점**: AI 응답에서 추천 카드가 뷰포트에 진입하여 렌더링 완료 시. Intersection Observer 기반. **1 대화 내 동일 카드 중복 기록 방지** (conversation_id + card_id 조합으로 중복 체크).

**zod 검증:**
```typescript
z.object({
  card_id: z.string().min(1),
  domain: z.enum(["shopping", "treatment"]),
  position: z.number().int().nonnegative(),
  conversation_id: z.string().uuid(),
})
```

---

### `card_click` — 카드 클릭

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| target_id | UUID | 필수 | 해당 엔티티 PK | 클릭된 카드의 엔티티 ID |
| target_type | string | 필수 | `product` / `treatment` | 카드 유형 |

**metadata 스키마:**

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| card_id | string | 필수 | `"{target_type}_{target_id}"` | 카드 고유 식별자 |
| domain | string | 필수 | `"shopping"` / `"treatment"` | 도메인 분류 |
| conversation_id | string | 필수 | UUID | 대화 컨텍스트 |

**발화 시점**: 사용자가 카드 영역을 클릭/탭 시 즉시. 카드 내부 외부 링크 클릭은 `external_link_click`으로 별도 기록.

**zod 검증:**
```typescript
z.object({
  card_id: z.string().min(1),
  domain: z.enum(["shopping", "treatment"]),
  conversation_id: z.string().uuid(),
})
```

---

### `external_link_click` — 외부 링크 클릭

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| target_id | UUID | 필수 | 해당 엔티티 PK | 링크가 속한 카드의 엔티티 ID |
| target_type | string | 필수 | `product` / `treatment` | 카드 유형 |

**metadata 스키마:**

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| card_id | string | 필수 | `"{target_type}_{target_id}"` | 카드 고유 식별자 |
| link_type | string | 필수 | `"naver_map"` / `"kakao_map"` / `"website"` / `"purchase"` / `"booking"` / `"phone"` | 링크 유형 |
| url | string | 필수 | URL 형식 | 클릭된 외부 URL |
| conversation_id | string | 필수 | UUID | 대화 컨텍스트 |

**발화 시점**: 카드 내 외부 링크 (지도, 구매, 예약, 전화 등) 클릭 시 즉시. `window.open` / `location.href` 전에 이벤트 기록.

**zod 검증:**
```typescript
z.object({
  card_id: z.string().min(1),
  link_type: z.enum(["naver_map", "kakao_map", "website", "purchase", "booking", "phone"]),
  url: z.string().url(),
  conversation_id: z.string().uuid(),
})
```

---

### `kit_cta_submit` — Kit CTA 이메일 제출

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| target_id | — | null | — | 대상 엔티티 없음 |
| target_type | — | null | — | — |

**metadata 스키마:**

| 속성 | 타입 | 필수 | 값 제약 | 설명 |
|------|------|------|---------|------|
| email_hash | string | 필수 | SHA-256 해시 | 이메일 해시 (원문 미저장) |
| conversation_id | string | 필수 | UUID | 대화 컨텍스트 |
| marketing_consent | boolean | 필수 | true/false | 마케팅 동의 여부 (PRD §3.2) |

**발화 시점**: Kit CTA 폼에서 이메일 입력 + 동의 체크 후 제출 버튼 클릭 시. 서버 저장 성공 후 기록 (실패 시 미기록).

**zod 검증:**
```typescript
z.object({
  email_hash: z.string().length(64),
  conversation_id: z.string().uuid(),
  marketing_consent: z.boolean(),
})
```

## 3.3 추가 이벤트 (MVP 선택)

KPI 이벤트 외에 MVP 운영에 유용한 보조 이벤트. 구현 우선순위는 KPI 이벤트보다 낮음.

| event_type | 용도 | target_type | 발화 시점 | MVP 포함 |
|------------|------|-------------|----------|---------|
| `page_view` | 페이지 진입 추적 | — | 각 페이지 마운트 시 | 선택 (Vercel Analytics 보조) |
| `onboarding_step_complete` | 온보딩 단계별 이탈 분석 | — | 각 온보딩 단계 완료 시 | 권장 |
| `chat_message_sent` | 사용자 메시지 패턴 | — | 사용자 메시지 전송 시 | 선택 (messages 테이블로 대체 가능) |
| `error_displayed` | 에러 빈도 추적 | — | 에러 UI 렌더링 시 | 권장 |

### `page_view` metadata

```typescript
z.object({
  page: z.enum(["landing", "onboarding", "profile", "chat"]),
  locale: z.string().length(2),
  referrer: z.string().optional(),
})
```

### `onboarding_step_complete` metadata

```typescript
z.object({
  step: z.number().int().min(1).max(4),
  step_name: z.enum(["skin_type", "concerns", "budget_style", "travel_info"]),
  conversation_id: z.string().uuid(),
})
```

### `error_displayed` metadata

```typescript
z.object({
  error_type: z.enum(["network", "llm_timeout", "api_error", "validation"]),
  error_code: z.string().optional(),
  page: z.enum(["landing", "onboarding", "profile", "chat"]),
})
```

---

# §4 분석 도구 결정 (U-10)

## 선택지 비교

| 기준 | (a) Vercel Analytics | (b) Mixpanel | (c) 자체 (behavior_logs) |
|------|---------------------|-------------|------------------------|
| KPI 측정 | 페이지뷰만 네이티브. 커스텀 이벤트 제한적 | 6개 KPI 모두 네이티브 지원 | 6개 KPI 모두 SQL 쿼리로 측정 |
| 퍼널 분석 | ✗ | ✓ (핵심 강점) | ✗ (수동 SQL) |
| 대시보드 | 기본 제공 (페이지뷰/Web Vitals) | 풍부한 시각화 | ✗ (직접 구축 또는 외부 도구) |
| 설치 비용 | 제로 (Vercel 내장) | JS SDK 추가 + GDPR 설정 | 제로 (DB 이미 설계됨) |
| 운영 비용 | 무료 (Pro 포함) | 무료 (20M 이벤트/월) | 무료 (Supabase 내) |
| 데이터 소유 | Vercel 서버 | Mixpanel 서버 | 자체 Supabase DB |
| 개발 공수 | 최소 | 중 (SDK 통합, 이벤트 전송) | 중 (이벤트 기록 + 조회 쿼리) |
| MVP 적합성 | 보조용으로만 적합 | 소규모에는 과잉 | ✓ 소규모 최적 |

## 결정: **(c) 자체 + (a) Vercel Analytics 보조**

| 역할 | 도구 | 용도 |
|------|------|------|
| **주 측정** | 자체 (`behavior_logs` + SQL) | 6개 KPI 전체 측정 |
| **보조** | Vercel Analytics | 페이지뷰, Web Vitals, 디바이스/브라우저 (무료, 제로 설정) |

**근거:**

1. `behavior_logs` 테이블이 TDD에 이미 설계됨 — 추가 인프라 불필요
2. 5개 이벤트로 6개 KPI 전부 측정 가능 — 외부 도구 없이 충분
3. MVP는 소프트 런칭(소규모) — Mixpanel 퍼널 분석은 v0.2+ 사용자 증가 시 검토
4. Vercel Analytics는 제로 설정으로 페이지뷰 + Web Vitals 보조 (무료)
5. 1인 개발 — 외부 의존성 최소화, 데이터 완전 소유

**v0.2+ 전환 경로**: 사용자 규모 증가 시 `behavior_logs` → Mixpanel/Amplitude 이벤트 파이프라인 추가 가능 (데이터 구조 호환)

---

# §5 KPI별 측정 방법

> 각 KPI의 목표값은 PRD §5.6 정본 기준. 아래 소제목의 목표값은 가독성 참고용.

## K1: 온보딩 완료율 (목표 >60%)

```
측정식: COUNT(user_profiles created in period) / COUNT(behavior_logs WHERE event_type='path_a_entry' in period)
데이터: behavior_logs (path_a_entry) + user_profiles (created_at)
집계: 일간/주간
```

- 분자: `user_profiles` 레코드 생성 = 온보딩 4단계 완료 + 프로필 생성
- 분모: Landing에서 "Set up my profile" 클릭 시 `path_a_entry` 이벤트 기록
- 경로B 사용자는 분모에 포함되지 않음 (PRD §5.6 정의와 일치)

## K2: 대화 턴 수 (목표 avg 5+)

```
측정식: AVG(user_message_count per conversation)
         = AVG(SELECT COUNT(*) FROM messages WHERE role='user' GROUP BY conversation_id)
데이터: messages 테이블 — 추가 이벤트 불필요
집계: 일간/주간
```

- 기존 `messages` 테이블에서 직접 계산
- `role='user'`인 메시지만 카운트 (assistant/system 제외)

## K3: 카드 클릭률 (목표 >30%)

```
측정식: COUNT(card_click events in period) / COUNT(card_exposure events in period)
데이터: behavior_logs (card_exposure, card_click)
집계: 일간/주간
```

- `card_exposure`: AI 응답에서 추천 카드가 렌더링될 때 기록
- `card_click`: 사용자가 카드를 클릭/탭할 때 기록
- 도메인별(shopping/treatment) 분리 집계 가능 (metadata.domain)

## K4: Kit CTA 전환 (목표 >5%)

```
측정식: COUNT(kit_cta_submit events in period) / COUNT(conversations created in period)
데이터: behavior_logs (kit_cta_submit) + conversations (created_at)
집계: 일간/주간
```

- 분자: Kit CTA 폼에서 이메일 제출 시 `kit_cta_submit` 이벤트 기록
- 분모: `conversations` 레코드 수 (§1 전제 참조)
- `email_hash`만 metadata에 기록 (원문 이메일은 별도 저장소)

## K5: 외부 링크 클릭 (목표 >20%)

```
측정식: COUNT(external_link_click events in period) / COUNT(card_exposure events in period)
데이터: behavior_logs (external_link_click, card_exposure)
집계: 일간/주간
```

- `card_exposure`는 K3과 공유 (중복 기록 아님)
- `link_type`별 분리 집계 가능 (metadata.link_type: naver_map, kakao_map, website 등)

## K6: 다국어 사용 (목표 2+ 언어)

```
측정식: COUNT(conversations WHERE locale != 'en' in period) / COUNT(conversations in period)
데이터: conversations.locale (URL [locale] 파라미터에서 기록)
집계: 일간/주간
보조: 언어별 비율 breakdown (en, ko, ja, zh, es, fr)
```

- `conversations.locale TEXT` 컬럼: schema.dbml v2.1에서 추가 완료
- URL locale = 사용자가 선택한 UI 언어를 대리 지표로 사용. 대화 내 실제 사용 언어 감지는 v0.2+ 범위
- URL locale 기반 → 경로A/B 모두 포함 (user_profiles.language는 경로B 사용자 누락 가능)
- 목표 "2+ 언어": 영어 외 1개 이상 언어에서 유의미한 대화 발생 여부

---

# §6 동의/법적 경계

## 이벤트 ↔ 동의 타입 매핑

> 동의 항목의 정본은 **PRD §4-C** + **schema.dbml `consent_records`**. 본 섹션은 이벤트 유형별 매핑만 기술.

| 이벤트 유형 | 목적 | 매핑 동의 컬럼 (consent_records) | MVP 수집 |
|------------|------|-------------------------------|---------|
| **KPI 이벤트** (§3.2, 5개) | 서비스 운영 분석 | `data_retention` | ✓ MVP 필수 |
| **BH-4 학습 이벤트** (v0.3) | 고급 개인화 | `behavior_logging` | ✗ v0.3 |

## 본 문서 고유 해석

- 두 유형 모두 동일한 `behavior_logs` 테이블에 기록되지만, **동의 범위가 다름**
- KPI 이벤트는 집계 목적(개인 식별 불요), BH-4 학습 이벤트는 개인화 목적(개인별 추적)
- `consent_records.analytics` 컬럼이 schema.dbml v2.0에 존재 — KPI 이벤트 동의가 `data_retention`이 아닌 `analytics`에 해당할 가능성 있음. **U-15 법적 검토에서 확정** 필요

---

# §7 MVP 범위 vs v0.2+

## MVP (v0.1)

| 항목 | 범위 |
|------|------|
| KPI 측정 | 6개 KPI 전부. SQL 쿼리로 집계 |
| 이벤트 수집 | behavior_logs에 5개 이벤트 타입 기록 |
| 페이지 분석 | Vercel Analytics (페이지뷰, Web Vitals) |
| 대시보드 | 없음. SQL 수동 조회 또는 간단한 관리자 화면 |
| 알림 | 없음 |

## v0.2+

| 항목 | 범위 |
|------|------|
| 대시보드 | 관리자 앱에 KPI 대시보드 시각화 (MASTER-PLAN §2.2) |
| 퍼널 분석 | Mixpanel/Amplitude 도입 검토 (사용자 규모 증가 시) |
| 추가 이벤트 | page_view, onboarding_step_complete 등 (§3.3 정의 완료, 구현 우선순위 낮음) |
| BH-4 학습 | behavior_logging 동의 수집 후 상세 행동 추적 (v0.3) |
| 행동 분석 | 행동 분석 대시보드 (v0.3, MASTER-PLAN §2.3) |

---

# §8 의존성 + 미결정 메모

## 후속 작업 의존성

| 항목 | 설명 | 결정 시점 |
|------|------|----------|
| ~~K6 locale 컬럼~~ | ~~`conversations` 테이블에 `locale TEXT` 추가 필요~~ | **schema.dbml v2.1에 반영 완료** |
| ~~Kit CTA 저장 테이블~~ | ~~DB 스키마에 kit_subscribers 테이블 없음~~ | **schema.dbml v2.1에 kit_subscribers 추가 완료** |
| ~~P1-56 이벤트 상세~~ | ~~본 문서의 5개 KPI 이벤트 + 추가 이벤트 상세 정의~~ | **§3에 반영 완료** |
| P2-26 행동 로그 서비스 | `behavior_logs` 기록 서비스 구현 | Phase 2 |
| U-15 법적 검토 | KPI 이벤트 ⊂ data_retention 동의 전제의 법적 타당성 확인 | Phase 0~3 |
| ~~consent_records 스키마 동기화~~ | schema.dbml v2.0에서 analytics 반영 완료 | 해소 |
