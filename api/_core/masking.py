"""Penyamaran data sensitif sebelum paket keluar ke Layanan LLM (NFR-12).

Attributes
----------
ATURAN : list of tuple
    Daftar ``(jenis, pola_regex, token_pengganti)`` yang diterapkan berurutan:
    email, URL, alamat IP, hostname, nomor panjang (rekening/ID), dan kredensial.
"""
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
    """Penyamar teks dan nama layanan yang mencatat apa saja yang disamarkan.

    Attributes
    ----------
    jumlah : int
        Banyaknya nilai yang sudah disamarkan.
    jenis : list of str
        Jenis data yang pernah disamarkan, tanpa duplikat, sesuai urutan kemunculan.
    """
    def __init__(self):
        """Membuat penyamar dengan pencatat kosong."""
        self.jumlah = 0
        self.jenis: list[str] = []

    def _catat(self, jenis: str):
        """Mencatat satu penyamaran.

        Parameters
        ----------
        jenis : str
            Jenis data yang disamarkan, misalnya ``"email"``.
        """
        self.jumlah += 1
        if jenis not in self.jenis:
            self.jenis.append(jenis)

    def teks(self, s: str | None) -> str:
        """Menyamarkan teks bebas memakai seluruh ``ATURAN``.

        Parameters
        ----------
        s : str or None
            Teks masukan; ``None`` diperlakukan sebagai string kosong.

        Returns
        -------
        str
            Teks dengan data sensitif diganti token seperti ``[EMAIL]`` atau ``[IP]``.
        """
        out = s or ""
        for jenis, pola, token in ATURAN:
            def ganti(_m, j=jenis, t=token):
                """Fungsi pengganti ``re.sub`` yang mencatat jenis lalu mengembalikan token.

                Parameters
                ----------
                _m : re.Match
                    Kecocokan regex (tidak dipakai).
                j : str
                    Jenis data, diikat saat definisi agar tidak tertimpa iterasi berikutnya.
                t : str
                    Token pengganti.

                Returns
                -------
                str
                    Token pengganti.
                """
                self._catat(j)
                return t
            out = pola.sub(ganti, out)
        return out

    def layanan(self, nama: str) -> str:
        """Mengganti nama layanan dengan alias stabil.

        Parameters
        ----------
        nama : str
            Nama layanan asli.

        Returns
        -------
        str
            Alias berbentuk ``LAYANAN-X##`` yang selalu sama untuk nama yang sama.
        """
        self._catat("nama layanan")
        h = int(hashlib.sha256(nama.encode()).hexdigest()[:6], 16)
        return f"LAYANAN-{chr(65 + h % 26)}{h % 90 + 10}"

    def laporan(self) -> dict:
        """Ringkasan penyamaran untuk dicatat pada hasil analisis.

        Returns
        -------
        dict
            ``{"jumlah": int, "jenis": list of str}``.
        """
        return {"jumlah": self.jumlah, "jenis": self.jenis}
