import { z } from "zod";
import type { Call, Incident, Offer, Route, Transcript } from "./types";

// Offline reader: sentences of the latest helper turn that say what they will do.
export function offerFrom(ref: string, transcript: Transcript[]): Offer | undefined {
  const turn = transcript.findLastIndex(t => !["Guardian AI", "Hệ thống"].includes(t.speaker));
  const parts = (transcript[turn]?.text ?? "").split(/[.!?;]/).map(t => t.trim()).filter(t =>
    /(?:^|\s)(?:sẽ|có thể|cho|ra đón|đưa|gọi|đón|chở|đi cùng|báo|giữ|để|chạy)(?:\s|$)/i.test(t) &&
    !/không (?:thể|được)|từ chối|chưa (?:nhận|thể)/i.test(t));
  if (!parts.length) return undefined;
  const text = parts.slice(0, 2).join(". ").slice(0, 200);
  return { text, quote: text, evidenceRef: `${ref}:${turn}`, source: "RULES" };
}

export const needsSchema = z
  .object({
    communication: z.enum(["PUBLIC", "DISCREET"]).nullable(),
    canMove: z.boolean().nullable(),
    maxWalkMeters: z.number().int().min(0).max(20000).nullable(),
    refusals: z.array(z.string().trim().min(1).max(150)).max(10),
  })
  .strict();
export type Needs = z.infer<typeof needsSchema>;
export const emptyNeeds = (): Needs => ({
  communication: null,
  canMove: null,
  maxWalkMeters: null,
  refusals: [],
});
// Recognize only explicit statements. No inference from location, urgency, scenario or model confidence.
export function statedNeeds(
  text: string,
  previous: Needs = emptyNeeds(),
): Needs {
  const needs = structuredClone(previous);
  if (/nếu|giả sử|ví dụ|có lẽ/i.test(text)) return needs;
  const s = text
    .toLocaleLowerCase("vi")
    .split(/[.!?;]/)
    .filter((part) => /(?:^|[,،])\s*(?:chân )?(tôi|mình|em|tớ)\s/.test(part))
    .join(". ");
  if (!s) return needs;
  if (
    !/không cần (?:tương tác )?kín đáo/.test(s) &&
    /không thể nói|nói nhỏ|đừng gọi to|cần (?:tương tác )?kín đáo|không (?:thể )?nói công khai/.test(
      s,
    )
  )
    needs.communication = "DISCREET";
  else if (/có thể nói công khai/.test(s)) needs.communication = "PUBLIC";
  if (
    /không thể (?:tiếp tục )?di chuyển|không thể đi bộ|tôi không đi được/.test(
      s,
    )
  )
    needs.canMove = false;
  else if (/có thể tiếp tục di chuyển|tôi vẫn đi được/.test(s))
    needs.canMove = true;
  const bound = s.match(
    /(?:đi bộ|đi được|đi)\s*(?:tối đa|không quá|chỉ được|chỉ đi nổi|nổi)\s*(\d+)\s*(km|mét|m)(?:\s|[,.;]|$)/,
  );
  if (bound) {
    const meters = Number(bound[1]) * (bound[2] === "km" ? 1000 : 1);
    if (meters <= 20000) needs.maxWalkMeters = meters;
  }
  const alley = s.match(/(?:không (?:muốn )?(?:đi )?(?:vào|qua)|đừng (?:dẫn (?:tôi|mình|em|tớ) )?qua) (?:ngõ|hẻm)/);
  const home = s.match(/không (?:muốn )?về thẳng nhà/);
  needs.refusals = [
    ...new Set([
      ...needs.refusals,
      ...[alley ? "Không đi qua ngõ hoặc hẻm" : undefined, home?.[0]].filter((v): v is string => !!v),
    ]),
  ].slice(0, 10);
  return needsSchema.parse(needs);
}
export const supportSchema = z
  .object({
    decision: z.enum([
      "UNKNOWN",
      "CLARIFY",
      "ACCEPTED",
      "DECLINED",
      "EXPIRED",
      "REVOKED",
    ]),
    supportTypes: z
      .array(z.enum(["WAITING_SPACE", "STAFF_MEET", "CONTACT_FAMILY"]))
      .max(3),
    entrance: z.string().max(200).nullable(),
    conditions: z.array(z.string().max(200)).max(10),
    validUntil: z.string().datetime().nullable(),
    discreet: z.boolean().nullable(),
    requiresMovement: z.boolean().nullable(),
    viaAlley: z.boolean().nullable(),
    missing: z.array(z.string().max(200)).max(15),
    updatedAt: z.string().datetime(),
    evidenceRefs: z.array(z.string().max(200)).max(30),
  })
  .strict();
export type Support = z.infer<typeof supportSchema>;
export function supportSignature(r: Support | undefined) {
  if (!r) return "unknown";
  const { updatedAt: _updatedAt, evidenceRefs: _evidenceRefs, ...facts } = r;
  return JSON.stringify(facts);
}
export const factsSchema = z
  .object({
    facts: z
      .array(
        z
          .object({
            field: z.enum([
              "ACCEPTED",
              "DECLINED",
              "REVOKED",
              "WAITING_SPACE",
              "STAFF_MEET",
              "CONTACT_FAMILY",
              "ENTRANCE",
              "CONDITION",
              "OFFER",
            ]),
            value: z.string().max(200),
            quote: z.string().min(1).max(500),
            turn: z.number().int().min(0).max(100),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
// Strings must be verbatim partner evidence. Explicit decision words are checked again by the backend.
export function groundedSupport(call: Call, output: unknown): Support {
  const r = extractSupport(call),
    data = factsSchema.parse(output);
  const latestTurn = call.transcript.findLastIndex(
    (t) => !["Guardian AI", "Hệ thống"].includes(t.speaker),
  );
  for (const fact of data.facts) {
    const t = call.transcript[fact.turn];
    if (
      !t ||
      ["Guardian AI", "Hệ thống"].includes(t.speaker) ||
      !t.text.includes(fact.quote)
    )
      throw new Error("Bằng chứng không thuộc phản hồi đối tác");
    if (fact.turn !== latestTurn || fact.field === "OFFER") continue;
    if (r.decision === "REVOKED" || r.decision === "DECLINED") continue;
    if (
      /chắc|có lẽ|để xem|xem xét|có thể|tùy|tuỳ|nếu|không|chưa/.test(fact.quote.toLowerCase()) &&
      !["ENTRANCE", "CONDITION"].includes(fact.field)
    )
      continue;
    if (
      fact.field === "ACCEPTED" &&
      /đồng ý|xác nhận|sẵn sàng tiếp nhận|cứ vào|cứ đến|được,/.test(
        fact.quote.toLowerCase(),
      )
    )
      r.decision = "ACCEPTED";
    if (
      ["WAITING_SPACE", "STAFF_MEET", "CONTACT_FAMILY"].includes(fact.field)
    ) {
      const patterns = {
        WAITING_SPACE: /chờ|ngồi|sảnh/,
        STAFF_MEET: /đón|gặp.*nhân viên/,
        CONTACT_FAMILY: /liên hệ.*người thân|gọi.*gia đình/,
      };
      if (
        patterns[fact.field as keyof typeof patterns].test(
          fact.quote.toLowerCase(),
        )
      )
        r.supportTypes = [
          ...new Set([
            ...r.supportTypes,
            fact.field as Support["supportTypes"][number],
          ]),
        ];
    }
    if (["ENTRANCE", "CONDITION"].includes(fact.field)) {
      if (!fact.value || !fact.quote.includes(fact.value))
        throw new Error("Giá trị trích xuất không có trong bằng chứng");
      if (
        fact.field === "ENTRANCE" &&
        !/cửa|sảnh|quầy|điểm gặp|cổng/i.test(fact.quote)
      )
        continue;
      if (
        fact.field === "CONDITION" &&
        !/điều kiện|yêu cầu|chỉ nhận|cần |không cần/i.test(fact.quote)
      )
        continue;
      if (fact.field === "ENTRANCE") r.entrance = fact.value;
      else r.conditions = [fact.value];
    }
    r.evidenceRefs = [
      ...new Set([...r.evidenceRefs, `${call.id}:${fact.turn}`]),
    ];
  }
  settleDecision(r);
  return supportSchema.parse(r);
}
// A clear consent is enough to plan: entrance and conditions are recorded when given, never chased.
function settleDecision(r: Support) {
  if (r.decision !== "ACCEPTED" && r.decision !== "CLARIFY") return;
  r.missing = r.decision === "ACCEPTED" ? [] : ["Cần quyết định đồng ý rõ ràng"];
  if (r.decision === "ACCEPTED" && !r.supportTypes.length) r.supportTypes = ["WAITING_SPACE"];
}
export const emptySupport = (): Support => ({
  decision: "UNKNOWN",
  supportTypes: [],
  entrance: null,
  conditions: [],
  validUntil: null,
  discreet: null,
  requiresMovement: null,
  viaAlley: null,
  missing: [],
  updatedAt: new Date().toISOString(),
  evidenceRefs: [],
});

// Conservative offline extractor. Unknown language stays unknown; no model confidence gates admission.
// Only partner utterances are input. Later utterances supersede facts they explicitly update.
export function extractSupport(call: Call): Support {
  const r = emptySupport();
  call.transcript.forEach((t, index) => {
    if (["Guardian AI", "Hệ thống"].includes(t.speaker)) return;
    const s = t.text.toLocaleLowerCase("vi");
    r.evidenceRefs.push(`${call.id}:${index}`);
    if (/rút lại|thu hồi|không còn tiếp nhận/.test(s)) r.decision = "REVOKED";
    else if (/không thể tiếp nhận|không tiếp nhận được|từ chối|(?:tạm thời )?(?:chưa|không) (?:thể )?nhận được|bảo vệ chưa|không còn người trực/.test(s))
      r.decision = "DECLINED";
    else if (/chắc được|có lẽ|có thể được|để xem|chưa chắc|\bnếu\b|chờ.*quản lý/.test(s))
      r.decision = "CLARIFY";
    else if (/đồng ý tiếp nhận|xác nhận tiếp nhận|cho .*vào chờ/.test(s))
      r.decision = "ACCEPTED";
    // A new uncertain update suspends an earlier commitment immediately.
    else if (/chưa biết|chưa rõ|đợi.*(?:bảo vệ|xác nhận)|cần.*phê duyệt/.test(s)) r.decision = "CLARIFY";
    if (/chỗ chờ|vào chờ|chỗ ngồi chờ/.test(s))
      r.supportTypes = [
        ...new Set([...r.supportTypes, "WAITING_SPACE" as const]),
      ];
    if (/(?:nhân viên|bảo vệ|lễ tân)[^.]{0,30}đón/.test(s))
      r.supportTypes = [...new Set([...r.supportTypes, "STAFF_MEET" as const])];
    if (/hỗ trợ liên hệ người thân/.test(s))
      r.supportTypes = [
        ...new Set([...r.supportTypes, "CONTACT_FAMILY" as const]),
      ];
    const entrance = t.text.match(
      /(?:điểm gặp|cửa vào)\s*:\s*([^.;\n]+)/i,
    )?.[1];
    if (entrance) r.entrance = entrance.trim();
    else if (/cửa sau/.test(s)) r.entrance = "cửa sau";
    else if (/cửa chính/.test(s)) r.entrance = "cửa chính";
    if (/nói nhỏ|giữ kín|trao đổi kín đáo/.test(s)) r.discreet = true;
    if (/không (?:đi )?qua (?:ngõ|hẻm)/.test(s)) r.viaAlley = false;
    if (/không (?:có )?(?:yêu cầu|điều kiện) (?:gì )?thêm/.test(s)) r.conditions = ["không yêu cầu thêm"];
    if (/tương tác kín đáo: có/.test(s)) r.discreet = true;
    if (/tương tác kín đáo: không/.test(s)) r.discreet = false;
    if (/cần di chuyển: có/.test(s)) r.requiresMovement = true;
    if (/cần di chuyển: không/.test(s)) r.requiresMovement = false;
    if (/qua ngõ: không/.test(s)) r.viaAlley = false;
    else if (/qua ngõ: có/.test(s)) r.viaAlley = true;
    const condition = t.text.match(/điều kiện:\s*([^.;\n]+)/i)?.[1];
    if (condition) r.conditions = [condition.trim()];
    else if (/(?:nhưng phải|với điều kiện|cần xuất trình|chỉ nhận khi)/.test(s)) {
      r.conditions = [t.text.slice(0, 200)];
      r.decision = "CLARIFY";
    }
    const minutes = s.match(/(?:còn|trong)\s+(\d+)\s*phút/);
    if (minutes)
      r.validUntil = new Date(
        Date.parse(t.time) + Number(minutes[1]) * 60000,
      ).toISOString();
    r.updatedAt = t.time;
  });
  settleDecision(r);
  return supportSchema.parse(r);
}

export function checkSupport(
  r: Support | undefined,
  needs: Needs,
  route?: Route,
  at = Date.now(),
): string[] {
  if (!r) return ["Chưa có kết quả hội thoại có cấu trúc"];
  const failed: string[] = [];
  if (r.decision !== "ACCEPTED") failed.push(`Quyết định: ${r.decision}`);
  failed.push(...r.missing);
  if (!r.supportTypes.length || !r.evidenceRefs.length)
    failed.push("Thiếu dữ kiện tiếp nhận/bằng chứng");
  if (!r.supportTypes.some((t) => t === "WAITING_SPACE" || t === "STAFF_MEET"))
    failed.push(
      "Chưa xác nhận chỗ chờ hoặc nhân viên đón để lập kế hoạch tiếp nhận",
    );
  if (r.validUntil && Date.parse(r.validUntil) <= at)
    failed.push("Đã hết thời hạn tiếp nhận");
  for (const condition of r.conditions) {
    // Unknown conditions fail closed. A model cannot assert the user meets them.
    if (!/^(?:không (?:có )?(?:yêu cầu|điều kiện) (?:gì )?thêm|không cần thủ tục|không|không có|chỉ còn \d+ phút)$/i.test(condition.trim()))
      failed.push(`Điều kiện chưa được xác minh: ${condition}`);
  }
  if (needs.communication === "DISCREET" && r.discreet !== true)
    failed.push("Chưa xác nhận tương tác kín đáo");
  if (
    needs.canMove === false &&
    (r.requiresMovement !== false || !r.supportTypes.includes("STAFF_MEET"))
  )
    failed.push(
      "Người dùng không thể di chuyển; cần nhân viên đến đón tại vị trí hiện tại",
    );
  for (const refusal of needs.refusals) {
    if (/ngõ/i.test(refusal) && r.viaAlley !== false)
      failed.push("Chưa xác nhận không qua ngõ");
    else if (/nhà/i.test(refusal)) {
      /* Partner waiting space is not a route home. */
    } else if (!/ngõ/i.test(refusal))
      failed.push(`Giới hạn cần kiểm tra thủ công: ${refusal}`);
  }
  if (route) {
    if (
      needs.maxWalkMeters !== null &&
      (route.distanceMeters === undefined ||
        route.distanceMeters > needs.maxWalkMeters)
    )
      failed.push("Quãng đi bộ vượt giới hạn hoặc chưa có dữ liệu định tuyến");
    if (
      r.validUntil &&
      (route.sourceKind !== "LIVE" ||
        route.durationSeconds === undefined ||
        at + route.durationSeconds * 1000 >= Date.parse(r.validUntil))
    )
      failed.push("Chưa có ETA đáng tin cậy để kiểm tra thời hạn");
  }
  return [...new Set(failed)];
}

export const demoCases = [
  "SHOWCASE",
  "BASIC",
  "CLARIFY",
  "CONSTRAINT",
  "TWO_OPTIONS",
  "CHANGE",
  "NONE",
  "MODEL_FAILURE",
  "CANCEL",
  "FAMILY",
  "HANDOFF",
] as const;
export type DemoCase = (typeof demoCases)[number];
export const demoLabels: Record<DemoCase, string> = {
  SHOWCASE: "★ Demo thi đấu · Phối hợp thích ứng",
  BASIC: "1 · Từ chối / đồng ý / im lặng",
  CLARIFY: "2 · Mơ hồ rồi hỏi lại",
  CONSTRAINT: "3 · Nơi gần không phù hợp",
  TWO_OPTIONS: "4 · Hai nơi, hai điều kiện",
  CHANGE: "5 · Đổi cửa / thu hồi",
  NONE: "6 · Không nơi nào đủ điều kiện",
  MODEL_FAILURE: "7 · Model lỗi → dự phòng",
  CANCEL: "8 · Hủy khi đang chạy",
  FAMILY: "9 · Người thân đổi khả năng",
  HANDOFF: "10 · Bàn giao hai chiều",
};
export type PartnerProfile = {
  natural?: boolean;
  // Showcase persona: each lane proposes a different kind of help in natural speech.
  persona?: "ALLEY" | "ASK_MANAGER" | "GUARD";
  support: "DECLINE" | "SILENT" | "ACCEPT";
  entrance: string;
  discreet: boolean;
  alley: boolean;
  style: "CLEAR" | "VAGUE";
  condition: string;
  windowMinutes: number | null;
};
// Server-only profiles. Never attach these to Incident, SSE, planner context or contact-agent prompts.
export function partnerProfile(
  scenario: DemoCase,
  index: number,
  allUnavailable = false,
): PartnerProfile {
  const p: PartnerProfile = {
    support: index === 0 ? "DECLINE" : index === 1 ? "ACCEPT" : "SILENT",
    entrance: "cửa chính",
    discreet: true,
    alley: false,
    style: "CLEAR",
    condition: "không yêu cầu thêm",
    windowMinutes: null,
  };
  if (["CLARIFY", "CONSTRAINT", "TWO_OPTIONS", "CHANGE"].includes(scenario))
    p.support = index < 2 ? "ACCEPT" : "SILENT";
  if (scenario === "CLARIFY") p.style = "VAGUE";
  if (scenario === "SHOWCASE") {
    p.natural = true;
    p.support = "ACCEPT";
    p.persona = (["ALLEY", "ASK_MANAGER", "GUARD"] as const)[index % 3];
    if (index % 3 === 0) { p.alley = true; p.discreet = false; p.entrance = "cửa sau qua hẻm"; }
    if (index % 3 === 1) p.style = "VAGUE";
  }
  if (scenario === "CONSTRAINT" && index === 0) {
    p.alley = true;
    p.entrance = "cửa sau qua ngõ";
    p.discreet = false;
  }
  if (scenario === "TWO_OPTIONS" && index === 0) {
    p.windowMinutes = 5;
    p.condition = "chỉ còn 5 phút";
  }
  if (scenario === "NONE" || allUnavailable)
    p.support = index === 2 ? "SILENT" : "DECLINE";
  return p;
}
export function scriptedReply(p: PartnerProfile, turn: number): string | null {
  if (p.support === "SILENT") return null;
  if (p.support === "DECLINE") return "Xin lỗi, chúng tôi không thể tiếp nhận.";
  if (p.persona === "ALLEY")
    return [
      "Được bạn ơi, bên mình đồng ý tiếp nhận. Cửa chính khóa rồi, bạn ấy vào cửa sau qua hẻm nhỏ, bên mình cho ngồi chờ trong đó.",
      "Không có lối khác đâu bạn, giờ này chỉ mở cửa sau trong hẻm thôi.",
    ][turn] ?? null;
  if (p.persona === "ASK_MANAGER")
    return turn === 0
      ? "Chắc được, nhưng để mình hỏi quản lý đã nhé."
      : "Quản lý đồng ý tiếp nhận rồi. Bên mình cho bạn ấy vào sảnh, có chỗ ngồi chờ và nước uống. Nhân viên sẽ nói nhỏ, giữ kín. Vào cửa chính, không đi qua hẻm.";
  if (p.persona === "GUARD")
    return "Được, bên mình đồng ý tiếp nhận. Mình cho nhân viên ra tận đầu đường đón bạn ấy rồi đưa vào cửa chính, có chỗ ngồi chờ và sạc điện thoại. Nhân viên sẽ nói nhỏ, giữ kín. Không đi qua hẻm.";
  if (p.style === "VAGUE" && turn === 0)
    return "Chắc được, chỉ nhận ở cửa sau.";
  if (p.natural)
    return `Được bạn nhé, bên mình đồng ý tiếp nhận. Có chỗ ngồi chờ và nhân viên ra đón ở ${p.entrance}. Không có yêu cầu gì thêm. ${p.discreet ? "Bên mình sẽ nói nhỏ và giữ kín." : "Tương tác kín đáo: không."} Cần di chuyển: có. ${p.alley ? "Qua ngõ: có." : "Không đi qua ngõ."}`;
  return `Chúng tôi đồng ý tiếp nhận, có chỗ chờ và nhân viên đón. Cửa vào: ${p.entrance}. Điều kiện: ${p.condition}. Tương tác kín đáo: ${p.discreet ? "có" : "không"}. Cần di chuyển: có. Qua ngõ: ${p.alley ? "có" : "không"}.${p.windowMinutes ? ` Chỉ còn ${p.windowMinutes} phút.` : ""}`;
}
export function latestSupport(i: Incident, placeId: string) {
  return i.calls.filter((c) => c.placeId === placeId).at(-1)?.support;
}

/** Ask only the next useful question, without making people fill out a form aloud. */
export function clarificationQuestion(r?: Support, checks: string[] = []): string {
  if (!r || r.decision === "UNKNOWN" || r.decision === "CLARIFY")
    return "Mình cần xác nhận một chút: bên bạn đã sẵn sàng nhận người ngay lúc này, hay vẫn cần chờ ai về?";
  if (!r.entrance) return "Bạn ấy nên vào cửa nào, và sẽ gặp ai ở đó?";
  if (!r.supportTypes.length) return "Bên bạn có chỗ cho bạn ấy ngồi chờ, hay có nhân viên ra đón được không?";
  if (checks.some(c => c.includes("kín đáo"))) return "Bạn ấy cần kín đáo. Mình có thể nhờ bên bạn nói nhỏ và đón nhẹ nhàng được không?";
  if (checks.some(c => c.includes("ngõ"))) return "Có lối vào nào không phải qua ngõ hoặc hẻm không?";
  if (checks.some(c => c.includes("di chuyển"))) return "Bạn ấy chưa đi tiếp được. Có nhân viên nào đến chỗ bạn ấy được không?";
  return "Ngoài việc đến gặp nhân viên, bạn ấy có cần chuẩn bị gì không? Bên bạn nhận được đến lúc nào?";
}
