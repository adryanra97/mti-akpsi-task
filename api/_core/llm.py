"""Antarmuka Layanan LLM melalui LangChain (NFR-17: penyedia dapat diganti tanpa mengubah alur use case)."""
from __future__ import annotations

import os
from typing import Literal

from pydantic import BaseModel, Field

VERSI_PROMPT = "serveragent-prompt-2026.11"

SISTEM = (
    "Anda adalah AgenAnalisis pada ServerAgent Core Module. Anda menilai kesiapan performa release candidate "
    "sebelum promosi dari Dev ke Production dan menilai insiden performa setelah go-live. Data yang Anda terima "
    "sudah disamarkan; jangan menebak nilai aslinya. Jawab dalam Bahasa Indonesia yang ringkas dan teknis."
)


class LangkahLLM(BaseModel):
    deskripsi: str = Field(description="Apa yang dikerjakan langkah ini")
    alat: Literal["jalankan_serversim", "estimasi_serverbrief", "kueri_metrik_elk"]
    acuan: str = Field(description="Kunci skenario atau komponen yang dirujuk, persis seperti di daftar")


class RencanaLLM(BaseModel):
    ringkasanTujuan: str = Field(description="Satu kalimat tujuan dan risiko utama yang diperhatikan")
    langkah: list[LangkahLLM]


class EstimasiLLM(BaseModel):
    cpuPct: float
    memPct: float
    threadPct: float
    p95Ms: float
    errorRatePct: float
    keyakinan: float = Field(ge=0, le=1, description="Skor keyakinan 0 sampai 1")
    alasan: str


class GagalLLM(Exception):
    pass


ENV_KEY = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "gemini": "GEMINI_API_KEY"}


class LayananLLM:
    def __init__(self, provider: str, model: str, harga: dict, kurs: float):
        self.provider = provider
        self.model = model
        self.harga = harga
        self.kurs = kurs
        self.pengiriman = 0
        self.token_masuk = 0
        self.token_keluar = 0
        self._chat = None

    def _model(self):
        if self._chat is not None:
            return self._chat
        key = os.environ.get(ENV_KEY.get(self.provider, ""), "")
        if not key:
            raise GagalLLM(f"{ENV_KEY.get(self.provider, 'API key')} belum diisi di environment variable.")
        if self.provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            self._chat = ChatAnthropic(model=self.model, api_key=key, max_tokens=1200, timeout=45, max_retries=1)
        elif self.provider == "openai":
            from langchain_openai import ChatOpenAI
            self._chat = ChatOpenAI(model=self.model, api_key=key, base_url=os.environ.get("OPENAI_BASE_URL") or None,
                                    timeout=45, max_retries=1)
        elif self.provider == "gemini":
            from langchain_google_genai import ChatGoogleGenerativeAI
            self._chat = ChatGoogleGenerativeAI(model=self.model, google_api_key=key, timeout=45, max_retries=1)
        else:
            raise GagalLLM(f"Penyedia LLM tidak dikenal: {self.provider}")
        return self._chat

    def _catat_pemakaian(self, msg):
        self.pengiriman += 1
        usage = getattr(msg, "usage_metadata", None) or {}
        self.token_masuk += int(usage.get("input_tokens", 0) or 0)
        self.token_keluar += int(usage.get("output_tokens", 0) or 0)

    def terstruktur(self, skema: type[BaseModel], prompt: str):
        try:
            hasil = self._model().with_structured_output(skema, include_raw=True).invoke(
                [("system", SISTEM), ("human", prompt)]
            )
        except GagalLLM:
            raise
        except Exception as e:  # noqa: BLE001
            raise GagalLLM(str(e)[:300]) from e
        self._catat_pemakaian(hasil.get("raw"))
        if hasil.get("parsed") is None:
            raise GagalLLM(f"Keluaran model tidak sesuai skema: {str(hasil.get('parsing_error'))[:200]}")
        return hasil["parsed"]

    def teks(self, prompt: str) -> str:
        try:
            msg = self._model().invoke([("system", SISTEM), ("human", prompt)])
        except GagalLLM:
            raise
        except Exception as e:  # noqa: BLE001
            raise GagalLLM(str(e)[:300]) from e
        self._catat_pemakaian(msg)
        c = msg.content
        if isinstance(c, list):
            c = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in c)
        return str(c).strip()

    def biaya(self) -> dict:
        usd = (self.token_masuk * self.harga.get("input", 0) + self.token_keluar * self.harga.get("output", 0)) / 1_000_000
        return {
            "pengiriman": self.pengiriman,
            "tokenMasuk": self.token_masuk,
            "tokenKeluar": self.token_keluar,
            "usd": round(usd, 5),
            "idr": round(usd * self.kurs),
        }
