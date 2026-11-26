/** Who runs the bot until the owner gives a legal name (decision 13). Each language says it in its own words (privacy.rights.team). */
export const TEAM_OPERATOR = "the tonkfun.fun team";

/**
 * tonkfun.fun's bot on Telegram (worker/src/telegram): its display name and
 * handle are names, so they aren't translated. operator is who runs it, as the
 * privacy page names them: replace TEAM_OPERATOR with the legal name once the
 * owner gives one, and it shows as written in every language.
 */
export const BOT: { readonly name: "TonkFun"; readonly handle: "@TonkfunBot"; readonly operator: string } = {
  name: "TonkFun",
  handle: "@TonkfunBot",
  operator: TEAM_OPERATOR,
};

/** Who runs the bot, in the page's language: the team in that language's words (privacy.rights.team) while the operator is the default, else the legal name as given. */
export function operatorName(team: string, operator: string = BOT.operator): string {
  return operator === TEAM_OPERATOR ? team : operator;
}

/** When the bot's privacy policy last changed (UTC): AI answers lost their footer, and inline mode gained Ask TonkFun (module 15). The owner moves it to the go-live date if they differ. */
export const UPDATED = Date.UTC(2026, 10, 26);

/** Anthropic's own page on how long it keeps data, linked from the policy's AI section. */
export const ANTHROPIC_RETENTION_URL = "https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-personal-data";
