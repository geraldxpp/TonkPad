"use client";

import { ImageUp, LoaderCircle, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { useWallet } from "@/shared/wallet/wallet";
import { IMAGE_TYPES, imageHost } from "./image";
import { isInvited } from "./invites";
import { fileProblem, problemOf, type UploadProblem, uploadTokenImage } from "./upload-image";

interface ImagePickerProps {
  /** The image's address, or "" while the token shows its letter. */
  value: string;
  onChange: (url: string) => void;
  /** The token as it looks now, its image or its letter, drawn by the screen. */
  preview: ReactNode;
  label: string;
  /** "card": stacked, for Launch's narrow column; "row": the tile beside the text, for Edit details. */
  layout: "card" | "row";
  /** Something else is with the wallet. */
  disabled?: boolean;
}

const BUTTON =
  "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-raised px-2.5 py-1 text-[11px] leading-[1.3] font-semibold text-text hover:bg-input disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Picks, uploads and removes a token's image. Uploading needs the connected
 * Robinhood Chain wallet's signature (free; it sends nothing), and while
 * Launch is invite-only an invited wallet; until one is connected it says
 * so, and the screen's own Connect does the rest. The server re-encodes the
 * file to a 512 × 512 WebP and answers with its address, which the screen keeps.
 */
export function ImagePicker({ value, onChange, preview, label, layout, disabled = false }: ImagePickerProps) {
  const { t, lang } = useI18n();
  const ti = t.tokenImage;
  const owner = useWallet().accounts.rh ?? null;
  const input = useRef<HTMLInputElement>(null);
  const textId = useId();
  const [step, setStep] = useState<"idle" | "sign" | "upload">("idle");
  const [problem, setProblem] = useState<UploadProblem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // An upload ends after a signature and a round trip: by then the form may have changed, so the newest callback gets the address.
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });

  const closed = imageHost() === null || problem === "closed";
  const uninvited = owner !== null && (!isInvited(owner) || problem === "invite");
  const busy = step !== "idle";
  const failed = problem !== null && problem !== "closed" && problem !== "invite";

  const pick = async (file: File | undefined) => {
    if (!file || !owner) return;
    setNote(null);
    const local = fileProblem(file);
    setProblem(local);
    if (local) return;
    setStep("sign");
    try {
      const url = await uploadTokenImage({ file, owner, lang, template: ti.message, onSigned: () => setStep("upload") });
      changed.current(url);
      setNote(ti.done);
    } catch (error) {
      setProblem(problemOf(error));
    } finally {
      setStep("idle");
    }
  };

  const remove = () => {
    onChange("");
    setProblem(null);
    setNote(ti.removed);
  };

  const text = closed
    ? ti.notSetUp
    : uninvited
      ? ti.inviteOnly
      : step === "sign"
        ? ti.sign
        : step === "upload"
          ? ti.uploading
          : failed
            ? ti.errors[problem as Exclude<UploadProblem, "closed" | "invite">]
            : (note ?? (owner ? ti.help : ti.connect));
  const card = layout === "card";
  return (
    <div className={card ? "flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-bg px-3 py-3.5 text-center" : "flex items-start gap-3"}>
      <span className="relative flex flex-none">
        {preview}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-bg/60">
            <LoaderCircle size={18} strokeWidth={2} className="tk-spin text-text" aria-hidden="true" />
          </span>
        ) : null}
      </span>
      <div className={cn("flex min-w-0 flex-col", card ? "mt-2.5 items-center" : "flex-1 items-start")}>
        <strong className="block text-[12px] font-medium">{label}</strong>
        <small id={textId} aria-live="polite" className={cn("mt-1 block text-[10px] leading-[1.6]", failed && !busy ? "text-neg" : "text-text-3")}>
          {text}
        </small>
        <div className={cn("mt-2 flex flex-wrap gap-1.5", card && "justify-center")}>
          {closed || uninvited || !owner ? null : (
            <button type="button" disabled={busy || disabled} aria-describedby={textId} onClick={() => input.current?.click()} className={BUTTON}>
              <ImageUp size={14} strokeWidth={2} aria-hidden="true" />
              {value ? ti.change : ti.choose}
            </button>
          )}
          {value ? (
            <button type="button" disabled={busy || disabled} onClick={remove} className={BUTTON}>
              <X size={14} strokeWidth={2} aria-hidden="true" />
              {ti.remove}
            </button>
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          tabIndex={-1}
          aria-hidden="true"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void pick(file);
          }}
        />
      </div>
    </div>
  );
}
