/**
 * The bot's words in English, the source of truth. Every other language has
 * the same keys and keeps the same {placeholders} (telegram-i18n.test.ts).
 * Kept in the worker, not the site's dictionaries, so the site's pages don't
 * carry them and a change here redeploys the worker. Names of tokens, chains
 * and launchpads, tickers and numbers are not translated.
 */
export const en = {
  profile: {
    short: "Check new tokens before you buy, and follow launches on tonkfun.fun, Pons and Pump.fun.",
    description:
      "Paste a token address to see its Mission score, locks and key numbers. Follow the newest launches on tonkfun.fun, Pons and Pump.fun, make your referral link, and open any token on tonkfun.fun.\n\nThis bot never asks for your keys and never sends a transaction.",
  },
  commands: {
    start: "Home",
    check: "Check a token",
    launches: "Latest launches",
    referral: "Your referral link",
    help: "How it works",
  },
  home: {
    body: "Check new tokens before you buy, and follow every launch.",
    hint: "Paste a token address, or choose below.",
    check: "Check a token",
    launches: "Latest launches",
    referral: "Referral link",
    help: "How it works",
    open: "Open tonkfun.fun",
  },
  check: {
    prompt: "Send me a token address to check.",
    placeholder: "0x… or a Solana address",
    groupUsage: "Add a token address after the command: /check 0x…",
    notFound: "I don't follow this token.",
    notFoundBody: "I follow every tonkfun.fun launch, and Pump.fun, Bonk.fun and Pons tokens for about a day after launch.",
    lookUp: "Look it up on tonkfun.fun",
    notAddress: "That doesn't look like a token address.",
    notAddressBody: "Paste a full address: 0x… for Robinhood Chain, or a Solana address.",
  },
  card: {
    score: "Mission score {score} · {level}",
    marketCap: "Market cap {value}",
    change: "24h {value}",
    curve: "Bonding curve {value}",
    graduated: "Graduated to its own pool",
    holders: "Holders {value}",
    noMarket: "Market data is still coming in.",
    open: "Open on tonkfun.fun",
    refresh: "Refresh",
    share: "Share",
    shareText: "{name} on tonkfun.fun",
    refreshed: "Up to date",
  },
  levels: { Safe: "Safe", Caution: "Caution", Risky: "Risky" },
  badges: {
    locked: "Locked",
    crew: "Crew {pct}",
    shield: "Block-0 Shield",
    agent: "Agent",
    graduated: "Graduated",
    rwa: "Verified RWA",
  },
  launches: {
    on: "Latest on {pad}",
    trendingTitle: "Trending now",
    trending: "Trending",
    empty: "No launches yet. New ones appear here the moment they go live.",
    trendingEmpty: "Nothing is trending right now. Check back soon.",
    row: "Score {score} · {level} · {age} ago",
    explore: "Open Explore",
  },
  age: { s: "{n}s", m: "{n}m", h: "{n}h", d: "{n}d" },
  referral: {
    title: "Your referral link",
    prompt: "Send me the wallet that should earn, starting with 0x. Curve trades on tonkfun.fun through your link pay it 25% of the 1% protocol fee.",
    placeholder: "Your wallet, 0x…",
    notWallet: "That isn't a wallet address. Send one that starts with 0x and has 42 characters.",
    isToken: "That's a token's address, not a wallet. Send your own wallet's address, starting with 0x.",
    pays: "When someone trades on a tonkfun.fun curve through your link, the contract sends this wallet 25% of the 1% protocol fee, straight away.",
    limits: "Only curve trades count, and a visitor keeps the first link they open.",
    share: "Share link",
    open: "Open",
    shareText: "Check tokens and follow launches on tonkfun.fun",
  },
  help: {
    title: "How it works",
    paste: "Paste a new token's address to see its Mission score and key numbers.",
    launches: "/launches shows the newest launches on tonkfun.fun, Pons and Pump.fun, and what's trending.",
    referral: "/referral makes your referral link.",
    groups: "In a group, send /check followed by an address.",
    inline: "In any chat, type @{bot} and an address to share a token's card.",
    score: "The Mission score rates a token from facts on the chain, such as locks, holders and supply. It isn't advice to buy.",
    safety: "tonkfun.fun will never ask for your seed phrase or keys, and this bot never sends a transaction.",
    docs: "Docs",
  },
  common: {
    back: "Back",
    slowDown: "One moment, please.",
    unavailable: "Live data is unavailable right now. Please try again in a minute.",
  },
  inline: {
    help: "How to use this bot",
    notFound: "Token not found · How it works",
  },
  channel: {
    launch: "New launch",
    lock: "{pct} of the dev buy locked for {days}",
    vest: "{pct} of the dev buy vests over {days}",
    days: { one: "{count} day", few: "{count} days", many: "{count} days", other: "{count} days" },
    crew: "Crew Rewards {pct}",
    shieldOn: "Block-0 Shield on",
    half: "Halfway to graduation",
    almost: "Almost graduated",
    sold: "{pct} of its curve is sold.",
    graduated: "Graduated",
    graduatedBody: "Its curve sold out, and it now trades on its own Uniswap pool with the liquidity locked.",
    lockExtended: "Creator lock extended",
    lockUntil: "Locked until {date}.",
    shield: "Block-0 Shield report",
    shieldBody: "{buys} in its first blocks paid the 99% tax: {eth} ETH burned.",
    buys: { one: "{count} buy", few: "{count} buys", many: "{count} buys", other: "{count} buys" },
  },
};

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every language's bot dictionary has. */
export type BotDictionary = Widen<typeof en>;
