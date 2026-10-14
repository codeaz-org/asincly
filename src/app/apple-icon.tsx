import { ImageResponse } from "next/og";
import { markDataUri } from "./brand-image";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <img src={markDataUri()} width={180} height={180} alt="" />,
    size,
  );
}
