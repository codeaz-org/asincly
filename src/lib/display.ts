// Display-name rules: never show a raw email in the product surfaces.

export function displayName(name: string | null | undefined, email: string): string {
  return name?.trim() || email.split("@")[0];
}

export function firstName(name: string | null | undefined, email: string): string {
  return displayName(name, email).split(/\s+/)[0];
}

export function initials(name: string | null | undefined, email: string): string {
  const dn = displayName(name, email);
  const parts = dn.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return dn.slice(0, 2).toUpperCase();
}

// Deterministic avatar hue from the display name; stable across sessions.
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}
