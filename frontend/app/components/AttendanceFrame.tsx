export default function AttendanceFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-[#F3F5FA] lg:grid lg:grid-cols-[minmax(280px,400px)_minmax(0,1fr)]">
      <aside className="relative overflow-hidden bg-[#0B1220] text-white px-5 py-7 sm:px-8 lg:px-10 lg:py-12 lg:min-h-[100dvh] flex flex-col">
        <div
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full opacity-80"
          style={{ background: "radial-gradient(circle, #1B6FE8 0%, transparent 68%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-56 w-56 rounded-full opacity-40"
          style={{ background: "radial-gradient(circle, #0F766E 0%, transparent 70%)" }}
        />
        <div className="relative flex items-center gap-3">
          <img
            src="/images/LOGO.png"
            alt="BEM Solutions"
            className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-white object-contain p-1 shadow-lg"
          />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">BEM Solutions</p>
            <p className="text-sm font-semibold text-white/90">Attendance</p>
          </div>
        </div>
        <div className="relative mt-8 lg:mt-auto lg:mb-auto lg:py-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05]">{title}</h1>
          <p className="mt-3 max-w-sm text-sm sm:text-base text-white/70 leading-relaxed">{subtitle}</p>
        </div>
        <p className="relative mt-8 text-xs text-white/45">Times are Pakistan time.</p>
      </aside>
      <main className="px-4 py-5 sm:px-8 lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
