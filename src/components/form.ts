"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Mengirim form ke server action tanpa reset otomatis dari React,
 * sehingga isian dan pilihan pengguna tetap utuh saat validasi gagal.
 */
export function submitWith(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => action(fd));
  };
}
