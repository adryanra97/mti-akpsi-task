"""ServerAgent Core Module (FastAPI) untuk Vercel Python Runtime.

Satu-satunya pintu masuk adalah PermintaanAnalisis yang ditandatangani Dashboard (JWT HS256 dengan AUTH_SECRET).
Hasil ditandatangani HMAC-SHA256 agar Dashboard dapat memastikan hasil berasal dari Core Module dan tidak diubah.
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
    s = os.environ.get("AUTH_SECRET", "")
    if len(s) >= 32:
        return s.encode()
    if DI_VERCEL:
        raise HTTPException(503, "AUTH_SECRET belum diatur di server.")
    return DEV_SECRET.encode()


def verifikasi_token(token: str, tujuan: str) -> dict:
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
    return hmac.new(rahasia(), teks.encode(), hashlib.sha256).hexdigest()


@app.get("/api/py/sehat")
def sehat():
    return {"status": "ok", "komponen": "ServerAgent Core Module", "python": sys.version.split()[0],
            "layanan": [x["nama"] for x in REGISTRI["layanan"]]}


@app.post("/api/py/analisis")
async def analisis(req: Request):
    body = await req.json()
    data = verifikasi_token(str(body.get("token", "")), "analisis")
    permintaan = data["permintaan"]

    def aliran():
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
    body = await req.json()
    data = verifikasi_token(str(body.get("token", "")), "uji-koneksi")
    import time
    t0 = time.time()
    llm = LayananLLM(data["provider"], data["model"], {"input": 0, "output": 0}, 1)
    try:
        teks = llm.teks('Balas persis dengan satu kata: "siap"')
        return {"ok": True, "message": f"Tersambung dalam {time.time() - t0:.1f} detik. Jawaban model: \"{teks[:40]}\""}
    except GagalLLM as e:
        return JSONResponse({"ok": False, "message": str(e)})
