"use client";

import { useRef, useState } from "react";
import { ExternalLink, Eye, ImageIcon, Loader2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import ProofImagePreview from "./ProofImagePreview";
import { isImageProofUrl } from "../utils/uploadAccountsProof";

type ProofUploadFieldProps = {
  proofUrl?: string;
  proofName?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => void;
  compact?: boolean;
  disabled?: boolean;
  label?: string;
};

export default function ProofUploadField({
  proofUrl,
  proofName,
  onUpload,
  onRemove,
  compact = false,
  disabled = false,
  label = "Upload image",
}: ProofUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const pickFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    setBusy(true);
    try {
      await onUpload(file);
      toast.success("Image uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const canPreview = proofUrl && isImageProofUrl(proofUrl);

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void pickFile(f);
          }}
        />
        <div className="inline-flex items-center gap-1 flex-wrap justify-center">
          {proofUrl ? (
            <>
              {canPreview ? (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="h-7 px-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 inline-flex items-center gap-1 hover:bg-emerald-100"
                  title={proofName || "Preview image"}
                >
                  <Eye size={11} />
                  Preview
                </button>
              ) : (
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-7 px-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 inline-flex items-center gap-1"
                >
                  <ExternalLink size={10} />
                  View
                </a>
              )}
              <button
                type="button"
                disabled={busy || disabled}
                onClick={() => inputRef.current?.click()}
                className="h-7 px-2 rounded-lg border border-crm-border text-[10px] font-bold text-crm-text-secondary hover:bg-crm-surface-muted disabled:opacity-50"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : "Replace"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy || disabled}
              onClick={() => inputRef.current?.click()}
              className="h-7 px-2.5 rounded-lg bg-[#EAF5FF] border border-[#D6EBFF] text-[10px] font-bold text-[#0B84F3] inline-flex items-center gap-1 hover:bg-[#D6EBFF] disabled:opacity-50"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
              Image
            </button>
          )}
        </div>
        {canPreview && (
          <ProofImagePreview
            open={previewOpen}
            url={proofUrl!}
            title={proofName}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void pickFile(f);
        }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        {canPreview && (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="h-16 w-16 rounded-xl overflow-hidden border-2 border-emerald-200 shadow-sm hover:ring-2 hover:ring-emerald-300 transition-all shrink-0"
            title="Click to preview"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proofUrl} alt="" className="w-full h-full object-cover" />
          </button>
        )}
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
          className="h-8 px-3 rounded-xl bg-crm-surface border border-crm-border text-[11px] font-bold text-crm-text-secondary inline-flex items-center gap-1.5 hover:border-[#0B84F3] hover:text-[#0B84F3] disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {proofUrl ? "Replace image" : label}
        </button>
        {proofUrl && (
          <>
            {!canPreview && (
              <a
                href={proofUrl}
                target="_blank"
                rel="noreferrer"
                className="h-8 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1"
              >
                <ImageIcon size={13} />
                Open file
                <ExternalLink size={11} />
              </a>
            )}
            {canPreview && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="h-8 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1"
              >
                <Eye size={13} />
                Preview
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="h-8 px-2 rounded-xl text-[11px] font-bold text-red-500 hover:bg-red-50"
              >
                Remove
              </button>
            )}
          </>
        )}
      </div>
      {canPreview && (
        <ProofImagePreview
          open={previewOpen}
          url={proofUrl!}
          title={proofName}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
