/**
 * The reviewed feature strings of the bot's knowledge pack, by screen:
 * wallet notes, Launch rules, token images, and the basics of the token
 * page, Swap, Bridge, Portfolio and Alerts (prompts/15-community-agent.md,
 * "What it knows"). Never demo, mock, hero or marketing copy, and never a
 * live figure; a test holds every path to the 12 dictionaries.
 */

/**
 * A line of the pack: a dictionary path, or a pair of paths written
 * "term: text", where the text may be a list ("Launchpads: Every new
 * launch; Graduations; Hot launches").
 */
export type KnowledgeLine = string | readonly [term: string, text: string | readonly string[]];

export interface KnowledgeGroup {
  /** The block's tag in the pack: [features.<id>]. */
  id: string;
  /** The path of the block's heading. */
  title: string;
  lines: readonly KnowledgeLine[];
}

/** The text paths of a line's pair: one, or a list. */
export const linePaths = (text: string | readonly string[]): readonly string[] => (typeof text === "string" ? [text] : text);

export const KNOWLEDGE_GROUPS: readonly KnowledgeGroup[] = [
  {
    id: "wallet",
    title: "wallet.title",
    lines: [
      "wallet.note",
      "wallet.likelyToFail",
      ["mission.trade.notSentTitle", "mission.trade.notSent"],
      ["launch.receipt.notSentTitle", "launch.run.notSent"],
      ["mission.trade.stalledTitle", "mission.trade.stalled"],
      "launch.run.stalled",
      "launch.run.replaced",
      "launch.run.reverted",
      "mission.trade.errors.reverted",
    ],
  },
  {
    id: "launch",
    title: "meta.launch",
    lines: [
      ["launch.basics.devBuy", "launch.basics.devBuyHelp"],
      "launch.basics.zeroNote",
      ["launch.basics.socials", "launch.basics.socialsHelp"],
      ["launch.basics.name", "launch.errors.name"],
      ["launch.basics.ticker", "launch.errors.ticker"],
      ["launch.basics.description", "launch.errors.description"],
      ["launch.basics.x", "launch.errors.x"],
      ["launch.basics.telegram", "launch.errors.telegram"],
      ["launch.basics.website", "launch.errors.website"],
      ["launch.lock.duration", "launch.errors.days"],
      ["launch.lock.vesting", "launch.lock.monthHelp"],
      ["launch.agent.name", "launch.errors.agentName"],
      ["launch.agent.role", "launch.errors.agentRole"],
      ["launch.agent.brief", "launch.errors.agentBrief"],
      "launch.lock.messageIronclad",
      "launch.lock.messageStandard",
      "launch.lock.messageNone",
      "launch.lock.scoreYes",
      "launch.lock.scoreNo",
      "launch.lock.badgeNo",
      ["launch.economics.crewTitle", "launch.economics.crewHelp"],
      "launch.economics.poolNote",
      "launch.economics.tierFloor",
      "launch.economics.noticeNoBuy",
      ["launch.summary.included", "launch.summary.includedBody"],
      ["launch.review.title", "launch.review.rules"],
      ["launch.steps.agent", "launch.agent.previewNote"],
      ["launch.score.title", "launch.score.note"],
      "launch.run.migrator",
      ["launch.receipt.pendingTitle", "launch.receipt.pendingBody"],
    ],
  },
  {
    id: "images",
    title: "launch.basics.image",
    lines: ["tokenImage.help", "tokenImage.sign", "tokenImage.errors.limit"],
  },
  {
    id: "token",
    title: "meta.token",
    lines: [
      "mission.trade.errors.early",
      "mission.trade.capped",
      "mission.trade.graduatedPool",
      "mission.trade.errors.graduated",
      "mission.trade.errors.migrator",
      "mission.trade.errors.approvedNotSent",
      "mission.pausedNoticeSells",
      "mission.creator.timeLockNote",
      ["mission.creator.extend", ["mission.creator.extendSub", "mission.creator.extendVestNote"]],
      ["mission.creator.extendDays", "mission.creator.extendMin"],
      ["mission.creator.edit", "mission.creator.editSub"],
      "mission.action.forbidden",
    ],
  },
  {
    id: "swap",
    title: "nav.swap",
    lines: [
      "swap.signNote",
      ["swap.slippageTitle", "swap.slippageHint"],
      ["swap.chooseToken", "swap.noResults"],
      ["swap.recent", "swap.recentEmptyBody"],
      "swap.errors.expired",
      "swap.errors.failed",
    ],
  },
  {
    id: "bridge",
    title: "nav.bridge",
    lines: [
      ["bridge.how.step1Title", "bridge.how.step1Body"],
      ["bridge.how.step2Title", "bridge.how.step2Body"],
      ["bridge.how.step3Title", "bridge.how.step3Body"],
      ["bridge.how.routesTitle", "bridge.how.routesBody"],
      "bridge.note",
      ["bridge.review.title", "bridge.recipient.warning"],
      "bridge.progress.slow",
      "bridge.progress.support",
      ["bridge.recent.title", "bridge.recent.note"],
    ],
  },
  {
    id: "portfolio",
    title: "nav.portfolio",
    lines: [
      "portfolio.connect.body",
      "portfolio.assets.unpricedNote",
      "portfolio.assets.footSource",
      "portfolio.activity.footSource",
      ["portfolio.failedTitle", "portfolio.failedBody"],
      "portfolio.receive.warnRh",
      "portfolio.receive.warnSol",
    ],
  },
  {
    id: "alerts",
    title: "nav.alerts",
    lines: [
      "alerts.subtitle",
      ["alerts.launchpads", ["alerts.launches", "alerts.padGraduations", "alerts.padHot"]],
      "alerts.hotHint",
      ["alerts.watching", ["alerts.graduations", "alerts.locks"]],
      "alerts.watchHint",
      "alerts.emptyRules",
      ["alerts.notify", "alerts.notifyHint"],
      "alerts.form.full",
      "alerts.testnet",
    ],
  },
];
