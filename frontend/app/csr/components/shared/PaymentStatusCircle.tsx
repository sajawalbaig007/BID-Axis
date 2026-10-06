interface PaymentStatusCircleProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
}

export default function PaymentStatusCircle({ percent, size = 44, strokeWidth = 4 }: PaymentStatusCircleProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 100 ? "#15803D" : clamped > 0 ? "#1B6FE8" : "#CBD5E1";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F1F2F6" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-[#0F172A]">{Math.round(clamped)}%</span>
      </div>
    </div>
  );
}
