"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

type BinChartPoint = { name: string; value: number };

export default function BinStatsChart({
  loading,
  data,
}: {
  loading: boolean;
  data: BinChartPoint[];
}) {
  if (loading) {
    return <div className="h-full bg-gray-50 rounded-2xl animate-pulse" />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} barSize={52}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#6B7280", fontWeight: 600 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} width={28} />
        <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: "12px" }} />
        <Bar dataKey="value" radius={[7, 7, 0, 0]} name="Count">
          {["#F59E0B", "#1B6FE8", "#7C3AED", "#6366F1", "#6B7280"].map((fill, i) => (
            <Cell key={i} fill={fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
