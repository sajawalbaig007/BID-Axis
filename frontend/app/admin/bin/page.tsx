"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Trash2, Search, RefreshCw, Phone, Briefcase,
  ThumbsDown, PhoneOff, X, Check, ArrowRightLeft, Star, User2, ChevronDown, Ban,
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

import { StaffSidebar } from "@/app/hooks/useStaffSidebar";
import DashboardNavbar from "../components/layout/Navbar";
import API from "@/lib/api";
import { getAuthMe, peekAuthMe } from "@/lib/authMeCache";
import { ChangeDialerNumber, useZoomDialer } from "@/app/csr/components/dialer/ZoomDialerProvider";
import { formatEstDayMonth } from "@/lib/estTime";
import { binCategory, binReasonLabel } from "@/app/csr/hooks/useBinData";
import { CSR_THEAD } from "@/app/csr/components/shared/csrTableStyles";
import StateFilterDropdown from "@/app/csr/components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "@/app/csr/components/shared/PhoneAreaCodeFilterInput";
import { matchesStateLocationFilter, matchesPhoneAreaCodeFilter } from "@/lib/stateLocationFilter";
import CapsuleTabs, { type CapsuleTabItem } from "@/app/components/CapsuleTabs";

const BinStatsChart = dynamic(() => import("./BinStatsChart"), {
  ssr: false,
  loading: () => <div className="h-full bg-gray-50 rounded-2xl animate-pulse" />,
});

type BinLead = {
  id:                 string;
  client:             string;
  company:            string;
  phone:              string;
  state:              string;
  status:             string;
  notPickedCount:     number;
  notInterestedCount: number;
  interestedService?: string;
  binReason:          string | null;
  updatedAt?:         string;
  csr:                { id: string; name: string; csrCode: string | null };
};

type CSR = { id: string; name: string; csrCode: string | null };
type TabKey = "all" | "notpicked" | "notinterested" | "notuseful" | "deleted";

export default function AdminBinPage() {
  const dialer = useZoomDialer();
  const [leads,      setLeads]      = useState<BinLead[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [tab,        setTab]        = useState<TabKey>("all");
  const [filterCSR,  setFilterCSR]  = useState("all");
  const [allCsrs,    setAllCsrs]    = useState<CSR[]>([]);

  const [showReassign,  setShowReassign]  = useState(false);
  const [reassignLead,  setReassignLead]  = useState<BinLead | null>(null);
  const [csrOptions,    setCsrOptions]    = useState<CSR[]>([]);
  const [selectedCsrId, setSelectedCsrId] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [canDeleteNotUseful, setCanDeleteNotUseful] = useState(() => {
    const role = peekAuthMe()?.role;
    return role === "admin" || role === "manager";
  });

  const mapLeads = (raw: unknown[]): BinLead[] =>
    (raw as Array<Record<string, unknown>>).map(l => ({
      id:                 String(l.id ?? ""),
      client:             String(l.name ?? "Unknown"),
      company:            String((l.uploadFile as { companyName?: string })?.companyName ?? l.company ?? "N/A"),
      phone:              String(l.phone ?? "N/A"),
      state:              String(l.state ?? ""),
      status:             String(l.status ?? ""),
      notPickedCount:     Number(l.notPickedCount ?? 0),
      notInterestedCount: Number(l.notInterestedCount ?? 0),
      interestedService:  String(l.interestedService ?? ""),
      binReason:          (l.binReason as string | null) ?? null,
      updatedAt:          String(l.updatedAt ?? ""),
      csr: {
        id:      String((l.csr as { id?: string })?.id ?? ""),
        name:    String((l.csr as { name?: string })?.name ?? "—"),
        csrCode: ((l.csr as { csrCode?: string | null })?.csrCode) ?? null,
      },
    }));

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page: 1, limit: 2000 };
      if (filterCSR !== "all") params.csrId = filterCSR;
      const res = await API.get("/admin/bin", { params });
      setLeads(mapLeads(res.data.leads ?? []));
    } catch {
      toast.error("Failed to load bin.");
    } finally {
      setLoading(false);
    }
  }, [filterCSR]);

  useEffect(() => {
    const load = () => {
      API.get("/admin/csrs").then(res => setAllCsrs(res.data.csrs ?? [])).catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  useEffect(() => { void fetchLeads(); }, [fetchLeads]);

  useEffect(() => {
    const role = peekAuthMe()?.role;
    setCanDeleteNotUseful(role === "admin" || role === "manager");
    getAuthMe(false).then(me => {
      setCanDeleteNotUseful(me?.role === "admin" || me?.role === "manager");
    }).catch(() => {});
  }, []);

  useEffect(() => { setSelectedIds([]); }, [tab, filterCSR, search, stateFilter, phoneFilter]);

  const openReassign = (lead: BinLead) => {
    setReassignLead(lead);
    setSelectedCsrId("");
    setShowReassign(true);
    if (csrOptions.length === 0) {
      API.get("/admin/csrs").then(res => setCsrOptions(res.data.csrs ?? [])).catch(() => toast.error("Failed to load CSRs."));
    }
  };

  const confirmReassign = async () => {
    if (!reassignLead || !selectedCsrId) return;
    setIsReassigning(true);
    try {
      await API.put(`/admin/lead/${reassignLead.id}/reassign`, { csrId: selectedCsrId });
      const name = csrOptions.find(c => c.id === selectedCsrId)?.name ?? "another CSR";
      toast.success(`Lead reassigned to ${name}.`);
      setLeads(prev => prev.filter(l => l.id !== reassignLead.id));
      setShowReassign(false);
      setReassignLead(null);
    } catch { toast.error("Failed to reassign lead."); }
    finally { setIsReassigning(false); }
  };

  const byTab = useMemo(() => ({
    notpicked:     leads.filter(l => binCategory(l.binReason, l.status) === "notpicked"),
    notinterested: leads.filter(l => binCategory(l.binReason, l.status) === "notinterested"),
    notuseful:     leads.filter(l => binCategory(l.binReason, l.status) === "notuseful"),
    deleted:       leads.filter(l => binCategory(l.binReason, l.status) === "deleted"),
  }), [leads]);

  const currentList = tab === "all" ? leads : byTab[tab];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return currentList.filter(l => {
      if (!matchesStateLocationFilter(l.state, l.phone, stateFilter)) return false;
      if (!matchesPhoneAreaCodeFilter(l.phone, phoneFilter)) return false;
      return !q || l.client.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.csr.name.toLowerCase().includes(q) ||
        (l.status || "").toLowerCase().includes(q) ||
        binReasonLabel(l.binReason).toLowerCase().includes(q);
    });
  }, [currentList, search, stateFilter, phoneFilter]);

  const showDelete = tab === "notuseful" && canDeleteNotUseful;
  const allVisibleSelected = filtered.length > 0 && filtered.every(l => selectedIds.includes(l.id));

  const toggleAllVisible = () => {
    setSelectedIds(allVisibleSelected ? [] : filtered.map(l => l.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    if (!window.confirm(`Permanently delete ${count} Not useful lead${count === 1 ? "" : "s"}?`)) return;
    setDeleting(true);
    try {
      const res = await API.post("/admin/bin/not-useful/delete", { ids: selectedIds });
      const deleted = Number(res.data?.deleted ?? count);
      const gone = new Set(selectedIds);
      setLeads(prev => prev.filter(l => !gone.has(l.id)));
      setSelectedIds([]);
      toast.success(`${deleted} lead${deleted === 1 ? "" : "s"} deleted.`);
    } catch {
      toast.error("Failed to delete leads.");
    } finally {
      setDeleting(false);
    }
  };

  const tabs: CapsuleTabItem<TabKey>[] = [
    { key: "all",           label: "All",            count: leads.length,               icon: Trash2     },
    { key: "notpicked",     label: "Not Picked",     count: byTab.notpicked.length,     icon: PhoneOff   },
    { key: "notinterested", label: "Not Interested", count: byTab.notinterested.length, icon: ThumbsDown },
    { key: "notuseful",     label: "Not useful",     count: byTab.notuseful.length,     icon: Ban        },
    { key: "deleted",       label: "Deleted",        count: byTab.deleted.length,       icon: Star       },
  ];

  return (
    <div className="flex min-h-screen bg-[#F5F6FA]">
      <Toaster position="top-right" />
      <StaffSidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        <DashboardNavbar />

        <div className="p-4 sm:p-6 lg:p-8 pt-[var(--app-header-h,64px)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
              <Trash2 size={20} className="text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Bin</h1>
              <p className="text-sm text-gray-400 mt-0.5">Limit-reached and deleted leads — all CSRs or filter individually.</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl lg:rounded-3xl border border-gray-100 shadow-sm p-4 sm:p-5 mb-6">
            <div className="h-[130px]">
              <BinStatsChart
                loading={loading}
                data={[
                  { name: "Not Picked", value: byTab.notpicked.length },
                  { name: "Not Interested", value: byTab.notinterested.length },
                  { name: "Not useful", value: byTab.notuseful.length },
                  { name: "Deleted", value: byTab.deleted.length },
                  { name: "Total", value: leads.length },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-4">
            <CapsuleTabs
              className="flex-1"
              tabs={tabs}
              activeKey={tab}
              onChange={key => { setTab(key); setSearch(""); }}
            />
            <div className="relative w-full sm:w-auto">
              <User2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={filterCSR}
                onChange={e => setFilterCSR(e.target.value)}
                className="appearance-none w-full sm:min-w-[200px] h-10 bg-white border border-gray-200 rounded-xl pl-10 pr-9 text-sm outline-none focus:border-[#1B6FE8]"
              >
                <option value="all">All CSRs</option>
                {allCsrs.map(c => (
                  <option key={c.id} value={c.id}>{c.csrCode ? `${c.csrCode} — ${c.name}` : c.name}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div className="bg-white rounded-2xl lg:rounded-3xl border border-gray-100 shadow-sm">
            <div className="p-4 sm:p-5 border-b border-gray-100 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="font-semibold text-gray-800 text-base sm:text-lg">Bin Leads</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {showDelete && (
                    <button
                      type="button"
                      onClick={() => void deleteSelected()}
                      disabled={selectedIds.length === 0 || deleting}
                      className="h-9 px-3 rounded-xl bg-[#1B6FE8] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                      {deleting ? "Deleting…" : `Delete selected${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
                    </button>
                  )}
                  <div className="relative flex-1 min-w-[150px] sm:w-[220px]">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text" placeholder="Search..."
                      value={search} onChange={e => setSearch(e.target.value)}
                      className="w-full h-9 sm:h-[40px] rounded-xl border border-gray-200 bg-[#FAFAFA] pl-8 pr-3 text-xs outline-none focus:border-[#1B6FE8]"
                    />
                  </div>
                  <StateFilterDropdown value={stateFilter} onChange={setStateFilter} />
                  <PhoneAreaCodeFilterInput value={phoneFilter} onChange={setPhoneFilter} />
                  <button onClick={() => void fetchLeads()} className="h-9 w-9 rounded-xl border border-gray-200 bg-[#FAFAFA] flex items-center justify-center hover:border-[#1B6FE8] text-gray-500">
                    <RefreshCw size={13} />
                  </button>
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#EAF2FE] text-[#1B6FE8] whitespace-nowrap">{filtered.length} Leads</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto px-4 sm:px-5 pb-4">
              <table className="w-full" style={{ minWidth: "860px" }}>
                <thead className={CSR_THEAD}>
                  <tr className="border-b border-gray-100">
                    {showDelete && (
                      <th className="text-left py-3 px-2">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          aria-label="Select all Not useful leads"
                          className="h-4 w-4 accent-[#1B6FE8]"
                        />
                      </th>
                    )}
                    {["#","CSR","Client","Company","Phone","Service","Reason","Updated","Action"].map(h => (
                      <th key={h} className="text-left py-3 px-2 text-[11px] sm:text-[12px] font-semibold text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1,2,3,4].map(i => (
                      <tr key={i} className="border-b border-gray-50">
                        {[1,2,3,4,5,6,7,8,9].map(j => (
                          <td key={j} className="py-4 px-2"><div className="h-3.5 bg-gray-100 rounded animate-pulse w-16"/></td>
                        ))}
                      </tr>
                    ))
                  ) : filtered.length > 0 ? filtered.map((lead, idx) => (
                    <tr key={lead.id} className="border-b border-gray-50 hover:bg-gray-50">
                      {showDelete && (
                        <td className="py-3.5 px-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(lead.id)}
                            onChange={() => toggleOne(lead.id)}
                            aria-label={`Select ${lead.client}`}
                            className="h-4 w-4 accent-[#1B6FE8]"
                          />
                        </td>
                      )}
                      <td className="py-3.5 px-2 text-xs text-gray-400">{idx + 1}</td>
                      <td className="py-3.5 px-2">
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 truncate max-w-[90px]">{lead.csr.name}</p>
                          {lead.csr.csrCode && <p className="text-[10px] text-gray-400">{lead.csr.csrCode}</p>}
                        </div>
                      </td>
                      <td className="py-3.5 px-2"><span className="font-semibold text-[13px] text-gray-800">{lead.client}</span></td>
                      <td className="py-3.5 px-2"><span className="text-[13px] text-gray-700 truncate block max-w-[100px]">{lead.company}</span></td>
                      <td className="py-3.5 px-2">
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!lead.phone || lead.phone === "N/A"}
                            onClick={() => dialer?.open({
                              destination: lead.phone,
                              leadId: lead.id,
                              clientName: lead.company || lead.client,
                            })}
                            className="group flex items-center gap-1 bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-xl text-[11px] font-medium w-fit hover:bg-[#F4F8FF] hover:text-[#1B6FE8] disabled:cursor-default"
                            title="Call this number"
                          >
                            <Phone size={10}/><span className="underline-offset-[3px] group-hover:underline group-disabled:no-underline">{lead.phone}</span>
                          </button>
                          {lead.phone && lead.phone !== "N/A" && <ChangeDialerNumber />}
                        </span>
                      </td>
                      <td className="py-3.5 px-2">
                        {lead.interestedService ? (
                          <div className="flex items-center gap-1 bg-[#FFF4E5] text-[#D97706] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap">
                            <Briefcase size={10}/>{lead.interestedService}
                          </div>
                        ) : <span className="text-gray-300 text-sm">—</span>}
                      </td>
                      <td className="py-3.5 px-2">
                        <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg whitespace-nowrap">
                          {binCategory(lead.binReason, lead.status) === "notuseful" ? "Not useful" : binReasonLabel(lead.binReason)}
                        </span>
                      </td>
                      <td className="py-3.5 px-2">
                        <span className="text-xs text-gray-400">
                          {lead.updatedAt ? formatEstDayMonth(lead.updatedAt) : "—"}
                        </span>
                      </td>
                      <td className="py-3.5 px-2">
                        <button onClick={() => openReassign(lead)} className="h-8 px-3 rounded-xl bg-[#EAF5FF] text-[#0B84F3] text-[11px] font-semibold flex items-center gap-1.5 hover:bg-blue-100 whitespace-nowrap">
                          <ArrowRightLeft size={11}/>Reassign
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={showDelete ? 10 : 9} className="py-20 text-center">
                        <Trash2 size={28} className="text-gray-200 mx-auto mb-3"/>
                        <p className="text-gray-400 text-sm">{search ? "No leads match your search." : "Bin is empty."}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showReassign && reassignLead && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-[32px] shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-[#1B6FE8] to-[#0E4FBE] px-5 sm:px-6 pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">Reassign Lead</h2>
                  <p className="text-white/70 text-xs sm:text-sm mt-0.5">Assigning <span className="font-semibold text-white">{reassignLead.client}</span></p>
                </div>
                <button onClick={() => setShowReassign(false)} className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white"><X size={15}/></button>
              </div>
            </div>
            <div className="px-5 sm:px-6 py-4 space-y-2 max-h-64 overflow-y-auto">
              {csrOptions.map(csr => (
                <button key={csr.id} onClick={() => setSelectedCsrId(csr.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all text-left ${selectedCsrId === csr.id ? "border-[#1B6FE8] bg-[#EAF2FE]" : "border-gray-100 bg-[#FAFAFA]"}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${selectedCsrId === csr.id ? "bg-[#1B6FE8]" : "bg-gray-400"}`}>{csr.name.charAt(0)}</div>
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm truncate ${selectedCsrId === csr.id ? "text-[#1B6FE8]" : "text-[#0F172A]"}`}>{csr.name}</p>
                    {csr.csrCode && <p className="text-xs text-gray-400">{csr.csrCode}</p>}
                  </div>
                  {selectedCsrId === csr.id && <div className="ml-auto w-5 h-5 rounded-full bg-[#1B6FE8] flex items-center justify-center"><Check size={11} className="text-white"/></div>}
                </button>
              ))}
            </div>
            <div className="flex gap-3 px-5 sm:px-6 pb-5 pt-2">
              <button onClick={() => setShowReassign(false)} className="flex-1 h-11 rounded-2xl bg-[#F5F6FA] text-gray-600 font-semibold text-sm">Cancel</button>
              <button onClick={confirmReassign} disabled={!selectedCsrId || isReassigning}
                className="flex-1 h-11 rounded-2xl bg-[#1B6FE8] text-white font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                <ArrowRightLeft size={14}/>{isReassigning ? "Reassigning…" : "Reassign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
