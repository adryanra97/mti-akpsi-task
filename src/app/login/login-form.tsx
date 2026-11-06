"use client";

/**
 * Formulir masuk ringkas: pilih peran, isi kata sandi, Masuk.
 */
import { submitWith } from "@/components/form";
import { useActionState, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { login, type LoginState } from "./actions";
import { USERS, ROLE_LABEL, ROLE_GOAL } from "@/lib/roles";
import { Button, Field, Input, Select } from "@/components/ui";

/**
 * Formulir masuk yang muat dalam satu layar agar tombol utama selalu terlihat.
 *
 * Peran dipilih melalui dropdown native yang ramah keyboard dan pembaca layar.
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

      <div>
        <label htmlFor="username" className="mb-1.5 block text-[13.5px] font-semibold text-ink">
          Masuk sebagai
        </label>
        <Select
          id="username"
          name="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-describedby="role-description"
          className="h-12"
        >
          <option value="" disabled>Pilih peran pengguna</option>
          {USERS.map((u) => (
            <option key={u.id} value={u.username}>{ROLE_LABEL[u.role]}</option>
          ))}
        </Select>
        <p id="role-description" className="mt-2 min-h-5 text-[13px] leading-relaxed text-ink-3" aria-live="polite">
          {selected ? ROLE_GOAL[selected.role] : "Pilih peran untuk melihat tanggung jawab dan aksesnya."}
        </p>
      </div>

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
