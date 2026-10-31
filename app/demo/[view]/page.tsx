import Dashboard from "@/components/dashboard";
import ProductExperience from "@/components/product-experience";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  if (
    !["command-center", "phone", "advanced", "companion", "guided", "control", "calls", "architecture"].includes(
      view,
    )
  )
    notFound();
  // Keep the same full dashboard and phone at the local demo's public URLs.
  if (view === "guided" || view === "companion") return <ProductExperience phone={view === "companion"} />;
  return <Dashboard view={view === "advanced" ? "command-center" : view} />;
}
