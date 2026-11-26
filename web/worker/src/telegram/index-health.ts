import type { ChannelPoster } from "./channel";
import type { CommunityHooks } from "./community/types";
import type { Poller } from "./poller";
import type { Sender } from "./sender";

export interface HealthInput {
  poller: Poller;
  sender: Sender;
  channel: ChannelPoster | null;
  community: CommunityHooks | undefined;
  username: string | null;
  inline: boolean;
  privacyMode: boolean;
}

const iso = (at: number | null) => (at ? new Date(at).toISOString() : null);

/**
 * The bot's part of the worker's public /health: polling, counts and
 * switches, never an ID or a text. Of the community agent only whether it
 * runs: its budget, AI state, rights and raids are in /status in the admin
 * chat, so nobody outside can watch for weak moments.
 */
export function botHealth(input: HealthInput): Record<string, unknown> {
  const { poller, sender, channel } = input;
  return {
    enabled: true,
    polling: poller.health.state,
    bot: input.username,
    updates: poller.health.updates,
    lastUpdateAt: iso(poller.health.lastUpdateAt),
    calls: sender.stats.calls,
    failed: sender.stats.failed,
    dropped: { replies: sender.stats.dropped, updates: poller.health.dropped },
    inline: input.inline,
    privacyMode: input.privacyMode,
    channel: channel ? { enabled: true, posted: channel.stats.posted, skipped: channel.stats.skipped, lastPostAt: iso(channel.stats.lastPostAt) } : { enabled: false },
    community: input.community?.health() ?? { enabled: false },
  };
}
