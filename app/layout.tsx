import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import "./voice.css";
import "./command.css";
import "./product.css";
import { LanguageProvider } from "@/components/language";
const ui = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500", "600", "700"], variable: "--font-ui", display: "swap" });
export const metadata: Metadata = {
  title: "Guardian AI · Command Center",
  description:
    "Hệ thống phối hợp hỗ trợ người đi một mình · Hackathon simulation",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={ui.variable}>
      <body><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
