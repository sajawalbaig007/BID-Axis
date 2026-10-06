import ChatLayoutCleanup from "@/app/components/chat/ChatLayoutCleanup";
import StaffPresenceInit from "@/app/components/StaffPresenceInit";
import StaffChatNotifier from "@/app/components/StaffChatNotifier";
import SessionNotifierInit from "@/app/components/SessionNotifierInit";
import EstimatorPresenceInit from "@/app/estimator/components/EstimatorPresenceInit";
import CrmAssistantPanel from "@/app/components/assistant/CrmAssistantPanel";

export default function EstimatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SessionNotifierInit />
      <StaffPresenceInit />
      <EstimatorPresenceInit />
      <StaffChatNotifier />
      <ChatLayoutCleanup />
      {children}
      <CrmAssistantPanel />
    </>
  );
}
