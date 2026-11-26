import { fmt } from "@/shared/i18n/config";
import type { Dictionary } from "@/shared/i18n/dictionaries/en";
import { block, item, sub, term } from "./knowledge-text";

/** The Docs page's sections, in its order (DOC_SECTIONS in modules/docs/lib/sections.ts; a test holds the two equal). */
export const KNOWLEDGE_SECTIONS = ["about", "launching", "curve", "fees", "locks", "crew", "tax", "score", "safety", "faq"] as const;

type Section = (typeof KNOWLEDGE_SECTIONS)[number];
type FigureKey = "fee" | "reserves" | "startCap" | "graduation" | "status" | "reserveNow" | "maxCurve";

/**
 * Where the page shows live figures: their labels, never their values, which
 * change on the chain and come only from the launchpad_figures tool.
 */
const live = (t: Dictionary, keys: readonly FigureKey[]) => `Live figures, read with launchpad_figures: ${keys.map((key) => t.docs.figures[key]).join("; ")}.`;

/** The line under a group of figures on mainnet: where they are read. Left out without a network. */
const source = (t: Dictionary, chain: string | null) => (chain ? fmt(t.docs.figures.live, { chain }) : "");

/** The example Crew badge the page shows beside its meaning (ScoreCard). */
const CREW_EXAMPLE = "2%";

/**
 * Each section's lines, as its card on the Docs page shows them in mainnet
 * mode (modules/docs/components/*Card.tsx): paragraphs, sub-headings, the
 * terms beside their meanings, and the labels of live figures. Invite-only
 * notes are left out: the site says whether Launch is invite-only.
 */
const SECTIONS: Record<Section, (t: Dictionary, chain: string | null) => readonly string[]> = {
  about: (t) => {
    const a = t.docs.about;
    return [a.intro, term(t.nav.explore, a.explore), term(t.nav.swap, a.swap), term(t.nav.bridge, a.bridge), term(t.nav.portfolio, a.portfolio), term(t.nav.launch, a.launch)];
  },
  launching: (t) => {
    const l = t.docs.launching;
    const steps = t.launch.steps;
    return [
      l.intro,
      term(steps.basics, l.basics),
      term(steps.lock, l.lock),
      term(steps.economics, l.economics),
      term(steps.agent, l.agent),
      sub(l.devBuyTitle),
      l.devBuy,
      sub(l.reviewTitle),
      l.review,
      l.images,
    ];
  },
  curve: (t, chain) => {
    const c = t.docs.curve;
    return [c.price, c.reserves, c.supply, live(t, ["reserves", "startCap", "graduation"]), source(t, chain), t.docs.figures.newLaunches, sub(c.graduationTitle), c.graduation, c.seed, c.locked, c.guard];
  },
  fees: (t, chain) => {
    const f = t.docs.fees;
    return [
      f.launchFee,
      live(t, ["fee"]),
      source(t, chain),
      sub(f.tradeTitle),
      f.trade,
      f.cap,
      sub(f.tiersTitle),
      item(f.tierNone),
      item(f.tierStandard),
      item(f.tierIronclad),
      f.tierFloor,
      f.crewFloor,
      sub(f.referralTitle),
      f.referral,
      sub(f.graduationTitle),
      f.graduation,
      sub(f.poolTitle),
      f.pool,
      f.share,
    ];
  },
  locks: (t) => {
    const l = t.docs.locks;
    const kinds = t.launch.lock;
    return [
      l.intro,
      term(kinds.time, l.time),
      term(kinds.linear, l.linear),
      term(kinds.none, l.none),
      l.rules,
      l.claim,
      sub(l.extendTitle),
      l.extend,
      l.extendVest,
      sub(l.badgeTitle),
      term(t.badges.locked, l.badge),
    ];
  },
  crew: (t) => {
    const c = t.docs.crew;
    return [c.intro, c.eligible, sub(c.floorTitle), c.floor, sub(c.claimTitle), c.claim, sub(c.afterTitle), c.after];
  },
  tax: (t) => {
    const x = t.docs.tax;
    return [term(t.launch.preview.shield, x.body), x.burn, x.why, x.wait];
  },
  score: (t) => {
    const s = t.docs.score;
    const b = t.badges;
    return [
      s.intro,
      term(t.score.Safe, s.safe),
      term(t.score.Caution, s.caution),
      term(t.score.Risky, s.risky),
      sub(s.howTitle),
      s.how,
      s.tonk,
      sub(s.badgesTitle),
      term(b.locked, s.locked),
      term(fmt(b.crew, { pct: CREW_EXAMPLE }), s.crew),
      term(b.agent, s.agent),
      term(b.hot, s.hot),
      term(b.new, s.new),
      term(b.graduated, s.graduated),
      term(b.rwa, s.rwa),
      term(t.launch.preview.shield, s.shield),
    ];
  },
  safety: (t, chain) => {
    const s = t.docs.safety;
    return [
      s.security,
      sub(s.limitsTitle),
      s.limits,
      live(t, ["reserveNow", "maxCurve"]),
      sub(s.ownerTitle),
      s.owner,
      s.cannot,
      sub(s.pauseTitle),
      s.pause,
      live(t, ["status"]),
      source(t, chain),
      sub(s.contractsTitle),
      s.contracts,
    ];
  },
  faq: (t) => {
    const q = t.docs.faq;
    const ids = Object.keys(q.questions) as (keyof typeof q.questions)[];
    return ids.flatMap((id) => [`Q: ${q.questions[id]}`, `A: ${q.answers[id]}`]);
  },
};

/**
 * The Docs page as text, in page order: its title, then one block per
 * section ([docs.fees] Fees). `chain` names the network its live figures
 * are read on ("Robinhood Chain").
 */
export function docsBlocks(t: Dictionary, chain: string | null): string[] {
  const d = t.docs;
  return [block("docs", `${d.eyebrow} · ${d.title}`, [d.subtitle]), ...KNOWLEDGE_SECTIONS.map((id) => block(`docs.${id}`, d[id].title, SECTIONS[id](t, chain)))];
}
