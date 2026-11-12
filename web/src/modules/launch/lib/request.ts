import type { LaunchRequest } from "@/shared/tonk/types";
import type { LaunchForm } from "./form";
import type { LaunchView } from "./view";

/** The form as the server is asked to build it, for the wallet that will sign. */
export function launchRequest(form: LaunchForm, view: LaunchView, creator: string): LaunchRequest {
  return {
    creator,
    name: form.name.trim(),
    ticker: form.ticker.trim(),
    description: form.description.trim(),
    x: form.x.trim(),
    telegram: form.telegram.trim(),
    website: form.website.trim(),
    image: form.image,
    devBuy: view.devBuy.toString(),
    lock: view.locks ? form.lock : "none",
    share: form.share,
    days: view.lock.days,
    crewBps: form.crew,
    creatorBps: form.creator,
    agent: form.agent ? { name: form.agentName.trim(), role: form.agentRole.trim(), voice: form.voice, brief: form.agentBrief.trim() } : null,
  };
}
