import { Ticket, Users } from "lucide-react";

import { useAuth } from "../../auth/AuthContext";
import PageLayout from "../../ui/layout/PageLayout";
import { SectionTabs, type SectionTab } from "../../ui/SectionTabs";
import { useTabParam } from "../../ui/shell/useTabParam";
import AccountsTab from "./AccountsTab";
import InvitesTab from "./InvitesTab";

type AdminTab = "accounts" | "invites";
const ADMIN_TAB_KEYS: readonly AdminTab[] = ["accounts", "invites"];

const TABS: SectionTab<AdminTab>[] = [
  { key: "accounts", label: "Accounts", icon: <Users size={14} /> },
  { key: "invites", label: "Invites", icon: <Ticket size={14} /> },
];

/**
 * The admin page (L6): who has an account, who is logged in and from which device, who is
 * still on a migrated password, invite codes and reset links. Owner+ (the route's
 * `RequireRole`); the site-admin-only controls follow the **effective** role, so an admin
 * "viewing as" an owner sees exactly what an owner sees.
 */
export default function AdminPage() {
  const { siteAdmin, role } = useAuth();
  const isSiteAdmin = siteAdmin && role === "admin";
  const [tab, setTab] = useTabParam<AdminTab>(ADMIN_TAB_KEYS, "accounts");

  return (
    <PageLayout title="Admin">
      <SectionTabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="mx-auto w-full max-w-2xl">
        {tab === "invites" ? <InvitesTab /> : <AccountsTab siteAdmin={isSiteAdmin} />}
      </div>
    </PageLayout>
  );
}
