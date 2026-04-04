import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/client/ui/primitives/button";

export default async function NotFoundPage() {
  const t = await getTranslations("error");

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-5 text-center">
      <div className="max-w-sm">
        <p className="mb-2 text-5xl font-bold text-primary">404</p>
        <h1 className="mb-3 text-2xl font-bold text-foreground">
          {t("notFoundTitle")}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          {t("notFoundDescription")}
        </p>
        <a
          href="/"
          className={buttonVariants({ size: "cta" })}
        >
          {t("home")}
        </a>
      </div>
    </div>
  );
}
