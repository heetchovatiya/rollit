"use client";
import { useState } from "react";
import { FileText, Upload, Check, X } from "lucide-react";
import { MAX_BILL_BYTES } from "@/lib/pos/bills";
export interface UploadedBill {
  id: string;
  name: string;
  size: number;
  type: string;
  driveStatus: string;
}
export function BillUpload({
  value,
  onChange,
  disabled = false,
  onFile,
  onBusy,
}: {
  value: UploadedBill | null;
  onChange: (bill: UploadedBill | null) => void;
  disabled?: boolean;
  onFile?: (file: File) => Promise<void>;
  onBusy?: (busy: boolean) => void;
}) {
  const [busy, B] = useState(false),
    [error, E] = useState("");
  async function upload(file: File) {
    E("");
    if (file.size > MAX_BILL_BYTES) {
      E("Bill must be 10 MB or smaller.");
      return;
    }
    B(true);
    onBusy?.(true);
    try {
      const response = await fetch("/api/bills", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Bill-Name": encodeURIComponent(file.name),
        },
        body: file,
        signal: AbortSignal.timeout(45000),
      });
      const body = (await response.json()) as UploadedBill & { error?: string };
      if (!response.ok) throw Error(body.error || "Unable to upload the bill.");
      onChange(body);
      if (onFile) await onFile(file);
    } catch (error) {
      E(error instanceof Error ? error.message : "Unable to upload this bill.");
    } finally {
      B(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="bill-upload">
      <div className="bill-heading">
        <FileText size={17} />
        <strong>Bill attachment</strong>
        <span>Optional for manual entries</span>
      </div>
      {value ? (
        <div className="attached-bill">
          <Check size={17} />
          <div>
            <strong>{value.name}</strong>
            <small>
              Saved privately{" "}
              {value.size > 0 ? `· ${(value.size / 1024).toFixed(0)} KB` : ""}
            </small>
            <a href={"/api/bills/" + value.id} target="_blank" rel="noreferrer">
              Download bill ↗
            </a>
          </div>
          <button
            type="button"
            aria-label="Remove bill from draft"
            disabled={disabled || busy}
            onClick={() => {
              onChange(null);
              E("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <label
          className={"upload-zone " + (disabled || busy ? "disabled" : "")}
        >
          <Upload size={22} />
          <strong>
            {busy ? "Uploading and reading bill…" : "Upload PDF or bill image"}
          </strong>
          <small>PDF, JPEG, PNG or WebP · up to 10 MB</small>
          <input
            aria-label="Upload bill"
            disabled={disabled || busy}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
      <p className="drive-placeholder">
        Google Drive: destination not configured. Bills are saved in private app
        storage for now.
      </p>
      {error && (
        <p role="alert" className="upload-error">
          {error}
        </p>
      )}
    </div>
  );
}
