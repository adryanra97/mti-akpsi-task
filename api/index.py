"""ServerAgent Core Module (FastAPI) untuk Vercel Python Runtime.

Satu-satunya pintu masuk adalah PermintaanAnalisis yang ditandatangani Dashboard
(JWT HS256 dengan ``AUTH_SECRET``). Hasil ditandatangani HMAC-SHA256 agar Dashboard dapat
memastikan hasil berasal dari Core Module dan tidak diubah di perjalanan.

Endpoint
--------
GET /api/py/sehat
    Pemeriksaan kesehatan dan daftar layanan pada registri.
POST /api/py/analisis
    Menjalankan AgenAnalisis dan mengalirkan event NDJSON.
POST /api/py/uji-koneksi
    Menguji API key dan nama model penyedia LLM.

Attributes
----------
DEV_SECRET : str
    Rahasia khusus pengembangan lokal; tidak pernah dipakai di Vercel.
DI_VERCEL : bool
    ``True`` bila berjalan di Vercel (environment variable ``VERCEL=1``).
app : fastapi.FastAPI
    Aplikasi ASGI tanpa halaman dokumentasi publik.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import jwt  # noqa: E402
from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import JSONResponse, StreamingResponse  # noqa: E402

from _core.agent import REGISTRI, AgenAnalisis  # noqa: E402
from _core.llm import GagalLLM, LayananLLM  # noqa: E402

DEV_SECRET = "dev-only-secret-tidak-dipakai-di-production-000000"
DI_VERCEL = os.environ.get("VERCEL") == "1"

app = FastAPI(title="ServerAgent Core Module", docs_url=None, redoc_url=None, openapi_url=None)


def rahasia() -> bytes:
    """Mengambil kunci penandatangan bersama Dashboard.

    Returns
    -------
    bytes
        ``AUTH_SECRET`` bila panjangnya minimal 32 karakter; di luar Vercel dipakai ``DEV_SECRET``.

    Raises
    ------
    fastapi.HTTPException
        Status 503 bila berjalan di Vercel dan ``AUTH_SECRET`` belum diatur.
    """
    s = os.environ.get("AUTH_SECRET", "")
    if len(s) >= 32:
        return s.encode()
    if DI_VERCEL:
        raise HTTPException(503, "AUTH_SECRET belum diatur di server.")
    return DEV_SECRET.encode()


def verifikasi_token(token: str, tujuan: str) -> dict:
    """Memverifikasi token JWT permintaan dari Dashboard.

    Parameters
    ----------
    token : str
        JWT HS256 dengan audiens ``serveragent-core``.
    tujuan : {"analisis", "uji-koneksi"}
        Nilai klaim ``tujuan`` yang diharapkan, agar token satu endpoint tidak dipakai di endpoint lain.

    Returns
    -------
    dict
        Klaim token yang sudah terverifikasi.

    Raises
    ------
    fastapi.HTTPException
        Status 401 bila token kedaluwarsa, tanda tangan salah, atau tujuan tidak cocok.
    """
    try:
        data = jwt.decode(token, rahasia(), algorithms=["HS256"], audience="serveragent-core")
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(401, "Permintaan kedaluwarsa. Jalankan ulang analisis.") from e
    except jwt.PyJWTError as e:
        raise HTTPException(401, "Permintaan analisis tidak sah.") from e
    if data.get("tujuan") != tujuan:
        raise HTTPException(401, "Permintaan analisis tidak sah.")
    return data


def tanda_tangan(teks: str) -> str:
    """Membuat tanda HMAC-SHA256 untuk teks hasil.

    Parameters
    ----------
    teks : str
        JSON hasil analisis yang sudah diserialisasi.

    Returns
    -------
    str
        Tanda tangan dalam heksadesimal.
    """
    return hmac.new(rahasia(), teks.encode(), hashlib.sha256).hexdigest()


@app.get("/api/py/sehat")
def sehat():
    """Endpoint pemeriksaan kesehatan Core Module.

    Returns
    -------
    dict
        Status, nama komponen, versi Python, dan nama layanan pada registri.
    """
    return {"status": "ok", "komponen": "ServerAgent Core Module", "python": sys.version.split()[0],
            "layanan": [x["nama"] for x in REGISTRI["layanan"]]}


@app.post("/api/py/analisis")
async def analisis(req: Request):
    """Endpoint utama: menjalankan AgenAnalisis untuk satu PermintaanAnalisis.

    Parameters
    ----------
    req : fastapi.Request
        Body JSON ``{"token": str}``; klaim ``permintaan`` berisi seluruh masukan analisis.

    Returns
    -------
    fastapi.responses.StreamingResponse
        Aliran NDJSON berisi event ``status`` dan ``step``, lalu ``done`` dengan ``hasil``
        (string JSON) dan ``tanda`` (HMAC), atau ``error`` bila pemrosesan gagal.
    """
    body = await req.json()
    data = verifikasi_token(str(body.get("token", "")), "analisis")
    permintaan = data["permintaan"]

    def aliran():
        """Generator baris NDJSON dari event AgenAnalisis.

        Yields
        ------
        str
            Satu event JSON per baris.
        """
        try:
            for ev in AgenAnalisis(permintaan).proses():
                if ev["type"] == "hasil":
                    teks = json.dumps(ev["hasil"], ensure_ascii=False, separators=(",", ":"))
                    yield json.dumps({"type": "done", "hasil": teks, "tanda": tanda_tangan(teks)}) + "\n"
                else:
                    yield json.dumps(ev, ensure_ascii=False) + "\n"
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            yield json.dumps({"type": "error", "message": f"Core Module gagal memproses permintaan: {str(e)[:200]}"}) + "\n"

    return StreamingResponse(aliran(), media_type="application/x-ndjson", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@app.post("/api/py/uji-koneksi")
async def uji_koneksi(req: Request):
    """Endpoint uji koneksi penyedia LLM dari halaman Pengaturan.

    Parameters
    ----------
    req : fastapi.Request
        Body JSON ``{"token": str}``; klaim memuat ``provider`` dan ``model``.

    Returns
    -------
    dict or fastapi.responses.JSONResponse
        ``{"ok": bool, "message": str}`` beserta waktu tempuh atau pesan galat.
    """
    body = await req.json()
    data = verifikasi_token(str(body.get("token", "")), "uji-koneksi")
    import time
    t0 = time.time()
    llm = LayananLLM(data["provider"], data["model"], {"input": 0, "output": 0}, 1)
    try:
        teks = llm.teks('Balas persis dengan satu kata: "siap"')
        cadangan = (f" Model {llm.model} sedang sibuk; yang menjawab model cadangan {llm.model_terpakai}."
                    if llm.model_terpakai != llm.model else "")
        return {"ok": True, "message": f"Tersambung dalam {time.time() - t0:.1f} detik. Jawaban model: \"{teks[:40]}\".{cadangan}"}
    except GagalLLM as e:
        return JSONResponse({"ok": False, "message": str(e)})
