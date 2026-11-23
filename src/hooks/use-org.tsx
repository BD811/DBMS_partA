"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { OrgMembership, Organisation, Person, UserRole } from "@/types";

export interface OrgContextValue {
  org: Organisation;
  membership: OrgMembership;
  person: Person;
  isOwner: boolean;
  isDispatcher: boolean;
  isTechnician: boolean;
  isAccounts: boolean;
  loading: boolean;
  error: string | null;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const [contextValue, setContextValue] = useState<OrgContextValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOrganization() {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error("Your session has ended. Please sign in again.");

        const { data: person, error: personError } = await supabase
          .from("person")
          .select("person_id, auth_user_id, full_name, phone, email, base_city, lang_pref, phone_verified, id_verified, joined_at")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (personError) throw personError;
        if (!person) throw new Error("Your profile is not set up. Please finish organization onboarding.");

        const { data: membership, error: membershipError } = await supabase
          .from("org_membership")
          .select("membership_id, person_id, org_id, role, engagement_type, emp_code, is_active, joined_at, organisation(org_id, name, org_type, day_start, day_end, working_days, plan, created_at)")
          .eq("person_id", person.person_id)
          .eq("is_active", true)
          .order("joined_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (membershipError) throw membershipError;
        const joinedOrganization = Array.isArray(membership?.organisation)
          ? membership.organisation[0]
          : membership?.organisation;
        if (!membership || !joinedOrganization) {
          throw new Error("No active organization membership was found.");
        }

        const role = membership.role as UserRole;
        if (!active) return;

        setContextValue({
          person: person as Person,
          membership: membership as OrgMembership,
          org: joinedOrganization as Organisation,
          isOwner: role === "owner",
          isDispatcher: role === "owner" || role === "dispatcher",
          isTechnician: role === "technician",
          isAccounts: role === "accounts",
          loading: false,
          error: null,
        });
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We could not load your organization.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOrganization();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading your workspace…
      </div>
    );
  }

  if (error || !contextValue) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-sm text-red-800">
          {error ?? "Your organization could not be loaded."}
        </div>
      </div>
    );
  }

  return (
    <OrgContext.Provider value={contextValue}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const contextValue = useContext(OrgContext);
  if (!contextValue) {
    throw new Error("useOrg must be used inside OrgProvider.");
  }
  return contextValue;
}
