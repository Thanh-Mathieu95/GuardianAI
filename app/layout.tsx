import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { LanguageProvider } from "@/components/language";
import "./globals.css";
import "./command.css";
const font = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
export const metadata: Metadata = {
  title: "Guardian AI · Có người cùng bạn",
  description:
    "Night-walk support with verified commitments. Hỗ trợ người đi đêm, phối hợp từ lời đồng ý có căn cứ.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={font.className}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
