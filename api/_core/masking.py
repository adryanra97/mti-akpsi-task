"""Penyamaran data sensitif sebelum paket keluar ke Layanan LLM (NFR-12)."""
import hashlib
import re

ATURAN = [
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[EMAIL]"),
    ("url", re.compile(r"https?://[^\s)]+"), "[URL]"),
    ("alamat IP", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b"), "[IP]"),
    ("hostname", re.compile(r"\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|local|lan|corp|co\.id|id|com|net)\b", re.I), "[HOST]"),
    ("nomor rekening/ID", re.compile(r"\b\d{8,}\b"), "[NOMOR]"),
    ("kredensial", re.compile(r"\b(?:password|passwd|secret|token|apikey|api_key)\s*[:=]\s*\S+", re.I), "[KREDENSIAL]"),
]


class Penyamar:
    def __init__(self):
        self.jumlah = 0
        self.jenis: list[str] = []

    def _catat(self, jenis: str):
        self.jumlah += 1
        if jenis not in self.jenis:
            self.jenis.append(jenis)

    def teks(self, s: str | None) -> str:
        out = s or ""
        for jenis, pola, token in ATURAN:
            def ganti(_m, j=jenis, t=token):
                self._catat(j)
                return t
            out = pola.sub(ganti, out)
        return out

    def layanan(self, nama: str) -> str:
        self._catat("nama layanan")
        h = int(hashlib.sha256(nama.encode()).hexdigest()[:6], 16)
        return f"LAYANAN-{chr(65 + h % 26)}{h % 90 + 10}"

    def laporan(self) -> dict:
        return {"jumlah": self.jumlah, "jenis": self.jenis}
