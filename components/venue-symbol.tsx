// One stroke-based symbol set shared by React detail cards and native map markers.
export const venuePaths = [
  ["M3 10h18l-2-6H5z", "M5 10v10h14V10", "M9 20v-6h6v6"],
  ["M4 21V3h16v18", "M8 7h1m6 0h1M8 11h1m6 0h1", "M9 21v-6h6v6"],
  ["m8 16 8-8", "M7 18a5 5 0 0 1-1-8l4-4a5 5 0 0 1 8 6l-6 6a5 5 0 0 1-5 0"],
  [
    "M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z",
    "M16 9h2a3 3 0 0 1 0 6h-2",
    "M7 3v2m5-2v2",
  ],
  ["M5 3v7m3-7v7M3 6h7M6 10v11", "M17 3v18m0-18c-4 3-4 8 0 8"],
  ["M5 21V4h10v17M3 21h14M5 9h10", "M15 7h3l3 4v7a2 2 0 0 1-4 0v-5"],
  ["m3 8 9-5 9 5H3", "M5 10v8m7-8v8m7-8v8M3 21h18"],
  ["M3 4h3l3 12h10l2-8H7", "M10 21h.01M18 21h.01"],
  ["m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z", "M9 11h6m-3-3v6"],
  [
    "M5 3v6a5 5 0 0 0 10 0V3",
    "M3 3h4m6 0h4",
    "M10 14v3a4 4 0 0 0 8 0v-3",
    "M18 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  ],
  ["M4 21V3h16v18M9 21v-5h6v5", "M9 8h6m-3-3v6"],
  ["m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z", "m8 12 3 3 5-6"],
];
export function VenueSymbol({
  kind,
  size = 20,
}: {
  kind: number;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(venuePaths[kind] || venuePaths[0]).map((d, n) => (
        <path d={d} key={n} />
      ))}
    </svg>
  );
}
