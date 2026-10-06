import ChatLayoutCleanup from "../components/chat/ChatLayoutCleanup";
import StaffPresenceInit from "../components/StaffPresenceInit";
import StaffChatNotifier from "../components/StaffChatNotifier";
import SessionNotifierInit from "../components/SessionNotifierInit";
import CsrPresenceInit from "./components/CsrPresenceInit";
import CsrDataResetListener from "./components/CsrDataResetListener";
import CsrShiftLock from "./components/CsrShiftLock";
import CrmAssistantPanel from "../components/assistant/CrmAssistantPanel";
import DevToolsGuard from "../components/DevToolsGuard";
import CrmMailProvider from "../components/mail/CrmMailProvider";
import { ZoomDialerProvider } from "./components/dialer/ZoomDialerProvider";

export default function CsrLayout({ children }: { children: React.ReactNode }) {
  return (
    <CrmMailProvider>
      <ZoomDialerProvider>
        <DevToolsGuard allowSelection />
        <SessionNotifierInit />
        <StaffPresenceInit />
        <CsrDataResetListener />
        <CsrPresenceInit />
        <CsrShiftLock />
        <StaffChatNotifier />
        <ChatLayoutCleanup />
        {children}
        <CrmAssistantPanel />
      </ZoomDialerProvider>
    </CrmMailProvider>
  );
}
