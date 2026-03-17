// ============================================================
// Domain Configuration — 5 service domains
// ============================================================

import type { DomainConfig } from "../types/domain";

export const DOMAINS: DomainConfig[] = [
  { id: "shopping", label: "Shopping", tabLabel: "Shops", enabled: true, cardType: "ProductCard" },
  { id: "clinic", label: "Treatment/Clinic", tabLabel: "Clinic", enabled: true, cardType: "TreatmentCard" },
  { id: "salon", label: "Salon", tabLabel: "Salon", enabled: false, cardType: "SalonCard" },
  { id: "dining", label: "Dining", tabLabel: "Eats", enabled: false, cardType: "DiningCard" },
  { id: "cultural", label: "Experience", tabLabel: "Exp", enabled: false, cardType: "ExperienceCard" },
] as const;

export const MVP_DOMAINS = DOMAINS.filter((d) => d.enabled);

/** Store types (DOM-1) */
export const STORE_TYPES = [
  "olive_young",
  "chicor",
  "department_store",
  "brand_store",
  "pharmacy",
  "other",
] as const;

/** Clinic types (DOM-2) */
export const CLINIC_TYPES = [
  "dermatology",
  "plastic_surgery",
  "aesthetic",
  "med_spa",
] as const;

/** Treatment categories (DOM-2) */
export const TREATMENT_CATEGORIES = [
  "skin",
  "laser",
  "injection",
  "facial",
  "body",
  "hair",
] as const;

/** Product categories (DOM-1) */
export const PRODUCT_CATEGORIES = [
  "skincare",
  "makeup",
  "haircare",
  "bodycare",
  "tools",
] as const;

/** English support levels */
export const ENGLISH_SUPPORT_LEVELS = [
  "none",
  "basic",
  "good",
  "fluent",
] as const;

/** Link types for external links */
export const LINK_TYPES = [
  "naver_map",
  "kakao_map",
  "website",
  "instagram",
  "naver_booking",
  "coupang",
  "amazon",
  "other",
] as const;
