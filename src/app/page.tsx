import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

// Root page — redirects to default locale.
// Primary routing is handled by proxy.ts; this is a fallback.
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`);
}
