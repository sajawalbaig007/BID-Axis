import {
  CalendarClock, Clock3, Trophy, UserX, X,
  AlertTriangle, CalendarDays, Users, Clock, CircleCheckBig, ArrowRightLeft,
} from "lucide-react";
import ScheduleCallForm from "../shared/ScheduleCallForm";
import ProjectDetailsForm from "../shared/ProjectDetailsForm";
import EmailField from "../shared/EmailField";
import NoteHistoryPanel from "../shared/NoteHistoryPanel";
import { usTimezones } from "../../constants/timezones";
import type { NoteEntry } from "../../hooks/useLeadsData";

export type EditAction = "reschedule" | "closeclient" | "deleteclient" | null;

const MOVE_OPTIONS = [
  { status: "important",      Icon: AlertTriangle, iconBg: "bg-[#EAF2FE] text-[#B42318]", title: "Move to Important",    sub: "Mark as important (no schedule)" },
  { status: "schedule call",  Icon: CalendarDays,  iconBg: "bg-[#EAF5FF] text-[#0B84F3]", title: "Move to Schedule Call", sub: "Pick date, time & timezone" },
  { status: "interested",     Icon: Users,         iconBg: "bg-[#FFF4E5] text-[#D97706]", title: "Move to Interested",   sub: "Client showed interest" },
  { status: "pending",        Icon: Clock,         iconBg: "bg-[#F1F5F9] text-[#475569]", title: "Move to Pending",      sub: "Back to pending queue" },
  { status: "Close Client",   Icon: CircleCheckBig,iconBg: "bg-[#ECFDF5] text-[#065F46]", title: "Close Client",         sub: "Fill project details & close" },
] as const;

interface EditClientModalProps {
  client: string;
  clientCompany?: string;
  ourCompany?: string;
  phone?: string;
  leadId?: string;
  noteHistory?: NoteEntry[];
  noteCount?: number;
  onAddNote?: (id: string, text: string, parentId?: string) => Promise<unknown>;
  company: string;
  email: string; onEmailChange: (v: string) => void;
  editAction: EditAction;
  onSelectAction: (action: EditAction) => void;
  onClose: () => void;
  onMoveTo?: (status: string) => void;
  /** Hide "Move to X" when lead is already in that bucket */
  currentMoveStatus?: string;

  scheduleDate: string; onScheduleDateChange: (v: string) => void;
  scheduleTime: string; onScheduleTimeChange: (v: string) => void;
  timezone: string; onTimezoneChange: (v: string) => void;
  onSaveReschedule: () => void;

  projectCode: string; onProjectCodeChange: (v: string) => void;
  projectTitle: string; onProjectTitleChange: (v: string) => void;
  projectService: string; onProjectServiceChange: (v: string) => void;
  projectDeadline: string; onProjectDeadlineChange: (v: string) => void;
  projectBudget: string; onProjectBudgetChange: (v: string) => void;
  paidAmount: string; onPaidAmountChange: (v: string) => void;
  projectNotes: string; onProjectNotesChange: (v: string) => void;
  projectWonValid: boolean;
  onSaveProjectWon: () => void;

  onDeleteClient: () => void;
}

export default function EditClientModal({
  client, clientCompany: clientCo, ourCompany: ourCo, phone, leadId,
  noteHistory, noteCount, onAddNote,
  company, email, onEmailChange, editAction, onSelectAction, onClose, onMoveTo, currentMoveStatus,
  scheduleDate, onScheduleDateChange, scheduleTime, onScheduleTimeChange,
  timezone, onTimezoneChange, onSaveReschedule,
  projectCode, onProjectCodeChange,
  projectTitle, onProjectTitleChange, projectService, onProjectServiceChange,
  projectDeadline, onProjectDeadlineChange, projectBudget, onProjectBudgetChange,
  paidAmount, onPaidAmountChange,
  projectNotes, onProjectNotesChange, projectWonValid, onSaveProjectWon,
  onDeleteClient,
}: EditClientModalProps) {
  const displayCo = clientCo && clientCo !== "—" ? clientCo : (company !== "N/A" ? company : "");

  /** Show all move options — CSR can re-apply the same status */
  const visibleMoveOptions = MOVE_OPTIONS;

  const handleMove = (status: string) => {
    if (status === "schedule call") {
      onSelectAction("reschedule");
      return;
    }
    if (status === "Close Client") {
      onSelectAction("closeclient");
      return;
    }
    onMoveTo?.(status);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="w-full sm:max-w-[520px] lg:max-w-[540px] bg-white dark:bg-gray-900 rounded-t-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "92vh" }}
      >
        <div className="relative bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-4 sm:px-5 lg:px-6 pt-4 sm:pt-5 pb-4 sm:pb-5 shrink-0 overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
          <button onClick={onClose}
            className="absolute top-3 sm:top-4 right-3 sm:right-4 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors z-10">
            <X size={13} className="sm:w-[15px] sm:h-[15px]" />
          </button>
          <div className="flex items-start gap-2.5 sm:gap-3 pr-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white text-lg font-bold shrink-0">
              {client.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base lg:text-lg font-bold text-white leading-tight truncate">
                {editAction === "reschedule"   ? "Reschedule Call"
                 : editAction === "closeclient"  ? "Close Client"
                 : editAction === "deleteclient" ? "Delete Client"
                 : client}
              </h2>
              {!editAction && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                  {displayCo && (
                    <p className="text-white/75 text-[10px] sm:text-[11px] truncate col-span-2 sm:col-span-1">
                      <span className="text-white/50">Company · </span>{displayCo}
                    </p>
                  )}
                  {email && (
                    <p className="text-white/75 text-[10px] sm:text-[11px] truncate col-span-2 sm:col-span-1">
                      <span className="text-white/50">Email · </span>{email}
                    </p>
                  )}
                  {phone && phone !== "N/A" && (
                    <p className="text-white/75 text-[10px] sm:text-[11px] truncate col-span-2">
                      <span className="text-white/50">Phone · </span>{phone}
                    </p>
                  )}
                  {ourCo && ourCo !== "—" && (
                    <p className="text-white/60 text-[10px] truncate col-span-2">
                      Our co: {ourCo}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-4 sm:px-5 lg:px-6 py-4 sm:py-5 space-y-3 sm:space-y-4">

            {leadId && onAddNote && !editAction && (
              <NoteHistoryPanel
                leadId={leadId}
                noteHistory={noteHistory}
                noteCount={noteCount}
                onAddNote={onAddNote}
              />
            )}

            <EmailField email={email} onEmailChange={onEmailChange} />

            {!editAction && (
              <div className="space-y-2 sm:space-y-2.5">
                <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowRightLeft size={11} /> Move to
                </p>
                {onMoveTo && visibleMoveOptions.map(opt => (
                  <button
                    key={opt.status}
                    type="button"
                    onClick={() => handleMove(opt.status)}
                    className="w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-[#FAFAFA] dark:bg-gray-800 dark:border-gray-700 hover:border-[#1B6FE8] hover:bg-[#EAF2FE] transition-all text-left"
                  >
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${opt.iconBg} flex items-center justify-center shrink-0`}>
                      <opt.Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-[#0F172A] dark:text-gray-100 text-sm">{opt.title}</h4>
                      <p className="text-gray-500 text-[11px] sm:text-xs mt-0.5">{opt.sub}</p>
                    </div>
                  </button>
                ))}

                <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-1">
                  Other actions
                </p>
                {[
                  { action: "reschedule" as EditAction,  Icon: CalendarClock, iconBg: "bg-[#EAF5FF] text-[#0B84F3]", title: "Reschedule",    sub: "Pick a new date, time & timezone" },
                  { action: "deleteclient" as EditAction,Icon: UserX,         iconBg: "bg-[#EAF2FE] text-[#B42318]", title: "Delete Client",  sub: "Move this client to Bin" },
                ].map(opt => (
                  <button
                    key={String(opt.action)}
                    type="button"
                    onClick={() => onSelectAction(opt.action)}
                    className="w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border-2 border-gray-100 bg-[#FAFAFA] dark:bg-gray-800 dark:border-gray-700 hover:border-[#1B6FE8] hover:bg-[#EAF2FE] transition-all text-left"
                  >
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${opt.iconBg} flex items-center justify-center shrink-0`}>
                      <opt.Icon size={16} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[#0F172A] dark:text-gray-100 text-sm">{opt.title}</h4>
                      <p className="text-gray-500 text-[11px] sm:text-xs mt-0.5">{opt.sub}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {editAction === "reschedule" && (
              <>
                <ScheduleCallForm
                  date={scheduleDate} onDateChange={onScheduleDateChange}
                  time={scheduleTime} onTimeChange={onScheduleTimeChange}
                  timezone={timezone} onTimezoneChange={onTimezoneChange}
                  dateLabel="New Schedule Date" timeLabel="New Call Time"
                />
                {scheduleDate && scheduleTime && (
                  <div className="bg-[#F8F9FC] rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock3 size={11} className="text-[#1B6FE8]" />
                      <p className="text-gray-400 text-[10px]">New Schedule Preview</p>
                    </div>
                    <h4 className="font-semibold text-[#0F172A] text-xs">
                      {scheduleDate} at {scheduleTime} {usTimezones.find(tz => tz.value === timezone)?.abbreviation}
                    </h4>
                  </div>
                )}
                <div className="flex gap-2 sm:gap-3 pb-1">
                  <button type="button" onClick={() => onSelectAction(null)} className="flex-1 h-10 sm:h-12 rounded-xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm">Back</button>
                  <button type="button" onClick={onSaveReschedule} disabled={!scheduleDate || !scheduleTime}
                    className={`flex-1 h-10 sm:h-12 rounded-xl font-semibold text-sm text-white ${scheduleDate && scheduleTime ? "bg-[#1B6FE8]" : "bg-gray-200 cursor-not-allowed text-gray-400"}`}>
                    Save Schedule
                  </button>
                </div>
              </>
            )}

            {editAction === "closeclient" && (
              <>
                <div className="bg-[#F8F9FC] rounded-xl p-3 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#ECFDF5] text-[#065F46] flex items-center justify-center shrink-0">
                    <Trophy size={15} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-[#0F172A] text-xs">Close Client</h4>
                    <p className="text-gray-400 text-[10px] mt-0.5 truncate">Project details for <strong>{client}</strong></p>
                  </div>
                </div>
                <ProjectDetailsForm
                  projectCode={projectCode} onProjectCodeChange={onProjectCodeChange}
                  title={projectTitle} onTitleChange={onProjectTitleChange}
                  service={projectService} onServiceChange={onProjectServiceChange}
                  deadline={projectDeadline} onDeadlineChange={onProjectDeadlineChange}
                  budget={projectBudget} onBudgetChange={onProjectBudgetChange}
                  paidAmount={paidAmount} onPaidAmountChange={onPaidAmountChange}
                  notes={projectNotes} onNotesChange={onProjectNotesChange}
                />
                <div className="flex gap-2 sm:gap-3 pb-1">
                  <button type="button" onClick={() => onSelectAction(null)} className="flex-1 h-10 sm:h-12 rounded-xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm">Back</button>
                  <button type="button" onClick={onSaveProjectWon} disabled={!projectWonValid}
                    className={`flex-1 h-10 sm:h-12 rounded-xl font-semibold text-sm text-white ${projectWonValid ? "bg-[#1B6FE8]" : "bg-gray-200 cursor-not-allowed text-gray-400"}`}>
                    Confirm &amp; Move
                  </button>
                </div>
              </>
            )}

            {editAction === "deleteclient" && (
              <>
                <div className="bg-[#EAF2FE] rounded-xl p-3 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white text-[#B42318] flex items-center justify-center shrink-0 shadow-sm">
                    <UserX size={16} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-[#B42318] text-xs">Confirm Delete</h4>
                    <p className="text-[#B42318]/70 text-[11px] mt-0.5"><strong>{client}</strong> → Bin</p>
                  </div>
                </div>
                <div className="flex gap-2 sm:gap-3 pb-1">
                  <button type="button" onClick={() => onSelectAction(null)} className="flex-1 h-10 sm:h-12 rounded-xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm">Back</button>
                  <button type="button" onClick={onDeleteClient} className="flex-1 h-10 sm:h-12 rounded-xl bg-[#B42318] text-white font-semibold text-sm">Delete Client</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
