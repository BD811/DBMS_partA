import { redirect } from "next/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { OrgProvider } from "@/hooks/use-org";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OrgLayout({
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
  if (membership.role === "technician") redirect("/tech");

  return (
    <OrgProvider>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-24 pt-5 md:px-6 lg:h-screen lg:pb-6">
          {children}
        </main>
        <MobileNav />
      </div>
    </OrgProvider>
  );
}
