import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fmt, localizePath } from "@/shared/i18n/config";
import { DICTIONARIES } from "@/shared/i18n/dictionaries";
import { en } from "@/shared/i18n/dictionaries/en";
import { ANTHROPIC_RETENTION_URL, BOT, operatorName, TEAM_OPERATOR } from "../lib/bot";
import { PrivacyView } from "../PrivacyView";

const href = (path: string) => path;
const region = (name: string) => screen.getByRole("region", { name });
const items = (list: HTMLElement) => within(list).getAllByRole("listitem").map((item) => item.textContent);
const p = en.privacy;

function renderEnglish(link = href) {
  return render(<PrivacyView p={p} href={link} updated="24 November 2026" />);
}

describe("PrivacyView", () => {
  it("names the bot and its handle, and when the policy last changed", () => {
    renderEnglish();
    expect(screen.getByRole("heading", { level: 1, name: "The bot keeps very little, and not for long." })).toBeInTheDocument();
    expect(screen.getByText("How TonkFun, tonkfun.fun's bot on Telegram (@TonkfunBot), handles what you send it.")).toBeInTheDocument();
    expect(screen.getByText("Last updated 24 November 2026")).toBeInTheDocument();
  });

  it("shows the eight sections in order, each a named region", () => {
    renderEnglish();
    const ids = ["reads", "ai", "keeps", "never", "rights", "channel", "telegram", "questions"].map((id) => `privacy-${id}-title`);
    expect(screen.getAllByRole("region").map((section) => section.getAttribute("aria-labelledby"))).toEqual(ids);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "What it reads",
      "AI answers and checks",
      "What it keeps",
      "What it never does",
      "Your choices and rights",
      "The official channel",
      "Telegram",
      "Questions",
    ]);
  });

  it("says what it reads in the official community group, beside private chats and other groups", () => {
    renderEnglish();
    const reads = region("What it reads");
    expect(items(within(reads).getByRole("list"))).toEqual([p.reads.private, p.reads.community, p.reads.groups, fmt(p.reads.inline, { handle: "@TonkfunBot" }), p.reads.buttons]);
    expect(within(reads).getByText(/^In tonkfun\.fun's official community group, where it is an admin, Telegram shows it every message, edit and new member\./)).toBeInTheDocument();
    // Names are also read for links and handles (removed at join) and for the brand beside a role word.
    expect(within(reads).getByText(/your name only to spot spam and accounts posing as the team, and in its notes to the team;/)).toBeInTheDocument();
  });

  it("says what goes to Anthropic, how long Anthropic keeps it, and how to ask for a review", () => {
    renderEnglish();
    const ai = within(region("AI answers and checks"));
    expect(ai.getByText(/^Its answers, and its checks of messages its own rules can't settle, are written by Claude, an AI model made by Anthropic/)).toBeInTheDocument();
    expect(ai.getByText(/^It sends Anthropic text, never photos or files:/)).toBeInTheDocument();
    expect(ai.getByText(/a code made from your Telegram ID, which changes every month/)).toBeInTheDocument();
    expect(ai.getByText(/^Anthropic deletes this text within 30 days\. If its safety systems flag a message, it may keep it for up to 2 years/)).toBeInTheDocument();
    // A secret is removed in the group and from a question; elsewhere in a private chat it stays there, sent nowhere.
    expect(ai.getByText("Never send a seed phrase or a private key. The bot removes anything that looks like one, in the group and in what you ask it, and never sends one anywhere.")).toBeInTheDocument();
    // True while every action alerts the team: raid copies and normal mode's unknown-link deletes included.
    expect(ai.getByText(/Every action is reported to the team, who can undo it,/)).toBeInTheDocument();
    // A review takes a mute, a ban or a warning on record: a removal with no offence, or a new member's text-only days, has nothing to review (appeal.ts).
    expect(ai.getByText(/ If it mutes or bans you, or records a warning, tap ‘Why\? Ask for a review’ on its notice\.$/)).toBeInTheDocument();
    expect(p.ai.decisions).not.toMatch(/If it acts on you/);
  });

  it("lists every kind of group message Claude's check receives, and the facts sent with it", () => {
    // mod/triage.ts (shouldTriage) and mod/triage-prompt.ts (triageUserContent), and the answers' language line.
    const parts = [
      "In the official group it also sends messages its rules can't settle on their own: questions;",
      "messages with handles, wallet or token addresses, or links that aren't on its allow-list (whether it removed them or not);",
      "messages that ask for help or mention a problem, such as lost funds or a failed buy;",
      "messages that warn about, ask about or report a scam, or mention DMs;",
      "messages that may show someone is in distress;",
      "and new members' messages of 3 words or more.",
      "such as your app's language and, for its checks, whether you're a new or trusted member, whether the message was edited or forwarded, and its links' domains.",
      // Masked in the formats mod/secrets.ts recognises (and Telegram's phone and e-mail entities), not every way of writing one.
      "It adds no Telegram ID, name or username and hides e-mail addresses and phone numbers in the formats it recognises,",
    ];
    for (const part of parts) expect(p.ai.sent).toContain(part);
    expect(p.ai.sent).not.toMatch(/text only|links it removed|hides phone numbers and e-mail addresses,/);
  });

  it("lists the records it keeps in the official group, each with how long, and what the team sees", () => {
    renderEnglish();
    const keeps = region("What it keeps");
    expect(within(keeps).getByText("No chat history, and nothing from private chats once it has answered.")).toBeInTheDocument();
    const [memory, records] = within(keeps).getAllByRole("list");
    expect(items(memory)).toEqual([p.keeps.memory, p.keeps.wallet]);
    // No "chat IDs": a private chat's ID is the person's user ID, and the official groups' IDs are the operator's settings.
    expect(within(memory).getByText(/forgets them: user IDs, names, usernames and the text of a message for at most 10 minutes \(.*check a message, see whether someone else answers a question first, gather its notes to the team/)).toBeInTheDocument();
    expect(within(memory).queryByText(/chat IDs/)).not.toBeInTheDocument();
    expect(within(keeps).getByText("In the official group only, it keeps these records on its server, then deletes them:")).toBeInTheDocument();
    expect(items(records)).toEqual([p.keeps.warnings, p.keeps.newcomers, p.keeps.checks, p.keeps.trusted, p.keeps.reviews, p.keeps.cleanup]);
    expect(within(records).getByText("Reviews: when you last asked for one, for a day.")).toBeInTheDocument();
    // A member's message the rules removed stays among the deletes until Telegram confirms it (telegram-out-deletes.ts).
    expect(within(records).getByText("Messages still to delete, its own and members' messages it removed: their IDs, for at most 2 days.")).toBeInTheDocument();
    // A check that can't be posted keeps its joiners muted while it tries again, 30 minutes at most, and their records from the moment they are restricted.
    expect(within(records).getByText("A check in progress: your ID and the check message, for at most 15 minutes (45 if Telegram delays posting the check).")).toBeInTheDocument();
    // A newcomer record starts at the join too (observe mode, a join seen late, a check that couldn't be posted), or at a channel commenter's first comment.
    expect(within(records).getByText(/^New members: your ID and when you joined or passed the check \(or first commented on a channel post without joining\), for your first days/)).toBeInTheDocument();
    expect(within(keeps).getByText("It also counts each day's answers, reports, checks and moderation actions, and its AI spending, with no IDs.")).toBeInTheDocument();
  });

  it("says what the team's admin chat sees: observe mode, reports, reviews, refusals and trust included", () => {
    renderEnglish();
    const admins = within(region("What it keeps")).getByText(/^When it removes a message or restricts someone/);
    expect(admins).toHaveTextContent(/^When it removes a message or restricts someone \(or, while the group is in observe mode, would have\), when a case needs a person,/);
    expect(admins).toHaveTextContent(/when you report a message or ask for a review, or when it proposes an answer in observe mode, it posts in the team's private admin chat on Telegram:/);
    expect(admins).toHaveTextContent(/your name, username and ID, a short excerpt, a link to the message and, where Claude checked the message, the AI's guess; if you're a new member, also how long ago you joined or passed the check\./);
    expect(admins).toHaveTextContent(/A report also shows who sent it \(their name, username and ID\) and their reason, and a review your current restriction\./);
    // The refusals alert (qa-answer.ts), the /trust and /untrust confirmations (controls.ts) and /trusted's list (controls-members.ts).
    expect(admins).toHaveTextContent(/It also posts there your name, username and ID with an excerpt of your question when Claude refuses two of your questions in the group within 10 minutes;/);
    expect(admins).toHaveTextContent(/your name and username when an admin marks you trusted or stops trusting you; and each trusted member's name, username and ID when an admin asks for the list\./);
    expect(admins).toHaveTextContent(/It deletes its routine notes there after 2 days, and the chat deletes everything after 7; the bot keeps no copy\./);
    expect(admins).toHaveTextContent(/From a private chat it posts your name, username and message only if you tap Share with the team or use \/report\.$/);
  });

  it("never DMs first, and names who runs it, who receives what, and your rights", () => {
    renderEnglish();
    expect(items(within(region("What it never does")).getByRole("list"))).toEqual([p.never.keys, p.never.sign, p.never.dm]);
    const rights = within(region("Your choices and rights"));
    expect(rights.getByText("The bot is run by the tonkfun.fun team for tonkfun.fun's community.")).toBeInTheDocument();
    expect(
      rights.getByText(
        "Only Anthropic (for AI answers and checks, in the United States, under its data processing terms with the EU's standard contractual clauses), Telegram (which carries every message) and Railway (which hosts the bot's server and stores its records and logs) receive it.",
      ),
    ).toBeInTheDocument();
    // Unprompted answers (on by default) reply to a question nobody asked the bot.
    expect(
      rights.getByText(
        "In a private chat, nothing goes to the AI unless you use /ask or tap Ask. In the group, moderation applies to everyone, and while unprompted answers are on, the bot may also answer a question about tonkfun.fun that you post without asking it.",
      ),
    ).toBeInTheDocument();
    expect(rights.getByText(/you can complain to your data protection authority\.$/)).toBeInTheDocument();
  });

  it("opens Anthropic's and Telegram's pages in a new tab, and the Security page in the page's language", () => {
    renderEnglish((path) => localizePath("es", path));
    const outside = [
      ["AI answers and checks", "How long Anthropic keeps data", ANTHROPIC_RETENTION_URL],
      ["Telegram", "Telegram's privacy policy", "https://telegram.org/privacy"],
    ] as const;
    for (const [section, name, url] of outside) {
      const link = within(region(section)).getByRole("link", { name });
      expect(link).toHaveAttribute("href", url);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    expect(ANTHROPIC_RETENTION_URL).toBe("https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-personal-data");
    expect(within(region("Questions")).getByRole("link", { name: "Open the Security page" })).toHaveAttribute("href", "/es/security");
  });

  it("fills every placeholder in every language, and names the bot and who runs it", () => {
    for (const [code, t] of Object.entries(DICTIONARIES)) {
      const { container, unmount } = render(<PrivacyView p={t.privacy} href={href} updated="1" />);
      expect(container.textContent, code).not.toMatch(/\{\w+\}/);
      expect(container.textContent, code).toContain("@TonkfunBot");
      expect(container.textContent, code).toContain(fmt(t.privacy.rights.who, { operator: t.privacy.rights.team }));
      expect(screen.getAllByRole("region"), code).toHaveLength(8);
      expect(screen.getAllByRole("link"), code).toHaveLength(3);
      unmount();
    }
  });

  it("names the team in the page's language until the owner gives a legal name, then the name as given", () => {
    expect(BOT.operator).toBe(TEAM_OPERATOR);
    expect(operatorName(DICTIONARIES.de.privacy.rights.team)).toBe("das tonkfun.fun-Team");
    expect(operatorName(DICTIONARIES.de.privacy.rights.team, "Tonkfun Labs Ltd")).toBe("Tonkfun Labs Ltd");
  });
});
