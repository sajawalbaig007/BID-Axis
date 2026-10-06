import ChatLayoutCleanup from "../components/chat/ChatLayoutCleanup";
import StaffPresenceInit from "../components/StaffPresenceInit";
import StaffChatNotifier from "../components/StaffChatNotifier";
import SessionNotifierInit from "../components/SessionNotifierInit";
import AdminSummaryRefreshListener from "./components/AdminSummaryRefreshListener";
import CrmMailProvider from "../components/mail/CrmMailProvider";
import { ZoomDialerProvider } from "../csr/components/dialer/ZoomDialerProvider";
import CrmAssistantPanel from "../components/assistant/CrmAssistantPanel";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <CrmMailProvider>
      <ZoomDialerProvider>
        <SessionNotifierInit />
        <StaffPresenceInit />
        <StaffChatNotifier />
        <AdminSummaryRefreshListener />
        <ChatLayoutCleanup />
        {children}
        <CrmAssistantPanel />
      </ZoomDialerProvider>
    </CrmMailProvider>
  );
}
