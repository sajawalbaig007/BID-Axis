"use client";

import { useMemo } from "react";
import {
  Activity, UserPlus, CheckCircle, Edit,
  AlertCircle, Phone,
} from "lucide-react";
import type { ClientLead } from "../charts/PerformanceChart";
import { formatStatusTimestamp } from "@/lib/formatStatusTimestamp";

const MAX_ITEMS = 5;

type Props = {
  leads?: ClientLead[];
  recent?: ClientLead[];
  recentStatus?: {
    id?: string;
    csrName?: string;
    leadName?: string;
    status?: string;
    createdAt?: string;
  }[];
};

type ActivityItem = {
  id:     string;
  user:   string;
  action: string;
  time:   string;
  type:   "create" | "resolve" | "update" | "alert" | "call";
};

const getIcon = (type: string) => {
  switch (type) {
    case "create":  return <UserPlus    size={13} className="text-green-600"/>;
    case "resolve": return <CheckCircle size={13} className="text-blue-600"/>;
    case "update":  return <Edit        size={13} className="text-amber-600"/>;
    case "alert":   return <AlertCircle size={13} className="text-red-600"/>;
    case "call":    return <Phone       size={13} className="text-violet-600"/>;
    default:        return <Activity    size={13} className="text-gray-600"/>;
  }
};

const getBg = (type: string) => {
  switch (type) {
    case "create":  return "bg-green-50";
    case "resolve": return "bg-blue-50";
    case "update":  return "bg-amber-50";
    case "alert":   return "bg-red-50";
    case "call":    return "bg-violet-50";
    default:        return "bg-gray-50";
  }
};

const statusToType = (s: string): ActivityItem["type"] => {
  if (s === "important")    return "alert";
  if (s === "interested")   return "call";
  if (s === "Close Client") return "resolve";
  if (s === "pending")      return "create";
  return "update";
};

export default function RecentActivity({ leads = [], recent, recentStatus }: Props) {
  const activities = useMemo<ActivityItem[]>(() => {
    if (recentStatus?.length) {
      return recentStatus.slice(0, MAX_ITEMS).map((log, index) => {
        const status = log.status ?? "updated";
        return {
          id:     log.id ?? `status-${index}`,
          user:   log.csrName ?? "CSR",
          action: `updated "${log.leadName || "Lead"}" to ${status}`,
          time:   formatStatusTimestamp(log.createdAt),
          type:   statusToType(status),
        };
      });
    }

    const source = recent?.length ? recent : leads;
    return [...source]
      .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
      .slice(0, MAX_ITEMS)
      .map((l, index) => {
        const status = l.status ?? "updated";
        return {
          id:     l.id ?? `activity-${index}`,
          user:   l.csr?.name ?? "A CSR",
          action: `updated "${l.name?.trim() || l.company?.trim() || "Lead"}" to ${status}`,
          time:   formatStatusTimestamp(l.updatedAt),
          type:   statusToType(status),
        };
      });
  }, [leads, recent, recentStatus]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Live feed</p>
          <h3 className="font-bold text-[#0F172A] dark:text-crm-text">Recent Activity</h3>
        </div>
      </div>

      {activities.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">No recent status updates</p>
      ) : (
        <div className="space-y-2">
          {activities.map(activity => (
            <div
              key={activity.id}
              className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-xl transition-all"
            >
              <div className={`${getBg(activity.type)} w-8 h-8 rounded-full flex items-center justify-center shrink-0`}>
                {getIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-snug line-clamp-2">
                  <span className="font-semibold text-gray-800">{activity.user}</span>
                  <span className="text-gray-600"> {activity.action}</span>
                </p>
                {activity.time && (
                  <p className="text-[10px] text-gray-400 mt-0.5 font-mono tabular-nums">{activity.time}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
