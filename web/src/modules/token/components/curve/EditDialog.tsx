"use client";

import { type ReactNode, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { AGENT_VOICES, type AgentSettings, type AgentVoice, decodeAgent, decodeMetadata, LIMITS, normalizeTelegram, normalizeWebsite, normalizeX } from "@/shared/tonk/metadata";
import type { ActionRequest, MissionJson } from "@/shared/tonk/mission";
import { Sheet } from "@/shared/ui/Sheet";

const INPUT = "w-full min-w-0 rounded-lg border border-line-strong bg-bg px-3 py-2 text-[14px] leading-[1.6] text-text placeholder:text-text-3 aria-[invalid=true]:border-neg";

interface EditDialogProps {
  open: boolean;
  onClose: () => void;
  mission: MissionJson;
  owner: string;
  /** Something is with the wallet or confirming. */
  busy: boolean;
  /** Where the edit stands, once it has been asked for. */
  note: ReactNode;
  onAction: (request: ActionRequest) => void;
}

function Field({ id, label, error, children }: { id: string; label: string; error: string | null; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-medium text-text-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="m-0 text-[12px] leading-[1.5] text-neg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Edit a mission's details: the description, the links and the agent's
 * brief, with the Creator Studio's own checks. The contract replaces both
 * stored texts at once, so the form starts from what is on-chain and always
 * sends everything. Name and ticker can't change.
 */
export function EditDialog({ open, onClose, mission, owner, busy, note, onAction }: EditDialogProps) {
  const { t } = useI18n();
  const c = t.mission.creator;
  const b = t.launch.basics;
  const a = t.launch.agent;
  const e = t.launch.errors;
  const [stored] = useState(() => ({ details: decodeMetadata(mission.metadata), agent: decodeAgent(mission.agentPrompt) }));
  const [details, setDetails] = useState(stored.details);
  const [agentOn, setAgentOn] = useState(stored.agent !== null);
  const [agent, setAgent] = useState<AgentSettings>(stored.agent ?? { name: "", role: "", voice: "tactical", brief: "" });
  const errors = {
    description: details.description.length > LIMITS.description ? e.description : null,
    x: normalizeX(details.x) === null ? e.x : null,
    telegram: normalizeTelegram(details.telegram) === null ? e.telegram : null,
    website: normalizeWebsite(details.website) === null ? e.website : null,
    agentName: agentOn && !agent.name.trim() ? e.agentName : null,
    agentRole: agentOn && !agent.role.trim() ? e.agentRole : null,
    agentBrief: agentOn && !agent.brief.trim() ? e.agentBrief : null,
  };
  const valid = Object.values(errors).every((error) => error === null);
  const save = () =>
    onAction({
      kind: "edit",
      token: mission.token,
      owner,
      description: details.description.trim(),
      x: details.x.trim(),
      telegram: details.telegram.trim(),
      website: details.website.trim(),
      agent: agentOn ? { name: agent.name.trim(), role: agent.role.trim(), voice: agent.voice, brief: agent.brief.trim() } : null,
    });
  const link = (key: "x" | "telegram" | "website", label: string, placeholder: string) => (
    <Field id={`mission-edit-${key}`} label={label} error={errors[key]}>
      <input
        id={`mission-edit-${key}`}
        value={details[key]}
        maxLength={LIMITS.link}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => setDetails({ ...details, [key]: event.target.value })}
        aria-invalid={errors[key] ? true : undefined}
        className={INPUT}
      />
    </Field>
  );
  return (
    <Sheet open={open} onClose={onClose} title={c.editTitle} subtitle={c.editSub} busy={busy}>
      <Field id="mission-edit-description" label={b.description} error={errors.description}>
        <textarea
          id="mission-edit-description"
          rows={3}
          value={details.description}
          maxLength={LIMITS.description}
          onChange={(event) => setDetails({ ...details, description: event.target.value })}
          aria-invalid={errors.description ? true : undefined}
          className={`${INPUT} resize-y`}
        />
      </Field>
      {link("x", b.x, "@handle")}
      {link("telegram", b.telegram, "t.me/…")}
      {link("website", b.website, "example.com")}
      <label className="flex items-center justify-between gap-3 border-t border-line pt-4 text-[13px] font-medium">
        {t.launch.steps.agent}
        <input type="checkbox" role="switch" aria-label={`${t.launch.steps.agent}: ${a.enabled}`} checked={agentOn} onChange={(event) => setAgentOn(event.target.checked)} className="size-4 accent-cta" />
      </label>
      {agentOn ? (
        <>
          <Field id="mission-edit-agent-name" label={a.name} error={errors.agentName}>
            <input id="mission-edit-agent-name" value={agent.name} maxLength={LIMITS.agentName} autoComplete="off" onChange={(event) => setAgent({ ...agent, name: event.target.value })} aria-invalid={errors.agentName ? true : undefined} className={INPUT} />
          </Field>
          <Field id="mission-edit-agent-role" label={a.role} error={errors.agentRole}>
            <input id="mission-edit-agent-role" value={agent.role} maxLength={LIMITS.agentRole} autoComplete="off" onChange={(event) => setAgent({ ...agent, role: event.target.value })} aria-invalid={errors.agentRole ? true : undefined} className={INPUT} />
          </Field>
          <Field id="mission-edit-agent-voice" label={a.voice} error={null}>
            <select id="mission-edit-agent-voice" value={agent.voice} onChange={(event) => setAgent({ ...agent, voice: event.target.value as AgentVoice })} className={INPUT}>
              {AGENT_VOICES.map((voice) => (
                <option key={voice} value={voice}>
                  {a[voice]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="mission-edit-agent-brief" label={a.brief} error={errors.agentBrief}>
            <textarea id="mission-edit-agent-brief" rows={3} value={agent.brief} maxLength={LIMITS.agentBrief} onChange={(event) => setAgent({ ...agent, brief: event.target.value })} aria-invalid={errors.agentBrief ? true : undefined} className={`${INPUT} resize-y`} />
          </Field>
        </>
      ) : null}
      {note}
      <button type="button" disabled={busy || !valid} onClick={save} className="min-h-11 rounded-lg bg-cta px-4 text-[14px] font-semibold text-on-cta disabled:cursor-not-allowed disabled:opacity-60">
        {c.save}
      </button>
    </Sheet>
  );
}
