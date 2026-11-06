import { NextResponse } from "next/server";
import { currentUser, audit } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSession } from "@/lib/data";
import { put } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
import { runAlignment } from "@/lib/core/engine";
import { ndjsonStream, sameOrigin } from "@/lib/stream";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Masuk kembali." }, { status: 401 });
  if (!can(user.role, "alignment.run")) return NextResponse.json({ error: "Peran Anda tidak dapat menjalankan analisis." }, { status: 403 });
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 404 });
  if (!session.params) return NextResponse.json({ error: "Isi parameter analisis terlebih dahulu." }, { status: 400 });
  if (session.status === "diputuskan") return NextResponse.json({ error: "Sesi sudah diputuskan." }, { status: 409 });

  const settings = await getSettings();
  return ndjsonStream(async (emit) => {
    const { result, baselineToCache } = await runAlignment(session, session.params!, {
      settings,
      userName: user.name,
      emit,
      pace: settings.mode === "demo",
    });
    const fresh = (await getSession(id)) ?? session;
    fresh.runs = [...fresh.runs, result];
    fresh.status = "dianalisis";
    await put("sa_sessions", fresh);
    if (baselineToCache) {
      await saveSettings({ ...settings, cachedBaselines: { ...settings.cachedBaselines, [session.service]: { ...baselineToCache, source: "cache" } } });
    }
    await audit(user, "Menjalankan analisis Core Module", session.code, `Verdict ${result.verdict}`);
    return { verdict: result.verdict };
  });
}
