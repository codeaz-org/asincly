import { describe, expect, it } from "vitest";
import { isSuperAdminEmail } from "./admin";

describe("isSuperAdminEmail", () => {
  it("matches the listed emails, ignoring case and spaces", () => {
    const env = { SUPER_ADMIN_EMAILS: " anton@codeaz.org , Ops@Example.com" };
    expect(isSuperAdminEmail("anton@codeaz.org", env)).toBe(true);
    expect(isSuperAdminEmail("ANTON@codeaz.org", env)).toBe(true);
    expect(isSuperAdminEmail("ops@example.com", env)).toBe(true);
    expect(isSuperAdminEmail("someone@codeaz.org", env)).toBe(false);
  });

  it("lets nobody in when unset or empty", () => {
    expect(isSuperAdminEmail("anton@codeaz.org", {})).toBe(false);
    expect(isSuperAdminEmail("", { SUPER_ADMIN_EMAILS: "," })).toBe(false);
  });
});
