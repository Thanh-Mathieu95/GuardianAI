"use client";
import Link from "next/link";
import {
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  Check,
  MapPin,
  Phone,
  Users,
  FileCheck2,
} from "lucide-react";
import { LanguageSwitch, useLanguage } from "./language";
export function Header() {
  const { t } = useLanguage();
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <ShieldCheck size={24} />
        Guardian AI
      </Link>
      <nav>
        <Link href="/demo">{t("Xem demo", "Demo")}</Link>
        <Link href="/walk">{t("Đồng hành", "Companion")}</Link>
      </nav>
      <LanguageSwitch />
    </header>
  );
}
export default function Home() {
  const { t } = useLanguage();
  return (
    <main className="home">
      <Header />
      <section className="hero">
        <div className="hero-title">
          <h1>
            {t("Đường về muộn.", "A late walk home.")}
            <br />
            <span>{t("Có người cùng bạn.", "Someone by your side.")}</span>
          </h1>
          <p>
            {t(
              "Khi thấy bất an, bạn cần biết ai có thể giúp và nên làm gì tiếp theo. Guardian kết nối người thân, xác minh lời đề nghị hỗ trợ và cùng bạn chọn một bước rõ ràng.",
              "When you feel uneasy, you need to know who can help and what to do next. Guardian connects trusted people, verifies their offers and helps you choose a clear next step.",
            )}
          </p>
          <div className="actions">
            <Link className="button primary" href="/demo">
              {t("Chạy tình huống mô phỏng", "Run the simulation")}
              <ArrowRight size={18} />
            </Link>
            <Link className="button" href="/walk">
              {t("Mở app đồng hành", "Open companion")}
              <ArrowUpRight size={18} />
            </Link>
          </div>
          <small>
            {t(
              "Không cần đăng nhập hay micro để xem demo.",
              "No sign-in or microphone needed for the demo.",
            )}
          </small>
        </div>
        <div className="hero-record">
          <div className="record-top">
            <span>22:15 · Thủ Thiêm</span>
            <span className="source">{t("MÔ PHỎNG", "SIMULATED")}</span>
          </div>
          <div className="hero-request">
            <p>
              {t(
                "“Có người đi theo tôi. Tôi cần một chỗ có người để chờ.”",
                "“Someone is following me. I need a staffed place to wait.”",
              )}
            </p>
            <span>{t("Một lời cầu cứu", "One request for help")}</span>
          </div>
          <div className="record-entry">
            <div className="person-icon">
              <Users size={20} />
            </div>
            <div>
              <b>Linh</b>
              <p>
                {t(
                  "“Chị đang đến, khoảng 10 phút.”",
                  "“I’m on my way, about 10 minutes.”",
                )}
              </p>
              <small>
                {t(
                  "Thời gian do người thân tự báo",
                  "Arrival time reported by the contact",
                )}
              </small>
            </div>
          </div>
          <div className="record-entry">
            <div className="person-icon">
              <MapPin size={20} />
            </div>
            <div>
              <b>Café Đèn Vàng</b>
              <p>
                {t(
                  "“Đồng ý. Có nhân viên ở cửa chính.”",
                  "“Yes. A staff member is at the main entrance.”",
                )}
              </p>
              <small>
                {t(
                  "Lời đồng ý có trích dẫn gốc",
                  "A commitment with an original quote",
                )}
              </small>
            </div>
            <Check className="confirmed" size={22} />
          </div>
          <div className="record-result">
            <ShieldCheck size={24} />
            <div>
              <b>
                {t(
                  "Một nơi đến. Một phương án để bạn chọn.",
                  "One destination. A plan you choose.",
                )}
              </b>
              <p>
                {t(
                  "Cam kết thay đổi → phương án được kiểm tra lại.",
                  "Commitment changes → the plan is checked again.",
                )}
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="home-mechanism">
        <h2>
          {t(
            "Sự an tâm cần những việc cụ thể.",
            "Reassurance needs concrete actions.",
          )}
        </h2>
        <div className="mechanism-row">
          {[
            [
              Users,
              t("Có người biết bạn đang đi đâu", "Someone knows where you are"),
              t(
                "Mời người tin tưởng. Chia sẻ vị trí và hẹn giờ kiểm tra khi tới nơi.",
                "Invite someone you trust. Share your location and set an arrival check-in.",
              ),
            ],
            [
              MapPin,
              t(
                "Không dẫn tới một lời hứa mơ hồ",
                "No destination based on a vague promise",
              ),
              t(
                "Nghe máy chưa có nghĩa là nhận giúp. Guardian kiểm tra lời đồng ý và nhu cầu của bạn.",
                "Answering is not acceptance. Guardian checks the actual commitment against your needs.",
              ),
            ],
            [
              FileCheck2,
              t("Diễn biến được giữ lại", "Keep a record of what happened"),
              t(
                "Lời nói gốc, phiên bản phương án và vị trí nằm trong hồ sơ có thể kiểm tra toàn vẹn.",
                "Original statements, plan revisions and locations form an integrity-verifiable record.",
              ),
            ],
          ].map(([Icon, title, description], n) => {
            const I = Icon as typeof Users;
            return (
              <article key={n}>
                <I size={23} />
                <h3>{String(title)}</h3>
                <p>{String(description)}</p>
              </article>
            );
          })}
        </div>
      </section>
      <section className="home-honesty">
        <div>
          <h2>
            {t(
              "Hỗ trợ thật bắt đầu từ thông tin thật.",
              "Meaningful support starts with honest information.",
            )}
          </h2>
          <p>
            {t(
              "Demo dùng vai và địa điểm mô phỏng, chạy qua engine thật. Phiên thiết bị chỉ báo tới người đã đồng ý tham gia. Đây là bản thử nghiệm hỗ trợ phối hợp, không bảo đảm an toàn và không thay thế cứu hộ.",
              "The demo uses simulated people and places with a real decision engine. Device trials alert only people who agreed to join. This is an experimental coordination tool, not a safety guarantee or emergency service.",
            )}
          </p>
        </div>
        <div className="honesty-list">
          <p>
            <Phone size={19} />
            {t(
              "Bạn tự chọn gọi 113/115 tại Việt Nam.",
              "You choose whether to dial 113/115 in Vietnam.",
            )}
          </p>
          <p>
            <Check size={19} />
            {t(
              "Giữ trang mở; chưa có chuông khi khóa màn hình.",
              "Keep the page open; no ringing on a locked phone.",
            )}
          </p>
          <p>
            <ShieldCheck size={19} />
            {t(
              "AI chỉ kết nối khi bạn đồng ý.",
              "AI connects only with your consent.",
            )}
          </p>
        </div>
      </section>
      <footer className="site-footer">
        <b>Guardian AI</b>
        <span>
          {t(
            "Bản xây mới · Tiếng Việt / English",
            "New build · Tiếng Việt / English",
          )}
        </span>
        <Link href="/demo">
          {t("Tự trải nghiệm", "Explore it yourself")}
          <ArrowUpRight size={15} />
        </Link>
      </footer>
    </main>
  );
}
