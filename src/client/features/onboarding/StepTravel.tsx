"use client";

import "client-only";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { AGE_RANGES, BUDGET_LEVELS } from "@/shared/constants/beauty";
import type { TravelStyle } from "@/shared/types/domain";
import type { OnboardingFormData } from "@/shared/types/profile";
import { CardTitle } from "@/client/ui/primitives/typography";
import OptionGroup from "./OptionGroup";

/** PRD §4-A JC-5: UI에 표시하는 5개 여행 스타일 (luxury/budget은 JC-4와 중복, 대화 추출) */
const ONBOARDING_TRAVEL_STYLES: TravelStyle[] = [
  "efficient",
  "relaxed",
  "adventurous",
  "instagram",
  "local_experience",
];

const STAY_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

const SELECT_CLASS =
  "h-10 w-full appearance-none rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/50";

export default function StepTravel() {
  const t = useTranslations("onboarding");
  const { watch, setValue, register } = useFormContext<OnboardingFormData>();

  const travelStyle = watch("travel_style");

  const travelOptions = ONBOARDING_TRAVEL_STYLES.map((v) => ({
    value: v,
    label: t(`travelStyle_${v}`),
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <CardTitle className="mb-2">{t("country")}</CardTitle>
        <select {...register("country")} className={SELECT_CLASS} defaultValue="">
          <option value="" disabled>—</option>
          <option value="US">United States</option>
          <option value="JP">Japan</option>
          <option value="CN">China</option>
          <option value="TW">Taiwan</option>
          <option value="TH">Thailand</option>
          <option value="VN">Vietnam</option>
          <option value="SG">Singapore</option>
          <option value="MY">Malaysia</option>
          <option value="ID">Indonesia</option>
          <option value="PH">Philippines</option>
          <option value="IN">India</option>
          <option value="GB">United Kingdom</option>
          <option value="DE">Germany</option>
          <option value="FR">France</option>
          <option value="ES">Spain</option>
          <option value="IT">Italy</option>
          <option value="NL">Netherlands</option>
          <option value="SE">Sweden</option>
          <option value="AU">Australia</option>
          <option value="CA">Canada</option>
          <option value="BR">Brazil</option>
          <option value="MX">Mexico</option>
          <option value="RU">Russia</option>
          <option value="SA">Saudi Arabia</option>
          <option value="AE">UAE</option>
          <option value="KR">South Korea</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <CardTitle>{t("age")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("optional")}</span>
        </div>
        <select {...register("age_range")} className={SELECT_CLASS} defaultValue="">
          <option value="">—</option>
          {AGE_RANGES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div>
        <CardTitle className="mb-2">{t("stayDays")}</CardTitle>
        <select
          {...register("stay_days", { valueAsNumber: true })}
          className={SELECT_CLASS}
          defaultValue=""
        >
          <option value="" disabled>—</option>
          {STAY_DAYS.map((d) => (
            <option key={d} value={d}>{t("stayDaysSuffix", { days: d })}</option>
          ))}
        </select>
      </div>

      <div>
        <CardTitle className="mb-2">{t("budget")}</CardTitle>
        <select {...register("budget_level")} className={SELECT_CLASS} defaultValue="">
          <option value="" disabled>—</option>
          {BUDGET_LEVELS.map((b) => (
            <option key={b} value={b}>{t(`budget_${b}`)}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <CardTitle>{t("travelStyle")}</CardTitle>
          <span className="text-xs text-muted-foreground">{t("optional")}</span>
        </div>
        <OptionGroup
          options={travelOptions}
          value={travelStyle}
          onChange={(v) => setValue("travel_style", v as OnboardingFormData["travel_style"], { shouldValidate: true })}
          mode="multiple"
        />
      </div>
    </div>
  );
}
