import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileText, MapPin, Phone, ShieldCheck, Smartphone } from "lucide-react";
import "./landing.css";

export const metadata: Metadata = {
  title: "Guardian AI · Một lời cầu cứu, cả mạng lưới cùng phối hợp",
  description: "AI gọi người thân và quán xá quanh bạn cùng lúc, gộp lời đề nghị của từng người thành một tuyến đi an toàn, và niêm phong mọi thứ thành hồ sơ bằng chứng.",
};

const offers = [
  { who: "Chị Linh", role: "Hỗ trợ · tới sau 10′", quote: "Chị chạy xe qua đón em ngay, khoảng mười phút nữa tới. Em cứ vào chỗ nào sáng đèn ngồi chờ chị nhé." },
  { who: "Q-27 Quán Cháo Ấm", role: "Nơi đến · đã nhận", quote: "Mình cho nhân viên ra tận đầu đường đón bạn ấy rồi đưa vào cửa chính, có chỗ ngồi chờ và sạc điện thoại." },
  { who: "Anh Mạnh", role: "Giữ liên lạc", quote: "Anh ở xa, anh sẽ giữ máy và theo dõi vị trí em suốt." },
  { who: "T-01 Cửa hàng 24h Sao Mai", role: "Dự phòng", quote: "Bên mình cho bạn ấy vào sảnh, có chỗ ngồi chờ và nước uống." },
  { who: "K-02 Khách sạn Bình Minh", role: "Rút lại", quote: "Xin lỗi, nhân viên vừa phải đi gấp, tạm thời bên mình chưa nhận được.", struck: true },
];

const steps = [
  { n: "1", k: "Gọi cứu", s: "22:15", t: "Nói, hoặc bấm SOS", d: "Người dùng nói với AI đồng hành như nói với một người bạn. Có chế độ SOS kín đáo khi không thể nói to." },
  { n: "2", k: "Gọi người", s: "5 cuộc song song", t: "AI gọi nhiều người cùng lúc", d: "Người thân nhận cuộc gọi từ AI gia đình; quán, nhà thuốc, khách sạn đăng ký trong mạng lưới nhận cuộc gọi trong app." },
  { n: "3", k: "Lắng nghe", s: "5 lời đề nghị", t: "Mỗi người một ý", d: "Ai cũng nói mình giúp được gì và khi nào. AI chỉ ghi nhận điều họ thật sự nói, kèm câu trích nguyên văn." },
  { n: "4", k: "Gộp tuyến", s: "1 tuyến đi", t: "Gộp thành một tuyến đi", d: "Kế hoạch chọn một nơi đến, chia vai Chính / Hỗ trợ / Dự phòng, và vẽ tuyến tránh đoạn tối, vắng người." },
];

export default function Landing() {
  return (
    <main className="lp">
      <nav className="lp-nav" aria-label="Điều hướng">
        <Link href="/" className="lp-brand"><ShieldCheck size={20} /> Guardian AI</Link>
        <a href="#cach-hoat-dong">Cách hoạt động</a>
        <a href="#bien-ban">Biên bản</a>
        <a href="#ho-so">Hồ sơ bằng chứng</a>
        <Link href="/demo/command-center" className="lp-btn lp-btn-ink lp-nav-cta">Xem demo trực tiếp <ArrowRight size={16} /></Link>
      </nav>

      <header className="lp-hero">
        <h1>Một lời cầu cứu. <em>Năm người</em> cùng đưa bạn tới nơi an toàn.</h1>
        <div className="lp-hero-side">
        <p>Guardian AI gọi người thân và quán xá quanh bạn cùng lúc, nghe từng người đề nghị giúp gì, rồi gộp thành một tuyến đi duy nhất, có trích dẫn và dấu xác nhận.</p>
        <div className="lp-actions">
          <Link href="/demo/command-center" className="lp-btn lp-btn-ink">Xem demo trực tiếp <ArrowRight size={16} /></Link>
          <Link href="/demo/phone" className="lp-btn"><Smartphone size={16} /> Mở app điện thoại</Link>
        </div>
        </div>
      </header>

      <section className="lp-versus" aria-label="So sánh">
        <div className="lp-old">
          <h2>Nút SOS thường</h2>
          <p>Gửi một tin báo động. Người nhận tự đoán phải làm gì, ai đi, đi đâu.</p>
          <div className="lp-alert"><span>22:15</span>“Lan đang gặp nguy hiểm.”</div>
          <ul>
            <li>Không biết ai đang tới</li>
            <li>Không có nơi nào nhận đón</li>
            <li>Không có tuyến đi</li>
            <li>Không có bằng chứng</li>
          </ul>
        </div>
        <div className="lp-new">
          <h2>Guardian AI</h2>
          <figure className="lp-shot">
            <Image src="/landing/command-center.png" alt="Command center của Guardian AI: điện thoại nạn nhân, bản đồ tuyến đi tới Quán Cháo Ấm và biên bản điều phối có dấu xác nhận" width={2880} height={1800} priority sizes="(max-width: 900px) 100vw, 62vw" />
          </figure>
          <figure className="lp-minute">
            <Image src="/landing/minute.png" alt="Biên bản điều phối: Điều 1 Quán Cháo Ấm nơi đến, đã xác nhận; chị Linh tới sau 10 phút; anh Mạnh giữ máy" width={544} height={1042} sizes="240px" />
          </figure>
          <span className="lp-seal" aria-hidden="true"><b>5 người</b>1 tuyến<small>đã xác nhận</small></span>
        </div>
      </section>

      <section className="lp-night" aria-label="Bối cảnh">
        <Image src="/landing/photos/night-a.jpg" alt="Sài Gòn về đêm nhìn về phía sông và cầu Thủ Thiêm" fill sizes="100vw" />
        <div className="lp-night-copy">
          <p>22:15, Thủ Thiêm. Lan về muộn. Đường vắng, một đoạn mất đèn. Có người đi theo từ ngã ba.</p>
        </div>
        <small className="lp-credit">Ảnh: Kevin Rutherford, CC BY-SA 2.0, Wikimedia Commons</small>
      </section>

      <section className="lp-section" id="cach-hoat-dong">
        <h2>Cách hoạt động</h2>
        <ol className="lp-steps">
          {steps.map(s => <li key={s.n}><div className="lp-clause-head"><span>Điều {s.n} · {s.k}</span><em>{s.s}</em></div><b>{s.t}</b><p>{s.d}</p></li>)}
        </ol>
      </section>

      <section className="lp-section lp-split" id="bien-ban">
        <div>
          <h2>Năm lời đề nghị, một biên bản</h2>
          <p className="lp-lead">Mỗi người giúp trở thành một điều khoản. Nơi được chọn mang dấu đỏ; ai rút lại bị gạch tên, kế hoạch tự đổi sang phương án dự phòng.</p>
          <ol className="lp-offers">
            {offers.map(o => <li key={o.who} className={o.struck ? "struck" : ""}><div><b>{o.who}</b><span>{o.role}</span></div><q>{o.quote}</q></li>)}
          </ol>
        </div>
        <figure className="lp-frame">
          <Image src="/landing/map-plan.png" alt="Bản đồ: tuyến mực từ vị trí của Lan tới Q-27 Quán Cháo Ấm" width={1468} height={1384} sizes="(max-width: 900px) 100vw, 45vw" />
          <figcaption>Tuyến đi tới Q-27 Quán Cháo Ấm, 72 m.</figcaption>
        </figure>
      </section>

      <section className="lp-section lp-bad">
        <h2>Khi mọi thứ xấu đi</h2>
        <p className="lp-lead">Lan bị giật túi, tay chảy máu. AI nâng mức khẩn cấp, vẽ đường tới Khoa Cấp cứu Bến Việt (2,2 km) tránh khu vực sự cố, và đưa nút 115 lên đầu màn hình.</p>
        <div className="lp-bad-grid">
          <figure className="lp-frame"><Image src="/landing/map-attack.png" alt="Bản đồ khi bị tấn công: khu vực sự cố đỏ, tuyến tránh tới khoa cấp cứu" width={1468} height={1344} sizes="(max-width: 900px) 100vw, 55vw" /></figure>
          <figure className="lp-phone"><Image src="/landing/phone-attack.png" alt="Điện thoại của Lan: thẻ khẩn cấp với nút gọi 115 và 113" width={680} height={1344} sizes="(max-width: 900px) 70vw, 22vw" /></figure>
          <ul className="lp-rules">
            <li><Phone size={18} /><b>Không bao giờ tự gọi 113/115.</b> Ứng dụng chuẩn bị tóm tắt; người dùng tự bấm gọi.</li>
            <li><MapPin size={18} /><b>Tuyến tránh nguy hiểm.</b> Đoạn tối, vắng và khu sự cố được tính vào chi phí đường đi.</li>
            <li><ShieldCheck size={18} /><b>Có căn cứ.</b> Mỗi quyết định đi kèm câu nói của người đã hứa giúp.</li>
          </ul>
        </div>
      </section>

      <section className="lp-section lp-split" id="ho-so">
        <figure className="lp-frame lp-dossier"><Image src="/landing/dossier.png" alt="Hồ sơ bằng chứng: tóm tắt sự việc, mức khẩn cấp, vị trí cuối" width={1920} height={2400} sizes="(max-width: 900px) 100vw, 40vw" /></figure>
        <div>
          <h2>Mất liên lạc, hồ sơ vẫn tới tay người thân</h2>
          <p className="lp-lead">Khi điện thoại mất tín hiệu, Guardian niêm phong toàn bộ diễn biến, lời khai, ghi âm và vị trí cuối bằng mã SHA-256, rồi gửi đường dẫn cho người thân.</p>
          <ul className="lp-facts">
            <li><b>9 mục</b> đọc như một bản báo cáo, in được ra PDF</li>
            <li><b>Ghi âm</b> từng đoạn 10 giây, còn lại kể cả khi mất mạng</li>
            <li><b>Chuỗi băm</b> phát hiện mọi chỉnh sửa sau niêm phong</li>
          </ul>
          <Link href="/demo/command-center" className="lp-btn"><FileText size={16} /> Chạy demo để mở hồ sơ mẫu</Link>
        </div>
      </section>

      <section className="lp-close">
        <h2>Xem cả mười chặng trong hai phút.</h2>
        <p>Một nút chạy toàn bộ câu chuyện: năm cuộc gọi, ba phiên bản kế hoạch, một lần bị tấn công, một hồ sơ được gửi đi.</p>
        <Link href="/demo/command-center" className="lp-btn lp-btn-ink lp-btn-big">Chạy demo thi đấu <ArrowRight size={16} /></Link>
      </section>

      <footer className="lp-foot">
        <span>Guardian AI · dự án hackathon. Người, địa điểm và cuộc gọi trong demo là mô phỏng.</span>
        <span>Ảnh phố đêm: Wikimedia Commons (CC BY-SA 2.0). Ảnh sản phẩm chụp từ bản mô phỏng.</span>
      </footer>
    </main>
  );
}
