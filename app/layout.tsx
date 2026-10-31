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
      <body>
        {process.env.GUARDIAN_DEMO_HOSTING === "1" && (
          <aside role="note" style={{ padding: "10px 16px", background: "#fff4d6", color: "#493100", fontSize: "14px", lineHeight: 1.5 }}>
            Bản demo miễn phí · Máy chủ có thể ngủ hoặc gián đoạn. Chỉ dùng dữ liệu mô phỏng, chưa dùng cho tình huống khẩn cấp thật.
          </aside>
        )}
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
