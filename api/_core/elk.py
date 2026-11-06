"""Konektor ELK Stack (simulasi untuk prototipe).

Data Kibana Klien terikat NDA (Bab 4.6), sehingga metrik dibangkitkan secara deterministik
dari profil layanan yang terkalibrasi. Bila ELK tidak dapat diakses, dipakai baseline
tersimpan terakhir (FR-04, NFR-11).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from .twin import benih


def _jitter(kunci: str) -> float:
    """Variasi kecil yang deterministik untuk sebuah kunci.

    Parameters
    ----------
    kunci : str
        Kunci acuan, misalnya nama layanan ditambah tanggal.

    Returns
    -------
    float
        Nilai dalam rentang -0.5 sampai 0.5.
    """
    return (benih(kunci) % 1000) / 1000 - 0.5


def ambil_metrik(registri: dict, layanan: str, sekarang: datetime, elk_mati: bool, tersimpan: dict | None) -> tuple[dict, bool]:
    """Mengambil MetrikBaseline Production untuk satu layanan.

    Parameters
    ----------
    registri : dict
        Entri layanan dari ``registry.json`` (memuat ``baseline``).
    layanan : str
        Nama layanan.
    sekarang : datetime
        Waktu analisis; menentukan periode tujuh hari terakhir.
    elk_mati : bool
        ``True`` untuk mensimulasikan ELK tidak dapat diakses.
    tersimpan : dict or None
        Baseline tersimpan terakhir dari Dashboard, dipakai bila ELK tidak tersedia.

    Returns
    -------
    metrik : dict
        Metrik baseline dengan ``sumber`` ``"ELKLangsung"`` atau ``"TersimpanTerakhir"``.
    mati : bool
        ``True`` bila metrik berasal dari baseline tersimpan.
    """
    b = registri["baseline"]
    if elk_mati:
        dasar = tersimpan or {
            "environment": "Production", "jenisPeriode": "Baseline",
            "periodeMulai": "2026-09-24T00:00:00Z", "periodeSelesai": "2026-10-01T00:00:00Z",
            "cpuRataPersen": b["cpuPct"], "memoriRataPersen": b["memPct"], "throughputTps": b["avgTps"],
            "puncakTps": b["peakTps"], "errorRatePersen": b["errorRatePct"], "responseTimeP95Ms": b["p95Ms"],
            "tanggalPengambilan": "2026-10-01",
        }
        return {**dasar, "sumber": "TersimpanTerakhir"}, True
    j = _jitter(layanan + sekarang.strftime("%Y-%m-%d"))
    metrik = {
        "environment": "Production",
        "jenisPeriode": "Baseline",
        "periodeMulai": (sekarang - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "periodeSelesai": sekarang.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "cpuRataPersen": round(b["cpuPct"] * (1 + j * 0.1), 1),
        "memoriRataPersen": round(b["memPct"] * (1 + j * 0.05), 1),
        "throughputTps": round(b["avgTps"] * (1 + j * 0.1), 1),
        "puncakTps": round(b["peakTps"] * (1 + j * 0.08), 1),
        "errorRatePersen": round(b["errorRatePct"] * (1 + j * 0.2), 2),
        "responseTimeP95Ms": round(b["p95Ms"] * (1 + j * 0.1)),
        "sumber": "ELKLangsung",
        "tanggalPengambilan": sekarang.strftime("%Y-%m-%d"),
    }
    return metrik, False
