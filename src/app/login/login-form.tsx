"use client";

import { submitWith } from "@/components/form";
import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { login, type LoginState } from "./actions";
import { USERS, ROLE_LABEL, ROLE_GOAL } from "@/lib/roles";
import { Button, Field, Input, cx } from "@/components/ui";

export function LoginForm({ next, configProblems }: { next: string; configProblems: string[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [username, setUsername] = useState(state.username ?? "");

  return (
    <div>
      <h2 className="text-[26px]">Masuk</h2>
      {configProblems.length > 0 && (
        <div role="alert" className="mt-4 rounded-lg border border-cond/30 bg-cond-soft px-4 py-3 text-[14px]">
          <p className="font-medium">Login belum dikonfigurasi.</p>
          <p className="mt-0.5 text-ink-2">
            Admin perlu mengatur environment variable berikut di server, lalu deploy ulang: {configProblems.join(", ")}.
          </p>
        </div>
      )}
      <p className="mt-1 text-[14px] text-ink-3">Pilih peran Anda untuk mengisi nama pengguna, lalu masukkan kata sandi.</p>

      <fieldset className="mt-5">
        <legend className="mb-2 text-[13.5px] font-medium">Akun pengujian per peran</legend>
        <div className="grid gap-2">
          {USERS.map((u) => {
            const active = username === u.username;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setUsername(u.username)}
                aria-pressed={active}
                className={cx(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  active ? "border-primary bg-surface ring-1 ring-primary" : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span
                  className={cx(
                    "font-narrow mt-0.5 flex h-8 w-9 shrink-0 items-center justify-center rounded-[4px] text-[13px] font-bold tracking-wide",
                    active ? "bg-primary text-primary-ink" : "bg-sunken text-ink-2",
                  )}
                  aria-hidden
                >
                  {u.initials}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{ROLE_LABEL[u.role]}</span>
                  <span className="block text-[13px] text-ink-3">{ROLE_GOAL[u.role]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <form onSubmit={submitWith(action)} className="mt-5 grid gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field label="Nama pengguna" htmlFor="username">
          <Input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            maxLength={64}
          />
        </Field>
        <Field label="Kata sandi" htmlFor="password" hint="Kata sandi pengujian dibagikan oleh admin project.">
          <Input id="password" name="password" type="password" autoComplete="current-password" required aria-describedby="password-hint" maxLength={256} />
        </Field>
        {state.error && (
          <p role="alert" className="rounded-lg bg-fail-soft px-3 py-2 text-[14px] text-fail">
            {state.error}
          </p>
        )}
        <Button type="submit" disabled={pending} className="h-11">
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {pending ? "Memeriksa…" : "Masuk"}
        </Button>
      </form>
    </div>
  );
}
