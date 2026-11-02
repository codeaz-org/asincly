// Operator ("super admin") access to /admin: cross-tenant, read-mostly, for
// whoever runs this install. Granted by email in SUPER_ADMIN_EMAILS; unset
// means nobody, so a self-hosted install has no /admin unless its operator
// opts in. The 2FA requirement lives in requireSuperAdmin (lib/session.ts).
export function isSuperAdminEmail(email: string, env: Record<string, string | undefined> = process.env): boolean {
  const allowed = (env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
