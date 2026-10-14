import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Asincly",
    short_name: "Asincly",
    description: "Async standups for remote teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#1c1814",
    theme_color: "#1c1814",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
