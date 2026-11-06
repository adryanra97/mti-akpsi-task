"use client";

/**
 * Utilitas formulir untuk server action React 19.
 */
import { startTransition, type FormEvent } from "react";

/**
 * Mengirim formulir ke server action tanpa reset otomatis dari React.
 *
 * Dengan begitu isian dan pilihan pengguna tetap utuh saat validasi server gagal.
 *
 * Parameters
 * ----------
 * action : (fd: FormData) => void
 *     Server action (biasanya dari useActionState).
 *
 * Returns
 * -------
 * (e: React.FormEvent<HTMLFormElement>) => void
 *     Handler onSubmit yang mencegah submit bawaan lalu memanggil action di dalam transition.
 */
export function submitWith(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => action(fd));
  };
}
