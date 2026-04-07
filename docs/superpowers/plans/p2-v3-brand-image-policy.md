# P2-V3 브랜드 공식 이미지 정책 확인 — 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5개 K-뷰티 브랜드의 제품 이미지 사용 가능 여부를 조사하여 MVP 이미지 전략을 확정한다.

**Architecture:** 웹 조사 기반 검증 작업. 코드 변경 없음. 5개 브랜드 사이트의 이미지 정책을 확인하고, K-뷰티 업계 관행을 벤치마킹하여, data-collection.md U-6의 "잠정 전략"을 확정 또는 수정한다.

**Tech Stack:** WebFetch, WebSearch (조사 도구). 변경 대상: `docs/05-design-detail/data-collection.md` (설계서 갱신만).

**설계 정본:** `docs/05-design-detail/data-collection.md` §4 이미지 저작권 정책, U-6

**규칙 준수:**
- G-12: 외부 소스 사전 검증 (이 작업 자체가 G-12 실행)
- D-8: 경쟁 서비스 벤치마킹 (Task 2)
- D-1: 교차 문서 원문 대조 (Task 4)
- D-9: 누락 검증 (Task 4)
- src/ 수정 없음 — P2-9~28 (다른 세션) 작업과 충돌 0건

---

## 파일 구조

| 파일 | 역할 | 변경 유형 |
|------|------|---------|
| `docs/05-design-detail/data-collection.md` §4 | 이미지 저작권 정책 테이블 갱신 | 수정 |
| `docs/05-design-detail/data-collection.md` §8 U-6 | 잠정→확정 전환 | 수정 |
| `docs/05-design-detail/data-collection.md` §10 | D-14 이미지 전략 결정 추가 (필요 시) | 수정 |
| `src/` | **수정 없음** | — |

---

## Task 1: 5개 브랜드 공식 사이트 이미지 정책 조사

**Files:**
- 없음 (조사만)

**대상 브랜드:**
1. 이니스프리 (innisfree.com) — 아모레퍼시픽
2. 라네즈 (laneige.com) — 아모레퍼시픽
3. 설화수 (sulwhasoo.com) — 아모레퍼시픽
4. 코스알엑스 (cosrx.com) — 코스알엑스
5. 미샤 (misshaus.com / missha.com) — 에이블씨엔씨

> **참고**: cosrx, laneige, innisfree는 P2-V7에서 robots.txt 크롤링 허용 확인 완료. sulwhasoo, missha는 robots.txt 미확인 — Step 2에서 함께 확인.

**각 브랜드별 확인 항목:**

- [ ] **Step 1: 프레스킷/미디어 포털 존재 여부 확인**

각 브랜드 사이트에서 아래 경로를 WebFetch로 확인:
- `/press`, `/media`, `/press-kit`, `/newsroom`
- 푸터의 "Press" / "Media" / "For Press" 링크
- 모회사 사이트 (예: amorepacific.com/press)

기록 형식:
```
브랜드: [이름]
프레스킷 URL: [있음/없음 + URL]
미디어 포털: [있음/없음 + URL]
이미지 다운로드: [가능/불가/로그인 필요]
```

- [ ] **Step 2: 이용약관/저작권 고지 확인**

각 브랜드 사이트의 Terms of Use / 이용약관 페이지를 WebFetch로 확인:
- `/terms`, `/legal`, `/terms-of-use`
- 푸터의 "Terms" / "Legal" / "이용약관" 링크

확인 항목:
- "이미지 무단 사용 금지" 명시 여부
- "상업적 사용 금지" 명시 여부
- 출처 표시 조건
- 프로모션/마케팅 목적 사용 허용 여부
- robots.txt에서 이미지 경로 차단 여부

기록 형식:
```
브랜드: [이름]
약관 URL: [URL]
이미지 관련 조항: [원문 인용]
판정: [사용가능/조건부/금지]
```

- [ ] **Step 3: 제품 페이지 이미지 접근 구조 확인**

A-3 크롤링으로 수집될 이미지 URL의 기술적 접근성 확인:
- 제품 페이지에서 이미지 URL이 CDN 직접 접근 가능한지
- 핫링크 방지(referer 체크) 여부
- 이미지 URL 패턴 (CDN 도메인, 크기 파라미터 등)

각 브랜드 1개 제품 페이지를 WebFetch로 확인.

- [ ] **Step 4: 5개 브랜드 조사 결과 정리**

| 브랜드 | 프레스킷 | 약관 이미지 조항 | CDN 접근 | 판정 |
|--------|---------|---------------|---------|------|
| 이니스프리 | ? | ? | ? | ? |
| 라네즈 | ? | ? | ? | ? |
| 설화수 | ? | ? | ? | ? |
| 코스알엑스 | ? | ? | ? | ? |
| 미샤 | ? | ? | ? | ? |

---

## Task 2: K-뷰티 업계 이미지 사용 관행 벤치마킹 (D-8)

**Files:**
- 없음 (조사만)

- [ ] **Step 1: 경쟁 서비스의 제품 이미지 출처 조사**

WebSearch + WebFetch로 확인:
- **화해 (Hwahae)**: 제품 이미지를 어떻게 확보하는지 (브랜드 제공? 자체 촬영? 크롤링?)
- **글로우픽**: 동일
- **NOL World**: 동일
- **Picky**: 동일
- **YesStyle/StyleVana**: 동일 (글로벌 K-뷰티 리테일러)

확인 포인트:
- 이미지 출처 표시 여부 ("Image: [Brand]" 등)
- 이미지 품질/크기
- placeholder 사용 사례

- [ ] **Step 2: 벤치마킹 결과 정리**

| 서비스 | 이미지 출처 | 출처 표시 | 관행 |
|--------|-----------|---------|------|
| 화해 | ? | ? | ? |
| 글로우픽 | ? | ? | ? |
| NOL World | ? | ? | ? |
| Picky | ? | ? | ? |
| YesStyle | ? | ? | ? |

---

## Task 3: MVP 이미지 전략 확정

**Files:**
- 없음 (분석 + 판정)

- [ ] **Step 1: Task 1 + Task 2 결과 기반 판정**

판정 기준 (data-collection.md 기존 기준 계승):

| 결과 | MVP 전략 |
|------|---------|
| 3/5+ 브랜드에서 이미지 사용 가능 | **이미지 포함** — 출처 표시 + A-3 크롤링 시 image_url 수집 |
| 1~2/5 브랜드만 가능 | **혼합** — 가능 브랜드는 이미지, 불가 브랜드는 placeholder |
| 대부분 불가 또는 명시적 금지 | **placeholder 전략** — 브랜드 색상+텍스트 카드 |

**브랜드별 판정 카테고리:**
- **허용**: 프레스킷 공개 또는 약관에서 프로모션 목적 사용 명시 허용
- **조건부**: 출처 표시 등 조건 하에 허용 (약관에 금지 미명시 + 업계 관행 일치)
- **불명확**: 프레스킷 없음 + 약관에 명시적 허용도 금지도 없음
- **금지**: 약관에 이미지 무단 사용/상업적 사용 명시 금지

추가 판정 입력:
- 업계 관행이 "출처 표시 후 사용"이 일반적이면 "불명확" → "조건부"로 격상
- 업계가 "브랜드 제공/자체 촬영"만 사용하면 "불명확" 유지

- [ ] **Step 2: 누락 검증 (D-9)**

점검 항목:
- stores/clinics 이미지는? (카카오 API에서 미제공 → 수동 촬영 또는 Google Street View?)
- treatments 이미지는? (시술 전후 사진 → 저작권 복잡, 의료 정보 → 면책 필요)
- brands 로고는? (로고는 상표이므로 제품 이미지와 다른 규칙)
- 이미지 없는 MVP가 사용자 경험에 미치는 영향은?

---

## Task 4: 설계서 갱신 + 교차 검증

**Files:**
- Modify: `docs/05-design-detail/data-collection.md` §4, §8 U-6, §10

- [ ] **Step 1: §4 이미지 저작권 정책 테이블 갱신**

Task 1 결과를 기반으로 테이블 행 추가/수정:
- 브랜드별 판정 결과 반영
- "묵시적 프로모션 라이선스" → 근거 있는 판정으로 교체

- [ ] **Step 2: §8 U-6 상태 갱신**

"잠정 전략" → Task 3 판정 결과로 변경:
- 확정 시: "확정 (YYYY-MM-DD)" + 판정 근거
- 추가 조치 필요 시: "잠정 → 조건부 확정" + 후속 작업 명시

- [ ] **Step 3: §10 설계 결정 D-14 추가 (필요 시)**

이미지 전략이 설계 결정으로 격상할 수준이면 D-14로 추가:
```
| D-14 | MVP 이미지 전략 | [선택] | [근거] |
```

- [ ] **Step 4: 교차 문서 영향 확인 (D-6)**

V3 결과로 갱신이 필요한 다른 문서:
- `seed-data-plan.md`: products 이미지 수집 방법 기술 변경 필요?
- `docs/04-poc/data-strategy.md`: P0-35 이미지 전략 ("대부분 사용 가능") 갱신 필요?
- `TODO.md`: P2-V3 상태 ✅ 갱신
- 다른 문서에 "이미지" 관련 stale 참조 없는지 확인

- [ ] **Step 5: 커밋**

```bash
git add docs/05-design-detail/data-collection.md TODO.md [기타 변경 파일]
git commit -m "P2-V3: 브랜드 이미지 정책 확인 완료 — [판정 결과 요약]"
```

---

## 제약 사항

- **src/ 수정 없음** — 이미지 전략은 데이터 수집 단계 결정이며 코드에 영향 없음
- **core/ 수정 없음** (L-4, P-2)
- **다른 세션(P2-9~28) 작업과 충돌 없음** — docs/ 변경만
- **추론 금지** — 약관 원문을 직접 확인하고 인용. 존재하지 않는 정책을 가정하지 않음
- **PR 이메일 발송은 사용자 작업** — AI가 대신 발송하지 않음
