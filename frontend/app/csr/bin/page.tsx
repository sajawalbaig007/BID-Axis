"use client";

import { useMemo, useState } from "react";
import {
  Search, RefreshCw, Phone, Briefcase,
  Trash2, ArrowUpCircle, Star, ThumbsDown, PhoneOff,
} from "lucide-react";
import toast from "react-hot-toast";

import TopNavbar from "../components/navigation/TopNavbar";
import StackedHorizontalBarChart, { StackedBarRow } from "../components/shared/StackedHorizontalBarChart";
import Pagination from "../components/shared/Pagination";
import { CSR_TABLE_CARD, CSR_TABLE_WRAP, CSR_THEAD, CSR_TH, CSR_TABLE_CLASS, CsrColGroup, COL_9_BIN, CSR_PAGE_MAIN } from "../components/shared/csrTableStyles";
import { getTimezoneAbbr, tzBadgeClass, getTimezoneAbbrFromPhone } from "../constants/timezoneAbbr";

import { useBinData, binCategory, binReasonLabel } from "../hooks/useBinData";
import StateFilterDropdown from "../components/shared/StateFilterDropdown";
import PhoneAreaCodeFilterInput from "../components/shared/PhoneAreaCodeFilterInput";
import { matchesStateLocationFilter, matchesPhoneAreaCodeFilter } from "@/lib/stateLocationFilter";
import SubContactsCell from "@/app/components/clients/SubContactsCell";
import CapsuleTabs, { type CapsuleTabItem } from "@/app/components/CapsuleTabs";
import API from "@/lib/api";
import { ChangeDialerNumber, useZoomDialer } from "../components/dialer/ZoomDialerProvider";
import { formatEstDayMonth } from "@/lib/estTime";

const PAGE_SIZE = 30;
type TabKey = "all" | "notpicked" | "notinterested" | "deleted" | "inhouse" | "noowner" | "notinservice";

export default function CSRBinPage() {
  const dialer = useZoomDialer();
  const { leads: rawLeads, setLeads, loading, refetch } = useBinData();
  const leads = useMemo(
    () => rawLeads.filter(l => binCategory(l.binReason, l.status, l.binPreviousStatus) !== "notuseful"),
    [rawLeads],
  );

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [phoneFilter, setPhoneFilter] = useState("");
  const [page,   setPage]   = useState(1);
  const [tab,    setTab]    = useState<TabKey>("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const [restoringId, setRestoringId] = useState<string | null>(null);

  const sourceOptions = useMemo(() => {
    const set = new Set(leads.map(l => l.source).filter(s => s && s !== "—"));
    return [...set].sort();
  }, [leads]);

  const cat = (l: typeof leads[0]) => binCategory(l.binReason, l.status, l.binPreviousStatus);

  const byTab = useMemo(() => ({
    notpicked:     leads.filter(l => cat(l) === "notpicked"),
    notinterested: leads.filter(l => cat(l) === "notinterested"),
    deleted:       leads.filter(l => cat(l) === "deleted"),
    inhouse:       leads.filter(l => cat(l) === "inhouse"),
    noowner:       leads.filter(l => cat(l) === "noowner"),
    notinservice:  leads.filter(l => cat(l) === "notinservice"),
  }), [leads]);

  const currentList = tab === "all" ? leads : (byTab[tab] ?? leads);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return currentList.filter(l => {
      if (statusFilter !== "all" && cat(l) !== statusFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (!matchesStateLocationFilter(l.state, l.phone, stateFilter)) return false;
      if (!matchesPhoneAreaCodeFilter(l.phone, phoneFilter)) return false;
      return !q || l.client.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.source.toLowerCase().includes(q) ||
        binReasonLabel(l.binReason).toLowerCase().includes(q);
    });
  }, [currentList, search, statusFilter, sourceFilter, stateFilter, phoneFilter, leads]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const chartRows = useMemo<StackedBarRow[]>(() => [
    {
      label: "Bin",
      segments: [
        { label: "Not Picked",     value: byTab.notpicked.length,     color: "#F59E0B" },
        { label: "Not Interested", value: byTab.notinterested.length, color: "#1B6FE8" },
        { label: "Deleted",        value: byTab.deleted.length,       color: "#6366F1" },
      ],
    },
  ], [byTab]);

  const handleRestore = async (id: string, name: string) => {
    setRestoringId(id);
    try {
      await API.put(`/csr/lead/${id}`, { inBin: false });
      setLeads(prev => prev.filter(l => l.id !== id));
      toast.success(`${name} restored.`);
    } catch { toast.error("Failed to restore lead."); }
    finally { setRestoringId(null); }
  };

  const tabs: CapsuleTabItem<TabKey>[] = [
    { key: "all",           label: "All",            count: leads.length,               icon: Trash2     },
    { key: "notpicked",     label: "Not Picked",     count: byTab.notpicked.length,     icon: PhoneOff   },
    { key: "notinterested", label: "Not Interested", count: byTab.notinterested.length, icon: ThumbsDown },
    { key: "inhouse",       label: "In House",       count: byTab.inhouse.length,       icon: Briefcase  },
    { key: "noowner",       label: "No Owner",       count: byTab.noowner.length,       icon: PhoneOff   },
    { key: "notinservice",  label: "Not In Service", count: byTab.notinservice.length,  icon: ThumbsDown },
    { key: "deleted",       label: "Deleted",        count: byTab.deleted.length,       icon: Star       },
  ];

  return (
    <div className="min-h-screen bg-[#F5F6FA] dark:bg-crm-bg">
      <TopNavbar />
      <main className={CSR_PAGE_MAIN}>

        <div className="mt-1 flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#FFF7E6] flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-[#B54708] sm:w-5 sm:h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-[28px] lg:text-[34px] font-bold text-[#0F172A] leading-tight">My Bin</h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5">
              Limit-reached leads and deleted important/interested clients.
            </p>
          </div>
        </div>

        <div className="mt-4 sm:mt-7">
          <StackedHorizontalBarChart
            title="Bin overview"
            subtitle="Only final tries and deleted clients appear here."
            rows={chartRows}
            loading={loading}
          />
        </div>

        <CapsuleTabs
          stretch
          className="mt-4 sm:mt-6"
          tabs={tabs}
          activeKey={tab}
          onChange={key => { setTab(key); setSearch(""); setPage(1); }}
        />

        <div className={CSR_TABLE_CARD}>
          <div className="p-4 sm:p-5 border-b border-[#F3F3F3]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg sm:text-[20px] font-bold text-[#0F172A]">Bin Leads</h3>
              <div className="grid w-full gap-2 grid-cols-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto_auto]">
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                  className="h-9 sm:h-[40px] w-full rounded-xl border border-gray-200 dark:border-crm-border bg-white dark:bg-crm-input px-3 text-xs outline-none focus:border-[#1B6FE8] dark:text-crm-text">
                  <option value="all">All Status</option>
                  <option value="notpicked">Not Picked</option>
                  <option value="notinterested">Not Interested</option>
                  <option value="inhouse">In House</option>
                  <option value="noowner">No Owner</option>
                  <option value="notinservice">Not In Service</option>
                  <option value="deleted">Deleted</option>
                </select>
                <select value={sourceFilter} onChange={e => { setSourceFilter(e.target.value); setPage(1); }}
                  className="h-9 sm:h-[40px] w-full rounded-xl border border-gray-200 dark:border-crm-border bg-white dark:bg-crm-input px-3 text-xs outline-none focus:border-[#1B6FE8] dark:text-crm-text">
                  <option value="all">All Sources</option>
                  {sourceOptions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div className="relative min-w-0 col-span-2 sm:col-span-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text" placeholder="Search..."
                    value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="w-full h-9 sm:h-[40px] rounded-xl border border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input pl-8 pr-3 text-xs outline-none focus:border-[#1B6FE8] dark:text-crm-text"
                  />
                </div>
                <button onClick={() => void refetch(true)}
                  className="h-9 sm:h-[40px] w-full sm:w-10 rounded-xl border border-gray-200 dark:border-crm-border bg-[#FAFAFA] dark:bg-crm-input flex items-center justify-center hover:border-[#1B6FE8] hover:text-[#1B6FE8] text-gray-500 transition-colors"
                  title="Refresh">
                  <RefreshCw size={13} />
                </button>
                <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#FFF7E6] text-[#B54708] whitespace-nowrap inline-flex items-center justify-center">
                  {filtered.length} Leads
                </span>
                <StateFilterDropdown fullWidth value={stateFilter} onChange={v => { setStateFilter(v); setPage(1); }} />
                <PhoneAreaCodeFilterInput fullWidth value={phoneFilter} onChange={v => { setPhoneFilter(v); setPage(1); }} />
              </div>
            </div>
          </div>

          <div className={CSR_TABLE_WRAP}>
            <table className={CSR_TABLE_CLASS}>
              <CsrColGroup widths={COL_9_BIN} />
              <thead className={CSR_THEAD}>
                <tr>
                  {["#","Client","Company","Phone","Sub Contacts","Service","Reason","Updated","Action"].map(h => (
                    <th key={h} className={`${CSR_TH} ${h === "Sub Contacts" ? "hidden lg:table-cell" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1,2,3].map(i => (
                    <tr key={i} className="border-b border-[#F7F7F7]">
                      {[1,2,3,4,5,6,7,8,9].map(j => (
                        <td key={j} className="py-4 px-2"><div className="h-3.5 bg-gray-100 rounded animate-pulse w-16"/></td>
                      ))}
                    </tr>
                  ))
                ) : filtered.length > 0 ? paginated.map((lead, idx) => (
                  <tr key={lead.id} className="border-b border-[#F7F7F7] hover:bg-[#FFFBF2]">
                    <td className="py-4 px-2 text-xs text-gray-400">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-[#B54708]">
                          {lead.client.charAt(0)}
                        </div>
                        <div>
                          <span className="font-semibold text-[#0F172A] text-[13px]">{lead.client}</span>
                          {(() => {
                            const tz = getTimezoneAbbr(lead.state);
                            return tz ? (
                              <span className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${tzBadgeClass(tz)}`}>{tz}</span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-2">
                      <span className="text-[13px] font-medium text-[#0F172A] max-w-[100px] truncate block">{lead.company}</span>
                    </td>
                    <td className="py-4 px-2">
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!dialer || !lead.phone || lead.phone === "N/A"}
                          onClick={() => dialer?.open({
                            destination: lead.phone,
                            leadId: lead.id,
                            clientName: lead.company || lead.client,
                          })}
                          className="group flex items-center gap-1 bg-[#FFF7E6] text-[#B54708] px-2.5 py-1.5 rounded-xl text-[11px] font-medium w-fit whitespace-nowrap hover:opacity-80 disabled:cursor-default disabled:hover:no-underline"
                          title="Call this number"
                        >
                          <Phone size={18}/><span className="underline-offset-[3px] group-hover:underline group-disabled:no-underline">{lead.phone}</span>
                        </button>
                        {dialer && lead.phone && lead.phone !== "N/A" && <ChangeDialerNumber />}
                      </span>
                    </td>
                    <td className={`hidden lg:table-cell py-4 px-2`}>
                      <SubContactsCell contacts={lead.subContacts} />
                    </td>
                    <td className="py-4 px-2">
                      {lead.interestedService ? (
                        <div className="flex items-center gap-1 bg-[#FFF4E5] text-[#D97706] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold whitespace-nowrap">
                          <Briefcase size={10}/>{lead.interestedService}
                        </div>
                      ) : <span className="text-gray-300 text-sm">—</span>}
                    </td>
                    <td className="py-4 px-2">
                      <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-lg whitespace-nowrap">
                        {binReasonLabel(lead.binReason)}
                      </span>
                    </td>
                    <td className="py-4 px-2">
                      <span className="text-xs text-gray-400">
                        {lead.updatedAt
                          ? formatEstDayMonth(lead.updatedAt)
                          : "—"}
                      </span>
                    </td>
                    <td className="py-4 px-2">
                      <button
                        onClick={() => handleRestore(lead.id, lead.client)}
                        disabled={restoringId === lead.id}
                        className="h-8 px-3 rounded-xl bg-[#F0FFF4] text-green-700 text-[11px] font-semibold flex items-center gap-1.5 hover:bg-green-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {restoringId === lead.id
                          ? <><RefreshCw size={11} className="animate-spin"/>Restoring…</>
                          : <><ArrowUpCircle size={11}/>Restore</>
                        }
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9} className="py-20 text-center">
                      <Trash2 size={28} className="text-gray-200 mx-auto mb-3"/>
                      <p className="text-gray-400 text-sm">{search ? "No leads match your search." : "Your bin is empty."}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
          </div>
        </div>
      </main>
    </div>
  );
}
