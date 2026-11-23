export type UserRole = "owner" | "dispatcher" | "technician" | "accounts";
export type OrgType =
  | "retailer"
  | "wholesaler"
  | "service_centre"
  | "brand"
  | "facility";
export type JobStatus =
  | "open"
  | "assigned"
  | "en_route"
  | "on_site"
  | "awaiting_parts"
  | "closed"
  | "cancelled";
export type Priority = "P1" | "P2" | "P3";
export type TicketSource = "phone" | "whatsapp" | "email" | "portal" | "walk_in";
export type ContractType =
  | "comprehensive"
  | "non_comprehensive"
  | "labour_only";
export type EngagementType = "employee" | "contractor" | "marketplace";

// These app-facing records mirror the identity tables in supabase/migrations/0001_init.sql.
export interface Person {
  person_id: string;
  auth_user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  base_city: string | null;
  lang_pref: string | null;
  phone_verified: boolean | null;
  id_verified: boolean | null;
  joined_at: string | null;
}

export interface Organisation {
  org_id: string;
  name: string;
  org_type: OrgType;
  day_start: string | null;
  day_end: string | null;
  working_days: string | null;
  plan: string | null;
  created_at: string | null;
}

export interface OrgMembership {
  membership_id: string;
  person_id: string;
  org_id: string;
  role: UserRole;
  engagement_type: EngagementType | null;
  emp_code: string | null;
  is_active: boolean | null;
  joined_at: string | null;
}

export interface Holiday {
  holiday_id: string;
  org_id: string;
  holiday_date: string;
  name: string | null;
}
