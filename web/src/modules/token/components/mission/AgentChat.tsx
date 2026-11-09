"use client";

import { Bot, Send } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { fmt } from "@/shared/i18n/config";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { cn } from "@/shared/lib/cn";
import { TokenArt } from "@/shared/ui/TokenArt";
import { type AgentFacts, type ChatMessage, openingMessages, reply, routeQuestion, type Topic } from "../../lib/agent";
import { ChatBubble } from "./ChatBubble";

interface AgentChatProps {
  /** The agent's name ("Captain Boo"). */
  agent: string;
  art: string;
  ticker: string;
  facts: AgentFacts;
}

/** The token's mission agent: a chat log with fact chips, three quick questions and a free-text question. */
export function AgentChat({ agent, art, ticker, facts }: AgentChatProps) {
  const { t } = useI18n();
  const a = t.token.agent;
  const inputId = useId();
  const log = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => openingMessages(facts, a));
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const ask = (question: string, topic: Topic) => {
    setMessages((list) => {
      const id = list.length + 1;
      return [...list, { id, from: "user", parts: [{ kind: "text", text: question }] }, { id: id + 1, from: "agent", parts: reply(topic, facts, a) }];
    });
    setDraft("");
  };

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    ask(question, routeQuestion(question, a));
  };

  const quick: ReadonlyArray<readonly [string, Topic]> = [
    [a.qLock, "lock"],
    [a.qCrew, "crew"],
    [a.qBrief, "brief"],
  ];
  return (
    <section aria-labelledby="agent-title" className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="relative size-10 flex-none">
          <TokenArt src={art} label={ticker} size={40} className="size-10 rounded-xl" />
          <span aria-hidden="true" className="absolute -right-1 -bottom-1 flex size-[18px] items-center justify-center rounded-md border-2 border-surface bg-accent text-on-cta">
            <Bot size={10} strokeWidth={3} />
          </span>
        </span>
        <div className="flex min-w-0 flex-[1_1_140px] flex-col gap-px">
          <h2 id="agent-title" className="text-[14px] font-semibold">{agent}</h2>
          <span className="text-[12px] text-text-3">{fmt(a.role, { name: facts.name })}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-pos/35 bg-pos/12 px-[9px] py-1 text-[11px] font-semibold whitespace-nowrap text-pos">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-pos" />
          {a.grounded}
        </span>
      </div>
      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-label={fmt(a.chat, { name: agent })}
        tabIndex={0}
        className="flex h-[300px] flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-bg p-3"
      >
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} who={message.from === "agent" ? agent : a.you} />
        ))}
      </div>
      <div role="group" aria-label={a.quick} className="flex flex-wrap gap-1.5">
        {quick.map(([label, topic]) => (
          <button
            key={topic}
            type="button"
            onClick={() => ask(label, topic)}
            className="h-[30px] rounded-[15px] border border-line-strong bg-raised px-2.5 text-[12px] whitespace-nowrap"
          >
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {fmt(a.ask, { name: agent })}
        </label>
        <input
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={fmt(a.placeholder, { name: agent })}
          autoComplete="off"
          maxLength={280}
          className="h-11 min-w-0 flex-auto rounded-xl border border-line-strong bg-raised px-3.5 text-[13px] text-text placeholder:text-text-3"
        />
        <button type="submit" aria-label={a.send} className={cn("inline-flex size-11 flex-none items-center justify-center rounded-xl bg-cta text-on-cta")}>
          <Send size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
