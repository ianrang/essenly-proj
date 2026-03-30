import { useTranslations } from "next-intl";

const TRUST_ITEMS = [
  { icon: "🔓", titleKey: "trustNoSignup", descKey: "trustNoSignupDesc" },
  { icon: "🛡️", titleKey: "trustNoShare", descKey: "trustNoShareDesc" },
  { icon: "🗑️", titleKey: "trustDelete", descKey: "trustDeleteDesc" },
] as const;

export default function TrustSection() {
  const t = useTranslations("landing");

  return (
    <section className="border-t border-border py-12 lg:py-16">
      <div className="mx-auto max-w-[960px] px-5">
        <div className="mx-auto max-w-[640px] rounded-xl border border-border bg-card p-6 text-center lg:p-9">
          <h2 className="mb-1 text-lg font-bold">{t("trustTitle")}</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            {t("trustSubtitle")}
          </p>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:gap-3">
            {TRUST_ITEMS.map(({ icon, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="flex items-center gap-2.5 rounded-md bg-surface-warm p-3 text-left lg:flex-1 lg:flex-col lg:items-center lg:p-4 lg:text-center"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm"
                  aria-hidden="true"
                >
                  {icon}
                </div>
                <div className="text-xs">
                  <p className="font-semibold">{t(titleKey)}</p>
                  <p className="text-muted-foreground">{t(descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
