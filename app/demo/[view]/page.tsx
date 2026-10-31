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
    !["command-center", "phone", "advanced", "control", "calls", "architecture"].includes(
      view,
    )
  )
    notFound();
  if(view === "command-center" || view === "phone") return <ProductExperience phone={view === "phone"} />;
  return <Dashboard view={view === "advanced" ? "command-center" : view} />;
}
