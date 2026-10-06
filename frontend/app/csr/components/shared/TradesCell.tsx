"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Hammer, Pencil, Plus, Search, Trash2, X, Check } from "lucide-react";
import { useFixedPopover } from "../../hooks/useFixedPopover";
import {
  MASTER_FORMAT_TRADES,
  canonicalTradeName,
  parseSubTradeList,
  parseTradeList,
  parseTradeNotes,
  serializeTradeNotes,
} from "../../constants/masterFormatTrades";

interface TradesCellProps {
  trade: string;
  subTrades?: string;
  tradeNotes?: string;
  extraTrades?: string[];
  onSave?: (next: { trade: string; subTrades: string; tradeNotes: string }) => Promise<void> | void;
  className?: string;
}

export default function TradesCell({
  trade,
  subTrades = "",
  tradeNotes = "",
  extraTrades = [],
  onSave,
  className = "",
}: TradesCellProps) {
  const trades = parseTradeList(trade);
  const hiddenCount = Math.max(0, trades.length - 1);
  const catalog = mergeCatalog(extraTrades);
  const { open, toggle, setOpen, anchorRef, panelRef, style } = useFixedPopover(340, 420);

  const [draftTrades, setDraftTrades] = useState<string[]>(trades);
  const [draftSubs, setDraftSubs] = useState<string[]>(parseSubTradeList(subTrades));
  const [draftNotes, setDraftNotes] = useState<string[]>(parseTradeNotes(tradeNotes));
  const [subInput, setSubInput] = useState("");
  const [tradeSearch, setTradeSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraftTrades(parseTradeList(trade));
    setDraftSubs(parseSubTradeList(subTrades));
    setDraftNotes(parseTradeNotes(tradeNotes));
    setSubInput("");
    setTradeSearch("");
  }, [open, trade, subTrades, tradeNotes]);

  const visibleCatalog = useMemo(() => {
    const q = tradeSearch.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(name => name.toLowerCase().includes(q));
  }, [catalog, tradeSearch]);

  const toggleTrade = (name: string) => {
    setDraftTrades(prev =>
      prev.some(t => t.toLowerCase() === name.toLowerCase())
        ? prev.filter(t => t.toLowerCase() !== name.toLowerCase())
        : [...prev, name],
    );
  };

  const addSub = () => {
    const v = subInput.trim();
    if (!v) return;
    setDraftSubs(prev => (prev.some(s => s.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setSubInput("");
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({
        trade: draftTrades.join(", "),
        subTrades: draftSubs.join(", "),
        tradeNotes: serializeTradeNotes(draftNotes),
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const badge =
    trades.length === 0 ? (
      <span className="inline-flex items-center gap-1 text-[#1B6FE8] text-xs font-semibold">
        <Hammer size={11} />
        {onSave ? "Add trades" : "—"}
      </span>
    ) : (
      <div className={`flex flex-wrap items-center gap-1 min-w-0 ${className}`}>
        <span
          className="inline-flex items-center gap-1 bg-[#EAF2FE] text-[#1B6FE8] font-semibold px-2 py-0.5 rounded-lg text-[10px] sm:text-xs max-w-[120px]"
          title={trades[0]}
        >
          <Hammer size={9} className="shrink-0" />
          <span className="truncate">{trades[0]}</span>
        </span>
        {hiddenCount > 0 && (
          <span className="bg-[#1B6FE8] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
            +{hiddenCount}
          </span>
        )}
        {onSave && <Pencil size={10} className="shrink-0 text-[#1B6FE8] opacity-70" />}
      </div>
    );

  const popup =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        style={{ ...style, width: 340, maxWidth: "calc(100vw - 16px)" }}
        className="bg-white border border-gray-100 rounded-xl shadow-xl z-[200] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Trades</p>
          <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700">
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-3 space-y-3">
          <div className="space-y-1.5">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={tradeSearch}
                onChange={e => setTradeSearch(e.target.value)}
                placeholder="Search trades…"
                className="w-full h-8 rounded-lg border border-gray-200 pl-8 pr-2 text-[11px] outline-none focus:border-[#1B6FE8]"
              />
            </div>
            <div className="max-h-[140px] overflow-y-auto space-y-0.5 border border-gray-100 rounded-lg p-1.5">
              {visibleCatalog.length === 0 ? (
                <p className="px-1.5 py-3 text-[11px] text-gray-400 text-center">No match</p>
              ) : visibleCatalog.map(name => {
                const on = draftTrades.some(t => t.toLowerCase() === name.toLowerCase());
                return (
                  <label key={name} className="flex items-start gap-2 px-1.5 py-1 rounded-md hover:bg-[#EAF2FE] cursor-pointer">
                    <input type="checkbox" checked={on} onChange={() => toggleTrade(name)} className="mt-0.5 accent-[#1B6FE8]" />
                    <span className="text-[11px] text-gray-700 leading-snug">{name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Subtrades</p>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {draftSubs.map(s => (
                <span key={s} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                  {s}
                  <button type="button" onClick={() => setDraftSubs(prev => prev.filter(x => x !== s))} className="text-gray-400 hover:text-red-600">
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={subInput}
                onChange={e => setSubInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }}
                placeholder="Add subtrade"
                className="flex-1 h-8 rounded-lg border border-gray-200 px-2 text-[11px] outline-none focus:border-[#1B6FE8]"
              />
              <button type="button" onClick={addSub} className="h-8 w-8 rounded-lg bg-[#EAF2FE] text-[#1B6FE8] flex items-center justify-center">
                <Plus size={13} />
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold text-gray-500 uppercase">What they work in</p>
              <button
                type="button"
                onClick={() => setDraftNotes(prev => [...prev, ""])}
                className="text-[10px] font-bold text-[#1B6FE8] inline-flex items-center gap-0.5"
              >
                <Plus size={10} /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {draftNotes.map((note, i) => (
                <div key={i} className="flex gap-1">
                  <input
                    value={note}
                    onChange={e => setDraftNotes(prev => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                    placeholder="e.g. Commercial HVAC, residential plumbing…"
                    className="flex-1 h-8 rounded-lg border border-gray-200 px-2 text-[11px] outline-none focus:border-[#1B6FE8]"
                  />
                  <button
                    type="button"
                    onClick={() => setDraftNotes(prev => prev.filter((_, idx) => idx !== i))}
                    className="h-8 w-8 rounded-lg border border-gray-200 text-gray-400 hover:text-red-600 flex items-center justify-center"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {draftNotes.length === 0 && (
                <p className="text-[10px] text-gray-400">Add a short note about which trades they actually work in.</p>
              )}
            </div>
          </div>
        </div>
        {onSave && (
          <div className="border-t border-gray-100 p-2.5">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="w-full h-8 rounded-lg bg-[#1B6FE8] text-white text-[12px] font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Check size={12} />
              {saving ? "Saving…" : "Save trades"}
            </button>
          </div>
        )}
      </div>,
      document.body,
    );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={e => { e.stopPropagation(); toggle(); }}
        className="cursor-pointer hover:opacity-90 text-left max-w-full"
        title={trades.join(", ") || "Add trades"}
      >
        {badge}
      </button>
      {popup}
    </>
  );
}

function mergeCatalog(extra: string[]): string[] {
  const seen = new Set(MASTER_FORMAT_TRADES.map(t => t.toLowerCase()));
  const extras: string[] = [];
  for (const raw of extra) {
    const name = canonicalTradeName(raw);
    const key = name.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    extras.push(name);
  }
  return [...MASTER_FORMAT_TRADES, ...extras];
}
