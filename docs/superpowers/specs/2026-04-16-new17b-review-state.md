# NEW-17b 작업 상태 핸드오프 (2026-04-16)

> 이 문서는 다른 PC에서 작업을 재개할 때 컨텍스트 없이 정확한 상태를 복원하기 위한 핸드오프 노트.
> 정본 설계: `2026-04-16-new17b-rpc-hardening-design.md` v1.1

---

## 1. 현재 브랜치 / 커밋

- **브랜치**: `fix/new-17b-rpc-hardening-and-tests`
- **분기 기준**: `main` (bf1c8a1)
- **main 대비 커밋**:
  - `docs: NEW-17b RPC 하드닝 + NEW-17e 통합 테스트 설계 spec 추가` (초안)
  - `docs: NEW-17b 리뷰 반영 (v1.1) + 핸드오프 노트 + NEW-17g TODO` (리뷰 반영)

## 2. 완료된 단계

1. ✅ 브레인스토밍 (p_spec 저장 방식 결정: **RPC 본문 하드코딩** + `get_*_field_spec()` 드리프트 감지 보조 함수)
2. ✅ Spec 문서 작성 (`2026-04-16-new17b-rpc-hardening-design.md`)
3. ✅ `/gstack-plan-eng-review` 전문가 검토 → 9 이슈 발견
4. ✅ 리뷰 반영한 spec v1.1 작성 (아래 §3 확정사항)
5. ✅ `NEW-17g` TODO 등록 (v0.2 CI integration 통합 태스크)

## 3. 확정된 설계 결정

### 3.1 범위 (NEW-17b + NEW-17e 결합 브랜치)

- **포함**: RPC `p_spec` 인자 제거 + `REVOKE authenticated` + `GRANT service_role` + CHECK 제약 3건 + 통합 테스트 6~8건
- **범위 외**: NEW-17c(learned_preferences, v0.2), NEW-17d(UX), NEW-17f(trigger), NEW-17g(CI integration, v0.2)

### 3.2 drift 감지 정책 (A2 해소 — INFRA-PIPELINE.md 정본 일치)

- **결정**: 로컬에서 `npm run test:integration` 실행으로 drift 감지. CI에 integration job 미추가.
- **근거**: `docs/03-design/INFRA-PIPELINE.md` v1.1 §3.5 정본 — "GitHub Secrets는 사용하지 않는다". CI 책임은 코드 검증(lint/type-check/unit test)만.
- **보완**: PR template 체크리스트 항목 + `CLAUDE.md` 규칙 추가 (구현 단계)
- **v0.2 경로**: INFRA-PIPELINE.md P3-26(Supabase dev/prod 분리) 완료 후 `NEW-17g` 태스크로 CI 통합 재평가

### 3.3 리뷰에서 확정된 8건 보강 (v1.1 반영 완료)

| ID | 조치 |
|---|---|
| A1 | Migration 017 **전체 SQL 본문**을 spec §3.2에 inline (복붙 실수 차단) |
| A3 | Rollback SQL **전체 본문**을 spec §3.3에 inline |
| A4 | `REVOKE` 대상에 `anon` 명시 포함 |
| A5 | T5를 **4개 함수**(apply_ai_profile_patch, apply_ai_journey_patch, get_profile_field_spec, get_journey_field_spec)로 확장 |
| C1 | `service.ts`에서 미사용이 될 `PROFILE_FIELD_SPEC` / `JOURNEY_FIELD_SPEC` import 제거 |
| C2 | `service.test.ts` M4 테스트를 **exact match assertion**으로 재정의 |
| G1-G4 | Journey M1 대칭 케이스 **T7**, scalar NULL→AI set 케이스 **T8** 통합 테스트 추가 |
| C3 | CHECK 제약명 `_values` suffix 현 상태 유지 (bike-shed) |

## 4. 다음 단계 (이 핸드오프 이후)

1. **Spec 최종 리뷰** (선택) — 새 PC에서 v1.1 spec 재확인
2. **`superpowers:writing-plans`** 호출 → 실행 플랜 작성 (`docs/superpowers/plans/2026-04-16-new17b-rpc-hardening.md`)
3. **TDD 구현** (브랜치 유지):
   - 통합 테스트 T1~T8 먼저 작성 (red)
   - `supabase/migrations/017_rpc_hardening.sql` 작성
   - `supabase/migrations/017_rpc_hardening_rollback.sql` 작성
   - **사용자**가 Supabase Dashboard에서 017 수동 적용
   - `src/server/features/profile/service.ts` p_spec 인자 제거 + unused import 정리
   - `src/server/features/profile/service.test.ts` M4 mock 2-arg + exact match로 수정
   - `src/server/features/api/routes/chat.test.ts` 필요 시 mock assertion 수정
   - 전수 검증: `npm run type-check && npm run lint && npm run build && npm test && npm run test:integration`
4. **PR 생성** — PR body에 "migration 017 Dashboard 수동 적용 완료 여부" 체크박스 포함
5. **선택**: `/gstack-review`로 diff 기반 최종 리뷰

## 5. 중요한 제약 (재확인)

- **NO Docker, NO Supabase CLI, NO 로컬 DB** (CLAUDE.md). migration 파일은 작성·커밋만, 실제 적용은 사용자가 Supabase Dashboard SQL Editor에서 수동
- main 브랜치 직접 커밋 금지
- 커밋 메시지 Co-Authored-By 라인 금지
- Integration test는 **로컬에서만** 실행 가능 (`.env.test` 파일 필요, CI 미실행)

## 6. 핵심 파일 참조

| 파일 | 역할 |
|---|---|
| `docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md` | **정본 설계 v1.1** |
| `docs/superpowers/specs/2026-04-15-new17-profile-merge-policy-design.md` | 선행 설계 (NEW-17 v1.1) |
| `docs/03-design/INFRA-PIPELINE.md` | CI/CD 정본 (A2 결정 근거) |
| `docs/03-design/schema.dbml` | DB 정본 |
| `supabase/migrations/015_profile_skin_types_array.sql` | 기존 3-arg RPC (merge 로직 본문은 line 47-124) |
| `supabase/migrations/015b_apply_ai_journey_patch.sql` | 기존 3-arg journey RPC |
| `src/server/features/profile/service.ts` | RPC 호출부 (237, 262) |
| `src/shared/constants/profile-field-spec.ts` | TS field spec 레지스트리 |
| `src/__tests__/integration/helpers.ts` | Integration test 헬퍼 |
| `.github/workflows/ci.yml` | 현 CI (lint/type-check/unit test만) |
| `TODO.md` | NEW-17b/17e/17g 등 태스크 |

## 7. 미결정 사항

없음. A2는 INFRA-PIPELINE.md 정본 확인으로 **옵션 A (로컬 규율 + NEW-17g 분리)**로 확정.

## 8. 재개 시 첫 명령 제안

```bash
git checkout fix/new-17b-rpc-hardening-and-tests
git pull
cat docs/superpowers/specs/2026-04-16-new17b-review-state.md  # 이 문서
cat docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md  # 설계 v1.1
# 이후 superpowers:writing-plans 호출
```
