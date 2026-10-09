import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { StoreProvider, ToastViewport, useStore } from "@/lib/store";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import StaffPasswordResetRequest from "@/pages/StaffPasswordResetRequest";
import StaffPasswordResetComplete from "@/pages/StaffPasswordResetComplete";
import StaffChangePassword from "@/pages/StaffChangePassword";
import Cookies from "@/pages/Cookies";
import CookieConsent from "@/components/CookieConsent";
import { BrandLoader } from "@/components/BrandLoader";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/admin/Clients";
import SupportTickets from "@/pages/admin/Support";
import SearchPage from "@/pages/admin/Search";
import ServerOps from "@/pages/admin/ServerOps";
import ServicesHealth from "@/pages/admin/ServicesHealth";
import AiAdmin from "@/pages/admin/AiAdmin";
import AgentActivityAdmin from "@/pages/admin/AgentActivity";
import ComplianceAdmin from "@/pages/admin/Compliance";
import AuditConsole from "@/pages/admin/AuditConsole";
import ToolingAdmin from "@/pages/admin/Tooling";
import ExperienceAdmin from "@/pages/admin/Experience";
import ScannerTools from "@/pages/admin/ScannerTools";
import BillingAdmin from "@/pages/admin/Billing";
import StaffUsers from "@/pages/admin/StaffUsersPage";
import DevLogs from "@/pages/admin/DevLogs";
import DiscoveryAdmin from "@/pages/admin/Discovery";
import VaptAdmin from "@/pages/admin/VaptAdmin";
import BusDiagnostics from "@/pages/admin/BusDiagnostics";
import SuperLogs from "@/pages/admin/SuperLogs";
import EngineJobs from "@/pages/admin/EngineJobs";
import Overwatch from "@/pages/admin/Overwatch";
import SuperadminTerminal from "@/pages/admin/Terminal";
import AgiAdmin from "@/pages/admin/AgiAdmin";
import SandboxAdmin from "@/pages/admin/Sandbox";
import WaitlistAdmin from "@/pages/admin/Waitlist";
import AnalyticsAdmin from "@/pages/admin/Analytics";
import ArchitectureAdmin from "@/pages/admin/Architecture";
import DemoRequestsAdmin from "@/pages/admin/DemoRequests";
import FeedbackAdmin from "@/pages/admin/Feedback";
import SocProvisioning from "@/pages/admin/SocProvisioning";
import EmailTemplates from "@/pages/admin/EmailTemplates";
import LegalDocuments from "@/pages/admin/LegalDocuments";
import WeeklyAdmin from "@/pages/admin/Weekly";
import InternalAlerts from "@/pages/admin/InternalAlerts";
import ContributeHome from "@/pages/contribute/ContributeHome";
import ContributeKnowledge from "@/pages/contribute/ContributeKnowledge";
import ContributeCapabilities from "@/pages/contribute/ContributeCapabilities";
import ContributeSkills from "@/pages/contribute/ContributeSkills";
import ContributeEngines from "@/pages/contribute/ContributeEngines";
import ContributeLearning from "@/pages/contribute/ContributeLearning";
import { AGI_ENABLED } from "@/lib/api";

/** Full-screen gate shown while a stored session is verified — nothing renders
 *  until authentication + authorization are decided. */
function GateLoader() {
  return <BrandLoader label="Staff" />;
}

function RequireStaff({ children }: { children: React.ReactNode }) {
  const { session, sessionLoading } = useStore();
  const location = useLocation();
  if (sessionLoading) return <GateLoader />;
  if (!session?.authenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (session.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

function RequireContributor({ children }: { children: React.ReactNode }) {
  const { session, sessionLoading, isContributor } = useStore();
  const location = useLocation();
  if (sessionLoading) return <GateLoader />;
  if (!session?.authenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (session.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!isContributor) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, sessionLoading, isAdmin } = useStore();
  const location = useLocation();
  if (sessionLoading) return <GateLoader />;
  if (!session?.authenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (session.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/** The Weekly desk: editor, admin or superadmin. */
function RequireEditor({ children }: { children: React.ReactNode }) {
  const { session, sessionLoading, isEditor } = useStore();
  const location = useLocation();
  if (sessionLoading) return <GateLoader />;
  if (!session?.authenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (session.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!isEditor) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireSuperadmin({ children }: { children: React.ReactNode }) {  const { session, sessionLoading, isSuperadmin } = useStore();
  if (sessionLoading) return <GateLoader />;
  if (!session?.authenticated) return <Navigate to="/login" replace />;
  if (session.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!isSuperadmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireAgiAdmin({ children }: { children: React.ReactNode }) {
  const { session, sessionLoading, isAgiAdmin } = useStore();
  const location = useLocation();
  if (sessionLoading) return <GateLoader />;
  if (!session?.authenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  if (session.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!isAgiAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, sessionLoading } = useStore();
  if (sessionLoading) return <GateLoader />;
  if (!session?.authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<RequireAuth><StaffChangePassword /></RequireAuth>} />
          <Route path="/password-reset" element={<StaffPasswordResetRequest />} />
          <Route path="/reset-password" element={<StaffPasswordResetComplete />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route element={<Layout />}>
            {/* All staff */}
            <Route path="/dashboard" element={<RequireStaff><Dashboard /></RequireStaff>} />
            <Route path="/support" element={<RequireStaff><SupportTickets /></RequireStaff>} />
            <Route path="/search" element={<RequireStaff><SearchPage /></RequireStaff>} />

            {/* Contributor workspace (+ admin/superadmin) */}
            <Route path="/contribute" element={<RequireContributor><ContributeHome /></RequireContributor>} />
            <Route path="/contribute/knowledge" element={<RequireContributor><ContributeKnowledge /></RequireContributor>} />
            <Route path="/contribute/skills" element={<RequireContributor><ContributeSkills /></RequireContributor>} />
            <Route path="/contribute/capabilities" element={<RequireContributor><ContributeCapabilities /></RequireContributor>} />
            <Route path="/contribute/engines" element={<RequireContributor><ContributeEngines /></RequireContributor>} />
            <Route path="/contribute/learning" element={<RequireContributor><ContributeLearning /></RequireContributor>} />
            <Route path="/architecture" element={<RequireContributor><ArchitectureAdmin /></RequireContributor>} />

            {/* Admin (monitor + catalogs + advanced) */}
            <Route path="/clients" element={<RequireAdmin><Clients /></RequireAdmin>} />
            <Route path="/clients/:id" element={<RequireAdmin><Clients /></RequireAdmin>} />
            <Route path="/sandbox" element={<RequireAdmin><SandboxAdmin /></RequireAdmin>} />
            <Route path="/waitlist" element={<RequireAdmin><WaitlistAdmin /></RequireAdmin>} />
            <Route path="/logs" element={<RequireAdmin><DevLogs /></RequireAdmin>} />
            <Route path="/logs/issues/:issueId" element={<RequireAdmin><DevLogs /></RequireAdmin>} />
            <Route path="/server" element={<RequireAdmin><ServerOps /></RequireAdmin>} />
            <Route path="/services" element={<RequireAdmin><ServicesHealth /></RequireAdmin>} />
            <Route path="/scanner-tools" element={<RequireAdmin><ScannerTools /></RequireAdmin>} />
            <Route path="/bus" element={<RequireAdmin><BusDiagnostics /></RequireAdmin>} />
            <Route path="/analytics" element={<RequireAdmin><AnalyticsAdmin /></RequireAdmin>} />
            <Route path="/demo-requests" element={<RequireAdmin><DemoRequestsAdmin /></RequireAdmin>} />
            <Route path="/feedback" element={<RequireAdmin><FeedbackAdmin /></RequireAdmin>} />
            <Route path="/compliance" element={<RequireAdmin><ComplianceAdmin /></RequireAdmin>} />
            <Route path="/audits" element={<RequireAdmin><AuditConsole /></RequireAdmin>} />
            <Route path="/soc-provisioning" element={<RequireAdmin><SocProvisioning /></RequireAdmin>} />
            <Route path="/email-templates" element={<RequireAdmin><EmailTemplates /></RequireAdmin>} />
            <Route path="/legal-documents" element={<RequireAdmin><LegalDocuments /></RequireAdmin>} />
            <Route path="/weekly" element={<RequireEditor><WeeklyAdmin /></RequireEditor>} />
            <Route path="/tooling" element={<RequireAdmin><ToolingAdmin /></RequireAdmin>} />
            <Route path="/discovery" element={<RequireAdmin><DiscoveryAdmin /></RequireAdmin>} />
            <Route path="/experience" element={<RequireAdmin><ExperienceAdmin /></RequireAdmin>} />
            <Route path="/ai" element={<RequireAdmin><AiAdmin /></RequireAdmin>} />
            <Route path="/agent-activity" element={<RequireAdmin><AgentActivityAdmin /></RequireAdmin>} />
            <Route path="/vapt-admin" element={<RequireAdmin><VaptAdmin /></RequireAdmin>} />
            {AGI_ENABLED && <Route path="/agi" element={<RequireAgiAdmin><AgiAdmin /></RequireAgiAdmin>} />}

            {/* Superadmin */}
            <Route path="/super-logs" element={<RequireSuperadmin><SuperLogs /></RequireSuperadmin>} />
            <Route path="/engine-jobs" element={<RequireSuperadmin><EngineJobs /></RequireSuperadmin>} />
            <Route path="/overwatch" element={<RequireSuperadmin><Overwatch /></RequireSuperadmin>} />
            <Route path="/terminal" element={<RequireSuperadmin><SuperadminTerminal /></RequireSuperadmin>} />
            <Route path="/billing" element={<RequireSuperadmin><BillingAdmin /></RequireSuperadmin>} />
            <Route path="/staff" element={<RequireSuperadmin><StaffUsers /></RequireSuperadmin>} />
            <Route path="/internal-alerts" element={<RequireSuperadmin><InternalAlerts /></RequireSuperadmin>} />

            {/* Default redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
        <ToastViewport />
        <CookieConsent />
      </BrowserRouter>
    </StoreProvider>
  );
}
