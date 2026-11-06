"use client";

import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui";
import { openSession } from "../actions";

export function OpenSessionButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(() => openSession(id))}>
      {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
      Buka sesi sekarang
    </Button>
  );
}
