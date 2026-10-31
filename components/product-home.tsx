"use client";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck, Smartphone, Check, MapPin } from "lucide-react";
import { LanguageSwitch, useLanguage } from "./language";
export default function ProductHome() {
  const { t } = useLanguage();
  return <main className="product-home">
    <nav className="product-nav" aria-label={t("Điều hướng", "Navigation")}>
      <Link className="product-brand" href="/"><ShieldCheck /> Guardian AI</Link>
      <a href="#how">{t("Cách hỗ trợ", "How it helps")}</a><LanguageSwitch />
      <Link className="product-button primary" href="/demo/command-center">{t("Mở demo", "Open demo")} <ArrowRight size={17}/></Link>
    </nav>
    <header className="product-hero">
      <h1>{t("Đường về muộn.", "A late walk home.")}<br/><em>{t("Có người cùng bạn.", "Someone by your side.")}</em></h1>
      <div className="product-intro"><p>{t("Khi thấy bất an, điều bạn cần là biết ai có thể giúp và bước tiếp theo là gì. Guardian kết nối lời cầu cứu với người thân, xác minh nơi tiếp nhận và giữ lại diễn biến khi tình huống thay đổi.", "When you feel uneasy, you need to know who can help and what to do next. Guardian connects your request to trusted people, checks offers of support and keeps a record as the situation changes.")}</p>
        <div className="product-actions"><Link className="product-button primary" href="/demo/command-center">{t("Chạy tình huống mô phỏng", "Run the simulation")} <ArrowRight size={18}/></Link><Link className="product-button" href="/demo/phone"><Smartphone size={18}/>{t("Thử trên điện thoại", "Try the companion")}</Link></div>
        <p className="product-note">{t("Demo không cần đăng nhập hay micro. Không gọi số điện thoại thật.", "No sign-in or microphone needed for the demo. No real phone numbers are called.")}</p>
      </div>
    </header>
    <section className="product-proof" aria-label={t("Tình huống minh họa", "Illustrative scenario")}>
      <div className="product-proof-copy"><span className="source-tag">{t("TÌNH HUỐNG MÔ PHỎNG", "SIMULATED SCENARIO")}</span><h2>{t("22:15. Một lời cầu cứu, nhiều người cùng phối hợp.", "22:15. One request, several people helping together.")}</h2><p>{t("Một nơi nói có thể giúp. Một người hẹn đến đón. Guardian kiểm tra từng lời hứa trước khi đề xuất nơi đến.", "A venue offers a place to wait. A relative offers to pick you up. Guardian checks each commitment before proposing a destination.")}</p><div className="product-promise"><Check size={18}/><span>{t("Chỉ xác nhận từ lời người nhận giúp", "Confirmation comes from the person offering help")}</span></div><div className="product-promise"><MapPin size={18}/><span>{t("Cam kết thay đổi → phương án được kiểm tra lại", "A changed commitment triggers a new plan")}</span></div></div>
      <figure><Image src="/landing/map-plan.png" width={1468} height={1384} priority alt={t("Bản đồ tuyến mô phỏng tại Thủ Thiêm", "Simulated walking route in Thu Thiem")} sizes="(max-width: 760px) 100vw, 55vw"/><figcaption>{t("Ảnh từ engine demo · địa điểm và điều kiện đường là mô phỏng", "Captured from the demo engine · venues and road conditions are simulated")}</figcaption></figure>
    </section>
    <section id="how" className="product-how"><h2>{t("Từ bất an đến một bước rõ ràng.", "From uncertainty to a clear next step.")}</h2><ol>{[
      [t("Chuẩn bị trước khi đi", "Prepare before you walk"),t("Mời người bạn tin tưởng, kiểm tra họ đã tham gia, chọn thời gian dự kiến và chủ động cấp quyền vị trí.", "Invite someone you trust, check that they joined, set an expected arrival time and choose whether to share your location.")],
      [t("Nói điều bạn cần", "Say what you need"),t("Gửi SOS bằng chữ hoặc giọng nói khi đã bật AI. Người thân và đối tác tham gia nhận yêu cầu trong app.", "Send an SOS by text, or by voice when AI is enabled. Joined contacts and partners receive the request in the app.")],
      [t("Bạn chọn bước tiếp theo", "You choose the next step"),t("Xem ai đã nhận giúp và nơi nào đã đồng ý. Chấp nhận phương án; nếu cam kết bị rút, tuyến cũ dừng lại.", "See who has responded and which venue agreed to help. Accept the plan; if a commitment is withdrawn, the old guidance stops.")],
      [t("Giữ lại những gì đã xảy ra", "Keep a record of what happened"),t("Lời nói gốc, lịch sử phương án và vị trí tạo thành hồ sơ có chuỗi băm kiểm tra toàn vẹn.", "Original statements, plan history and locations form a record with an integrity-verifiable hash chain.")]
    ].map(([title,desc])=><li key={title}><h3>{title}</h3><p>{desc}</p></li>)}</ol></section>
    <section className="product-boundary"><h2>{t("Sự an tâm bắt đầu từ thông tin thật.", "Reassurance starts with honest information.")}</h2><p>{t("Guardian là công cụ hỗ trợ phối hợp, không bảo đảm an toàn và không thay thế cứu hộ. Phiên thử trên thiết bị cần giữ trang mở; chưa có thông báo nền khi khóa màn hình. 113/115 chỉ mở trình quay số khi bạn chọn.", "Guardian supports coordination; it cannot guarantee safety or replace emergency services. Device trials require the page to stay open; background alerts on a locked phone are not available. 113/115 open the dialer only when you choose.")}</p><Link className="product-button primary" href="/demo/command-center">{t("Xem toàn bộ luồng", "Explore the full flow")} <ArrowRight size={18}/></Link></section>
    <footer className="product-footer"><b>Guardian AI</b><span>{t("Bản thử nghiệm · Tiếng Việt / English", "Experimental build · Tiếng Việt / English")}</span><Link href="/demo/advanced">{t("Bàn điều khiển nâng cao (VI)", "Advanced console (VI)")}</Link></footer>
  </main>;
}
