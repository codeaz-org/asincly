// The app icon (same artwork as icon.svg) as a data URI for next/og images.
// Inlined, not read from disk: the standalone server has no src/ folder.
const ICON_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\" fill=\"none\">\n  <rect width=\"32\" height=\"32\" rx=\"7\" fill=\"#17120D\"/>\n  <defs>\n    <clipPath id=\"n\"><rect x=\"0\" y=\"0\" width=\"13.4\" height=\"32\"/></clipPath>\n    <clipPath id=\"m\"><rect x=\"16\" y=\"0\" width=\"16\" height=\"32\"/></clipPath>\n  </defs>\n  <circle cx=\"16\" cy=\"16\" r=\"11\" fill=\"#6E6257\" clip-path=\"url(#n)\"/>\n  <circle cx=\"16\" cy=\"16\" r=\"11\" fill=\"#F2A34D\" clip-path=\"url(#m)\"/>\n</svg>";

export const markDataUri = () => `data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString("base64")}`;
