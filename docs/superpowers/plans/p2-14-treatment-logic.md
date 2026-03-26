# P2-14: 시술 도메인 로직 구현 계획

> 상태: 최종 확정
> 선행: P2-12 (judgment.ts — ScoredItem 계약)
> 근거: search-engine.md §3.2 treatment.ts, PRD §4-A, user-screens.md

---

## 목적

Repository SQL(1~2단계)을 통과한 Treatment[]에 대해 **3단계 다운타임 하드 필터 + ScoredItem 변환**을 순수 함수로 처리.
search-handler(P2-20)에서 `scoreTreatments()` → `rank()` 순서로 호출.

---

## 범위

### 포함

| 파일 | 작업 | 비고 |
|------|------|------|
| `features/beauty/treatment.ts` | skeleton → 구현 | scoreTreatments (export 1개) |
| `features/beauty/treatment.test.ts` | 신규 | 단위 테스트 (P2-27 부분) |

### 미포함

| 파일 | 이유 |
|------|------|
| `beauty/judgment.ts` | P2-12 완료. 수정 없음 |
| `beauty/shopping.ts` | P2-13 완료. 수정 없음 |
| `beauty/derived.ts` | P2-15 |
| `shared/utils/date.ts` | 수정 없음. checkDowntimeSafety 재사용 |

---

## 의존성

### 사용하는 기존 모듈 (수정 없음)

| 모듈 | 용도 | 수정 |
|------|------|------|
| `beauty/judgment.ts` | ScoredItem 타입 import | 없음 |
| `shared/types/domain.ts` | Treatment 타입 import | 없음 |
| `shared/utils/date.ts` | checkDowntimeSafety 함수 import | 없음 |

### 의존 방향 검증

```
features/beauty/treatment.ts
  → beauty/judgment.ts (type import: ScoredItem)              §2.3 허용
  → shared/types/domain.ts (type import: Treatment)           R-7 허용
  → shared/utils/date.ts (import: checkDowntimeSafety)        R-7 허용
  X core/ import 없음
  X beauty/shopping.ts import 없음  §2.3 peer 금지
  X beauty/derived.ts import 없음   §2.3 peer 금지
  X DB/API 호출 없음 (L-7)
```

### G-2 중복 방지 — shared/utils/date.ts 재사용 분석

코드베이스에 이미 존재:
- `checkDowntimeSafety(downtimeDays, remainingDays)` → `"safe"|"warning"|"excluded"|"unknown"` — **순수 함수. 재사용.**
- `getRemainingDays(endDate, stayDays)` → `number | null` — **내부에서 new Date() 호출 = 비순수. beauty/에서 그대로 사용 시 L-7 위반.**

해결:
- `checkDowntimeSafety`: 그대로 import 재사용 (G-2 준수)
- `calculateRemainingDays`: treatment.ts 내부에 **순수 함수 버전** 작성 (today 파라미터 수신). `getRemainingDays`와 시그니처가 다르므로(today 파라미터 존재) 동일 함수가 아님.

---

## 설계 결정

### D-1. 비즈니스 규칙 (코드베이스 원문 대조)

| 조건 | checkDowntimeSafety 반환 | 처리 | 근거 |
|------|------------------------|------|------|
| `downtime > remaining` | `"excluded"` | ScoredItem에서 **제외** | PRD §4-A |
| `downtime >= remaining * 0.5` | `"warning"` | score 감산 + warnings | user-screens.md |
| 그 외 | `"safe"` | 기본 점수 | |
| null 입력 | `"unknown"` | 정상 처리 (VP-3) | search-engine.md §3.2 |

### D-2. 함수 시그니처

```typescript
// 내부 헬퍼 (미export) — 순수 함수 (today 파라미터)
function calculateRemainingDays(
  endDate: string | null,
  stayDays: number | null,
  today: Date,
): number | null

// export 1개
export function scoreTreatments(
  treatments: Treatment[],
  endDate: string | null,
  stayDays: number | null,
  today: Date,
): ScoredItem[]
```

- scoreTreatments가 endDate/stayDays/today를 받아 내부에서 calculateRemainingDays 호출
- checkDowntimeSafety는 shared/utils/date.ts에서 import (G-2)
- today를 파라미터로 수신 → 순수 함수 (L-7)

### D-3. score 계산

| checkDowntimeSafety 결과 | score | ScoredItem |
|--------------------------|-------|------------|
| `"safe"` 또는 `"unknown"` | BASE_SCORE (0.5) | 포함 |
| `"warning"` | BASE_SCORE - WARNING_PENALTY (0.4) | 포함 + warnings |
| `"excluded"` | — | **제외** (하드 필터) |

### D-4. 상수 (G-10)

```typescript
const BASE_SCORE = 0.5;
const WARNING_PENALTY = 0.1;
```

DOWNTIME_WARNING_RATIO(0.5)는 checkDowntimeSafety 내부에 이미 구현. treatment.ts에서 재정의 불필요.

### D-5. export 범위 (G-9)

| export | 용도 | 소비자 |
|--------|------|--------|
| `scoreTreatments()` | Treatment[] → ScoredItem[] | search-handler (P2-20) |

1개 export. checkDowntime 역할은 checkDowntimeSafety가 대체. calculateRemainingDays는 내부.

---

## 구현

### treatment.ts

```typescript
import 'server-only';
import type { Treatment } from '@/shared/types/domain';
import type { ScoredItem } from './judgment';
import { checkDowntimeSafety } from '@/shared/utils/date';

const BASE_SCORE = 0.5;
const WARNING_PENALTY = 0.1;

function calculateRemainingDays(
  endDate: string | null,
  stayDays: number | null,
  today: Date,
): number | null {
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    const t = new Date(today);
    t.setHours(0, 0, 0, 0);
    const diff = Math.ceil((end.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }
  if (stayDays != null) return stayDays;
  return null;
}

export function scoreTreatments(
  treatments: Treatment[],
  endDate: string | null,
  stayDays: number | null,
  today: Date,
): ScoredItem[] {
  const remainingDays = calculateRemainingDays(endDate, stayDays, today);
  const results: ScoredItem[] = [];

  for (const treatment of treatments) {
    const safety = checkDowntimeSafety(treatment.downtime_days, remainingDays);

    if (safety === 'excluded') continue;

    const isWarning = safety === 'warning';
    results.push({
      id: treatment.id,
      score: isWarning ? BASE_SCORE - WARNING_PENALTY : BASE_SCORE,
      reasons: [],
      warnings: isWarning
        ? [`Recovery ${treatment.downtime_days}d approaches remaining ${remainingDays}d`]
        : [],
      is_highlighted: treatment.is_highlighted,
    });
  }

  return results;
}
```

### 테스트

| 테스트 | 검증 |
|--------|------|
| scoreTreatments: 정상 — safe | score === BASE_SCORE, warnings 빈 배열 |
| scoreTreatments: 제외 — excluded | ScoredItem에서 제외 (PRD §4-A) |
| scoreTreatments: 경고 — warning | score 감산, warnings에 이유 |
| scoreTreatments: 경계값 downtime === remaining | 5>5=false → warning (5>=2.5) |
| scoreTreatments: downtime_days null → safe (VP-3) | unknown → 포함 |
| scoreTreatments: endDate/stayDays 모두 null → 전체 포함 (VP-3) | remainingDays=null → unknown |
| scoreTreatments: VP-1 is_highlighted 전달 | 그대로 복사 |
| scoreTreatments: 빈 배열 → 빈 배열 | |
| calculateRemainingDays: endDate 기반 | 날짜 차이 계산 |
| calculateRemainingDays: stayDays 폴백 | endDate null → stayDays |
| calculateRemainingDays: 둘 다 null → null | VP-3 |

---

## 검증 체크리스트

### 아키텍처

```
[ ] V-1  import: treatment.ts → judgment.ts(type) + shared/(type+util) ONLY
[ ] V-2  core/ 수정 없음
[ ] V-7  순수 함수: DB/API 없음, new Date() 내부 호출 없음 (today 파라미터)
[ ] V-8  §2.3: treatment→judgment ✓, treatment→shopping ✗, treatment→derived ✗
[ ] V-9  중복: checkDowntimeSafety 재사용. calculateRemainingDays는 시그니처 차이(today)
[ ] V-10 미사용 export 없음
[ ] V-17 제거 안전성: core/, shared/, judgment.ts, shopping.ts 빌드 무영향
```

### 품질

```
[ ] Q-2  VP-1: is_highlighted → ScoredItem에 복사만, score 미참여
[ ] Q-3  VP-3: downtime null, remainingDays null → 안전 처리
[ ] G-2  중복 금지: checkDowntimeSafety 재사용
[ ] G-8  any 없음
[ ] G-9  export 1개 (scoreTreatments)
[ ] G-10 상수: BASE_SCORE, WARNING_PENALTY
```

### 테스트

```
[ ] treatment.test.ts 11개
[ ] npx vitest run 전체 통과
[ ] grep: is_highlighted가 score 계산에 미참조
```
