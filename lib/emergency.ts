// Instant emergency detection from what the user says or types, before (and independent of) the LLM.
// Rules run on diacritic-free text so "bi dam" and "bị đâm" both match.
export type EmergencyHit = { kind: string; label: string; medical: boolean; critical: boolean };

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ");

// Order matters: the first matching rule names the emergency.
const rules: (EmergencyHit & { re: RegExp })[] = [
  { kind: "STABBED", label: "Bị đâm / chém", medical: true, critical: true, re: /\b(bi|vua bi|no) (dam|chem)\b|\bdam (toi|tao|minh|em|anh|chi)\b|\bstabbed\b/ },
  { kind: "SHOT", label: "Bị bắn", medical: true, critical: true, re: /\bbi ban\b|\bban (toi|tao|minh)\b|\bshot\b/ },
  { kind: "BLEEDING", label: "Đang chảy máu / bị thương", medical: true, critical: true, re: /\bchay mau\b|\bmau chay\b|\bbi thuong (nang|nhieu)?\b|\bbleeding\b/ },
  { kind: "UNCONSCIOUS", label: "Ngất / khó thở", medical: true, critical: true, re: /\b(ngat|bat tinh|khong tho duoc|kho tho qua)\b/ },
  { kind: "SEXUAL", label: "Xâm hại", medical: false, critical: true, re: /\b(hiep dam|xam hai|cuong hiep|sam so)\b/ },
  { kind: "ABDUCTION", label: "Bắt cóc / bị kéo đi", medical: false, critical: true, re: /\bbat coc\b|\bkeo (toi|minh|em)? ?len xe\b|\bbi (bat|loi|keo) di\b|\bnhot toi\b/ },
  { kind: "WEAPON", label: "Bị đe dọa bằng vũ khí", medical: false, critical: true, re: /\b(cam|co|rut|chia|dung) (dao|sung|kiem|my)\b|\bdao keo\b|\b(knife|gun)\b/ },
  { kind: "ASSAULT", label: "Bị tấn công / đánh", medical: false, critical: true, re: /\bbi (tan cong|danh|hanh hung|dap|bop co)\b|\b(tan cong|danh|dap) (toi|tao|minh|em)\b|\battacked\b/ },
  { kind: "ROBBERY", label: "Bị cướp / giật đồ", medical: false, critical: false, re: /\bbi (cuop|giat)\b|\b(cuop|giat) (do|tui|dien thoai|xe)\b|\ban cuop\b|\brobbed\b/ },
  { kind: "THREAT", label: "Bị đe dọa / bám theo", medical: false, critical: false, re: /\b(doa giet|de doa|bam theo|theo doi) (toi|minh|em)?\b/ },
  { kind: "CRY", label: "Kêu cứu", medical: false, critical: false, re: /\b(cuu (toi|em|voi|minh)|cuu cuu|help me)\b/ },
];
// "nếu bị đâm thì sao", "lỡ bị cướp", "trong phim" — talk about danger, not danger.
const hypothetical = /\b(neu|gia su|lo nhu|nhu the nao|lam sao de|phim|truyen|tro choi|vi du|doc bao|nghe noi|hoi thu|thu xem|what if|suppose|hypothetically|in a movie|in a game)\b/;
const negated = /\b(?:(khong|chua|dau co|chang) (bi |co )?|(?:not|never|isn't|wasn't|aren't|weren't) (?:being |been |getting )?)$/;

export function classifyEmergency(text: string): EmergencyHit | null {
  const t = fold(text);
  if (hypothetical.test(t)) return null;
  if (/\b(?:being followed|following me|threatening me)\b/.test(t) && !/\b(?:not|isn't|aren't) (?:being |following |threatening )/.test(t))
    return { kind: "THREAT", label: "Bị đe dọa / bám theo", medical: false, critical: false };
  if (/\b(?:cannot breathe|can't breathe|unconscious)\b/.test(t))
    return { kind: "UNCONSCIOUS", label: "Ngất / khó thở", medical: true, critical: true };
  for (const { re, ...hit } of rules) {
    const m = re.exec(t);
    if (m && !negated.test(t.slice(Math.max(0, m.index - 12), m.index))) return hit;
  }
  return null;
}
