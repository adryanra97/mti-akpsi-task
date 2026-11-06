"""ModelDigitalTwin: replika Integration Server berbasis simulasi kejadian diskret (SimPy).

Setiap node memiliki thread pool, inti CPU, dan connection pool sebagai ``simpy.Resource``.
Request datang mengikuti proses Poisson, dibagi round-robin ke node di belakang load balancer,
lalu melewati CPU, database (memegang koneksi), dependensi eksternal, dan CPU lagi sambil
memegang satu thread. Masukan yang sama dengan versi model yang sama selalu memberi angka
yang sama (NFR-10).

Attributes
----------
BUCKET_S : float
    Resolusi deret waktu dalam detik.
SAMPLE_S : float
    Selang pencuplikan utilisasi dalam detik.
WARMUP_S : float
    Masa pemanasan yang tidak ikut diukur, dalam detik.
DURATION_S : float
    Panjang jendela ukur bawaan, dalam detik.
QUEUE_FACTOR : int
    Antrean thread maksimal sebagai kelipatan ukuran thread pool; sisanya ditolak (HTTP 503).
CONN_WAIT_S : float
    Batas tunggu connection pool sebelum request dianggap gagal, dalam detik.
"""
from __future__ import annotations

import hashlib
import json
import math
import random
from dataclasses import dataclass, field

import simpy

BUCKET_S = 2.0          # resolusi deret waktu
SAMPLE_S = 0.25         # frekuensi pencuplikan utilisasi
WARMUP_S = 10.0
DURATION_S = 60.0
QUEUE_FACTOR = 2        # antrean thread maksimal = 2x ukuran thread pool, sisanya ditolak (HTTP 503)
CONN_WAIT_S = 1.0       # batas tunggu connection pool sebelum gagal


@dataclass
class Spesifikasi:
    """Spesifikasi sumber daya per node pada environment target.

    Attributes
    ----------
    vcpu : int
        Jumlah vCPU per node.
    ramGb : float
        RAM per node dalam GB.
    nodes : int
        Jumlah node di belakang load balancer.
    threadPool : int
        Ukuran thread pool per node.
    connPool : int
        Ukuran connection pool database per node.
    bandwidthMbps : float
        Bandwidth jaringan per node dalam Mbps.
    timeoutMs : int, default 3000
        Batas waktu request dalam milidetik.
    """
    vcpu: int
    ramGb: float
    nodes: int
    threadPool: int
    connPool: int
    bandwidthMbps: float
    timeoutMs: int = 3000

    @staticmethod
    def dari(d: dict) -> "Spesifikasi":
        """Membuat ``Spesifikasi`` dari dictionary masukan Dashboard.

        Nilai bilangan bulat dibatasi minimal 1 agar simulasi tetap valid.

        Parameters
        ----------
        d : dict
            Dictionary dengan kunci ``vcpu``, ``ramGb``, ``nodes``, ``threadPool``,
            ``connPool``, ``bandwidthMbps``, dan opsional ``timeoutMs``.

        Returns
        -------
        Spesifikasi
            Spesifikasi yang sudah dinormalisasi.
        """
        return Spesifikasi(
            vcpu=max(int(d["vcpu"]), 1),
            ramGb=float(d["ramGb"]),
            nodes=max(int(d["nodes"]), 1),
            threadPool=max(int(d["threadPool"]), 1),
            connPool=max(int(d["connPool"]), 1),
            bandwidthMbps=float(d["bandwidthMbps"]),
            timeoutMs=int(d.get("timeoutMs") or 3000),
        )


@dataclass
class Profil:
    """Profil beban per request hasil kalibrasi.

    Attributes
    ----------
    cpuMs : float
        Waktu CPU per request dalam milidetik.
    dbMs : float
        Waktu database selama memegang koneksi, dalam milidetik.
    extMs : float
        Waktu tunggu dependensi eksternal dalam milidetik.
    payloadKb : float
        Ukuran payload rata-rata dalam KB.
    memDasarGb : float
        Memori dasar per node dalam GB.
    memPerReqMb : float
        Memori per request yang sedang diproses, dalam MB.
    errorDasarPct : float, default 0.0
        Error rate dasar yang tidak bergantung pada beban, dalam persen.
    bocorGb : float, default 0.0
        Akumulasi kebocoran memori per node (kasus memory leak), dalam GB.
    porsiBatch : float, default 0.0
        Porsi inti CPU yang dipakai batch job (kasus batch overlap), 0 sampai 1.
    """
    cpuMs: float            # waktu CPU per request (ms)
    dbMs: float             # waktu database selama memegang koneksi (ms)
    extMs: float            # waktu tunggu dependensi eksternal (ms)
    payloadKb: float
    memDasarGb: float       # memori dasar per node
    memPerReqMb: float      # memori per request yang sedang diproses
    errorDasarPct: float = 0.0
    bocorGb: float = 0.0    # akumulasi kebocoran memori per node (memory leak)
    porsiBatch: float = 0.0  # porsi inti CPU yang dipakai batch job (batch overlap)


@dataclass
class HasilSimulasi:
    """Keluaran satu kali simulasi digital twin.

    Attributes
    ----------
    ringkasan : dict
        Indikator agregat: utilisasi CPU, memori, jaringan, thread pool, connection pool,
        persentil latensi, error rate, timeout, dan throughput.
    deretWaktu : list of dict
        Trajektori per ``BUCKET_S`` detik dengan kunci ``t``, ``cpu``, ``mem``, ``net``,
        ``thread``, ``conn``, dan ``p95``.
    komponenLatensiMs : dict
        Rata-rata waktu per komponen (antrean thread, antrean CPU, CPU, antrean koneksi,
        database, eksternal) dalam milidetik per request.
    """
    ringkasan: dict
    deretWaktu: list = field(default_factory=list)
    komponenLatensiMs: dict = field(default_factory=dict)


def benih(*parts) -> int:
    """Menghitung seed acak deterministik dari sekumpulan nilai.

    Parameters
    ----------
    *parts : object
        Nilai apa pun yang dapat diserialisasi JSON (memakai ``str`` sebagai cadangan).

    Returns
    -------
    int
        Seed 48-bit dari hash SHA-256 masukan.
    """
    raw = json.dumps(parts, sort_keys=True, default=str).encode()
    return int(hashlib.sha256(raw).hexdigest()[:12], 16)


def _pct(xs: list[float], p: float) -> float:
    """Menghitung persentil dengan metode nearest-rank.

    Parameters
    ----------
    xs : list of float
        Sampel nilai.
    p : float
        Persentil dalam rentang 0 sampai 1.

    Returns
    -------
    float
        Nilai persentil, atau 0.0 bila ``xs`` kosong.
    """
    if not xs:
        return 0.0
    s = sorted(xs)
    k = min(len(s) - 1, max(0, int(math.ceil(p * len(s))) - 1))
    return s[k]


def simulasikan(spec: Spesifikasi, pr: Profil, tps: float, seed: int, durasi_s: float = DURATION_S) -> HasilSimulasi:
    """Menjalankan simulasi kejadian diskret satu skenario beban.

    Parameters
    ----------
    spec : Spesifikasi
        Spesifikasi node yang disimulasikan.
    pr : Profil
        Profil beban per request hasil kalibrasi.
    tps : float
        Laju kedatangan request (transaksi per detik) untuk seluruh node.
    seed : int
        Seed acak; seed yang sama memberi hasil yang sama.
    durasi_s : float, default DURATION_S
        Panjang jendela ukur setelah masa pemanasan, dalam detik.

    Returns
    -------
    HasilSimulasi
        Ringkasan indikator, deret waktu, dan rincian komponen latensi.

    Notes
    -----
    Error rate menghitung request yang ditolak karena antrean penuh, gagal mendapat koneksi
    dalam ``CONN_WAIT_S``, melewati timeout, serta request yang masih tertahan di antrean
    pada akhir jendela ukur.
    """
    env = simpy.Environment()
    rng = random.Random(seed)
    total = WARMUP_S + durasi_s
    nbucket = int(math.ceil(total / BUCKET_S))

    class Node:
        """Satu node Integration Server dengan sumber daya SimPy-nya."""
        def __init__(self):
            """Membuat thread pool, inti CPU, dan connection pool untuk node ini."""
            self.threads = simpy.Resource(env, capacity=spec.threadPool)
            self.cpu = simpy.Resource(env, capacity=spec.vcpu)
            self.conns = simpy.Resource(env, capacity=spec.connPool)
            self.inflight = 0

    nodes = [Node() for _ in range(spec.nodes)]
    st = {"tiba": 0, "selesai": 0, "ditolak": 0, "gagalKoneksi": 0, "timeout": 0}
    lat_all: list[float] = []
    comp = {"antreThread": 0.0, "antreCpu": 0.0, "cpu": 0.0, "antreKoneksi": 0.0, "database": 0.0, "eksternal": 0.0}
    b_lat = [[] for _ in range(nbucket)]
    b_cpu = [0.0] * nbucket
    b_bytes = [0.0] * nbucket
    b_thread = [0.0] * nbucket
    b_conn = [0.0] * nbucket
    b_mem = [0.0] * nbucket
    b_n = [0] * nbucket

    def bucket(t: float) -> int:
        """Memetakan waktu simulasi ke indeks bucket deret waktu.

        Parameters
        ----------
        t : float
            Waktu simulasi dalam detik.

        Returns
        -------
        int
            Indeks bucket, dibatasi pada bucket terakhir.
        """
        return min(nbucket - 1, int(t / BUCKET_S))

    def kerja_cpu(node: Node, ms: float, rec: dict):
        """Proses SimPy: mengantre inti CPU lalu bekerja selama waktu acak eksponensial.

        Parameters
        ----------
        node : Node
            Node tempat request diproses.
        ms : float
            Rata-rata waktu CPU dalam milidetik.
        rec : dict
            Pencatat komponen latensi request ini; ``antreCpu`` dan ``cpu`` ditambahkan.

        Yields
        ------
        simpy.events.Event
            Event permintaan CPU dan timeout kerja.
        """
        t0 = env.now
        with node.cpu.request() as c:
            yield c
            rec["antreCpu"] += env.now - t0
            dur = rng.expovariate(1.0 / max(ms, 0.01)) / 1000.0
            yield env.timeout(dur)
            rec["cpu"] += dur
            b_cpu[bucket(env.now)] += dur

    def request(node: Node):
        """Proses SimPy untuk satu request dari kedatangan sampai selesai.

        Request ditolak bila antrean thread penuh, gagal bila connection pool tidak tersedia
        dalam ``CONN_WAIT_S``, dan dicatat timeout bila latensinya melewati ``spec.timeoutMs``.

        Parameters
        ----------
        node : Node
            Node tujuan hasil round-robin load balancer.

        Yields
        ------
        simpy.events.Event
            Event sumber daya dan timeout selama request diproses.
        """
        t0 = env.now
        st["tiba"] += 1 if t0 >= WARMUP_S else 0
        if len(node.threads.queue) >= spec.threadPool * QUEUE_FACTOR:
            if t0 >= WARMUP_S:
                st["ditolak"] += 1
            return
        rec = {k: 0.0 for k in comp}
        with node.threads.request() as th:
            yield th
            rec["antreThread"] = env.now - t0
            node.inflight += 1
            yield from kerja_cpu(node, pr.cpuMs * 0.6, rec)
            t1 = env.now
            with node.conns.request() as cn:
                got = yield cn | env.timeout(CONN_WAIT_S)
                rec["antreKoneksi"] = env.now - t1
                if cn not in got:
                    node.inflight -= 1
                    if t0 >= WARMUP_S:
                        st["gagalKoneksi"] += 1
                    return
                d = rng.lognormvariate(math.log(max(pr.dbMs, 0.1)) - 0.08, 0.4) / 1000.0
                yield env.timeout(d)
                rec["database"] = d
            if pr.extMs > 0:
                e = rng.lognormvariate(math.log(pr.extMs) - 0.08, 0.4) / 1000.0
                yield env.timeout(e)
                rec["eksternal"] = e
            yield from kerja_cpu(node, pr.cpuMs * 0.4, rec)
            node.inflight -= 1
        lat = env.now - t0
        b_bytes[bucket(env.now)] += pr.payloadKb * 2 * 1024 * 8
        if t0 >= WARMUP_S:
            st["selesai"] += 1
            lat_all.append(lat * 1000)
            b_lat[bucket(env.now)].append(lat * 1000)
            for k in comp:
                comp[k] += rec[k]
            if lat * 1000 > spec.timeoutMs:
                st["timeout"] += 1

    def batch_job(node: Node, cores: int):
        # Batch job memakai sebagian inti CPU sepanjang simulasi.
        """Proses SimPy batch job yang menduduki sebagian inti CPU sepanjang simulasi.

        Parameters
        ----------
        node : Node
            Node yang menjalankan batch job.
        cores : int
            Jumlah inti CPU yang diduduki.

        Yields
        ------
        simpy.events.Event
            Event permintaan CPU dan timeout panjang.
        """
        reqs = [node.cpu.request() for _ in range(cores)]
        for r in reqs:
            yield r
        yield env.timeout(total + 1)

    def kedatangan():
        """Proses SimPy pembangkit kedatangan request (proses Poisson) secara round-robin.

        Yields
        ------
        simpy.events.Timeout
            Jeda antar-kedatangan berdistribusi eksponensial.
        """
        i = 0
        while True:
            yield env.timeout(rng.expovariate(tps))
            env.process(request(nodes[i % len(nodes)]))
            i += 1

    def pemantau():
        """Proses SimPy yang mencuplik utilisasi thread, koneksi, dan memori setiap ``SAMPLE_S``.

        Yields
        ------
        simpy.events.Timeout
            Jeda pencuplikan.
        """
        while True:
            b = bucket(env.now)
            busy_t = sum(n.threads.count for n in nodes) / (spec.threadPool * spec.nodes)
            busy_c = sum(n.conns.count for n in nodes) / (spec.connPool * spec.nodes)
            queued = sum(len(n.threads.queue) for n in nodes) / spec.nodes
            inflight = sum(n.inflight for n in nodes) / spec.nodes
            mem = pr.memDasarGb + pr.bocorGb + (inflight * pr.memPerReqMb + queued * pr.payloadKb / 1024 * 4) / 1024
            b_thread[b] += busy_t
            b_conn[b] += busy_c
            b_mem[b] += mem / spec.ramGb
            b_n[b] += 1
            yield env.timeout(SAMPLE_S)

    batch_cores = int(round(spec.vcpu * pr.porsiBatch))
    if batch_cores > 0:
        for n in nodes:
            env.process(batch_job(n, min(batch_cores, spec.vcpu - 1)))
    env.process(kedatangan())
    env.process(pemantau())
    env.run(until=total)

    cpu_cap = spec.vcpu * spec.nodes * BUCKET_S
    net_cap = spec.bandwidthMbps * 1e6 * spec.nodes * BUCKET_S
    deret = []
    for i in range(nbucket):
        t = (i + 1) * BUCKET_S
        n = max(b_n[i], 1)
        batch_part = batch_cores * spec.nodes * BUCKET_S if batch_cores else 0
        deret.append({
            "t": round(t - WARMUP_S, 1),
            "cpu": round(100 * (b_cpu[i] + batch_part) / cpu_cap, 1),
            "mem": round(100 * b_mem[i] / n, 1),
            "net": round(100 * b_bytes[i] / net_cap, 2),
            "thread": round(100 * b_thread[i] / n, 1),
            "conn": round(100 * b_conn[i] / n, 1),
            "p95": round(_pct(b_lat[i], 0.95)) if b_lat[i] else None,
        })
    ukur = [d for d in deret if d["t"] > 0]
    avg = lambda k: round(sum(d[k] for d in ukur) / max(len(ukur), 1), 1)
    tiba = max(st["tiba"], 1)
    gagal = st["ditolak"] + st["gagalKoneksi"] + st["timeout"]
    # Request yang masih tertahan di antrean thread pada akhir jendela ukur dihitung tidak terlayani.
    tertahan = sum(len(n.threads.queue) for n in nodes)
    err = 100 * (gagal + tertahan) / tiba + pr.errorDasarPct
    n_ok = max(st["selesai"], 1)
    ringkasan = {
        "tps": round(tps, 2),
        "throughputTps": round(st["selesai"] / durasi_s, 2),
        "cpuPct": avg("cpu"),
        "memPct": round(max(d["mem"] for d in ukur), 1),
        "netPct": avg("net"),
        "threadPct": avg("thread"),
        "connPct": avg("conn"),
        "p50Ms": round(_pct(lat_all, 0.5)),
        "p95Ms": round(_pct(lat_all, 0.95)),
        "p99Ms": round(_pct(lat_all, 0.99)),
        "rataLatensiMs": round(sum(lat_all) / n_ok, 1) if lat_all else 0,
        "errorRatePct": round(min(err, 100.0), 2),
        "timeoutPct": round(100 * st["timeout"] / tiba, 2),
        "ditolak": st["ditolak"],
        "gagalKoneksi": st["gagalKoneksi"],
        "jumlahRequest": st["tiba"],
    }
    komponen = {k: round(v / n_ok * 1000, 1) for k, v in comp.items()}
    return HasilSimulasi(ringkasan=ringkasan, deretWaktu=deret, komponenLatensiMs=komponen)


def kalibrasi(spec: Spesifikasi, cpu_pct: float, tps: float, p95_ms: float, mem_pct: float, payload_kb: float,
              error_pct: float, porsi_db: float, seed_dasar: int) -> tuple[Profil, dict]:
    """Mengkalibrasi profil beban agar p95 simulasi mendekati p95 hasil uji.

    CPU per request diturunkan dari utilisasi CPU terukur; waktu tunggu database dan
    dependensi eksternal disetel berulang (maksimal empat iterasi) sampai galat p95 di bawah 5%.

    Parameters
    ----------
    spec : Spesifikasi
        Spesifikasi environment tempat pengukuran dilakukan (Dev atau baseline Production).
    cpu_pct : float
        Utilisasi CPU terukur dalam persen.
    tps : float
        Beban saat pengukuran (transaksi per detik).
    p95_ms : float
        Response time p95 terukur dalam milidetik.
    mem_pct : float
        Utilisasi memori terukur dalam persen.
    payload_kb : float
        Ukuran payload rata-rata dalam KB.
    error_pct : float
        Error rate terukur dalam persen, dipakai sebagai error dasar.
    porsi_db : float
        Porsi waktu tunggu yang dihabiskan di database (0 sampai 1); sisanya eksternal.
    seed_dasar : int
        Seed awal; setiap iterasi memakai ``seed_dasar + i``.

    Returns
    -------
    profil : Profil
        Profil beban hasil kalibrasi.
    info : dict
        Ringkasan kalibrasi: acuan, p95 simulasi, galat persen, CPU per request,
        dan waktu tunggu database serta eksternal.
    """
    tps = max(tps, 0.1)
    cpu_ms = max(cpu_pct / 100 * spec.vcpu * spec.nodes * 1000 / tps, 0.5)
    tunggu = max(p95_ms * 0.4 - cpu_ms, 5.0)
    mem_req = 2 + payload_kb / 64
    mem_dasar = max(mem_pct / 100 * spec.ramGb - (tps / spec.nodes) * 0.2 * mem_req / 1024, 0.2)

    def profil(t):
        """Membuat ``Profil`` untuk total waktu tunggu tertentu.

        Parameters
        ----------
        t : float
            Total waktu tunggu database dan eksternal dalam milidetik.

        Returns
        -------
        Profil
            Profil dengan waktu tunggu dibagi menurut ``porsi_db``.
        """
        return Profil(cpuMs=cpu_ms, dbMs=t * porsi_db, extMs=t * (1 - porsi_db), payloadKb=payload_kb,
                      memDasarGb=mem_dasar, memPerReqMb=mem_req, errorDasarPct=error_pct)

    hasil = None
    for i in range(4):
        hasil = simulasikan(spec, profil(tunggu), tps, seed_dasar + i, durasi_s=30)
        p95 = max(hasil.ringkasan["p95Ms"], 1)
        rasio = p95_ms / p95
        if abs(1 - rasio) < 0.05:
            break
        tunggu = min(max(tunggu * (rasio ** 0.9), 2.0), 20000.0)
    galat = abs(hasil.ringkasan["p95Ms"] - p95_ms) / max(p95_ms, 1)
    return profil(tunggu), {
        "acuanTps": round(tps, 2),
        "acuanP95Ms": round(p95_ms),
        "p95SimulasiMs": hasil.ringkasan["p95Ms"],
        "galatPersen": round(100 * galat, 1),
        "cpuMsPerRequest": round(cpu_ms, 1),
        "tungguDatabaseMs": round(tunggu * porsi_db, 1),
        "tungguEksternalMs": round(tunggu * (1 - porsi_db), 1),
    }


def kapasitas_littles_law(spec: Spesifikasi, pr: Profil, hasil_puncak: HasilSimulasi, tps_puncak: float,
                          batas_cpu_pct: float) -> dict:
    """Menghitung kapasitas maksimum dengan Little's Law dan batas tiap sumber daya.

    Kapasitas dihitung untuk CPU, thread pool, connection pool, dan jaringan; yang terkecil
    menjadi pembatas. Little's Law (L = lambda x W) dipakai untuk thread pool dan connection
    pool serta untuk menyarankan ukuran thread pool per node.

    Parameters
    ----------
    spec : Spesifikasi
        Spesifikasi Production yang dinilai.
    pr : Profil
        Profil beban hasil kalibrasi.
    hasil_puncak : HasilSimulasi
        Hasil simulasi pada beban puncak, sumber waktu tinggal W per komponen.
    tps_puncak : float
        Beban puncak (lambda) dalam transaksi per detik.
    batas_cpu_pct : float
        Batas utilisasi CPU pada kriteria penerimaan, dalam persen.

    Returns
    -------
    dict
        ``kapasitasMaksTps``, ``pembatas``, ``perSumberDaya`` (dengan rumus), dan
        ``littlesLaw`` (lambda, W, L, thread tersedia dan disarankan per node).
    """
    w_thread = max((hasil_puncak.komponenLatensiMs.get("cpu", 0) + hasil_puncak.komponenLatensiMs.get("antreCpu", 0)
                    + hasil_puncak.komponenLatensiMs.get("antreKoneksi", 0) + hasil_puncak.komponenLatensiMs.get("database", 0)
                    + hasil_puncak.komponenLatensiMs.get("eksternal", 0)) / 1000, 0.001)
    w_conn = max(hasil_puncak.komponenLatensiMs.get("database", pr.dbMs) / 1000, 0.0005)
    cpu_tps = spec.vcpu * spec.nodes * (1 - pr.porsiBatch) * 1000 / max(pr.cpuMs, 0.01) * (batas_cpu_pct / 100)
    thread_tps = spec.threadPool * spec.nodes / w_thread
    conn_tps = spec.connPool * spec.nodes / w_conn
    net_tps = spec.bandwidthMbps * 1e6 * spec.nodes * 0.9 / (pr.payloadKb * 2 * 1024 * 8)
    per = [
        {"sumber": "CPU", "kapasitasTps": round(cpu_tps, 1), "rumus": f"{spec.vcpu} vCPU x {spec.nodes} node / {pr.cpuMs:.1f} ms CPU per request x batas {batas_cpu_pct:.0f}%"},
        {"sumber": "ThreadPool", "kapasitasTps": round(thread_tps, 1), "rumus": f"L = {spec.threadPool} x {spec.nodes} thread, W = {w_thread*1000:.0f} ms, lambda = L / W"},
        {"sumber": "ConnectionPool", "kapasitasTps": round(conn_tps, 1), "rumus": f"L = {spec.connPool} x {spec.nodes} koneksi, W = {w_conn*1000:.0f} ms, lambda = L / W"},
        {"sumber": "Jaringan", "kapasitasTps": round(net_tps, 1), "rumus": f"{spec.bandwidthMbps:.0f} Mbps x {spec.nodes} node x 90% / ({pr.payloadKb:.0f} KB x 2)"},
    ]
    pembatas = min(per, key=lambda x: x["kapasitasTps"])
    l_puncak = tps_puncak * w_thread
    saran = math.ceil(l_puncak / spec.nodes * 1.3)
    return {
        "kapasitasMaksTps": pembatas["kapasitasTps"],
        "pembatas": pembatas["sumber"],
        "perSumberDaya": per,
        "littlesLaw": {
            "lambdaTps": round(tps_puncak, 1),
            "wDetik": round(w_thread, 3),
            "lRequest": round(l_puncak, 1),
            "threadTersediaPerNode": spec.threadPool,
            "threadDisarankanPerNode": max(saran, 1),
        },
    }
