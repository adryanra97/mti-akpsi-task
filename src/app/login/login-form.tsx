"use client";

/**
 * Formulir masuk ringkas: pilih peran, isi kata sandi, Masuk.
 */
import { submitWith } from "@/components/form";
import { useActionState, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { login, type LoginState } from "./actions";
import { USERS, ROLE_LABEL, ROLE_GOAL } from "@/lib/roles";
import { Button, Field, Input, cx } from "@/components/ui";

/**
 * Formulir masuk yang muat dalam satu layar agar tombol utama selalu terlihat.
 *
 * Peran dipilih lewat radio dan langsung menjadi nama pengguna; klik peran memindahkan fokus
 * ke kata sandi.
 *
 * Parameters
 * ----------
 * next : string
 *     Path tujuan setelah masuk.
 * configProblems : string[]
 *     Konfigurasi server yang belum lengkap; ditampilkan sebagai peringatan.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function LoginForm({ next, configProblems }: { next: string; configProblems: string[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [username, setUsername] = useState(state.username ?? "");
  const [show, setShow] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);
  const selected = USERS.find((u) => u.username === username);

  return (
    <form onSubmit={submitWith(action)} className="grid gap-5" noValidate aria-labelledby="login-title">
      <div>
        <h2 id="login-title" className="text-[26px] leading-tight">
          Masuk
        </h2>
        <p className="mt-1 text-[14px] text-ink-3">Pilih peran Anda, lalu masukkan kata sandi pengujian.</p>
      </div>

      {configProblems.length > 0 && (
        <div role="alert" className="rounded-lg border border-cond/30 bg-cond-soft px-4 py-3 text-[14px]">
          <p className="font-medium">Login belum dikonfigurasi.</p>
          <p className="mt-0.5 text-ink-2">Admin perlu mengatur environment variable berikut di server, lalu deploy ulang: {configProblems.join(", ")}.</p>
        </div>
      )}

      <input type="hidden" name="next" value={next} />

      <fieldset>
        <legend className="mb-2 text-[13.5px] font-medium">Masuk sebagai</legend>
        <div className="overflow-hidden rounded-lg border border-line-strong bg-surface">
          {USERS.map((u) => {
            const active = username === u.username;
            return (
              <label
                key={u.id}
                // Klik mouse/sentuh langsung ke kata sandi; navigasi panah keyboard tetap di grup peran.
                onClick={(e) => e.detail > 0 && setTimeout(() => pwRef.current?.focus(), 0)}
                className={cx(
                  "flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-0 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent",
                  active ? "bg-accent-soft" : "hover:bg-surface-2",
                )}
              >
                <input
                  type="radio"
                  name="username"
                  value={u.username}
                  checked={active}
                  onChange={() => setUsername(u.username)}
                  className="sr-only"
                />
                <span
                  className={cx(
                    "font-narrow flex h-7 w-8 shrink-0 items-center justify-center rounded-[4px] text-[12.5px] font-bold tracking-wide",
                    active ? "bg-primary text-primary-ink" : "bg-sunken text-ink-2",
                  )}
                  aria-hidden
                >
                  {u.initials}
                </span>
                <span className={cx("min-w-0 flex-1 text-[14.5px]", active && "font-semibold")}>{ROLE_LABEL[u.role]}</span>
                <span
                  className={cx("h-4 w-4 shrink-0 rounded-full border-2", active ? "border-accent bg-accent shadow-[inset_0_0_0_2px_var(--surface)]" : "border-line-strong")}
                  aria-hidden
                />
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 min-h-[20px] text-[13px] text-ink-3" aria-live="polite">
          {selected ? ROLE_GOAL[selected.role] : "Setiap peran membuka menu dan tindakan yang berbeda."}
        </p>
      </fieldset>

      <Field label="Kata sandi" htmlFor="password" hint="Dibagikan oleh admin project.">
        <div className="relative">
          <Input
            ref={pwRef}
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-describedby="password-hint"
            maxLength={256}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-3 hover:text-ink"
            aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={show}
          >
            {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </Field>

      {state.error && (
        <p role="alert" className="rounded-lg bg-fail-soft px-3 py-2 text-[14px] text-fail">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="h-11 w-full">
        {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
        {pending ? "Memeriksa…" : selected ? `Masuk sebagai ${ROLE_LABEL[selected.role]}` : "Masuk"}
      </Button>
    </form>
  );
}
