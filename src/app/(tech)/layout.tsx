import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { OrgProvider } from "@/hooks/use-org";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TechnicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(`Could not verify session: ${authError.message}`);
  if (!user) redirect("/login");

  const { data: person, error: personError } = await supabase
    .from("person")
    .select("person_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (personError) throw new Error(`Could not load profile: ${personError.message}`);
  if (!person) redirect("/onboard");

  const { data: membership, error: membershipError } = await supabase
    .from("org_membership")
    .select("role")
    .eq("person_id", person.person_id)
    .eq("is_active", true)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    throw new Error(`Could not load organization membership: ${membershipError.message}`);
  }
  if (!membership) redirect("/onboard");
  if (membership.role !== "technician") redirect("/dispatch");

  return (
    <OrgProvider>
      <div className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-20 flex min-h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
          <Link className="text-sm font-extrabold tracking-[0.15em] text-blue-800" href="/tech">
            SERVICEIQ
          </Link>
          <nav aria-label="Technician navigation" className="flex items-center gap-4 text-sm">
            <Link className="text-slate-600 hover:text-blue-800" href="/tech">My jobs</Link>
            <Link className="text-slate-600 hover:text-blue-800" href="/tech/profile">Profile</Link>
            <SignOutButton compact />
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
      </div>
    </OrgProvider>
  );
}
