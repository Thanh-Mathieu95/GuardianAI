import { z } from "zod";
import type { Transcript } from "./types";

export const familyResponseSchema = z.object({
  action: z.enum(["KEEP_CONTACT", "ON_THE_WAY", "CANNOT_HELP"]).nullable(),
  arrivalMinutes: z.number().int().min(0).max(1440).nullable(),
  conditions: z.array(z.string().max(300)).max(10),
  evidenceRefs: z.array(z.string()).max(20),
  missing: z.array(z.string()).max(10),
  message: z.string().max(300).nullable().optional(),
  offer: z.string().max(200).nullable().optional(),
}).strict();
export type FamilyResponse = z.infer<typeof familyResponseSchema>;

// What GPT returns; groundFamily turns it into a FamilyResponse only if the quote is real.
export const familyAISchema = z.object({
  action: z.enum(["KEEP_CONTACT", "ON_THE_WAY", "CANNOT_HELP"]).nullable(),
  arrivalMinutes: z.number().int().min(0).max(1440).nullable(),
  conditions: z.array(z.string().max(300)).max(10),
  messageForUser: z.string().max(300).nullable(),
  offer: z.string().max(200).nullable(),
  quote: z.string().max(500),
}).strict();
export type FamilyAI = z.infer<typeof familyAISchema>;

const numberWords: [RegExp, number][] = [
  [/nửa tiếng/, 30], [/(?:một|1) tiếng/, 60],
  ...(["mười lăm:15", "hai mươi:20", "ba mươi:30", "mười:10", "một:1", "hai:2", "ba:3", "bốn:4", "năm:5", "sáu:6", "bảy:7", "tám:8", "chín:9"]
    .map(p => p.split(":")).map(([w, n]) => [new RegExp(`(?:^|\\s)${w}\\s*phút`), Number(n)] as [RegExp, number])),
];
export const minutesIn = (s: string) => {
  const digits = s.match(/(\d+)\s*phút/);
  if (digits) return Number(digits[1]) <= 1440 ? Number(digits[1]) : null;
  return numberWords.find(([r]) => r.test(s))?.[1] ?? null;
};
const latestTurn = (history: Transcript[]) => history.findLastIndex(t => t.speaker !== "Guardian AI");
const missingFor = (action: FamilyResponse["action"], minutes: number | null) =>
  !action ? ["Chưa rõ khả năng hỗ trợ; cần hỏi lại"] : action === "ON_THE_WAY" && minutes === null ? ["Chưa cung cấp thời gian đến"] : [];

/** Only the latest human turn may grant a capability. Tool arguments are not evidence. */
export function interpretFamily(history: Transcript[], memberId: string, current?: string): FamilyResponse {
  const turn = latestTurn(history);
  const text = history[turn]?.text ?? "";
  const s = text.toLocaleLowerCase("vi");
  let action: FamilyResponse["action"] = null;
  if (/không (?:thể )?(?:(?:đến|đi|tới) )?(?:giúp|đón|tới|đến được)|không (?:qua|tới|đến|đi|sang|ra) (?:đó |đấy )?được|hủy.*(?:đón|đến)|bận.*không/.test(s)) action = "CANNOT_HELP";
  else if (!/nếu|có lẽ|chưa chắc|để xem/.test(s)) {
    if (/(?:đang|sẽ|đi) (?:tới|đến|qua|đón)|(?:tôi|mình|em|anh|chị|mẹ|bố) (?:ra|đến) đón|(?:tới|đến|qua|sang|ra) (?:liền|ngay)|trên đường|chạy (?:xe )?(?:qua|tới|đến|sang)|(?:cử|nhờ|đưa) .{0,25}(?:đến|tới|ra|qua|sang)|(?:tôi|mình|em|anh|chị|mẹ|bố|con) (?:tới|đến)(?=[\s.,!]|$)|để (?:tôi|mình|em|anh|chị|mẹ|bố|con|cô|chú|dì) (?:qua|tới|đến|đón|sang)/.test(s)) action = "ON_THE_WAY";
    else if (/giữ (?:máy|liên lạc)|theo dõi|nghe máy|ở (?:trên )?đường dây/.test(s)) action = "KEEP_CONTACT";
  }
  const minutes = minutesIn(s);
  // "Ba phút." right after a pickup commitment is that pickup's ETA.
  if (!action && current === "ON_THE_WAY" && minutes !== null && !/nếu|có lẽ|chưa chắc/.test(s)) action = "ON_THE_WAY";
  const arrivalMinutes = action === "ON_THE_WAY" ? minutes : null;
  const sentences = text.split(/[.!?;,]/).map(t => t.trim()).filter(Boolean);
  const conditions = sentences.filter(t => /nhưng|chỉ có thể|với điều kiện|phải chờ|cần chờ/i.test(t)).slice(0, 10);
  const message = sentences.filter(t => /(?:^|\s)(?:bảo|dặn|nhắn|nói với)\s|đứng (?:yên|im|đó|đấy)|ở yên|đừng|cứ (?:ở|đứng|chờ|đợi)|(?:chờ|đợi) (?:chị|anh|mẹ|bố|em|con|mình|cô|chú)/i.test(t)).join(", ").slice(0, 300) || null;
  // Conditional arrival remains uncommitted until explicitly clarified.
  if (conditions.length && action === "ON_THE_WAY") action = null;
  return familyResponseSchema.parse({ action, arrivalMinutes: action === "ON_THE_WAY" ? arrivalMinutes : null,
    conditions, evidenceRefs: turn >= 0 ? [`family:${memberId}:${turn}`] : [],
    missing: missingFor(action, action === "ON_THE_WAY" ? arrivalMinutes : null), message,
  });
}

const fold = (s: string) => s.toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** GPT output counts only when its quote is verbatim in the latest family turn. */
export function groundFamily(history: Transcript[], memberId: string, ai: FamilyAI, current?: string): FamilyResponse {
  const turn = latestTurn(history);
  // A short "đúng rồi" may confirm the previous family turn, so both are valid evidence.
  const text = history.filter(t => t.speaker !== "Guardian AI").slice(-2).map(t => t.text).join(" | ");
  const quote = fold(ai.quote);
  if (turn < 0 || (ai.action || ai.messageForUser || ai.offer) && (!quote || !fold(text).includes(quote)))
    throw new Error("Trích dẫn không có trong lời người thân.");
  // The model sometimes drops a spoken number ("ba mươi phút"); the family's own words fill it in.
  const spoken = minutesIn(text.toLocaleLowerCase("vi"));
  let action = ai.action ?? (current === "ON_THE_WAY" && spoken !== null ? "ON_THE_WAY" : null);
  if (ai.conditions.length && action === "ON_THE_WAY") action = null;
  const arrivalMinutes = action !== "ON_THE_WAY" ? null
    : ai.arrivalMinutes !== null && /phút|tiếng|giờ/.test(fold(text)) ? ai.arrivalMinutes : spoken;
  return familyResponseSchema.parse({ action, arrivalMinutes, conditions: ai.conditions,
    evidenceRefs: [`family:${memberId}:${turn}`], missing: missingFor(action, arrivalMinutes),
    message: ai.messageForUser?.trim() || null,
    offer: ai.offer?.trim() || null,
  });
}
