"""AgenAnalisis: orkestrator Core Module ServerAgent (Bab 4.1.3, kartu CRC 9 sampai 20, Gambar 10.2 sampai 10.4).

Agen menerima satu PermintaanAnalisis, menyamarkan data, mengambil metrik dari ELK, meminta
rencana kepada Layanan LLM, menjuruskan setiap langkah ke ModelDigitalTwin atau
EstimatorPenalaran, menghitung indikator, menetapkan verdict, meminta narasi, lalu mencatat
JejakKeputusan. Status permintaan mengikuti state machine PermintaanAnalisis: Diterima,
Disamarkan, Direncanakan, Dijalankan, (Dihentikan), Dinilai, Selesai.

Attributes
----------
REGISTRI : dict
    Isi ``registry.json``: layanan, model digital twin, baseline, dan komponen di luar cakupan.
KRITERIA_SLA : dict
    Kriteria SLA yang dipakai pada mode insiden dan mitigasi.
BATAS_HEADROOM : float
    Utilisasi (persen) di atas nilai ini membuat verdict paling tinggi Lolos Bersyarat.
ANGGARAN_LLM_S : float
    Batas waktu proses (detik) sebelum langkah LLM berikutnya memakai cadangan deterministik.
LABEL_SUMBER : dict of str
    Label tampilan untuk setiap sumber daya pembatas.
LABEL_VERDICT : dict of str
    Label tampilan untuk setiap verdict.
PENYEBAB : dict of str
    Kalimat kemungkinan penyebab bottleneck per sumber daya pembatas.
"""
from __future__ import annotations

import json
import math
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator

from langchain_core.tools import StructuredTool

from .elk import ambil_metrik
from .llm import VERSI_PROMPT, EstimasiLLM, GagalLLM, LayananLLM, RencanaLLM
from .masking import Penyamar
from .twin import HasilSimulasi, Profil, Spesifikasi, benih, kalibrasi, kapasitas_littles_law, simulasikan

REGISTRI = json.loads((Path(__file__).parent / "registry.json").read_text(encoding="utf-8"))
KRITERIA_SLA = {"maxP95Ms": 800, "maxErrorRatePct": 1, "maxCpuPct": 85, "maxMemPct": 90}
BATAS_HEADROOM = 75
ANGGARAN_LLM_S = 150    # setelah sekian detik, langkah LLM berikutnya memakai cadangan deterministik

LABEL_SUMBER = {
    "CPU": "CPU", "Memori": "Memori", "Jaringan": "Jaringan", "ThreadPool": "Thread pool",
    "ConnectionPool": "Connection pool", "Database": "Waktu respons database", "DependensiEksternal": "Dependensi eksternal",
}
LABEL_VERDICT = {"Lolos": "Lolos", "LolosBersyarat": "Lolos Bersyarat", "TidakLolos": "Tidak Lolos", "TidakDapatDinilai": "Tidak Dapat Dinilai"}
PENYEBAB = {
    "CPU": "Kebutuhan CPU per transaksi mendominasi; tinjau profil per request pada versi ini atau tambah vCPU/node.",
    "Memori": "Memori menjadi pembatas; periksa ukuran heap, cache, dan objek yang tertahan per request sebelum menambah RAM.",
    "Jaringan": "Bandwidth jaringan menjadi pembatas; periksa ukuran payload dan kompresi respons.",
    "ThreadPool": "Request mengantre di thread pool sebelum CPU jenuh; tambah thread pool atau pangkas waktu tunggu ke layanan hilir.",
    "ConnectionPool": "Connection pool ke database menjadi titik antre; tinjau ukuran pool dan durasi transaksi.",
    "Database": "Waktu respons database mendominasi latensi; periksa query lambat dan indeks.",
    "DependensiEksternal": "Waktu tunggu dependensi eksternal mendominasi latensi; pertimbangkan timeout, circuit breaker, atau cache respons.",
}


def iso(dt: datetime) -> str:
    """Memformat waktu sebagai ISO 8601 UTC dengan milidetik nol.

    Parameters
    ----------
    dt : datetime
        Waktu dengan zona waktu.

    Returns
    -------
    str
        Contoh: ``"2026-11-06T07:00:00.000Z"``.
    """
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def registri_layanan(nama: str) -> dict | None:
    """Mencari entri layanan pada registri.

    Parameters
    ----------
    nama : str
        Nama layanan, misalnya ``"Layanan Pembayaran"``.

    Returns
    -------
    dict or None
        Entri layanan (model, baseline, spesifikasi), atau ``None`` bila tidak terdaftar.
    """
    return next((x for x in REGISTRI["layanan"] if x["nama"] == nama), None)


@dataclass
class LangkahAnalisis:
    """Satu langkah pada rencana analisis beserta hasilnya.

    Attributes
    ----------
    urutan : int
        Nomor urut langkah, mulai dari 1.
    kunci : str
        Kunci stabil, misalnya ``"normal"``, ``"puncak"``, ``"whatif-2"``, ``"insiden"``.
    deskripsi : str
        Uraian langkah untuk ditampilkan.
    alat : str
        Alat agen yang dipakai: ``jalankan_serversim`` atau ``estimasi_serverbrief``.
    skenario : dict or None
        SkenarioBeban (TPS dasar, pengali, TPS target, pola beban, durasi).
    dalamCakupanModel : bool
        ``False`` bila langkah melibatkan komponen di luar cakupan model digital twin.
    jalurPenjurusan : {"DigitalTwin", "EstimasiPenalaran", "FallbackDigitalTwin"} or None
        Jalur yang dipilih saat penjurusan.
    skorKeyakinan, kesepakatanSampel : float or None
        Diisi bila langkah melewati EstimatorPenalaran.
    statusLangkah : {"Menunggu", "Selesai", "Dihentikan"}
        Status eksekusi langkah.
    perluVerifikasiManual : bool
        ``True`` bila angka berasal dari estimasi penalaran.
    estimasiBiaya : float
        Estimasi biaya LLM untuk langkah ini.
    ringkasan : dict or None
        Indikator hasil langkah.
    deretWaktu : list of dict
        Trajektori sumber daya dari digital twin.
    komponenLatensiMs : dict
        Rincian latensi per komponen.
    pelanggaran : list of str
        Kriteria penerimaan yang dilanggar.
    status : str or None
        Verdict per langkah.
    catatan : str
        Penjelasan singkat jalur dan hasil.
    """
    urutan: int
    kunci: str
    deskripsi: str
    alat: str
    skenario: dict | None = None
    dalamCakupanModel: bool = True
    jalurPenjurusan: str | None = None
    skorKeyakinan: float | None = None
    kesepakatanSampel: float | None = None
    statusLangkah: str = "Menunggu"
    perluVerifikasiManual: bool = False
    estimasiBiaya: float = 0.0
    ringkasan: dict | None = None
    deretWaktu: list = field(default_factory=list)
    komponenLatensiMs: dict = field(default_factory=dict)
    pelanggaran: list = field(default_factory=list)
    status: str | None = None
    catatan: str = ""

    def keluaran(self) -> dict:
        """Mengubah langkah menjadi dictionary untuk HasilAnalisis.

        Returns
        -------
        dict
            Semua field dataclass.
        """
        return {k: getattr(self, k) for k in self.__dataclass_fields__}


class EstimatorPenalaran:
    """Menjalankan langkah di luar cakupan model melalui beberapa sampel penalaran LLM.

    Parameters
    ----------
    agen : AgenAnalisis
        Agen pemilik; dipakai untuk pengaturan, LLM, dan kunci benih.

    Attributes
    ----------
    jumlahSampel : int
        Banyaknya sampel LLM (1 sampai 5).
    metodeAgregasi : str
        Cara menggabungkan sampel.
    """

    def __init__(self, agen: "AgenAnalisis"):
        """Membaca jumlah sampel dari pengaturan agen dan membatasinya ke 1 sampai 5."""
        self.agen = agen
        self.jumlahSampel = max(1, min(int(agen.pengaturan.get("sampel", 3)), 5))
        self.metodeAgregasi = "rata-rata dengan penalti kesepakatan"

    def jalankan(self, kunci: str, konteks: str, acuan: dict) -> dict:
        """Menghasilkan estimasi indikator, skor keyakinan, dan kesepakatan sampel.

        Pada mode LLM, setiap sampel diminta secara terstruktur lalu dirata-rata; kesepakatan dihitung
        dari sebaran relatif CPU dan p95, dan skor dikurangi 0,1 bila kesepakatan di bawah 0,8.
        Pada mode demo, estimasi dihitung deterministik dari kunci permintaan.

        Parameters
        ----------
        kunci : str
            Kunci langkah yang diestimasi.
        konteks : str
            Konteks tersamarkan untuk prompt LLM.
        acuan : dict
            Indikator digital twin tanpa komponen di luar cakupan, sebagai titik awal.

        Returns
        -------
        dict
            ``ringkasan`` (indikator), ``skor`` (0 sampai 1), ``kesepakatan`` (0 sampai 1), dan ``alasan``.
        """
        if self.agen._llm_boleh("estimasi penalaran"):
            sampel = []
            # Sampel diminta bersamaan agar waktu tunggu tidak berlipat sebanyak jumlah sampel.
            with ThreadPoolExecutor(max_workers=self.jumlahSampel) as ex:
                for f in [ex.submit(self.agen.llm.terstruktur, EstimasiLLM, konteks) for _ in range(self.jumlahSampel)]:
                    try:
                        sampel.append(f.result())
                    except GagalLLM as e:
                        self.agen.peringatan.append(f"Sebagian sampel estimasi gagal: {e}")
            if not sampel:
                return {"ringkasan": acuan, "skor": 0.0, "kesepakatan": 0.0, "alasan": "Seluruh sampel gagal."}
            rata = lambda k: sum(getattr(s, k) for s in sampel) / len(sampel)
            def sebaran(k):
                """Rata-rata simpangan mutlak relatif antar-sampel untuk satu indikator.

                Parameters
                ----------
                k : str
                    Nama field pada ``EstimasiLLM``.

                Returns
                -------
                float
                    Sebaran relatif; 0 bila rata-ratanya 0.
                """
                m = rata(k)
                return 0 if m == 0 else sum(abs(getattr(s, k) - m) for s in sampel) / len(sampel) / m
            kesepakatan = max(0.0, 1 - (sebaran("cpuPct") + sebaran("p95Ms")) / 2)
            skor = max(0.0, min(1.0, rata("keyakinan") - (0.1 if kesepakatan < 0.8 else 0)))
            ringkasan = {**acuan, "cpuPct": round(rata("cpuPct"), 1), "memPct": round(rata("memPct"), 1),
                         "threadPct": round(rata("threadPct"), 1), "p95Ms": round(rata("p95Ms")),
                         "errorRatePct": round(rata("errorRatePct"), 2)}
            return {"ringkasan": ringkasan, "skor": round(skor, 2), "kesepakatan": round(kesepakatan, 2), "alasan": sampel[0].alasan}
        # Mode demo: estimasi deterministik dari kunci permintaan.
        h = (benih(self.agen.kunci_benih, kunci) % 10000) / 10000
        skor = round(0.58 + h * 0.34, 2)
        kesepakatan = round(0.78 + ((benih(kunci, "s") % 1000) / 1000) * 0.2, 2)
        f = 1.08 + h * 0.12
        ringkasan = {**acuan, "cpuPct": round(acuan["cpuPct"] * f, 1), "memPct": round(min(acuan["memPct"] * (1 + (f - 1) / 2), 140), 1),
                     "threadPct": round(acuan["threadPct"] * f, 1), "p95Ms": round(acuan["p95Ms"] * f),
                     "errorRatePct": round(min(acuan["errorRatePct"] * f, 100), 2)}
        return {"ringkasan": ringkasan, "skor": skor, "kesepakatan": kesepakatan,
                "alasan": "Estimasi deterministik mode demo berdasarkan pola komponen sejenis."}


class AgenAnalisis:
    """Orkestrator satu PermintaanAnalisis dari diterima sampai selesai.

    Parameters
    ----------
    permintaan : dict
        PermintaanAnalisis dari Dashboard: ``idPermintaan``, ``mode`` (``Alignment``,
        ``ReproduksiInsiden``, atau ``Mitigasi``), ``layanan``, ``parameter`` atau ``insiden``,
        opsional ``mitigasi``, dan ``pengaturan`` (mode, penyedia, model, harga, ambang, sampel).
    sekarang : datetime, optional
        Waktu acuan analisis; bawaan waktu UTC saat ini. Dipakai skrip data contoh agar deterministik.

    Attributes
    ----------
    alat : dict of langchain_core.tools.StructuredTool
        Alat agen: ``kueri_metrik_elk``, ``jalankan_serversim``, ``estimasi_serverbrief``.
    langkah : list of LangkahAnalisis
        Langkah analisis yang disusun.
    jejak : list of dict
        JejakKeputusan per tahap.
    peringatan : list of str
        Peringatan yang ditampilkan pada hasil (misalnya ELK tidak tersedia).
    status : str
        Status PermintaanAnalisis saat ini.
    """
    def __init__(self, permintaan: dict, sekarang: datetime | None = None):
        """Menyiapkan pengaturan, LayananLLM, penyamar, estimator, dan alat LangChain."""
        self.p = permintaan
        self.mode = permintaan["mode"]  # Alignment | ReproduksiInsiden | Mitigasi
        self.pengaturan = permintaan.get("pengaturan", {})
        self.mode_llm = self.pengaturan.get("mode") == "llm"
        self.sekarang = sekarang or datetime.now(timezone.utc)
        self.layanan = permintaan["layanan"]
        self.reg = registri_layanan(self.layanan)
        self.ambang = float(self.pengaturan.get("ambang", 0.7))
        self.llm = LayananLLM(self.pengaturan.get("provider", "anthropic"), self.pengaturan.get("model", ""),
                              self.pengaturan.get("harga", {"input": 3, "output": 15}), float(self.pengaturan.get("kurs", 16500)))
        self.penyamar = Penyamar()
        self.peringatan: list[str] = []
        self.jejak: list[dict] = []
        self.langkah: list[LangkahAnalisis] = []
        self.status = "Diterima"
        # Seed tidak memuat daftar what-if: menambah atau mengurangi varian tidak boleh mengubah hasil beban normal dan puncak.
        dasar = {k: permintaan.get(k) for k in ("layanan", "parameter", "insiden", "mitigasi")}
        if isinstance(dasar.get("parameter"), dict):
            dasar["parameter"] = {k: v for k, v in dasar["parameter"].items() if k != "whatIf"}
        self.kunci_benih = json.dumps(dasar, sort_keys=True)
        self.t_mulai = time.time()
        self.estimator = EstimatorPenalaran(self)
        self.alat = {
            "kueri_metrik_elk": StructuredTool.from_function(
                func=self._alat_elk, name="kueri_metrik_elk",
                description="Mengambil metrik baseline Production dari ELK Stack; memakai baseline tersimpan terakhir bila ELK tidak dapat diakses."),
            "jalankan_serversim": StructuredTool.from_function(
                func=self._alat_serversim, name="jalankan_serversim",
                description="Menjalankan satu skenario beban pada digital twin SimPy yang deterministik. Argumen: kunci skenario."),
            "estimasi_serverbrief": StructuredTool.from_function(
                func=self._alat_estimasi, name="estimasi_serverbrief",
                description="Estimasi penalaran ala ServerBrief untuk kasus di luar cakupan model digital twin. Argumen: kunci langkah."),
        }

    # ------------------------------------------------------------------ utilitas peristiwa
    def _llm_boleh(self, tahap: str) -> bool:
        """Memeriksa apakah panggilan LLM untuk suatu tahap masih boleh dilakukan.

        Panggilan dibatalkan bila mode LLM tidak aktif atau waktu proses sudah melewati
        ``ANGGARAN_LLM_S``, agar fungsi tidak dihentikan platform sebelum hasil terkirim.

        Parameters
        ----------
        tahap : str
            Nama tahap untuk pesan peringatan, misalnya ``"narasi"``.

        Returns
        -------
        bool
            ``True`` bila LLM boleh dipanggil.
        """
        if not self.mode_llm:
            return False
        if time.time() - self.t_mulai > ANGGARAN_LLM_S:
            self.peringatan.append(f"Waktu proses melewati {ANGGARAN_LLM_S} detik; {tahap} memakai cadangan deterministik.")
            return False
        return True

    def _status(self, s: str):
        """Mengubah status permintaan dan membuat event status.

        Parameters
        ----------
        s : str
            Status baru pada state machine PermintaanAnalisis.

        Returns
        -------
        dict
            Event ``{"type": "status", "status": s}``.
        """
        self.status = s
        return {"type": "status", "status": s}

    def _jejak(self, id_: str, label: str, jalur: str, catatan: str, t0: float, skor=None, kesepakatan=None):
        """Menambah satu entri JejakKeputusan.

        Parameters
        ----------
        id_ : str
            Identitas tahap.
        label : str
            Label tahap untuk ditampilkan.
        jalur : str
            Jalur yang dipakai (``Sistem``, ``LayananLLM``, ``DigitalTwin``, ``EstimasiPenalaran``, dan seterusnya).
        catatan : str
            Ringkasan hasil tahap.
        t0 : float
            Waktu mulai tahap (``time.time()``) untuk menghitung durasi.
        skor, kesepakatan : float, optional
            Skor keyakinan dan kesepakatan sampel bila ada.
        """
        self.jejak.append({"id": id_, "label": label, "jalur": jalur, "catatan": catatan, "skorKeyakinan": skor,
                           "kesepakatanSampel": kesepakatan, "durasiMs": int((time.time() - t0) * 1000)})

    # ------------------------------------------------------------------ alat LangChain
    def _alat_elk(self) -> dict:
        """Alat ``kueri_metrik_elk``: mengambil baseline Production dari ELK.

        Returns
        -------
        dict
            MetrikBaseline; atribut ``_elk_mati`` diisi bila memakai baseline tersimpan.
        """
        metrik, mati = ambil_metrik(self.reg or {"baseline": {"avgTps": 5, "peakTps": 35, "cpuPct": 28, "memPct": 55, "p95Ms": 240, "errorRatePct": 0.1}},
                                    self.layanan, self.sekarang, bool(self.pengaturan.get("simulasiElkMati")),
                                    self.pengaturan.get("baselineTersimpan"))
        self._elk_mati = mati
        return metrik

    def _alat_serversim(self, kunci: str) -> dict:
        """Alat ``jalankan_serversim``: menjalankan satu skenario pada digital twin.

        Parameters
        ----------
        kunci : str
            Kunci langkah yang skenarionya disimulasikan.

        Returns
        -------
        dict
            ``ringkasan``, ``deretWaktu``, dan ``komponenLatensiMs``.
        """
        lk = next(l for l in self.langkah if l.kunci == kunci)
        sk = lk.skenario
        hasil: HasilSimulasi = simulasikan(self.spec, self.profil, sk["tpsTarget"], benih(self.reg["model"]["versiModel"], self.kunci_benih, kunci))
        return {"ringkasan": hasil.ringkasan, "deretWaktu": hasil.deretWaktu, "komponenLatensiMs": hasil.komponenLatensiMs}

    def _alat_estimasi(self, kunci: str) -> dict:
        """Alat ``estimasi_serverbrief``: estimasi penalaran untuk langkah di luar cakupan model.

        Parameters
        ----------
        kunci : str
            Kunci langkah yang diestimasi.

        Returns
        -------
        dict
            Keluaran ``EstimatorPenalaran.jalankan``.
        """
        lk = next(l for l in self.langkah if l.kunci == kunci)
        acuan = self._acuan_estimasi()
        konteks = (
            f"{self.konteks}\n\nLangkah: {lk.deskripsi}. Komponen ini berada di luar cakupan model digital twin.\n"
            f"Indikator digital twin tanpa komponen tersebut sebagai acuan: {json.dumps(acuan)}.\n"
            "Perkirakan indikator setelah dampak komponen itu diperhitungkan, beserta skor keyakinan 0 sampai 1."
        )
        return self.estimator.jalankan(kunci, konteks, acuan)

    # ------------------------------------------------------------------ alur utama
    def proses(self) -> Generator[dict, None, None]:
        """Menjalankan seluruh alur analisis sambil mengalirkan event kemajuan.

        Yields
        ------
        dict
            Event ``{"type": "status"}`` setiap perubahan status, ``{"type": "step"}`` dengan
            ``state`` ``run``, ``done``, ``warn``, atau ``skip`` untuk setiap tahap, dan terakhir
            ``{"type": "hasil", "hasil": dict}`` berisi HasilAnalisis lengkap.

        Notes
        -----
        Bila model tidak aktif atau beban suatu langkah di luar rentang TPS terkalibrasi, langkah
        ditandai Dihentikan, indikator tidak dihitung, dan verdict menjadi Tidak Dapat Dinilai.
        """
        t_mulai = time.time()
        yield self._status("Diterima")

        # 1. Samarkan data sensitif sebelum apa pun keluar ke Layanan LLM.
        t0 = time.time()
        yield {"type": "step", "id": "samarkan", "label": "Samarkan data sensitif", "state": "run"}
        self._samarkan()
        rep = self.penyamar.laporan()
        catatan = f"{rep['jumlah']} item disamarkan ({', '.join(rep['jenis']) or '-'})."
        self._jejak("samarkan", "Samarkan data sensitif", "Sistem", catatan, t0)
        yield {"type": "step", "id": "samarkan", "label": "Samarkan data sensitif", "state": "done", "note": catatan}
        yield self._status("Disamarkan")

        # 2. Ambil metrik baseline (alat kueri_metrik_elk).
        t0 = time.time()
        yield {"type": "step", "id": "elk", "label": "Ambil metrik dari ELK Stack", "state": "run"}
        self.metrik = self.alat["kueri_metrik_elk"].invoke({})
        mati = getattr(self, "_elk_mati", False)
        catatan = (f"ELK Stack tidak dapat diakses; memakai baseline tersimpan {self.metrik['tanggalPengambilan']}." if mati
                   else f"Baseline 7 hari: rata-rata {self.metrik['throughputTps']} TPS, puncak {self.metrik['puncakTps']} TPS, CPU {self.metrik['cpuRataPersen']}%, p95 {self.metrik['responseTimeP95Ms']} ms.")
        if mati:
            self.peringatan.append(catatan)
        self.metrik_insiden = self._metrik_periode_insiden()
        self._jejak("elk", "Ambil metrik dari ELK Stack", "Sistem", catatan, t0)
        yield {"type": "step", "id": "elk", "label": "Ambil metrik dari ELK Stack", "state": "warn" if mati else "done", "note": catatan}

        # 3. Susun rencana analisis.
        t0 = time.time()
        yield {"type": "step", "id": "rencana", "label": "Susun rencana analisis", "state": "run"}
        self._susun_langkah()
        self.rencana = self._susun_rencana()
        catatan = f"{len(self.langkah)} langkah. {self.rencana['ringkasanTujuan']}"
        self._jejak("rencana", "Susun rencana analisis", "LayananLLM" if self.mode_llm else "Sistem", catatan, t0)
        yield {"type": "step", "id": "rencana", "label": "Susun rencana analisis", "state": "done", "note": catatan}
        yield self._status("Direncanakan")

        # 4. Eksekusi langkah dengan penjurusan.
        yield self._status("Dijalankan")
        self.dihentikan = None
        model = self.reg["model"] if self.reg else None
        if not model or not model["statusAktif"]:
            self.dihentikan = f"Tidak ada model digital twin aktif untuk {self.layanan}."
        else:
            for lk in self.langkah:
                if lk.skenario and not (model["tpsMinTerkalibrasi"] <= lk.skenario["tpsTarget"] <= model["tpsMaksTerkalibrasi"]):
                    self.dihentikan = (f"{lk.deskripsi}: beban {lk.skenario['tpsTarget']} TPS di luar rentang terkalibrasi "
                                       f"{model['tpsMinTerkalibrasi']} sampai {model['tpsMaksTerkalibrasi']} TPS.")
                    break
        if not self.dihentikan:
            t0 = time.time()
            yield {"type": "step", "id": "kalibrasi", "label": "Kalibrasi profil beban", "state": "run"}
            catatan = self._kalibrasi()
            self._jejak("kalibrasi", "Kalibrasi profil beban", "DigitalTwin", catatan, t0)
            yield {"type": "step", "id": "kalibrasi", "label": "Kalibrasi profil beban", "state": "done", "note": catatan}

        for lk in self.langkah:
            sid = f"langkah-{lk.urutan}"
            label = f"Langkah {lk.urutan}: {lk.deskripsi}"
            if self.dihentikan:
                lk.statusLangkah = "Dihentikan"
                lk.catatan = self.dihentikan
                self._jejak(sid, label, "Dihentikan", self.dihentikan, time.time())
                yield {"type": "step", "id": sid, "label": label, "state": "skip", "note": self.dihentikan}
                continue
            t0 = time.time()
            yield {"type": "step", "id": sid, "label": label, "state": "run"}
            ev = self._jurus_langkah(lk)
            self._jejak(sid, label, lk.jalurPenjurusan, lk.catatan, t0, lk.skorKeyakinan, lk.kesepakatanSampel)
            yield {"type": "step", "id": sid, "label": label, "state": ev, "note": lk.catatan}

        if self.dihentikan:
            yield self._status("Dihentikan")

        # 5. Indikator, verdict, narasi.
        t0 = time.time()
        yield {"type": "step", "id": "indikator", "label": "Hitung indikator sumber daya", "state": "run" if not self.dihentikan else "skip"}
        self._hitung_indikator()
        if not self.dihentikan:
            catatan = (f"Kapasitas maksimum {self.kapasitas['kapasitasMaksTps']} TPS (Little's Law). "
                       f"Sumber daya pembatas: {LABEL_SUMBER[self.pembatas]}.")
            self._jejak("indikator", "Hitung indikator sumber daya", "DigitalTwin", catatan, t0)
            yield {"type": "step", "id": "indikator", "label": "Hitung indikator sumber daya", "state": "done", "note": catatan}
        else:
            yield {"type": "step", "id": "indikator", "label": "Hitung indikator sumber daya", "state": "skip", "note": "Indikator tidak dihitung karena analisis dihentikan."}

        t0 = time.time()
        yield {"type": "step", "id": "verdict", "label": "Tetapkan verdict", "state": "run"}
        self._tetapkan_verdict()
        self._jejak("verdict", "Tetapkan verdict", "Sistem", f"Verdict {LABEL_VERDICT[self.verdict['status']]}.", t0)
        yield {"type": "step", "id": "verdict", "label": "Tetapkan verdict", "state": "done", "note": f"Verdict: {LABEL_VERDICT[self.verdict['status']]}."}
        yield self._status("Dinilai")

        t0 = time.time()
        yield {"type": "step", "id": "narasi", "label": "Susun narasi verdict", "state": "run"}
        self._minta_narasi()
        self.rencana_uji = self._rencana_uji()
        self._jejak("narasi", "Susun narasi verdict", "LayananLLM" if self.mode_llm else "Sistem",
                    "Narasi dari Layanan LLM." if self.mode_llm and not self._narasi_fallback else "Narasi dari templat.", t0)
        yield {"type": "step", "id": "narasi", "label": "Susun narasi verdict", "state": "warn" if self._narasi_fallback and self.mode_llm else "done"}

        biaya = self.llm.biaya()
        catatan = (f"{biaya['pengiriman']} pengiriman ke Layanan LLM, estimasi Rp{biaya['idr']:,}".replace(",", ".")
                   if self.mode_llm else "Mode demo: tidak ada pengiriman ke Layanan LLM.")
        yield {"type": "step", "id": "jejak", "label": "Catat jejak keputusan", "state": "done", "note": catatan}
        self._jejak("jejak", "Catat jejak keputusan", "Sistem", catatan, time.time())
        yield self._status("Selesai")
        yield {"type": "hasil", "hasil": self._hasil(t_mulai, biaya)}

    # ------------------------------------------------------------------ langkah internal
    def _samarkan(self):
        """Menyusun konteks analisis yang sudah disamarkan untuk dikirim ke Layanan LLM.

        Nama layanan diganti alias, sedangkan teks bebas (perubahan konfigurasi, catatan uji,
        deskripsi dan gejala insiden) disamarkan dengan ``Penyamar.teks``. Hasilnya disimpan di
        ``self.konteks``.
        """
        s = self.penyamar
        alias = s.layanan(self.layanan)
        if self.mode == "Alignment":
            pa = self.p["parameter"]
            self.konteks = (
                f"Mode: Alignment. Layanan {alias}, versi uji {self.p.get('versiUji')}, sprint cycle {self.p.get('cycle')}, Dev ke Production.\n"
                f"Versi layanan: {pa.get('serviceVersion')}. Perubahan: {s.teks(pa.get('configChanges'))}.\n"
                f"Beban normal {pa['normalTps']} TPS, puncak {pa['peakTps']} TPS, what-if {pa.get('whatIf', [])} x normal.\n"
                f"Uji Dev: {json.dumps(pa['devSummary'] | {'notes': s.teks(pa['devSummary'].get('notes'))})}.\n"
                f"Spesifikasi Dev: {json.dumps(pa['devSpec'])}. Spesifikasi Production: {json.dumps(pa['prodSpec'])}.\n"
                f"Kriteria penerimaan: {json.dumps(pa['criteria'])}."
            )
        else:
            ins = self.p["insiden"]
            mit = self.p.get("mitigasi")
            self.konteks = (
                f"Mode: {self.mode}. Layanan {alias}. Tipe insiden {ins['type']}. Ringkasan: {s.teks(ins.get('title'))}. "
                f"{s.teks(ins.get('description'))} {s.teks(ins.get('manualSymptoms'))}\n"
                f"Beban puncak {ins['peakRps']} RPS, rata-rata {ins['avgRps']} RPS, durasi {ins['durationMin']} menit.\n"
                f"Spesifikasi: {json.dumps(ins['spec'])}." + (f" Opsi mitigasi: {json.dumps(mit['changes'])}." if mit else "")
                + f"\nKriteria SLA: {json.dumps(KRITERIA_SLA)}."
            )

    def _metrik_periode_insiden(self):
        """Menyiapkan metrik periode insiden untuk mode insiden dan mitigasi.

        Returns
        -------
        dict or None
            Metrik periode insiden dari ELK atau gejala manual; ``None`` pada mode Alignment.
        """
        if self.mode == "Alignment":
            return None
        ins = self.p["insiden"]
        if not ins.get("elkDataAvailable", True):
            return {"jenisPeriode": "PeriodeInsiden", "sumber": "GejalaManual", "gejala": ins.get("manualSymptoms", "")}
        return {"jenisPeriode": "PeriodeInsiden", "sumber": "ELKLangsung", "throughputTps": ins["peakRps"],
                "durasiMenit": ins["durationMin"], "waktuDeteksi": ins.get("detectedAt")}

    def _susun_langkah(self):
        """Menyusun daftar ``LangkahAnalisis`` sesuai mode.

        Mode Alignment membuat langkah beban normal, puncak, dan setiap varian what-if (pengali
        beban normal), ditambah langkah estimasi bila perubahan konfigurasi menyebut komponen di
        luar cakupan model. Mode insiden dan mitigasi membuat satu langkah profil beban insiden.
        """
        self.langkah = []
        cakupan = [k.lower() for k in (self.reg["model"]["cakupanKomponen"] if self.reg else [])]
        if self.mode == "Alignment":
            pa = self.p["parameter"]
            sken = [("normal", "Beban normal", pa["normalTps"], 1, pa["normalTps"]),
                    ("puncak", "Beban puncak", pa["peakTps"], 1, pa["peakTps"])]
            for m in pa.get("whatIf", []):
                sken.append((f"whatif-{m:g}", f"What-if {m:g}x beban normal", pa["normalTps"], m, round(pa["normalTps"] * m, 2)))
            for i, (k, nama, dasar, pengali, target) in enumerate(sken, start=1):
                self.langkah.append(LangkahAnalisis(i, k, f"{nama} ({target:g} TPS)", "jalankan_serversim", skenario={
                    "namaSkenario": nama, "tpsDasar": dasar, "pengali": pengali, "tpsTarget": target,
                    "polaBeban": "konstan (Poisson)", "durasiMenit": 1, "campuranTransaksi": "sesuai profil uji Dev"}))
            teks = (pa.get("configChanges") or "").lower()
            luar = [k for k in REGISTRI["komponenDiLuarCakupan"] if k in teks and k not in cakupan]
            if luar:
                self.langkah.append(LangkahAnalisis(len(self.langkah) + 1, "dampak-komponen",
                                                    f"Dampak komponen di luar cakupan model ({', '.join(luar)}) pada beban puncak",
                                                    "estimasi_serverbrief", dalamCakupanModel=False))
        else:
            ins = self.p["insiden"]
            nama = "Reproduksi kondisi insiden" if self.mode == "ReproduksiInsiden" else f"Nilai opsi mitigasi: {self.p['mitigasi'].get('label', '')}"
            dalam = ins["type"] != "lainnya"
            self.langkah.append(LangkahAnalisis(1, "insiden", f"{nama} ({ins['peakRps']:g} RPS)",
                                                "jalankan_serversim" if dalam else "estimasi_serverbrief",
                                                dalamCakupanModel=dalam, skenario={
                                                    "namaSkenario": "Profil beban insiden", "tpsDasar": ins["avgRps"],
                                                    "pengali": round(ins["peakRps"] / max(ins["avgRps"], 0.1), 2),
                                                    "tpsTarget": ins["peakRps"], "polaBeban": ins["type"],
                                                    "durasiMenit": ins["durationMin"], "campuranTransaksi": "sesuai periode insiden"}))

    def _susun_rencana(self) -> dict:
        """Menyusun RencanaAnalisis, diperkaya LLM bila mode LLM aktif.

        Returns
        -------
        dict
            ``ringkasanTujuan``, ``waktuDisusun``, dan daftar ``langkah``. Bila LLM gagal, rencana
            deterministik tetap dipakai dan peringatan dicatat.
        """
        tujuan = ("Menilai kesiapan versi uji pada beban normal, puncak, dan varian what-if terhadap kriteria penerimaan."
                  if self.mode == "Alignment" else
                  "Mereproduksi kondisi insiden pada spesifikasi saat ini." if self.mode == "ReproduksiInsiden" else
                  "Menilai apakah opsi mitigasi menahan kondisi insiden dalam batas SLA.")
        rencana = {"ringkasanTujuan": tujuan, "waktuDisusun": iso(self.sekarang),
                   "langkah": [{"urutan": l.urutan, "deskripsi": l.deskripsi, "alat": l.alat, "acuan": l.kunci} for l in self.langkah]}
        if not self._llm_boleh("rencana"):
            return rencana
        daftar = "\n".join(f"- {l.kunci}: {l.deskripsi}" for l in self.langkah)
        alat = "\n".join(f"- {t.name}: {t.description}" for t in self.alat.values())
        try:
            r: RencanaLLM = self.llm.terstruktur(RencanaLLM, (
                f"{self.konteks}\n\nAlat yang tersedia:\n{alat}\n\nSusun rencana analisis yang mencakup setiap kunci berikut "
                f"(pakai kunci persis sebagai acuan):\n{daftar}"))
            peta = {x.acuan: x for x in r.langkah}
            for l in self.langkah:
                if l.kunci in peta and peta[l.kunci].deskripsi:
                    rencana["langkah"][l.urutan - 1]["catatanLLM"] = peta[l.kunci].deskripsi
            hilang = [l.kunci for l in self.langkah if l.kunci not in peta]
            if hilang:
                self.peringatan.append(f"Rencana dari Layanan LLM tidak mencakup {', '.join(hilang)}; langkah itu tetap dijalankan.")
            rencana["ringkasanTujuan"] = r.ringkasanTujuan or tujuan
        except GagalLLM as e:
            self.peringatan.append(f"Layanan LLM gagal menyusun rencana ({e}); memakai rencana deterministik.")
        return rencana

    def _kalibrasi(self) -> str:
        """Mengkalibrasi profil beban dan menetapkan spesifikasi target serta kriteria.

        Mode Alignment memakai hasil uji Dev pada spesifikasi Dev; mode insiden memakai baseline
        Production. Kebocoran memori dan porsi batch job ditambahkan sesuai tipe insiden, dan
        perubahan mitigasi diterapkan ke spesifikasi.

        Returns
        -------
        str
            Catatan kalibrasi untuk jejak keputusan.
        """
        porsi = self.reg.get("porsiDatabase", 0.6)
        seed = benih(self.reg["model"]["versiModel"], "kalibrasi", self.kunci_benih)
        if self.mode == "Alignment":
            pa = self.p["parameter"]
            d = pa["devSummary"]
            dev = Spesifikasi.dari(pa["devSpec"])
            self.spec = Spesifikasi.dari(pa["prodSpec"])
            self.kriteria = pa["criteria"]
            self.profil, self.info_kalibrasi = kalibrasi(dev, d["cpuPct"], d["testedTps"], d["p95Ms"], d["memPct"], d["payloadKb"],
                                                         d["errorRatePct"], porsi, seed)
            sumber = f"hasil uji Dev {d['testedTps']:g} TPS"
        else:
            ins = self.p["insiden"]
            spec_awal = Spesifikasi.dari(ins["spec"])
            m = self.metrik
            self.profil, self.info_kalibrasi = kalibrasi(spec_awal, min(m["cpuRataPersen"] * 1.8, 90), m["puncakTps"], m["responseTimeP95Ms"],
                                                         m["memoriRataPersen"], ins.get("payloadKb", 6), m["errorRatePersen"], porsi, seed)
            if ins["type"] == "memory_leak":
                self.profil.bocorGb = ins.get("memGrowthMbPerHour", 0) * ins["durationMin"] / 60 / 1024
            if ins["type"] == "batch_overlap":
                self.profil.porsiBatch = min(ins.get("batchCpuPct", 0) / 100, 0.9)
            self.spec = spec_awal
            if self.mode == "Mitigasi":
                ch = self.p["mitigasi"]["changes"]
                self.spec = Spesifikasi.dari({**ins["spec"], **{k: v for k, v in ch.items() if v}})
                if ch.get("ramGb") and self.profil.bocorGb:
                    pass  # kebocoran tetap terjadi; RAM lebih besar hanya menunda titik jenuh
            self.kriteria = KRITERIA_SLA
            sumber = f"baseline Production {m['puncakTps']:g} TPS"
        self.info_kalibrasi["sumber"] = sumber
        return (f"Dikalibrasi dari {sumber}: CPU {self.info_kalibrasi['cpuMsPerRequest']} ms/request, "
                f"p95 simulasi {self.info_kalibrasi['p95SimulasiMs']} ms vs acuan {self.info_kalibrasi['acuanP95Ms']} ms "
                f"(galat {self.info_kalibrasi['galatPersen']}%).")

    def _acuan_estimasi(self) -> dict:
        """Indikator acuan untuk estimasi penalaran.

        Returns
        -------
        dict
            Ringkasan langkah puncak atau insiden bila sudah ada; bila belum, hasil simulasi baru
            pada TPS target langkah pertama.
        """
        puncak = next((l for l in self.langkah if l.kunci in ("puncak", "insiden") and l.ringkasan), None)
        if puncak:
            return dict(puncak.ringkasan)
        sk = self.langkah[0].skenario
        h = simulasikan(self.spec, self.profil, sk["tpsTarget"], benih(self.kunci_benih, "acuan"))
        return h.ringkasan

    def _jurus_langkah(self, lk: LangkahAnalisis) -> str:
        """Penjurusan satu langkah (Gambar 10.3) lalu menjalankannya.

        Langkah dalam cakupan model memakai digital twin. Langkah di luar cakupan memakai estimasi
        penalaran bila skor keyakinan memenuhi ambang, atau kembali ke digital twin (fallback) bila tidak.

        Parameters
        ----------
        lk : LangkahAnalisis
            Langkah yang dijalankan; field hasilnya diisi di tempat.

        Returns
        -------
        {"done", "warn"}
            Status event untuk ditampilkan; ``warn`` bila angka perlu verifikasi manual.
        """
        if lk.dalamCakupanModel:
            out = self.alat["jalankan_serversim"].invoke({"kunci": lk.kunci})
            lk.jalurPenjurusan = "DigitalTwin"
            lk.ringkasan, lk.deretWaktu, lk.komponenLatensiMs = out["ringkasan"], out["deretWaktu"], out["komponenLatensiMs"]
            lk.catatan = f"Dijalankan pada digital twin {self.reg['model']['versiModel']}."
            state = "done"
        else:
            est = self.alat["estimasi_serverbrief"].invoke({"kunci": lk.kunci})
            lk.skorKeyakinan, lk.kesepakatanSampel = est["skor"], est["kesepakatan"]
            if est["skor"] >= self.ambang:
                lk.jalurPenjurusan = "EstimasiPenalaran"
                lk.ringkasan = est["ringkasan"]
                lk.perluVerifikasiManual = True
                lk.catatan = (f"Di luar cakupan model. Estimasi penalaran dipakai (keyakinan {est['skor']:.0%}, kesepakatan sampel "
                              f"{est['kesepakatan']:.0%}); angka perlu verifikasi manual.")
                state = "warn"
            else:
                lk.jalurPenjurusan = "FallbackDigitalTwin"
                if lk.skenario:
                    out = self.alat["jalankan_serversim"].invoke({"kunci": lk.kunci})
                    lk.ringkasan, lk.deretWaktu, lk.komponenLatensiMs = out["ringkasan"], out["deretWaktu"], out["komponenLatensiMs"]
                else:
                    lk.ringkasan = self._acuan_estimasi()
                lk.catatan = (f"Keyakinan {est['skor']:.0%} di bawah ambang {self.ambang:.0%}; dialihkan ke digital twin "
                              "sebagai fallback deterministik tanpa memperhitungkan komponen di luar cakupan.")
                state = "done"
        if lk.ringkasan:
            lk.pelanggaran = self._pelanggaran(lk.ringkasan)
            lk.status = self._status_skenario(lk)
        lk.statusLangkah = "Selesai"
        return state

    def _pelanggaran(self, r: dict) -> list[str]:
        """Membandingkan indikator dengan kriteria penerimaan.

        Parameters
        ----------
        r : dict
            Ringkasan indikator satu langkah.

        Returns
        -------
        list of str
            Uraian setiap kriteria yang dilanggar, termasuk thread pool jenuh (>= 95%).
        """
        k = self.kriteria
        v = []
        if r["p95Ms"] > k["maxP95Ms"]:
            v.append(f"Response time p95 {r['p95Ms']} ms melebihi batas {k['maxP95Ms']} ms")
        if r["errorRatePct"] > k["maxErrorRatePct"]:
            v.append(f"Error rate {r['errorRatePct']}% melebihi batas {k['maxErrorRatePct']}%")
        if r["cpuPct"] > k["maxCpuPct"]:
            v.append(f"Utilisasi CPU {r['cpuPct']}% melebihi batas {k['maxCpuPct']}%")
        if r["memPct"] > k["maxMemPct"]:
            v.append(f"Utilisasi memori {r['memPct']}% melebihi batas {k['maxMemPct']}%")
        if r.get("threadPct", 0) >= 95:
            v.append(f"Thread pool jenuh ({r['threadPct']}%)")
        return v

    def _util_maks(self, r: dict) -> float:
        """Utilisasi tertinggi di antara CPU, memori, jaringan, thread pool, dan connection pool.

        Parameters
        ----------
        r : dict
            Ringkasan indikator.

        Returns
        -------
        float
            Utilisasi tertinggi dalam persen.
        """
        return max(r["cpuPct"], r["memPct"], r.get("netPct", 0), r.get("threadPct", 0), r.get("connPct", 0))

    def _status_skenario(self, lk: LangkahAnalisis) -> str:
        """Verdict untuk satu langkah.

        Parameters
        ----------
        lk : LangkahAnalisis
            Langkah yang sudah memiliki ringkasan dan daftar pelanggaran.

        Returns
        -------
        {"Lolos", "LolosBersyarat", "TidakLolos"}
            ``TidakLolos`` bila ada pelanggaran; ``LolosBersyarat`` bila memakai estimasi atau
            headroom di atas ``BATAS_HEADROOM``; selain itu ``Lolos``.
        """
        if lk.pelanggaran:
            return "TidakLolos"
        if lk.jalurPenjurusan == "EstimasiPenalaran" or self._util_maks(lk.ringkasan) > BATAS_HEADROOM:
            return "LolosBersyarat"
        return "Lolos"

    def _langkah_utama(self) -> LangkahAnalisis | None:
        """Langkah yang menjadi dasar indikator dan verdict.

        Returns
        -------
        LangkahAnalisis or None
            Langkah estimasi dampak komponen bila memakai estimasi penalaran; bila tidak, langkah
            beban puncak atau langkah insiden.
        """
        est = next((l for l in self.langkah if l.kunci == "dampak-komponen" and l.jalurPenjurusan == "EstimasiPenalaran"), None)
        if est:
            return est
        return next((l for l in self.langkah if l.kunci in ("puncak", "insiden") and l.ringkasan), None)

    def _hitung_indikator(self):
        """Menghitung IndikatorSumberDaya, kapasitas, sumber daya pembatas, dan penyebab.

        Pembatas ditentukan dari sumber daya yang mendekati jenuh (>= 60%); bila tidak ada,
        latensi yang mendominasi saat p95 dilanggar (database atau dependensi eksternal); selain itu
        sumber daya yang paling dulu habis menurut capacity planning Little's Law. Pada mode insiden,
        status reproduksi dan kemungkinan akar masalah juga diisi.
        """
        self.indikator, self.kapasitas, self.pembatas, self.penyebab = [], None, None, []
        self.status_reproduksi = None
        self.akar_masalah = []
        if self.dihentikan:
            self.status_reproduksi = "TidakDapatDinilai" if self.mode == "ReproduksiInsiden" else None
            return
        utama = self._langkah_utama()
        twin_puncak = next(l for l in self.langkah if l.kunci in ("puncak", "insiden"))
        r = utama.ringkasan
        sumber = utama.jalurPenjurusan
        verif = utama.perluVerifikasiManual
        hs = HasilSimulasi(ringkasan=twin_puncak.ringkasan, komponenLatensiMs=twin_puncak.komponenLatensiMs or {})
        self.kapasitas = kapasitas_littles_law(self.spec, self.profil, hs, twin_puncak.skenario["tpsTarget"], self.kriteria["maxCpuPct"])
        sp = self.spec
        def ind(jenis, label, nilai, satuan, kap, rasio=None, src=sumber, v=verif):
            """Membuat satu entri IndikatorSumberDaya.

            Parameters
            ----------
            jenis : str
                Jenis indikator, misalnya ``"CPU"``.
            label : str
                Label tampilan.
            nilai : float
                Nilai indikator.
            satuan : str
                Satuan nilai.
            kap : str
                Uraian kapasitas spesifikasi.
            rasio : float, optional
                Rasio utilisasi 0 sampai 1.
            src : str, optional
                Sumber angka (jalur penjurusan).
            v : bool, optional
                Apakah angka perlu verifikasi manual.

            Returns
            -------
            dict
                Entri indikator.
            """
            return {"jenis": jenis, "label": label, "nilai": nilai, "satuan": satuan, "kapasitasSpesifikasi": kap,
                    "rasioUtilisasi": rasio, "sumberAngka": src, "perluVerifikasiManual": v}
        self.indikator = [
            ind("CPU", "Utilisasi CPU", r["cpuPct"], "%", f"{sp.vcpu} vCPU x {sp.nodes} node", r["cpuPct"] / 100),
            ind("Memori", "Utilisasi memori", r["memPct"], "%", f"{sp.ramGb:g} GB x {sp.nodes} node", r["memPct"] / 100),
            ind("Jaringan", "Utilisasi jaringan", r.get("netPct", 0), "%", f"{sp.bandwidthMbps:g} Mbps x {sp.nodes} node", r.get("netPct", 0) / 100),
            ind("ThreadPool", "Kejenuhan thread pool", r.get("threadPct", 0), "%", f"{sp.threadPool} x {sp.nodes} thread", r.get("threadPct", 0) / 100),
            ind("KapasitasTransaksiMaks", "Kapasitas transaksi maksimum", self.kapasitas["kapasitasMaksTps"], "TPS",
                f"pembatas {LABEL_SUMBER[self.kapasitas['pembatas']]}", round(twin_puncak.skenario["tpsTarget"] / max(self.kapasitas["kapasitasMaksTps"], 0.1), 3),
                "DigitalTwin", False),
            ind("ErrorRate", "Error rate (termasuk timeout)", r["errorRatePct"], "%", f"batas {self.kriteria['maxErrorRatePct']}%", None),
            ind("ResponseTime", "Response time p95", r["p95Ms"], "ms", f"batas {self.kriteria['maxP95Ms']} ms; timeout {sp.timeoutMs} ms", None),
        ]
        util = {"CPU": r["cpuPct"], "Memori": r["memPct"], "Jaringan": r.get("netPct", 0), "ThreadPool": r.get("threadPct", 0),
                "ConnectionPool": r.get("connPct", 0)}
        komp = twin_puncak.komponenLatensiMs or {}
        latensi = {"Database": komp.get("database", 0) + komp.get("antreKoneksi", 0), "DependensiEksternal": komp.get("eksternal", 0),
                   "CPU": komp.get("cpu", 0) + komp.get("antreCpu", 0), "ThreadPool": komp.get("antreThread", 0)}
        total = max(sum(latensi.values()), 1)
        dominan = max(latensi, key=latensi.get)
        # Pembatas: sumber daya yang mendekati jenuh; bila belum ada, latensi yang mendominasi saat p95 dilanggar;
        # selain itu sumber daya yang paling dulu habis menurut capacity planning Little's Law.
        tertinggi = max(util, key=util.get)
        if util[tertinggi] >= 60:
            pembatas = tertinggi
        elif r["p95Ms"] > self.kriteria["maxP95Ms"] and dominan in ("Database", "DependensiEksternal"):
            pembatas = dominan
        else:
            pembatas = self.kapasitas["pembatas"]
        self.pembatas = pembatas
        self.penyebab = [PENYEBAB[pembatas]]
        if latensi[dominan] / total > 0.35:
            self.penyebab.append(f"{LABEL_SUMBER[dominan]} menyumbang {latensi[dominan] / total:.0%} dari rata-rata latensi pada beban puncak.")
        if r.get("timeoutPct", 0) > 0:
            self.penyebab.append(f"Kemungkinan timeout {r['timeoutPct']}% request (batas {sp.timeoutMs} ms).")
        if self.mode == "ReproduksiInsiden":
            self.status_reproduksi = "Tereproduksi" if utama.pelanggaran else "TidakTereproduksi"
        if self.mode != "Alignment":
            ins = self.p["insiden"]
            if ins["type"] == "memory_leak":
                self.akar_masalah.append(f"Kebocoran memori ±{ins.get('memGrowthMbPerHour', 0):g} MB/jam per node menambah "
                                         f"{self.profil.bocorGb:.1f} GB selama {ins['durationMin']} menit.")
            if ins["type"] == "batch_overlap":
                self.akar_masalah.append(f"Batch job memakai {ins.get('batchCpuPct', 0):g}% inti CPU per node bersamaan dengan trafik.")
            if ins["type"] == "traffic_spike":
                self.akar_masalah.append(f"Lonjakan trafik {ins['peakRps']:g} RPS, {ins['peakRps'] / max(ins['avgRps'], 0.1):.1f}x rata-rata.")
            self.akar_masalah.append(f"{LABEL_SUMBER[pembatas]} menjadi pembatas ({util.get(pembatas, latensi.get(pembatas, 0)):.0f}"
                                     f"{'%' if pembatas in util else ' ms'}).")

    def _tetapkan_verdict(self):
        """Menetapkan verdict beserta alasan dan syarat.

        Aturan: Tidak Dapat Dinilai bila analisis dihentikan; Tidak Lolos bila langkah wajib
        (normal, puncak, insiden) melanggar kriteria; Lolos Bersyarat bila ada estimasi penalaran
        atau headroom tipis; selain itu Lolos. Hasil varian what-if dicantumkan sebagai alasan
        tanpa memengaruhi verdict utama.
        """
        alasan, syarat = [], []
        if self.dihentikan:
            status = "TidakDapatDinilai"
            alasan = [self.dihentikan, "Indikator tidak dihitung agar tidak menghasilkan angka di luar rentang yang dapat dipertanggungjawabkan."]
            syarat = ["Kalibrasi ulang atau aktifkan model digital twin sebelum analisis berikutnya."]
        else:
            wajib = [l for l in self.langkah if not l.kunci.startswith("whatif")]
            pel = [f"{l.deskripsi}: {v}" for l in wajib for v in l.pelanggaran]
            utama = self._langkah_utama()
            ada_estimasi = any(l.jalurPenjurusan == "EstimasiPenalaran" for l in wajib)
            if self.mode == "ReproduksiInsiden":
                if self.status_reproduksi == "Tereproduksi":
                    status = "TidakLolos"
                    alasan = ["Insiden akan terjadi lagi pada spesifikasi saat ini.", *pel]
                else:
                    status = "LolosBersyarat" if ada_estimasi else "Lolos"
                    alasan = ["Gejala tidak tereproduksi: indikator masih dalam SLA pada spesifikasi saat ini."]
                    syarat = ["Kalibrasi ulang model dengan data periode insiden."]
            elif pel:
                status = "TidakLolos"
                alasan = pel
            elif ada_estimasi:
                status = "LolosBersyarat"
                alasan = ["Seluruh indikator memenuhi kriteria, tetapi sebagian angka berasal dari estimasi penalaran."]
                syarat = ["Verifikasi manual angka estimasi melalui performance test di Dev sebelum deployment."]
            elif self._util_maks(utama.ringkasan) > BATAS_HEADROOM:
                status = "LolosBersyarat"
                alasan = [f"Seluruh indikator memenuhi kriteria, tetapi headroom tipis: {LABEL_SUMBER[self.pembatas]} mendekati batas pada beban puncak."]
                syarat = [f"Pantau {LABEL_SUMBER[self.pembatas]} selama 7 hari pertama setelah deployment."]
            else:
                status = "Lolos"
                alasan = ["Seluruh indikator pada beban normal dan puncak memenuhi kriteria penerimaan."]
            if self.mode == "Alignment" and status != "TidakLolos":
                alasan.append(f"Kapasitas maksimum {self.kapasitas['kapasitasMaksTps']} TPS, atau "
                              f"{self.kapasitas['kapasitasMaksTps'] / self.p['parameter']['peakTps']:.1f}x beban puncak.")
            for l in self.langkah:
                if l.kunci.startswith("whatif") and l.status:
                    alasan.append(f"{l.deskripsi}: {LABEL_VERDICT[l.status]}" + (f" ({l.pelanggaran[0]})" if l.pelanggaran else "") + ".")
        if getattr(self, "_elk_mati", False):
            syarat.append(f"Baseline memakai data tersimpan tanggal {self.metrik['tanggalPengambilan']}.")
        self.verdict = {"status": status, "alasan": alasan, "syarat": syarat, "narasi": "", "waktuDitetapkan": iso(datetime.now(timezone.utc))}

    def _narasi_templat(self) -> str:
        """Narasi verdict deterministik.

        Returns
        -------
        str
            Tiga sampai lima kalimat tentang cara verdict diperoleh, sumber daya pembatas,
            kapasitas maksimum, dan kemungkinan penyebab bottleneck.
        """
        v = self.verdict
        if self.dihentikan:
            return (f"Status {LABEL_VERDICT[v['status']]} ditetapkan karena analisis tidak dapat dijalankan secara sah: {self.dihentikan} "
                    "Indikator sengaja tidak dihitung. Kalibrasi ulang model digital twin sebelum analisis berikutnya.")
        utama = self._langkah_utama()
        r = utama.ringkasan
        bagian = []
        if self.mode == "Alignment":
            pa = self.p["parameter"]
            bagian.append(f"Verdict {LABEL_VERDICT[v['status']]} ditetapkan dengan membandingkan hasil simulasi digital twin pada beban normal "
                          f"({pa['normalTps']:g} TPS) dan puncak ({pa['peakTps']:g} TPS) terhadap kriteria penerimaan.")
        elif self.mode == "ReproduksiInsiden":
            bagian.append(("Kondisi insiden tereproduksi" if self.status_reproduksi == "Tereproduksi" else "Kondisi insiden tidak tereproduksi")
                          + f" pada {self.spec.vcpu} vCPU, {self.spec.ramGb:g} GB RAM, {self.spec.nodes} node dengan beban {self.p['insiden']['peakRps']:g} RPS.")
        else:
            bagian.append(f"Dengan opsi mitigasi ini ({self.spec.vcpu} vCPU, {self.spec.ramGb:g} GB, {self.spec.nodes} node, thread pool "
                          f"{self.spec.threadPool}, connection pool {self.spec.connPool}), verdict-nya {LABEL_VERDICT[v['status']]}.")
        bagian.append(f"Pada beban puncak, p95 {r['p95Ms']} ms, error rate {r['errorRatePct']}%, dan sumber daya pembatas adalah "
                      f"{LABEL_SUMBER[self.pembatas]}.")
        bagian.append(f"Dengan Little's Law, kapasitas transaksi maksimum diperkirakan {self.kapasitas['kapasitasMaksTps']} TPS.")
        bagian.append(self.penyebab[0])
        if utama.jalurPenjurusan == "EstimasiPenalaran":
            bagian.append("Sebagian angka berasal dari estimasi penalaran sehingga perlu diverifikasi manual.")
        return " ".join(bagian)

    def _minta_narasi(self):
        """Mengisi narasi verdict dari Layanan LLM, dengan templat sebagai cadangan.

        Narasi templat selalu disiapkan lebih dulu; pada mode LLM narasi diganti jawaban model bila
        berhasil. ``self._narasi_fallback`` menandai apakah templat yang dipakai.
        """
        self._narasi_fallback = True
        templat = self._narasi_templat()
        self.verdict["narasi"] = templat
        if not self._llm_boleh("narasi"):
            return
        fakta = {"verdict": LABEL_VERDICT[self.verdict["status"]], "alasan": self.verdict["alasan"], "syarat": self.verdict["syarat"],
                 "pembatas": LABEL_SUMBER.get(self.pembatas) if self.pembatas else None, "penyebab": self.penyebab,
                 "kapasitas": self.kapasitas and self.kapasitas["kapasitasMaksTps"],
                 "langkah": [{"deskripsi": l.deskripsi, "jalur": l.jalurPenjurusan, "ringkasan": l.ringkasan and {k: l.ringkasan[k] for k in ("cpuPct", "memPct", "threadPct", "p95Ms", "errorRatePct")}} for l in self.langkah]}
        try:
            teks = self.llm.teks(f"{self.konteks}\n\nHasil analisis: {json.dumps(fakta, ensure_ascii=False)}\n\nTulis narasi 3 sampai 5 kalimat "
                                 "(teks biasa, tanpa markdown) yang menjelaskan cara verdict diperoleh dan kemungkinan penyebab bottleneck. "
                                 "Jangan mengubah verdict.")
            if teks:
                self.verdict["narasi"] = teks
                self._narasi_fallback = False
        except GagalLLM as e:
            self.peringatan.append(f"Layanan LLM gagal menyusun narasi ({e}); memakai templat.")

    def _rencana_uji(self) -> list[dict]:
        """Menyusun rencana uji performa lanjutan di lower environment.

        Returns
        -------
        list of dict
            Langkah uji bernomor dengan ``nama``, ``profilBeban``, ``durasiMenit``,
            ``kriteriaLulus``, dan ``alasan``.
        """
        if self.dihentikan:
            return [{"urutan": 1, "nama": "Kalibrasi ulang model", "profilBeban": "Injeksi latensi dan tekanan CPU terkendali di lower environment",
                     "durasiMenit": 120, "kriteriaLulus": "Galat p95 simulasi terhadap terukur di bawah 10%", "alasan": self.dihentikan}]
        k = self.kriteria
        krit = f"p95 <= {k['maxP95Ms']} ms, error <= {k['maxErrorRatePct']}%, CPU <= {k['maxCpuPct']}%"
        uji = []
        if self.mode == "Alignment":
            pa = self.p["parameter"]
            uji += [
                {"nama": "Pemanasan", "profilBeban": "2 TPS konstan", "durasiMenit": 5, "kriteriaLulus": "Tidak ada error", "alasan": "Mengisi cache dan pool koneksi."},
                {"nama": "Beban normal", "profilBeban": f"{pa['normalTps']:g} TPS konstan", "durasiMenit": 15, "kriteriaLulus": krit, "alasan": "Mengonfirmasi angka simulasi beban normal."},
                {"nama": "Naik ke beban puncak", "profilBeban": f"Ramp {pa['normalTps']:g} ke {pa['peakTps']:g} TPS selama 10 menit lalu tahan 15 menit",
                 "durasiMenit": 25, "kriteriaLulus": krit, "alasan": "Mengonfirmasi perilaku saat jam sibuk."},
            ]
            for m in pa.get("whatIf", []):
                uji.append({"nama": f"What-if {m:g}x normal", "profilBeban": f"{pa['normalTps'] * m:g} TPS konstan", "durasiMenit": 10, "kriteriaLulus": krit,
                            "alasan": "Membandingkan varian beban dengan hasil simulasi."})
        else:
            ins = self.p["insiden"]
            uji.append({"nama": "Ulang profil insiden", "profilBeban": f"{ins['avgRps']:g} ke {ins['peakRps']:g} RPS dengan pola {ins['type']}",
                         "durasiMenit": min(max(int(ins["durationMin"]), 15), 120), "kriteriaLulus": krit,
                         "alasan": "Memastikan konfigurasi menahan kondisi insiden di lower environment."})
        uji.append({"nama": "Uji titik jenuh", "profilBeban": f"Naik bertahap 10 TPS per 5 menit sampai {self.kapasitas['kapasitasMaksTps'] * 1.1:.0f} TPS",
                    "durasiMenit": 30, "kriteriaLulus": f"Titik jenuh berada pada {LABEL_SUMBER[self.kapasitas['pembatas']]} sekitar {self.kapasitas['kapasitasMaksTps']} TPS",
                    "alasan": "Memvalidasi capacity planning Little's Law."})
        utama = self._langkah_utama()
        if utama and utama.ringkasan["memPct"] > 70:
            uji.append({"nama": "Soak test memori", "profilBeban": "Beban normal konstan", "durasiMenit": 240,
                        "kriteriaLulus": f"Memori stabil di bawah {k['maxMemPct']}%", "alasan": "Memori tinggi pada simulasi; memastikan tidak ada kebocoran."})
        for l in self.langkah:
            if l.perluVerifikasiManual:
                uji.append({"nama": "Verifikasi angka estimasi", "profilBeban": "Beban puncak dengan komponen di luar cakupan model aktif",
                            "durasiMenit": 30, "kriteriaLulus": krit, "alasan": f"{l.deskripsi} berasal dari estimasi penalaran."})
        for i, u in enumerate(uji, start=1):
            u["urutan"] = i
        return uji

    def _hasil(self, t_mulai: float, biaya: dict) -> dict:
        """Merangkai HasilAnalisis lengkap untuk dikirim ke Dashboard.

        Parameters
        ----------
        t_mulai : float
            Waktu mulai proses (``time.time()``).
        biaya : dict
            Ringkasan biaya dari ``LayananLLM.biaya``.

        Returns
        -------
        dict
            HasilAnalisis: status permintaan, metrik, model dan kalibrasi, rencana, langkah,
            indikator, kapasitas, pembatas, verdict, rencana uji, jejak keputusan, dan peringatan.
        """
        model = self.reg["model"] if self.reg else None
        selesai = datetime.now(timezone.utc)
        return {
            "idPermintaan": self.p["idPermintaan"],
            "mode": self.mode,
            "modeAnalisis": "llm" if self.mode_llm else "demo",
            "provider": self.llm.provider if self.mode_llm else None,
            "model": self.llm.model if self.mode_llm else None,
            "statusPermintaan": self.status,
            "alasanDihentikan": self.dihentikan,
            "waktuDiterima": iso(self.sekarang),
            "waktuSelesai": iso(selesai),
            "penyamaran": self.penyamar.laporan(),
            "metrikBaseline": self.metrik,
            "metrikPeriodeInsiden": self.metrik_insiden,
            "modelDigitalTwin": model,
            "kalibrasi": getattr(self, "info_kalibrasi", None),
            "spesifikasi": self.spec.__dict__ if hasattr(self, "spec") else None,
            "kriteria": getattr(self, "kriteria", KRITERIA_SLA if self.mode != "Alignment" else self.p["parameter"]["criteria"]),
            "rencana": self.rencana,
            "langkah": [l.keluaran() for l in self.langkah],
            "indikator": self.indikator,
            "kapasitas": self.kapasitas,
            "sumberDayaPembatas": self.pembatas,
            "penyebabBottleneck": self.penyebab,
            "statusReproduksi": self.status_reproduksi,
            "kemungkinanAkarMasalah": self.akar_masalah,
            "adaAngkaEstimasi": any(l.jalurPenjurusan == "EstimasiPenalaran" for l in self.langkah),
            "verdict": self.verdict,
            "rencanaUji": self.rencana_uji,
            "jejak": {
                "idJejak": str(uuid.uuid4()),
                "waktuMulai": iso(self.sekarang),
                "waktuSelesai": iso(selesai),
                "durasiProsesMs": int((time.time() - t_mulai) * 1000),
                "versiModelDigitalTwin": model["versiModel"] if model else None,
                "versiModelLLM": self.llm.model if self.mode_llm else None,
                "versiPrompt": VERSI_PROMPT,
                "jumlahPengirimanKeLLM": biaya["pengiriman"],
                "biaya": biaya,
                "langkah": self.jejak,
            },
            "peringatan": self.peringatan,
            "mitigasi": self.p.get("mitigasi"),
        }


def jalankan_lengkap(permintaan: dict, sekarang: datetime | None = None) -> dict:
    """Menjalankan agen sampai selesai tanpa streaming.

    Dipakai skrip pembuat data contoh.

    Parameters
    ----------
    permintaan : dict
        PermintaanAnalisis.
    sekarang : datetime, optional
        Waktu acuan analisis.

    Returns
    -------
    dict
        HasilAnalisis.
    """
    hasil = None
    for ev in AgenAnalisis(permintaan, sekarang).proses():
        if ev["type"] == "hasil":
            hasil = ev["hasil"]
    return hasil
