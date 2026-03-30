import { getTranslations } from "next-intl/server";
import { Button } from "@/client/ui/primitives/button";

export default async function NotFoundPage() {
  const t = await getTranslations("error");

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-5 text-center">
      <div className="max-w-sm">
        <h1 className="mb-3 text-2xl font-bold text-foreground">
          {t("notFoundTitle")}
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-muted-foreground">
          {t("notFoundDescription")}
        </p>
        <Button size="lg" asChild className="min-h-11">
          <a href="/">{t("home")}</a>
        </Button>
      </div>
    </div>
  );
}
