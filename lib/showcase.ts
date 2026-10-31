import type { GuardianEngine } from "./engine";
import type { Incident, Point } from "./types";
import { randomUUID } from "node:crypto";
import { offersOf } from "./coordination";

export type ShowcaseOptions = { pace?: "PRESENTATION" | "BALANCED" | "QUICK"; voiceEnabled?: boolean };

export function acknowledgeShowcase(i: Incident, narrationId: string, playback: "FINISHED" | "UNAVAILABLE" | "SKIPPED" | "REPLAY") {
  if (i.showcase?.status !== "RUNNING" || i.showcase.narrationId !== narrationId) return false;
  // Duplicate browser callbacks must not replace an explicit skip or another outcome.
  if (playback === "SKIPPED") i.showcase.playback = "SKIPPED";
  else if (playback === "REPLAY" && i.showcase.playback !== "SKIPPED") i.showcase.playback = "PENDING";
  else if (playback !== "REPLAY" && i.showcase.playback === "PENDING") i.showcase.playback = playback;
  return true;
}

export async function waitForShowcaseStep(engine: GuardianEngine, i: Incident, generation: number) {
  for (let ticks = 0; ticks <= 130; ticks++) {
    const demo = i.showcase;
    if (!demo || demo.status !== "RUNNING" || i.generation !== generation) return false;
    if (demo.playback === "SKIPPED") return engine.delay(i, generation, 0);
    const minimumTicks = demo.pace === "QUICK" ? 8 : demo.pace === "PRESENTATION" ? 36 : 16;
    const narrationReady = !demo.voiceEnabled || demo.playback === "FINISHED" || demo.playback === "UNAVAILABLE";
    if (ticks >= minimumTicks && narrationReady) return engine.delay(i, generation, 0);
    if (ticks === 130) {
      demo.playback = "TIMED_OUT";
      engine.event(i, "Monitoring", "SHOWCASE_AUDIO_TIMEOUT", "Không nhận được tín hiệu kết thúc lời dẫn; chuyển sang phụ đề để demo không bị treo.", "WAITING", [], "SIMULATED");
      return engine.delay(i, generation, 0);
    }
    if (!(await engine.delay(i, generation))) return false;
  }
  return false;
}

/** The director supplies participant messages, never a selected destination or route.
 * Every consequence passes through the production interpreter, admission and planner,
 * and each narration is written afterwards from the resulting state.
 * No real member is created or contacted; all approvals are explicitly role-played.
 */
export async function runShowcase(engine: GuardianEngine, i: Incident, options: ShowcaseOptions = {}) {
  if (i.mode !== "SIMULATION" || !i.simulatorOnly || i.demoCase !== "SHOWCASE")
    throw new Error("Kịch bản trình diễn chỉ chạy trong mô phỏng một máy.");
  i.showcase = { status: "RUNNING", step: 0, title: "22:15 · Lan về muộn", narration: "22:15. Lan đi bộ một mình và thấy có người bám theo.", focus: [{ lat: i.location.lat, lng: i.location.lng }], narrationId: randomUUID(), playback: "PENDING", pace: options.pace ?? "BALANCED", voiceEnabled: options.voiceEnabled ?? false, startedAt: new Date().toISOString() };
  let generation = i.generation;
  const valid = () => i.showcase?.status === "RUNNING" && !["CLOSED", "USER_CANCELLED"].includes(i.status) && generation === i.generation;
  const here = (): Point => ({ lat: i.location.lat, lng: i.location.lng });
  const at = (id?: string): Point[] => i.places.filter(p => p.id === id).map(p => ({ lat: p.lat, lng: p.lng }));
  const stage = (step: number, title: string, narration: string, focus: Point[] = [here()]) => {
    if (!valid()) return false;
    Object.assign(i.showcase!, { step, title, narration, focus, narrationId: randomUUID(), playback: "PENDING" });
    i.message = narration;
    i.transcript.push({ speaker: "Guardian AI", text: narration, source: "MOCK", time: new Date().toISOString() });
    engine.event(i, "Coordinator", "SHOWCASE_STEP", `${step + 1}. ${title}: ${narration}`, "SUCCEEDED", [], "SIMULATED");
    return true;
  };
  const wait = () => waitForShowcaseStep(engine, i, generation);
  const plan = () => {
    const current = i.plans.find(p => !p.superseded);
    if (!current) throw new Error("Chưa có phương án đủ điều kiện; demo dừng để tránh giả lập kết quả.");
    return current;
  };
  const approve = () => {
    const current = plan();
    engine.event(i, "Voice", "DEMO_USER_APPROVAL", "Vai người dùng mô phỏng đồng ý với phương án vừa được giải thích.", "SUCCEEDED", [current.id], "SIMULATED");
    engine.acceptRoute(i, current.id);
  };
  const name = (id?: string) => i.places.find(p => p.id === id)?.name ?? "nơi tiếp nhận";
  const walk = async (steps: number) => {
    if (i.routeAdapter === "CITY") for (let n = 0; n < steps && valid(); n++) {
      engine.simMove(i, "step");
      if (!(await engine.delay(i, generation, 2))) return false;
    }
    return valid();
  };
  const linh = { id: "showcase-family", name: "Chị Linh (mô phỏng)" }, manh = { id: "showcase-family-2", name: "Anh Mạnh (mô phỏng)" };
  try {
    engine.event(i, "Coordinator", "SHOWCASE_STARTED", "Bắt đầu demo tự chạy; người dùng, người thân và đối tác đều là vai mô phỏng. Không gọi thành viên thật.", "WORKING", [], "SIMULATED");
    if (!(await wait()) || !valid()) return;
    await engine.sos(i, "Có người đi theo em. Em cần một chỗ chờ kín đáo, em khát, cần nước uống. Em vẫn đi được nhưng không muốn đi qua hẻm.");
    generation = i.generation;
    if (!valid()) return;
    for (const f of [linh, manh])
      i.contacts.push({ memberId: f.id, name: f.name, status: "RINGING", alertedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    // 1–2. Everyone is called at once; each proposes their own way to help.
    const calling = engine.startCalls(i, "MOCK");
    await engine.delay(i, generation, 1);
    const called = () => i.calls.flatMap(c => at(c.placeId));
    const closed = i.places.filter(p => p.openingStatus === "CLOSED").length;
    stage(1, "Gọi 5 người cùng lúc", `Lan bấm SOS. AI bỏ qua ${closed} nơi đã đóng cửa, gọi cùng lúc ${i.calls.length} điểm hỗ trợ và 2 người thân.`, [here(), ...called()]);
    await Promise.all([
      wait(),
      calling,
      (async () => {
        if (await engine.delay(i, generation, 2) && valid())
          await engine.contactTranscript(i, linh, "PARTNER", "Chị chạy xe qua đón em ngay, khoảng mười phút nữa tới. Em cứ vào chỗ nào sáng đèn ngồi chờ chị nhé.", "showcase-linh-1");
        if (await engine.delay(i, generation, 3) && valid())
          await engine.contactTranscript(i, manh, "PARTNER", "Anh ở xa, anh sẽ giữ máy và theo dõi vị trí em suốt.", "showcase-manh-1");
      })(),
    ]);
    if (!valid()) return;
    const asked = i.calls.find(c => c.transcript.some(t => t.speaker !== "Guardian AI" && /chắc được|có lẽ|chưa chắc/i.test(t.text)));
    stage(2, "Mỗi người một ý", `${offersOf(i).length} người, ${offersOf(i).length} cách giúp khác nhau.${asked ? ` ${name(asked.placeId)} nói “chắc được” nên AI hỏi lại cho rõ.` : ""}`, [here(), ...called()]);
    if (!(await wait()) || !valid()) return;

    // 3. The planner combines the ideas.
    const first = plan(), firstCall = i.calls.find(c => c.placeId === first.selectedPlaceId);
    const dropped = first.coordination?.assignments.find(a => a.role === "UNUSED" && a.ref.startsWith("call:"));
    const linhGoes = i.contacts.find(c => c.memberId === linh.id)?.status === "ON_THE_WAY";
    stage(3, "AI tổng hợp", `AI chọn ${name(first.selectedPlaceId)}, cách ${first.route.distanceMeters ?? "?"} m, ${firstCall?.support?.supportTypes.includes("STAFF_MEET") ? "có người ra đón" : "có chỗ ngồi chờ"}.${linhGoes ? " Chị Linh hẹn đón Lan ở đó." : ""}${dropped ? ` ${dropped.who} bị loại vì ${/ngõ|hẻm/.test(dropped.reason) ? "phải đi qua hẻm" : dropped.reason.split(",")[0].toLowerCase()}.` : ""}`, [here(), ...at(first.selectedPlaceId)]);
    if (!(await wait()) || !valid()) return;

    // 4. A destination the user asks for themselves is drawn, then weighed against the confirmed plan.
    i.transcript.push({ speaker: "Bạn", text: "Hay em tới đồn công an luôn được không?", source: "MOCK", time: new Date().toISOString() });
    const police = engine.directions(i, "đồn công an"), fact = police.options[0], end = police.points.at(-1)!;
    const planMeters = first.route.distanceMeters ?? 0, policeMeters = police.distanceMeters ?? 0;
    stage(4, "Hỏi đồn công an", `Lan hỏi đồn công an. AI vẽ đường: ${policeMeters} m${fact?.open ? "" : ", đang ngoài giờ hành chính"}. ${planMeters < policeMeters ? `${name(first.selectedPlaceId)} gần hơn và đã nhận Lan` : `${name(first.selectedPlaceId)} đã xác nhận nhận Lan`}, nên AI khuyên đi đó.`, [here(), end, ...at(first.selectedPlaceId)]);
    if (!(await wait()) || !valid()) return;
    approve();
    const relay = i.contacts.find(c => c.memberId === linh.id)?.lastMessage;
    stage(5, "Lên đường", `Lan lên đường.${relay ? ` AI chuyển lời chị Linh: “${relay}”` : ""}`, [here(), ...at(first.selectedPlaceId)]);
    if (!(await walk(2))) return;
    if (!(await wait()) || !valid()) return;

    // 6. A commitment changes mid-way: stop the old route, switch, tell the relative.
    const selected = i.calls.find(c => c.placeId === first.selectedPlaceId)!;
    await engine.partnerReply(i, selected, "Xin lỗi, nhân viên vừa phải đi gấp, tạm thời bên mình chưa nhận được.", name(selected.placeId) + " (mô phỏng)", selected.generation);
    if (!valid()) return;
    const second = plan();
    if (second.selectedPlaceId === first.selectedPlaceId || !first.superseded) throw new Error("Phản hồi mới chưa thay đổi quyết định như yêu cầu.");
    stage(6, "Cam kết đổi", `${name(first.selectedPlaceId)} báo nhân viên vừa đi gấp. AI dừng tuyến cũ, đổi sang ${name(second.selectedPlaceId)} và báo chị Linh đổi điểm đón.`, [here(), ...at(first.selectedPlaceId), ...at(second.selectedPlaceId)]);
    approve();
    if (!(await wait()) || !valid()) return;

    // 7. Dark road ahead → detour.
    await engine.inject(i, "ROAD_DARK");
    if (!valid()) return;
    const darkAt = plan().route.darkAt ?? i.plans.find(p => p.route.darkAt)?.route.darkAt;
    const street = i.events.filter(e => e.type === "ROAD_DARK").at(-1)?.summary.split(":")[0];
    stage(7, "Tránh đoạn tối", `${street ?? "Đoạn phía trước"} bị tối. AI vẽ đường vòng sáng hơn.`, [here(), ...(darkAt ? [darkAt] : [])]);
    approve();
    if (!(await walk(3))) return;
    if (!(await wait()) || !valid()) return;

    // 8. Attack: rules detect it instantly, then a short statement is taken for the dossier.
    engine.checkEmergency(i, "Có người giật túi em, tay em bị chém chảy máu!", "MIC", true);
    engine.recordStatement(i, "Nghi phạm", "Nam, áo khoác đen, đội mũ bảo hiểm");
    engine.recordStatement(i, "Phương tiện", "Xe máy, không thấy biển số");
    engine.recordStatement(i, "Hướng chạy", "Về phía cầu Thủ Thiêm");
    // An injury changes what the user needs: a shop cannot give first aid, so the engine drops it; show the medical option.
    await engine.replan(i, "EMERGENCY_DETECTED");
    for (let n = 0; n < 40 && engine.routing.has(i.id) && valid(); n++) await engine.delay(i, generation, 1);
    if (!valid()) return;
    const guided = i.plans.some(p => !p.superseded && p.acceptedAt);
    const er = guided ? undefined : engine.directions(i, "cấp cứu");
    stage(8, "Bị tấn công", er
      ? `Lan bị giật túi, tay chảy máu. AI bật khẩn cấp mức 4, hiện nút 115. Cửa hàng không sơ cứu được nên AI vẽ đường tới ${er.target} (${((er.distanceMeters ?? 0) / 1000).toFixed(1).replace(".", ",")} km, khá xa) và khuyên gọi 115.`
      : "Lan bị giật túi, tay chảy máu. AI bật khẩn cấp mức 4 ngay, hiện nút 115, dặn ấn chặt vết thương rồi ghi nhanh lời khai.",
      er ? [here(), er.points.at(-1)!] : [here()]);
    if (!(await wait()) || !valid()) return;

    // 9. Phone goes silent: keep the last location, alert everyone, seal and share the dossier.
    engine.simMove(i, "lost");
    await engine.contactTranscript(i, linh, "PARTNER", "Chị đang tới vị trí cuối của em, đã nhận hồ sơ rồi.", "showcase-linh-2");
    if (!valid()) return;
    const shared = i.evidenceShare;
    stage(9, "Mất liên lạc · gửi hồ sơ", `Điện thoại Lan mất tín hiệu. AI giữ lại vị trí cuối, niêm phong hồ sơ${shared ? ` (mã ${shared.hash.slice(0, 6)})` : ""} và gửi cho chị Linh, anh Mạnh để báo công an.`, [here()]);
    if (!(await wait()) || !valid()) return;
    Object.assign(i.showcase!, { title: "Hoàn tất", narration: `Hoàn tất. ${offersOf(i).length} người góp ý, ${i.plans.length} phiên bản kế hoạch, hồ sơ bằng chứng đã niêm phong và gửi đi.`, narrationId: randomUUID(), playback: "PENDING", status: "COMPLETED", completedAt: new Date().toISOString() });
    engine.event(i, "Coordinator", "SHOWCASE_COMPLETED", i.showcase!.narration, "SUCCEEDED", [], "SIMULATED");
  } catch (error) {
    if (!valid()) return;
    Object.assign(i.showcase!, { status: "FAILED", error: error instanceof Error ? error.message : "Demo bị gián đoạn" });
    engine.invalidatePlan(i, "Demo đã dừng do lỗi; không tiếp tục hướng dẫn.");
    engine.event(i, "Monitoring", "SHOWCASE_FAILED", i.showcase!.error!, "FAILED", [], "SIMULATED");
  }
}
