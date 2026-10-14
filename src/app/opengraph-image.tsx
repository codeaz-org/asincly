import { ImageResponse } from "next/og";
import { markDataUri } from "./brand-image";

export const alt = "Asincly — standups that respect sleep";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link previews (Slack, LinkedIn, X). Same warm ground and amber as the app.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 96,
          background: "#17120D",
          color: "#F5EDE3",
        }}
      >
        <img src={markDataUri()} width={120} height={120} alt="" />
        <div style={{ fontSize: 96, fontWeight: 600, marginTop: 48, letterSpacing: -2 }}>asincly</div>
        <div style={{ fontSize: 44, marginTop: 16, color: "#F2A34D" }}>Standups that respect sleep.</div>
        <div style={{ fontSize: 30, marginTop: 24, color: "#B8AA9A" }}>
          Check in on your own morning. AI turns a short video into a summary your team reads.
        </div>
      </div>
    ),
    size,
  );
}
