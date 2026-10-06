import BrandLogo from "@/app/components/BrandLogo";

export default function DesktopOnlyScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1220] px-5 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white px-6 py-8 text-center shadow-2xl">
        <div className="flex justify-center mb-4">
          <BrandLogo size="lg" priority />
        </div>
        <h1 className="text-xl font-bold text-[#0B1220]">Desktop only</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          This CRM opens on a desktop computer — Windows, Mac, or Linux. It does not open on a phone, including when Chrome is set to Desktop site.
        </p>
      </div>
    </div>
  );
}
