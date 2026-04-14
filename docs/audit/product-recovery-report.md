# 제품 데이터 정합성 복구 리포트

> 2026-04-14 · NEW-40

## 요약

| 지표 | 수치 |
|------|------|
| 작업 전 전체 | 201건 |
| 브랜드 오염 | 71건 (brand 필드 교체) |
| name 오염 | 73건 (name_en 교체) |
| **복구 후 유지** | **129건** (128 완전 성공 + 1 Essenly) |
| 제거 | 72건 (올리브영 미입점/단종/이름 불일치) |
| **브랜드 정합성** | **129/129 일치 (100%)** |
| **이미지 커버리지** | **129/129 (100%)** |
| **가격 커버리지** | **129/129 (100%)** |

## 오염 원인

`collect-replacement-products.ts`가 올리브영 검색 실패(73건)에 대해 다른 제품의 brand/name/images/links/price를 덮어씀.

## 복구 과정

1. **Phase 1**: `products-enriched.json`에서 원본 brand/brand_id 복원
2. **Phase 2**: 개선된 스크래퍼로 올리브영 재매칭
   - 브랜드 검증 게이트 추가 (페이지 내 브랜드 확인)
   - 가격 수집 (USD→KRW 환율 변환)
   - Global + 한국 OY 4단계 검색
3. **name 오염 발견**: Phase 1에서 brand만 복원하고 name은 안 건드린 버그 → enriched.json에서 name도 복원
4. **부분 성공 6건 검증**: 이미지/링크가 잘못된 제품을 가리키고 있어 제거

## 제거된 72건 분석

### 주요 원인

| 원인 | 건수 | 대표 브랜드 |
|------|------|------------|
| 올리브영 미입점 (백화점/자체몰 전용) | ~30 | Sulwhasoo, The History of Whoo, Amorepacific, HERA, ISA KNOX |
| 올리브영 단종/품절 | ~15 | ETUDE Beauty Tool, Moremo, Amos Professional |
| 이름 불일치 (리뉴얼/리네이밍) | ~15 | Sulwhasoo Renewing→Rejuvenating, numbuzin No.5 시리즈 |
| 부분 성공 (링크 오염) | 6 | HERA, Cell Fusion C, Laneige |

### 카테고리별 제거 분포

| 카테고리 | 건수 |
|----------|------|
| skincare (serum, moisturizer, eye_care, cleanser 등) | 26 |
| makeup (cushion, lip, eye, mascara 등) | 15 |
| haircare (shampoo, treatment, oil 등) | 11 |
| bodycare (wash, lotion, hand 등) | 13 |
| tools (brush, puff, mirror 등) | 7 |

## 가격 데이터

- 통화: KRW (USD→KRW 환율 변환, USD_TO_KRW=1380)
- 소스: `price_source='real'`, `price_source_url`=올리브영 Global URL
- 할인 적용: `price_min`=현재 판매가, `price_max`=정가

## 후속 작업

- [ ] 부족분 71건을 올리브영 카테고리별 베스트셀러에서 신규 수집 (목표: 200건)
- [ ] 제거된 카테고리 분포를 참고하여 균형 있게 수집
- [ ] `products-removed.json` 참조 (제거 목록)
