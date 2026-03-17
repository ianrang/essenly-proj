import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en"],   // MVP: English only
  defaultLocale: "en",
});
