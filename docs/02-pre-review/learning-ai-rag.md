# AI 에이전트 서비스 구현을 위한 학습 가이드

> 대상: 에센리 K-뷰티 AI 에이전트 개발자
> 목적: RAG, 임베딩, 벡터 DB, AI 에이전트 개념을 이해하고 MVP에 적용
> 최종 갱신: 2026-03-15

---

## 목차

1. [AI 에이전트란 무엇인가](#1-ai-에이전트란-무엇인가)
2. [LLM 기초 — 토큰, 컨텍스트, 프롬프트](#2-llm-기초--토큰-컨텍스트-프롬프트)
3. [Tool Use (Function Calling)](#3-tool-use-function-calling)
4. [RAG — 검색 증강 생성](#4-rag--검색-증강-생성)
5. [임베딩과 벡터 DB](#5-임베딩과-벡터-db)
6. [에센리 시스템에 적용](#6-에센리-시스템에-적용)
7. [학습 로드맵](#7-학습-로드맵)

---

# 1. AI 에이전트란 무엇인가

## 1.1 일반 챗봇 vs AI 에이전트

```
[일반 챗봇]
  사용자: "서울 피부과 추천해줘"
  챗봇:   (학습된 텍스트에서 답변 생성)
          "강남에 유명한 피부과가 많습니다..."
          → 최신 정보 없음, 개인화 없음, 행동 불가

[AI 에이전트]
  사용자: "서울 피부과 추천해줘"
  에이전트: (생각) "피부과를 검색해야 한다. 사용자 피부타입은 민감성이다."
            (행동) → search_beauty_data(domain: "clinic", filters: {skin_type: "sensitive"})
            (결과) → 3개 클리닉 데이터 수신
            (답변) "민감성 피부에 특화된 클리닉 3곳을 찾았어요..."
                   + TreatmentCard 3개 표시
```

AI 에이전트 = LLM + 도구(Tools) + 메모리(Memory)

| 구성 요소 | 역할 | 에센리에서의 구현 |
|---|---|---|
| LLM | 자연어 이해, 판단, 생성 | Claude / GPT / Gemini (Vercel AI SDK로 전환 가능) |
| 도구 (Tools) | 외부 데이터 검색, 계산 등 실제 행동 | search_beauty_data, get_external_links |
| 메모리 | 대화 맥락 유지, 사용자 정보 기억 | 단기(대화 히스토리) + 장기(프로필 DB) |
| 지식 (Knowledge) | 도메인 전문 지식 | 뷰티 KB (성분 가이드, 시술 가이드 등) |

## 1.2 에센리 AI 에이전트의 동작 원리

```
사용자 입력
    │
    ▼
┌───────────────────────────────────────┐
│           시스템 프롬프트               │
│  "너는 K-뷰티 AI 에이전트이다.          │
│   사용자 프로필: {민감성, 홍조, 5일}     │
│   사용 가능한 도구: [검색, 링크]        │
│   규칙: 비개입적 판단, 추천 이유 필수"   │
└───────────────┬───────────────────────┘
                │
                ▼
┌───────────────────────────────────────┐
│              LLM (Claude)             │
│                                       │
│  1. 사용자 의도 파악                    │
│     → "선크림 추천 요청"               │
│                                       │
│  2. 어떤 도구를 쓸지 판단               │
│     → search_beauty_data 호출 결정     │
│                                       │
│  3. 도구 파라미터 결정                  │
│     → {domain: "shopping",            │
│        filters: {skin_types:          │
│          ["sensitive"]}}              │
└───────────────┬───────────────────────┘
                │ tool_use 요청
                ▼
┌───────────────────────────────────────┐
│        서버에서 Tool 실행               │
│  SQL: SELECT * FROM products          │
│  WHERE 'sensitive' = ANY(skin_types)  │
│  → 결과 5건 반환                       │
└───────────────┬───────────────────────┘
                │ tool 결과
                ▼
┌───────────────────────────────────────┐
│         LLM이 최종 답변 생성            │
│                                       │
│  텍스트: "민감성 피부에 적합한..."       │
│  + ProductCard 3개 (구조화 데이터)     │
│  + 각 카드에 why_recommended          │
└───────────────────────────────────────┘
```

---

# 2. LLM 기초 — 토큰, 컨텍스트, 프롬프트

## 2.1 토큰이란

LLM은 텍스트를 "토큰" 단위로 처리합니다.

```
"I love K-beauty skincare" → ["I", " love", " K", "-", "beauty", " skin", "care"]
                              = 7 토큰

"민감성 피부에 좋은 선크림" → ["민", "감", "성", " 피부", "에", " 좋은", " 선", "크림"]
                              = 8 토큰 (한국어는 영어보다 토큰 수 많음)
```

대략적 기준: 영어 1단어 ≈ 1~1.5 토큰, 한국어 1글자 ≈ 1~2 토큰

## 2.2 컨텍스트 윈도우

LLM이 한 번에 "볼 수 있는" 텍스트의 최대 크기.

```
┌─────────────────────── 200K 토큰 (Claude Sonnet 4.5) ──────────────────────┐
│                                                                            │
│  [시스템 프롬프트 ~4,000] [프로필 ~500] [히스토리 ~4,000] [검색 ~2,000]      │
│  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  사용 ~10,500 토큰 (5%)                     여유 ~189,500 토큰 (95%)        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

에센리 MVP에서는 200K 한도의 5%만 사용 → 매우 넉넉합니다.

## 2.3 프롬프트 구조

```
[1회 API 호출 시 전달되는 내용]

┌── 시스템 프롬프트 (system) ──────────────────────┐
│  역할 정의, 규칙, 도구 정의, KB(지식)             │
│  → 매 요청마다 동일 → Prompt Caching 대상         │
└─────────────────────────────────────────────────┘
┌── 메시지 히스토리 (messages) ────────────────────┐
│  user: "선크림 추천해줘"                          │
│  assistant: "어떤 피부타입이신가요?"               │
│  user: "민감성이요"                               │
│  assistant: (tool_use: search...) "추천드립니다"  │
│  user: "더 저렴한 건 없어?"    ← 현재 입력        │
└─────────────────────────────────────────────────┘
```

## 2.4 Prompt Caching

시스템 프롬프트는 매번 동일 → Anthropic/Google이 캐시하여 비용 90% 절감.

```
[첫 번째 요청]
  시스템 프롬프트 4,000 토큰 → $0.012 (정가)

[두 번째~ 요청]
  시스템 프롬프트 4,000 토큰 → $0.0012 (90% 할인, 캐시 적중)
```

---

# 3. Tool Use (Function Calling)

## 3.1 개념

LLM이 "도구를 사용하겠다"고 선언하면, 서버가 실행하고 결과를 돌려주는 방식.

```
[기존 방식 — LLM이 직접 답변]
  user: "강남 피부과 전화번호 알려줘"
  LLM:  "02-1234-5678입니다" ← 환각(hallucination). 실제 번호가 아닐 수 있음

[Tool Use 방식 — LLM이 도구로 검색 후 답변]
  user: "강남 피부과 전화번호 알려줘"
  LLM:  (판단) "DB에서 검색해야 한다"
        → tool_use: search_beauty_data({domain: "clinic", query: "강남"})
  서버: (실행) → {name: "ABC클리닉", phone: "02-1234-5678", ...}
  LLM:  (결과 기반 답변) "강남 ABC클리닉 전화번호는 02-1234-5678입니다"
        → 정확한 데이터 기반
```

## 3.2 Tool 정의 방법 (Vercel AI SDK)

```typescript
import { tool } from 'ai';
import { z } from 'zod';

// 도구 정의: LLM에게 "이런 도구가 있다"고 알려줌
const searchBeautyData = tool({
  description: '뷰티 제품, 시술, 매장, 클리닉을 검색합니다',
  parameters: z.object({
    domain: z.enum(['shopping', 'clinic']),
    query: z.string(),
    filters: z.object({
      skin_types: z.array(z.string()).optional(),
      concerns: z.array(z.string()).optional(),
    }).optional(),
  }),
  execute: async ({ domain, query, filters }) => {
    // 실제 DB 검색 로직
    const results = await searchDatabase(domain, query, filters);
    return results;
  },
});
```

## 3.3 스트리밍 + Tool Use 흐름

```
[시간 순서]

t=0s   사용자 입력 전송
t=0.1s LLM 응답 시작 (스트리밍)
t=0.2s "민감성 피부에 적합한 선크림을..."  ← 텍스트가 한 글자씩 나타남
t=0.5s "...추천드릴게요. 잠시만요."
t=0.6s [tool_use 요청] search_beauty_data(...)  ← LLM이 도구 호출 결정
t=0.7s [서버에서 DB 검색 실행]
t=0.8s [tool 결과 반환]
t=0.9s LLM이 결과를 보고 추가 텍스트 생성
t=1.0s "3개 제품을 찾았어요!"
t=1.1s [ProductCard 3개 "팝인"] ← 카드가 화면에 나타남
t=1.5s 응답 완료

※ 텍스트는 실시간 스트리밍, 카드는 tool_use 완료 후 일괄 표시
```

---

# 4. RAG — 검색 증강 생성

## 4.1 RAG란

Retrieval-Augmented Generation = 검색으로 보강된 생성

LLM은 학습 데이터에 없는 최신/전문 정보를 모릅니다. RAG는 "답변 전에 관련 자료를 먼저 찾아보는" 방식입니다.

```
[RAG 없이]
  user: "레티놀이 민감성 피부에 안전한가요?"
  LLM:  (학습 데이터 기반 일반 답변) "레티놀은 자극이 있을 수 있습니다..."
        → 정확할 수도 있지만, 우리 서비스의 전문 지식이 아님

[RAG 사용]
  user: "레티놀이 민감성 피부에 안전한가요?"

  1단계 검색: "레티놀 민감성" → 벡터 DB에서 유사 문서 검색
    → 찾은 문서: "레티놀(Retinol): 비타민A 유도체. 주름 개선 효과.
       민감성 피부: 0.025% 이하 농도 권장. 처음 사용 시 2-3일 간격.
       대안: 바쿠치올(Bakuchiol) — 자극 없는 레티놀 대안.
       주의: 선크림 병용 필수."

  2단계 LLM: (검색 결과 참고하여 답변)
    "우리 성분 가이드에 따르면, 레티놀은 민감성 피부에
     0.025% 이하 농도로 시작하는 것이 좋습니다.
     자극이 걱정되시면 바쿠치올이 좋은 대안이에요.
     관련 제품을 찾아드릴까요?"
    → 전문적이고 정확한 답변
```

## 4.2 RAG가 필요한 이유

| 방식 | 장점 | 단점 |
|---|---|---|
| LLM만 | 빠름, 단순 | 전문 지식 부족, 환각 가능 |
| 전체 데이터를 프롬프트에 | 100% 정확 | 토큰 비용 증가, 크기 한계 |
| RAG | 필요한 것만 검색 → 정확 + 효율 | 검색 정확도에 의존, 구현 복잡 |

## 4.3 에센리에서의 RAG 적용

```
[에센리 데이터 분류]

구조화 데이터 (SQL로 검색) ← RAG 불필요
  ├── 제품 200건 (이름, 가격, 피부타입, 성분...)
  ├── 시술 50건 (이름, 가격, 회복기간...)
  ├── 매장 50건, 클리닉 30건
  └── 필터: WHERE skin_type = 'sensitive' AND price < 30000

비구조화 데이터 (RAG로 검색) ← 여기에 적용
  ├── 성분 가이드: "나이아신아마이드는 미백 효과가..."
  ├── 시술 가이드: "IPL 시술 후 자외선 노출을..."
  ├── 지역 가이드: "홍대 주변은 인디 브랜드 매장이 밀집..."
  └── K-뷰티 상식: "한국 화장품은 피부 장벽 강화를..."
```

---

# 5. 임베딩과 벡터 DB

## 5.1 임베딩이란

텍스트를 숫자 배열(벡터)로 변환하는 것. 의미가 비슷한 텍스트는 비슷한 숫자 배열을 가집니다.

```
"보습 크림"     → [0.82, 0.15, 0.43, 0.91, ...]  (1024개 숫자)
"수분 크림"     → [0.80, 0.17, 0.45, 0.89, ...]  ← 의미 유사 → 숫자도 유사
"여드름 치료"   → [0.12, 0.88, 0.23, 0.31, ...]  ← 의미 다름 → 숫자도 다름
```

비유: 지도 위의 좌표. 서울과 인천은 좌표가 가깝고, 서울과 뉴욕은 멀다.
임베딩도 마찬가지 — 의미가 가까운 텍스트는 "좌표"가 가깝다.

## 5.2 벡터 DB (pgvector)

임베딩 벡터를 저장하고, "가장 가까운 벡터"를 빠르게 찾아주는 데이터베이스.

```
[벡터 DB에 저장된 상태]

문서1: "레티놀은 주름 개선에..."  → [0.72, 0.34, ...]
문서2: "나이아신아마이드는..."    → [0.65, 0.41, ...]
문서3: "살리실산은 여드름에..."   → [0.11, 0.89, ...]
...

[검색]
질문: "주름에 좋은 성분?"       → [0.70, 0.36, ...]  (질문도 임베딩)

→ 코사인 유사도 계산:
  문서1과의 거리: 0.95 (매우 가까움) ✓ ← 이 문서를 반환
  문서2과의 거리: 0.72 (보통)
  문서3과의 거리: 0.15 (멀음)
```

## 5.3 pgvector 인덱스: HNSW vs IVFFlat

| 인덱스 | 적합 규모 | 원리 | 에센리 선택 |
|---|---|---|---|
| HNSW | 소~대규모 | 그래프 기반 근사 검색 | ✅ 추천 (소규모에도 안정적) |
| IVFFlat | 대규모(수만~) | 클러스터 기반 분할 검색 | ❌ 소규모에서 정확도 낮음 |
| 인덱스 없음 | 수백 건 이하 | 전체 스캔 (정확) | ⚠️ 100건이면 이것도 가능 |

## 5.4 임베딩 모델 선택

텍스트 → 벡터 변환을 수행하는 모델. LLM과는 별도의 모델입니다.

| 모델 | 제공사 | 차원 | 다국어 | 가격 (1M 토큰) |
|---|---|---|---|---|
| Voyage-3-large | Voyage AI | 1024 | ✅ | ~$0.06 |
| text-embedding-3-large | OpenAI | 3072 (축소 가능) | ✅ | $0.13 |
| Gemini text-embedding | Google | 768 | ✅ | 무료~$0.01 |

> 에센리 MVP: P-4 PoC에서 한국어 데이터 + 영어 쿼리 정확도 기준 선정

---

# 6. 에센리 시스템에 적용

## 6.1 전체 아키텍처에서의 위치

```
┌─────────────────────────────────────────────────────────┐
│                    사용자 질문                             │
└─────────────────────────┬───────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   LLM (Claude 등)                        │
│                                                          │
│  시스템 프롬프트:                                         │
│    역할 + 규칙 + 프로필                                   │
│    + [KB 지식] ← MVP: 프롬프트에 직접 포함 또는 RAG 검색   │
│                                                          │
│  도구 사용 판단:                                          │
│    "제품 검색이 필요하다" → tool_use                       │
│    "성분 지식이 필요하다" → KB 참조 (프롬프트 또는 RAG)     │
└───────────┬─────────────────────────┬───────────────────┘
            │                         │
            ▼                         ▼
  ┌──────────────────┐    ┌──────────────────────┐
  │  SQL 검색         │    │  RAG 검색 (선택)       │
  │  (구조화 데이터)   │    │  (비구조화 KB)         │
  │                   │    │                       │
  │  products 테이블   │    │  pgvector 벡터 검색    │
  │  treatments 테이블 │    │  또는                  │
  │  WHERE 필터       │    │  시스템 프롬프트 포함   │
  └──────────────────┘    └──────────────────────┘
```

## 6.2 추상화 레이어 설계 (MVP 핵심)

RAG를 학습 목적으로 구현하되, 시간 부족 시 전환 가능하도록 인터페이스를 설계합니다.

```typescript
// 검색 엔진 인터페이스 (추상화)
interface KnowledgeSearchEngine {
  search(query: string, topK?: number): Promise<KnowledgeResult[]>;
}

// 구현 A: 시스템 프롬프트 직접 포함 (빠른 구현, 폴백)
class PromptKnowledgeEngine implements KnowledgeSearchEngine {
  // KB 전체를 시스템 프롬프트에 포함 → 검색 불필요
  // search() 호출 시 전체 KB 반환
}

// 구현 B: pgvector RAG (학습 목적 구현)
class VectorKnowledgeEngine implements KnowledgeSearchEngine {
  // 쿼리 → 임베딩 → pgvector 검색 → Top-K 반환
}

// 환경 변수로 전환
// KNOWLEDGE_ENGINE=prompt  → PromptKnowledgeEngine
// KNOWLEDGE_ENGINE=vector  → VectorKnowledgeEngine
```

구현 순서:
1. PromptKnowledgeEngine 먼저 (MVP 핵심 기능 동작 보장)
2. VectorKnowledgeEngine 학습 + 구현 (RAG 파이프라인)
3. 벤치마크 비교 후 프로덕션 선택

## 6.3 Vercel AI SDK 멀티 프로바이더 구조

```typescript
// AI 프로바이더 추상화 (Vercel AI SDK가 이미 제공)

// 환경 변수: LLM_PROVIDER=anthropic, LLM_MODEL=claude-sonnet-4-5
//           LLM_PROVIDER=openai,    LLM_MODEL=gpt-4.1
//           LLM_PROVIDER=google,    LLM_MODEL=gemini-2.5-flash

import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

function getModel() {
  switch (process.env.LLM_PROVIDER) {
    case 'anthropic': return anthropic(process.env.LLM_MODEL);
    case 'openai':    return openai(process.env.LLM_MODEL);
    case 'google':    return google(process.env.LLM_MODEL);
  }
}

// 사용 — 모든 프로바이더에서 동일한 코드
const result = await streamText({
  model: getModel(),
  system: systemPrompt,
  messages: conversationHistory,
  tools: { searchBeautyData, getExternalLinks },
});
```

---

# 7. 학습 로드맵

## 7.1 추천 학습 순서

```
Phase 1: 기초 이해 (이 문서 읽기)
  ├── AI 에이전트 개념
  ├── LLM 기초 (토큰, 컨텍스트)
  └── Tool Use 개념

Phase 2: 핵심 구현 (M2 마일스톤)
  ├── Vercel AI SDK 튜토리얼
  │   → streamText, useChat, tool 정의
  ├── 시스템 프롬프트 작성
  └── Tool 실행 (SQL 검색 연결)

Phase 3: RAG 학습 + 구현
  ├── 임베딩 개념 실습
  │   → 텍스트 3개를 임베딩하고 유사도 비교
  ├── pgvector 설정
  │   → Supabase에서 벡터 테이블 생성
  ├── RAG 파이프라인 구축
  │   → 문서 임베딩 → 저장 → 검색 → LLM 주입
  └── 벤치마크
      → PromptKnowledge vs VectorKnowledge 비교
```

## 7.2 추천 학습 자료

| 자료 | 설명 |
|---|---|
| [Vercel AI SDK 공식 문서](https://ai-sdk.dev/docs) | useChat, streamText, tool 정의 |
| [Supabase Vector/AI 가이드](https://supabase.com/docs/guides/ai) | pgvector 설정, 임베딩, 검색 |
| [Anthropic Cookbook — RAG](https://docs.anthropic.com/en/docs/build-with-claude/retrieval-augmented-generation) | Claude RAG 구현 가이드 |
| [Anthropic Prompt Caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) | 프롬프트 캐싱으로 비용 절감 |
| [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings) | 임베딩 개념 + 실습 |

## 7.3 PoC 체크리스트

MVP 착수 전 검증 항목 (TDD §1.4 P-1~P-6):

- [ ] P-1: Claude tool_use로 ProductCard/TreatmentCard 안정적 생성 확인
- [ ] P-2: 스트리밍 텍스트 + 카드 "팝인" UI 프로토타입
- [ ] P-3: SQL WHERE vs 벡터 검색 정확도/속도 벤치마크 (50건)
- [ ] P-4: 임베딩 모델 다국어 정확도 비교 (한국어 데이터 + 영어 쿼리)
- [ ] P-5: DV-4 AI 프로필 일관성 테스트 (입력 20개 변형)
- [ ] P-6: Supabase anonymous auth 브라우저 재방문 식별 테스트
