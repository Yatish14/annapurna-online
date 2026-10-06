/** The lotus logo (48×48 viewBox): shared by <Lotus> and the counter QR code */
export const LOTUS_SHAPES: { d: string; opacity?: number; line?: true }[] = [
  { d: "M24 8c4 4.5 6 9 6 13.5 0 4-2.2 7.6-6 10.5-3.8-2.9-6-6.5-6-10.5C18 17 20 12.5 24 8z" },
  {
    d: "M10 17c5 .3 9 2.2 11.5 5.6 2 2.8 2.6 6 2.5 9.4-3.6.3-7-.5-9.6-2.8C11.7 26.6 10.4 22.4 10 17zM38 17c-5 .3-9 2.2-11.5 5.6-2 2.8-2.6 6-2.5 9.4 3.6.3 7-.5 9.6-2.8 2.7-2.6 4-6.8 4.4-12.2z",
    opacity: 0.85,
  },
  {
    d: "M4 27c4.5-.8 9 0 13 2.6 2.6 1.7 4.8 3.8 7 6.4-4.6 1.4-9.3 1.2-13.2-.8C7.6 33.6 5.4 30.8 4 27zM44 27c-4.5-.8-9 0-13 2.6-2.6 1.7-4.8 3.8-7 6.4 4.6 1.4 9.3 1.2 13.2-.8 3.2-1.6 5.4-4.4 6.8-8.2z",
    opacity: 0.6,
  },
  { d: "M10 41h28", line: true },
];

export const LOTUS_GRADIENT = [
  { offset: "0", color: "#f6e3ad" },
  { offset: ".55", color: "#e2bd67" },
  { offset: "1", color: "#b08834" },
];
