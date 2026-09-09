import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  const hasGoogle = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Sign in to Asincly</h1>
          <p className="text-sm text-muted-foreground">Magic link or Google.</p>
        </div>

        <form
          action={async (formData) => {
            "use server";
            await signIn("resend", { email: formData.get("email"), redirectTo: "/" });
          }}
          className="space-y-2"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="you@company.com"
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
          <button
            type="submit"
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Email me a link
          </button>
        </form>

        {hasGoogle ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full h-10 rounded-md border border-input bg-background text-sm font-medium"
            >
              Continue with Google
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
