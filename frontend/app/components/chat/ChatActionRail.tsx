"use client";

import {
  Bell,
  BellOff,
  CheckSquare,
  Plus,
  User2,
  X,
  Volume2,
  VolumeX,
  Archive,
  ArchiveRestore,
  Maximize2,
  Minimize2,
  Settings,
} from "lucide-react";

interface ChatActionRailProps {
  notifGranted: boolean;
  onNotif: () => void;
  onSelect?: () => void;
  onNewDm?: () => void;
  onNewGroup?: () => void;
  onSettings?: () => void;
  settingsOpen?: boolean;
  soundOn?: boolean;
  onSoundToggle?: () => void;
  showArchived?: boolean;
  onArchiveToggle?: () => void;
  onClose?: () => void;
  readOnly?: boolean;
  isFullscreen?: boolean;
  onFullscreen?: () => void;
}

const btn =
  "w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0";

export default function ChatActionRail({
  notifGranted,
  onNotif,
  onSelect,
  onNewDm,
  onNewGroup,
  onSettings,
  settingsOpen,
  soundOn,
  onSoundToggle,
  showArchived,
  onArchiveToggle,
  onClose,
  readOnly,
  isFullscreen,
  onFullscreen,
}: ChatActionRailProps) {
  return (
    <nav className="w-12 shrink-0 flex flex-col items-center gap-1.5 py-3 px-1.5 border-r border-gray-100 bg-[#F5F6FA]">
      {!readOnly && (
      <button
        type="button"
        onClick={onNotif}
        title={notifGranted ? "Notifications on" : "Enable notifications"}
        className={`${btn} ${notifGranted ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-500 hover:bg-amber-100"}`}
      >
        {notifGranted ? <Bell size={15} /> : <BellOff size={15} />}
      </button>
      )}

      {!readOnly && onSoundToggle != null && (
        <button
          type="button"
          onClick={onSoundToggle}
          title={soundOn ? "Sound on" : "Sound off"}
          className={`${btn} ${soundOn ? "bg-green-50 text-green-600" : "bg-white text-gray-400 hover:bg-gray-100"}`}
        >
          {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
        </button>
      )}

      {onArchiveToggle != null && (
        <button
          type="button"
          onClick={onArchiveToggle}
          title={showArchived ? "Show active chats" : "Show archived"}
          className={`${btn} ${showArchived ? "bg-[#1B6FE8] text-white" : "bg-white text-gray-500 hover:bg-gray-100"}`}
        >
          {showArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
        </button>
      )}

      {onSelect && (
      <button
        type="button"
        onClick={onSelect}
        title="Select chats"
        className={`${btn} bg-white text-gray-500 hover:bg-gray-100`}
      >
        <CheckSquare size={15} />
      </button>
      )}

      {onNewDm && (
      <button
        type="button"
        onClick={onNewDm}
        title="New DM"
        className={`${btn} bg-white text-gray-500 hover:bg-[#EAF2FE] hover:text-[#1B6FE8]`}
      >
        <User2 size={15} />
      </button>
      )}

      {onNewGroup && (
      <button
        type="button"
        onClick={onNewGroup}
        title="New group"
        className={`${btn} bg-[#1B6FE8] text-white hover:bg-[#a30f27]`}
      >
        <Plus size={15} />
      </button>
      )}

      {onSettings && (
      <button
        type="button"
        onClick={onSettings}
        title="Chat theme"
        className={`${btn} ${settingsOpen ? "bg-[#1B6FE8] text-white" : "bg-white text-gray-500 hover:bg-[#EAF2FE] hover:text-[#1B6FE8]"}`}
      >
        <Settings size={15} />
      </button>
      )}

      {onFullscreen && (
      <button
        type="button"
        onClick={onFullscreen}
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen chat"}
        className={`${btn} ${isFullscreen ? "bg-[#1B6FE8] text-white" : "bg-white text-gray-500 hover:bg-[#EAF2FE] hover:text-[#1B6FE8]"}`}
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
      )}

      <div className="flex-1 min-h-2" />

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className={`${btn} bg-white text-gray-500 hover:bg-gray-200`}
        >
          <X size={15} />
        </button>
      )}
    </nav>
  );
}
