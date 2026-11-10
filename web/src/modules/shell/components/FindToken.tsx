"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useI18n } from "@/shared/i18n/I18nProvider";
import { isEvmAddress } from "@/shared/lib/address";
import { buttonClasses } from "@/shared/ui/Button";

/** Opens a token's page from its address: until Explore lists testnet tokens, this is how one is found. */
export function FindToken() {
  const { t, href } = useI18n();
  const f = t.mission.find;
  const router = useRouter();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = value.trim();
    if (!isEvmAddress(address)) return setInvalid(true);
    router.push(href(`/token/${address}`));
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <label htmlFor="find-token" className="text-[12px] font-medium text-text-2">
        {f.label}
      </label>
      <div className="flex gap-2 max-md:flex-col">
        <input
          id="find-token"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
          placeholder="0x…"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid ? "find-token-error" : undefined}
          className="h-10 min-w-0 flex-auto rounded-xl border border-line-strong bg-bg px-3 font-mono text-[13px] text-text placeholder:text-text-3 aria-[invalid=true]:border-neg"
        />
        <button type="submit" className={buttonClasses("cta", "md", "flex-none")}>
          {f.open}
        </button>
      </div>
      {invalid ? (
        <p id="find-token-error" role="alert" className="m-0 text-[12px] leading-[1.5] text-neg">
          {f.invalid}
        </p>
      ) : null}
    </form>
  );
}
