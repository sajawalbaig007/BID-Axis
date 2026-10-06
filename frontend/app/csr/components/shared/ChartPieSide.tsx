"use client";

import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { StatusSlice } from "../../constants/statusChart";
import { useMounted } from "@/lib/useMounted";

interface Props {
  data: StatusSlice[];
  title?: string;
}

const SIZE = 176;
const RADIUS = 72;

export default function ChartPieSide({ data, title }: Props) {
  const mounted = useMounted();

  return (
    <div className="flex flex-col items-center">
      {title && (
        <p className="text-xs sm:text-[13px] font-semibold text-gray-600 dark:text-crm-text-secondary mb-2 text-center">{title}</p>
      )}
      <div
        className="w-44 h-44 sm:w-52 sm:h-52 lg:w-56 lg:h-56 shrink-0 flex items-center justify-center"
        style={{ minWidth: SIZE, minHeight: SIZE }}
      >
        {mounted && data.length > 0 ? (
          <PieChart width={SIZE} height={SIZE}>
            <Tooltip
              formatter={(value, name) => [`${value} Leads`, name]}
              contentStyle={{ borderRadius: "14px", border: "1px solid #eee", boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}
            />
            <Pie
              data={data}
              cx={SIZE / 2}
              cy={SIZE / 2}
              outerRadius={RADIUS}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map(slice => (
                <Cell key={slice.name} fill={slice.color} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
          </PieChart>
        ) : null}
      </div>
    </div>
  );
}
