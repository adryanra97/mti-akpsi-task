"""Membangkitkan data contoh dengan menjalankan Core Module (mode demo) pada skenario riwayat rilis dan insiden.

Jalankan dari akar repo:  python3 scripts/buat_data_contoh.py
Keluaran: src/lib/seed-data.json (dibaca src/lib/seed.ts saat database pertama kali diisi).
"""
import copy
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))

from _core.agent import REGISTRI, jalankan_lengkap  # noqa: E402

SEKARANG = datetime(2026, 11, 1, 3, 0, tzinfo=timezone.utc)
DEMO = {"mode": "demo", "ambang": 0.7, "sampel": 3, "harga": {"input": 3, "output": 15}, "kurs": 16500}


def spesifikasi(layanan, **ubah):
    s = next(x for x in REGISTRI["layanan"] if x["nama"] == layanan)["spesifikasi"]
    return {**s, **ubah}


def parameter(layanan, dev=None, prod=None, **ubah):
    p = {
        "normalTps": 8, "peakTps": 45, "whatIf": [2, 3], "serviceVersion": "", "configChanges": "",
        "criteria": {"maxP95Ms": 800, "maxErrorRatePct": 1, "maxCpuPct": 80, "maxMemPct": 85},
        "devSpec": {"vcpu": 4, "ramGb": 8, "nodes": 2, "threadPool": 100, "connPool": 30, "bandwidthMbps": 1000, "timeoutMs": 3000},
        "devSummary": {"testedTps": 40, "p95Ms": 420, "cpuPct": 62, "memPct": 58, "errorRatePct": 0.1, "payloadKb": 6, "notes": ""},
        "prodSpec": spesifikasi(layanan, **(prod or {})),
    }
    p.update(ubah)
    p["devSummary"] = {**p["devSummary"], **(dev or {})}
    return p


RK, PB, NT, FR = "Layanan Rekening", "Layanan Pembayaran", "Layanan Notifikasi", "Layanan Deteksi Fraud"

SESI = [
    # Rilis Mutasi (Layanan Rekening): lima cycle, cycle 5 lanjut promosi dan sign-off disetujui.
    dict(kunci="mutasi-c1", service=RK, release="Rilis Mutasi", rc="Kandidat 1 (v3.7)", cycleNo=1, daysAgo=96,
         params=parameter(RK, normalTps=6, peakTps=38, serviceVersion="Kandidat 1 (v3.7)", configChanges="Upgrade driver JDBC; batas koneksi db-core-01.internal dinaikkan",
                          dev={"testedTps": 35, "p95Ms": 1450, "cpuPct": 84, "memPct": 71}),
         decision="KembaliKeDev", notes="Query saldo tanpa indeks memicu p95 tinggi.", followUps=["Tambahkan indeks pada tabel mutasi", "Ulang performance test di Dev"]),
    dict(kunci="mutasi-c2", service=RK, release="Rilis Mutasi", rc="Kandidat 2 (v3.7)", cycleNo=2, daysAgo=82,
         params=parameter(RK, normalTps=6, peakTps=38, serviceVersion="Kandidat 2 (v3.7)", configChanges="Indeks mutasi ditambahkan",
                          dev={"testedTps": 35, "p95Ms": 1180, "cpuPct": 74, "memPct": 66}),
         decision="KembaliKeDev", notes="p95 turun, tetapi masih di atas batas pada beban puncak.", followUps=["Aktifkan cache saldo 30 detik"]),
    dict(kunci="mutasi-c3", service=RK, release="Rilis Mutasi", rc="Kandidat 3 (v3.7)", cycleNo=3, daysAgo=68,
         params=parameter(RK, normalTps=6, peakTps=38, serviceVersion="Kandidat 3 (v3.7)", configChanges="Cache saldo aktif", prod={"ramGb": 6},
                          dev={"testedTps": 35, "p95Ms": 610, "cpuPct": 63, "memPct": 62}),
         decision="KembaliKeDev", notes="Headroom memori tipis karena cache saldo; RAM Production perlu dinaikkan.", followUps=["Konfirmasi alokasi RAM Production ke tim infrastruktur"]),
    dict(kunci="mutasi-c4", service=RK, release="Rilis Mutasi", rc="Kandidat 4 (v3.7)", cycleNo=4, daysAgo=54,
         params=parameter(RK, normalTps=6, peakTps=38, serviceVersion="Kandidat 4 (v3.7)", dev={"testedTps": 35, "p95Ms": 520, "cpuPct": 58, "memPct": 60}),
         decision="KembaliKeDev", notes="Verdict lolos, tetapi masih menunggu hasil UAT modul transfer.", followUps=["Selesaikan UAT modul transfer"]),
    dict(kunci="mutasi-c5", service=RK, release="Rilis Mutasi", rc="Final (v3.7)", cycleNo=5, daysAgo=40,
         params=parameter(RK, normalTps=6, peakTps=38, serviceVersion="Final (v3.7)", prod={"threadPool": 200}, dev={"testedTps": 35, "p95Ms": 470, "cpuPct": 52, "memPct": 58}),
         decision="LanjutPromosi", notes="Semua indikator dalam kriteria. Disepakati lanjut ke Production.", followUps=["Pantau p95 transfer 7 hari pertama"], signoff="Disetujui"),
    # Rilis QRIS (Layanan Pembayaran): cycle 4 menunggu keputusan sign-off.
    dict(kunci="qris-c1", service=PB, release="Rilis QRIS", rc="Kandidat 1 (v3.8)", cycleNo=1, daysAgo=42,
         params=parameter(PB, normalTps=9, peakTps=52, serviceVersion="Kandidat 1 (v3.8)", configChanges="Integrasi QRIS baru ke https://qris.partner.co.id/api",
                          prod={"nodes": 2}, dev={"testedTps": 25, "p95Ms": 1100, "cpuPct": 88, "memPct": 70, "payloadKb": 9}),
         decision="KembaliKeDev", notes="Verifikasi tanda tangan partner memakan CPU berlebih.", followUps=["Cache public key partner", "Profiling ulang endpoint pembayaran"]),
    dict(kunci="qris-c2", service=PB, release="Rilis QRIS", rc="Kandidat 2 (v3.8)", cycleNo=2, daysAgo=28,
         params=parameter(PB, normalTps=9, peakTps=52, serviceVersion="Kandidat 2 (v3.8)", configChanges="Cache public key partner",
                          dev={"testedTps": 40, "p95Ms": 760, "cpuPct": 74, "memPct": 64, "payloadKb": 9}),
         decision="KembaliKeDev", notes="Promosi ditunda sampai perbaikan connection pool selesai diuji di UAT.", followUps=["Naikkan connection pool ke 80"]),
    dict(kunci="qris-c3", service=PB, release="Rilis QRIS", rc="Kandidat 3 (v3.8)", cycleNo=3, daysAgo=14,
         params=parameter(PB, normalTps=9, peakTps=52, whatIf=[2, 3, 5], serviceVersion="Kandidat 3 (v3.8)", configChanges="Connection pool 80", prod={"connPool": 80},
                          dev={"testedTps": 40, "p95Ms": 520, "cpuPct": 60, "memPct": 60, "payloadKb": 9}),
         decision="KembaliKeDev", notes="Tim ingin menambah node untuk periode promo akhir tahun.", followUps=["Tambah 1 node untuk periode promo"]),
    dict(kunci="qris-c4", service=PB, release="Rilis QRIS", rc="Final (v3.8)", cycleNo=4, daysAgo=1,
         params=parameter(PB, normalTps=9, peakTps=52, whatIf=[2, 3, 5], serviceVersion="Final (v3.8)", configChanges="Connection pool 80; 4 node", prod={"connPool": 80, "nodes": 4},
                          dev={"testedTps": 40, "p95Ms": 500, "cpuPct": 58, "memPct": 59, "payloadKb": 9}),
         decision="LanjutPromosi", notes="Verdict disepakati. Lanjut promosi pada jadwal deployment Senin.", followUps=["Siapkan runbook rollback", "Pantau CPU saat promo 11.11"], signoff="MenungguKeputusan"),
    # Rilis Notifikasi: cycle 1 memakai Kafka (di luar cakupan model), cycle 2 menunggu parameter.
    dict(kunci="notifikasi-c1", service=NT, release="Rilis Notifikasi", rc="Kandidat 1 (v2.4)", cycleNo=1, daysAgo=12,
         params=parameter(NT, normalTps=10, peakTps=55, serviceVersion="Kandidat 1 (v2.4)", configChanges="Template push baru; antrean pesan via Kafka",
                          dev={"testedTps": 45, "p95Ms": 380, "cpuPct": 70, "memPct": 64, "payloadKb": 4}),
         decision="KembaliKeDev", notes="Angka dampak Kafka masih estimasi; perlu performance test terpisah.", followUps=["Uji beban Kafka di Dev", "Tambahkan exponential backoff"]),
    dict(kunci="notifikasi-c2", service=NT, release="Rilis Notifikasi", rc="Kandidat 2 (v2.4)", cycleNo=2, daysAgo=0, status="PengisianParameter"),
    # Rilis Deteksi Fraud: parameter sudah diisi, belum ada model twin aktif.
    dict(kunci="fraud-c1", service=FR, release="Rilis Deteksi Fraud", rc="Kandidat 1 (v1.0)", cycleNo=1, daysAgo=0, status="PengisianParameter",
         params=parameter(FR, normalTps=5, peakTps=33, serviceVersion="Kandidat 1 (v1.0)", configChanges="Model skoring v1 di scoring-01.internal",
                          dev={"testedTps": 30, "p95Ms": 450, "cpuPct": 66, "memPct": 61}), jalankan=False),
    # Rilis Dompet Digital: baru dijadwalkan.
    dict(kunci="dompet-c1", service=PB, release="Rilis Dompet Digital", rc="Kandidat 1 (v4.0)", cycleNo=1, daysAgo=-3, status="Terjadwal"),
]

INSIDEN = [
    dict(kunci="inc-001", code="INC-001", daysAgo=33, final="MitigasiDitemukan", data=dict(
        type="traffic_spike", title="Lonjakan trafik saat payday",
        description="Timeout pada endpoint pembayaran pukul 12.05 sampai 12.40 setelah pembaruan Agustus. Alert dari api-gw-02.internal.",
        service=PB, release="Rilis Pembayaran Agustus", peakRps=96, avgRps=7, durationMin=35, payloadKb=9, memGrowthMbPerHour=0, batchCpuPct=0,
        spec=spesifikasi(PB), manualSymptoms="", elkDataAvailable=True),
        mitigasi=[("mit-1", "Naikkan thread pool ke 300", {"threadPool": 300}), ("mit-2", "Tambah 2 node dan connection pool 90", {"nodes": 5, "connPool": 90})]),
    dict(kunci="inc-002", code="INC-002", daysAgo=19, final="BelumTereproduksi", data=dict(
        type="batch_overlap", title="Latensi naik saat rekonsiliasi malam",
        description="p95 naik sesaat ketika batch rekonsiliasi berjalan bersamaan dengan trafik malam.",
        service=RK, release="Rilis Mutasi", peakRps=14, avgRps=4, durationMin=20, payloadKb=6, memGrowthMbPerHour=0, batchCpuPct=15,
        spec=spesifikasi(RK, threadPool=200), manualSymptoms="Data ELK periode insiden tertutup perjanjian kerahasiaan; gejala: p95 naik ke sekitar 900 ms selama 20 menit.",
        elkDataAvailable=False), mitigasi=[]),
    dict(kunci="inc-003", code="INC-003", daysAgo=0, final=None, data=dict(
        type="memory_leak", title="Memori naik terus setelah pembaruan Oktober",
        description="Pod notifikasi di cluster prod-jkt restart OOM tiap sekitar 10 jam sejak pembaruan Oktober.",
        service=NT, release="Rilis Notifikasi Oktober", peakRps=40, avgRps=8, durationMin=600, payloadKb=4, memGrowthMbPerHour=520, batchCpuPct=0,
        spec=spesifikasi(NT), manualSymptoms="", elkDataAvailable=True), mitigasi=[], jalankan=False),
]


def main():
    out = {"versi": 3, "sesi": [], "insiden": []}
    for s in SESI:
        s = copy.deepcopy(s)
        if s.get("params") and s.get("decision"):
            req = {"idPermintaan": f"req-{s['kunci']}", "mode": "Alignment", "layanan": s["service"], "rilis": s["release"],
                   "versiUji": s["rc"], "cycle": s["cycleNo"], "parameter": s["params"], "pengaturan": DEMO}
            s["hasil"] = jalankan_lengkap(req, SEKARANG)
            v = s["hasil"]["verdict"]["status"]
            print(f"{s['kunci']:16} {v:18} pembatas={s['hasil']['sumberDayaPembatas']}")
        s.pop("jalankan", None)
        out["sesi"].append(s)
    for i in INSIDEN:
        i = copy.deepcopy(i)
        if i.pop("jalankan", True):
            base = {"layanan": i["data"]["service"], "rilis": i["data"]["release"], "insiden": i["data"], "pengaturan": DEMO}
            i["repro"] = jalankan_lengkap({**base, "idPermintaan": f"req-{i['kunci']}-r", "mode": "ReproduksiInsiden"}, SEKARANG)
            print(f"{i['kunci']:16} repro {i['repro']['statusReproduksi']} {i['repro']['verdict']['status']}")
            hasil_mit = []
            for mid, label, ch in i["mitigasi"]:
                r = jalankan_lengkap({**base, "idPermintaan": f"req-{i['kunci']}-{mid}", "mode": "Mitigasi",
                                      "mitigasi": {"label": label, "changes": ch}}, SEKARANG)
                print(f"{'':16} {label}: {r['verdict']['status']}")
                hasil_mit.append({"id": mid, "label": label, "changes": ch, "result": r})
            i["mitigasi"] = hasil_mit
        out["insiden"].append(i)
    path = ROOT / "src" / "lib" / "seed-data.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Tersimpan: {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
