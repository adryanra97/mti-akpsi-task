"""Antarmuka Layanan LLM melalui LangChain.

Penyedia dapat diganti tanpa mengubah alur use case (NFR-17). Mendukung Anthropic Claude,
OpenAI (atau layanan kompatibel OpenAI lewat ``OPENAI_BASE_URL``), dan Google Gemini.

Attributes
----------
VERSI_PROMPT : str
    Versi templat prompt yang dicatat pada jejak keputusan.
SISTEM : str
    Pesan sistem untuk semua panggilan LLM.
ENV_KEY : dict of str
    Nama environment variable API key per penyedia.
"""
from __future__ import annotations

import os
import threading
from typing import Literal

from pydantic import BaseModel, Field

VERSI_PROMPT = "serveragent-prompt-2026.11"

SISTEM = (
    "Anda adalah AgenAnalisis pada ServerAgent Core Module. Anda menilai kesiapan performa release candidate "
    "sebelum promosi dari Dev ke Production dan menilai insiden performa setelah go-live. Data yang Anda terima "
    "sudah disamarkan; jangan menebak nilai aslinya. Jawab dalam Bahasa Indonesia yang ringkas dan teknis."
)


class LangkahLLM(BaseModel):
    """Satu langkah rencana analisis yang diusulkan LLM.

    Attributes
    ----------
    deskripsi : str
        Apa yang dikerjakan langkah ini.
    alat : {"jalankan_serversim", "estimasi_serverbrief", "kueri_metrik_elk"}
        Alat agen yang dipakai.
    acuan : str
        Kunci skenario atau komponen yang dirujuk.
    """
    deskripsi: str = Field(description="Apa yang dikerjakan langkah ini")
    alat: Literal["jalankan_serversim", "estimasi_serverbrief", "kueri_metrik_elk"]
    acuan: str = Field(description="Kunci skenario atau komponen yang dirujuk, persis seperti di daftar")


class RencanaLLM(BaseModel):
    """Rencana analisis terstruktur dari LLM.

    Attributes
    ----------
    ringkasanTujuan : str
        Satu kalimat tujuan dan risiko utama.
    langkah : list of LangkahLLM
        Urutan langkah analisis.
    """
    ringkasanTujuan: str = Field(description="Satu kalimat tujuan dan risiko utama yang diperhatikan")
    langkah: list[LangkahLLM]


class EstimasiLLM(BaseModel):
    """Estimasi penalaran untuk komponen di luar cakupan model digital twin.

    Attributes
    ----------
    cpuPct, memPct, threadPct : float
        Perkiraan utilisasi dalam persen.
    p95Ms : float
        Perkiraan response time p95 dalam milidetik.
    errorRatePct : float
        Perkiraan error rate dalam persen.
    keyakinan : float
        Skor keyakinan 0 sampai 1.
    alasan : str
        Penjelasan singkat dasar estimasi.
    """
    cpuPct: float
    memPct: float
    threadPct: float
    p95Ms: float
    errorRatePct: float
    keyakinan: float = Field(ge=0, le=1, description="Skor keyakinan 0 sampai 1")
    alasan: str


class GagalLLM(Exception):
    """Galat panggilan LLM: API key kosong, penyedia tidak dikenal, jaringan, atau keluaran tidak sesuai skema."""
    pass


ENV_KEY = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "gemini": "GEMINI_API_KEY"}


def _pesan_galat(e: Exception, provider: str, model: str) -> str:
    """Menyusun pesan galat LLM yang bisa ditindaklanjuti pengguna.

    Parameters
    ----------
    e : Exception
        Galat asli dari SDK penyedia.
    provider : str
        Penyedia LLM.
    model : str
        Nama model yang dipanggil.

    Returns
    -------
    str
        Pesan singkat; untuk model yang tidak ditemukan atau sudah dihentikan, disertai saran
        mengganti nama model di Pengaturan.
    """
    teks = str(e)
    if "NOT_FOUND" in teks or "404" in teks or "not_found" in teks.lower() or "does not exist" in teks.lower():
        return (f"Model '{model}' tidak tersedia di {provider} (mungkin sudah dihentikan). "
                "Ganti nama model di Pengaturan, lalu uji koneksi lagi.")
    if "401" in teks or "403" in teks or "API key" in teks or "PERMISSION_DENIED" in teks:
        return f"API key {provider} ditolak. Periksa environment variable API key di Vercel, lalu redeploy."
    if "429" in teks or "RESOURCE_EXHAUSTED" in teks or "rate" in teks.lower():
        return f"Kuota atau batas laju {provider} habis. Coba lagi beberapa saat lagi."
    return teks[:300]


class LayananLLM:
    """Pembungkus model chat LangChain dengan pencatatan token dan biaya.

    Parameters
    ----------
    provider : {"anthropic", "openai", "gemini"}
        Penyedia LLM.
    model : str
        Nama model pada penyedia tersebut.
    harga : dict
        Harga per satu juta token dalam USD, dengan kunci ``input`` dan ``output``.
    kurs : float
        Kurs USD ke IDR untuk estimasi biaya.

    Attributes
    ----------
    pengiriman : int
        Banyaknya panggilan ke LLM.
    token_masuk, token_keluar : int
        Akumulasi token masukan dan keluaran.
    """
    def __init__(self, provider: str, model: str, harga: dict, kurs: float):
        """Menyimpan konfigurasi; model chat baru dibuat saat panggilan pertama."""
        self.provider = provider
        self.model = model
        self.harga = harga
        self.kurs = kurs
        self.pengiriman = 0
        self.token_masuk = 0
        self.token_keluar = 0
        self._chat = None
        self._kunci = threading.Lock()

    def _model(self):
        """Membuat (sekali) dan mengembalikan model chat LangChain sesuai penyedia.

        Returns
        -------
        langchain_core.language_models.BaseChatModel
            Model chat yang siap dipanggil.

        Raises
        ------
        GagalLLM
            Bila API key belum diisi atau penyedia tidak dikenal.
        """
        with self._kunci:
            return self._buat_model()

    def _buat_model(self):
        """Membuat model chat bila belum ada; dipanggil di dalam kunci ``_kunci``.

        Returns
        -------
        langchain_core.language_models.BaseChatModel
            Model chat yang siap dipanggil.

        Raises
        ------
        GagalLLM
            Bila API key belum diisi atau penyedia tidak dikenal.
        """
        if self._chat is not None:
            return self._chat
        key = os.environ.get(ENV_KEY.get(self.provider, ""), "")
        if not key:
            raise GagalLLM(f"{ENV_KEY.get(self.provider, 'API key')} belum diisi di environment variable.")
        if self.provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            self._chat = ChatAnthropic(model=self.model, api_key=key, max_tokens=1200, timeout=30, max_retries=1)
        elif self.provider == "openai":
            from langchain_openai import ChatOpenAI
            self._chat = ChatOpenAI(model=self.model, api_key=key, base_url=os.environ.get("OPENAI_BASE_URL") or None,
                                    timeout=30, max_retries=1)
        elif self.provider == "gemini":
            from langchain_google_genai import ChatGoogleGenerativeAI
            self._chat = ChatGoogleGenerativeAI(model=self.model, google_api_key=key, timeout=30, max_retries=1)
        else:
            raise GagalLLM(f"Penyedia LLM tidak dikenal: {self.provider}")
        return self._chat

    def _catat_pemakaian(self, msg):
        """Menambah hitungan panggilan dan token dari metadata pesan.

        Parameters
        ----------
        msg : langchain_core.messages.AIMessage or None
            Pesan balasan model; ``usage_metadata`` dibaca bila ada.
        """
        usage = getattr(msg, "usage_metadata", None) or {}
        with self._kunci:  # dapat dipanggil bersamaan dari thread sampel estimasi
            self.pengiriman += 1
            self.token_masuk += int(usage.get("input_tokens", 0) or 0)
            self.token_keluar += int(usage.get("output_tokens", 0) or 0)

    def terstruktur(self, skema: type[BaseModel], prompt: str):
        """Memanggil LLM dengan keluaran terstruktur sesuai skema Pydantic.

        Parameters
        ----------
        skema : type of pydantic.BaseModel
            Skema keluaran, misalnya ``RencanaLLM`` atau ``EstimasiLLM``.
        prompt : str
            Isi pesan pengguna (data sudah disamarkan).

        Returns
        -------
        pydantic.BaseModel
            Instans ``skema`` hasil parsing.

        Raises
        ------
        GagalLLM
            Bila panggilan gagal atau keluaran tidak dapat diparsing.
        """
        try:
            hasil = self._model().with_structured_output(skema, include_raw=True).invoke(
                [("system", SISTEM), ("human", prompt)]
            )
        except GagalLLM:
            raise
        except Exception as e:  # noqa: BLE001
            raise GagalLLM(_pesan_galat(e, self.provider, self.model)) from e
        self._catat_pemakaian(hasil.get("raw"))
        if hasil.get("parsed") is None:
            raise GagalLLM(f"Keluaran model tidak sesuai skema: {str(hasil.get('parsing_error'))[:200]}")
        return hasil["parsed"]

    def teks(self, prompt: str) -> str:
        """Memanggil LLM untuk keluaran teks bebas.

        Parameters
        ----------
        prompt : str
            Isi pesan pengguna.

        Returns
        -------
        str
            Teks balasan model tanpa spasi di awal dan akhir.

        Raises
        ------
        GagalLLM
            Bila panggilan gagal.
        """
        try:
            msg = self._model().invoke([("system", SISTEM), ("human", prompt)])
        except GagalLLM:
            raise
        except Exception as e:  # noqa: BLE001
            raise GagalLLM(_pesan_galat(e, self.provider, self.model)) from e
        self._catat_pemakaian(msg)
        c = msg.content
        if isinstance(c, list):
            c = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in c)
        return str(c).strip()

    def biaya(self) -> dict:
        """Estimasi biaya pemakaian LLM sejauh ini.

        Returns
        -------
        dict
            ``pengiriman``, ``tokenMasuk``, ``tokenKeluar``, ``usd``, dan ``idr``.
        """
        usd = (self.token_masuk * self.harga.get("input", 0) + self.token_keluar * self.harga.get("output", 0)) / 1_000_000
        return {
            "pengiriman": self.pengiriman,
            "tokenMasuk": self.token_masuk,
            "tokenKeluar": self.token_keluar,
            "usd": round(usd, 5),
            "idr": round(usd * self.kurs),
        }
