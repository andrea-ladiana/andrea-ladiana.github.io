/* Mappa affitti Roma · frontend (Leaflet). Nessun dato degli annunci viene inserito come HTML senza escaping. */
"use strict";

const PALETTE = {
  price: {
    title: "Prezzo (canone + spese)",
    key: r => r.price_band,
    items: [["<=500", "#1a9850", "≤ 500 €"], ["501-600", "#91cf60", "501–600 €", true], ["601-700", "#fdae61", "601–700 €", true], [">700", "#d73027", "> 700 €"]],
  },
  quality: {
    title: "Qualità",
    key: r => r.quality_band,
    items: [["alta", "#08519c", "Alta (≥78)"], ["media", "#6baed6", "Media (62–77)", true], ["bassa", "#d0d7e2", "Bassa (<62)", true]],
  },
  commute: {
    title: "Tempo verso la Sapienza",
    key: r => r.commute_band,
    items: [["ottimo", "#54278f", "≤ 25 min"], ["buono", "#807dba", "26–40 min"], ["medio", "#cbc9e2", "41–55 min", true], ["lungo", "#f2f0f7", "> 55 min", true]],
  },
};
const RING_FOR = { price: "quality", quality: "price", commute: "quality" };
const LINE_COLORS = { A: "#e8761b", B: "#1f6fd1", B1: "#58a6ff", C: "#2aa84a" };
const COND = { ottimo: "Ottimo / ristrutturato", buono: "Buono / abitabile", da_ristrutturare: "Da ristrutturare" };
const CONTRACT = {
  "4+4": "4+4 (canone libero)", "3+2": "3+2 (canone concordato)", transitorio: "Transitorio (breve durata)",
  studenti: "Transitorio per studenti", "lungo termine": "Lungo termine (4+4 o 3+2, da chiedere)",
};
const STATUS = { da_contattare: ["Da contattare", "#1f6fd1"], contattato: ["Contattato", "#7a4fd0"], visita: ["Visita fissata", "#1a9850"], scartato: ["Scartato", "#8a94a6"] };
const POI_LABEL = { supermercato: "supermercati", farmacia: "farmacie", lavanderia: "lavanderie", mercato: "mercati", palestra: "palestre", parco: "parchi" };

const RISK_RANK = { nessuno: 0, basso: 1, medio: 2, alto: 3 };
const RISK_COLOR = { alto: "#d73027", medio: "#f08c00", basso: "#8a94a6" };
const riskOf = r => r.risk || { level: "nessuno", score: 0, signals: [] }; // dati esportati prima dei segnali di rischio

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : "#");
const tri = v => (v === true ? "Sì" : v === false ? "No" : "–");
const eur = n => (n == null ? "–" : `${Math.round(n)} €`);
const itDate = iso => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "–");
const lineName = l => (!l ? "" : /^ME/.test(l) ? `metro ${l.slice(2)}` : `linea ${l}`); // nel GTFS di Roma le metro sono MEA, MEB, MEB1, MEC

const state = {
  data: [], mode: "price", selected: null, filtered: [], photoIdx: 0,
  markers: new Map(), favs: new Set(), sources: new Set(), lines: new Set(), statuses: new Set(), kinds: new Set(["monolocale", "bilocale"]),
  notes: {}, // uid -> {status, note, at}
};
try { state.favs = new Set(JSON.parse(localStorage.getItem("favs") || "[]")); } catch { /* storage non disponibile */ }
try { state.notes = JSON.parse(localStorage.getItem("notes") || "{}"); } catch { /* storage non disponibile */ }
const saveFavs = () => { try { localStorage.setItem("favs", JSON.stringify([...state.favs])); } catch { /* ignora */ } };
const saveNotes = () => { try { localStorage.setItem("notes", JSON.stringify(state.notes)); } catch { /* ignora */ } };
const statusOf = uid => state.notes[uid]?.status || "";

const costs = r => r.costs || { monthly: r.price_total, entry: null, estimated: [] };
const priceShown = r => (val("priceBasis") === "monthly" ? costs(r).monthly : r.price_total);
// equilibrio fra qualità, costo reale e tempo (0-100): utile per ordinare, non è un voto
const balance = r => {
  const q = r.quality / 100, c = 1 - Math.min(1, Math.max(0, (costs(r).monthly - 450) / 450)), t = 1 - Math.min(1, Math.max(0, (r.commute_min - 10) / 60));
  return Math.round((0.35 * q + 0.35 * c + 0.3 * t) * 100);
};

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.add("hidden"), 3200);
}

/* ------------------------------------------------------------------ colori */
function colorOf(rec, dim) {
  const pal = PALETTE[dim];
  const k = pal.key(rec);
  const it = pal.items.find(x => x[0] === k) || pal.items[pal.items.length - 1];
  return { color: it[1], dark: !!it[3], label: it[2] };
}

function renderLegend() {
  const main = PALETTE[state.mode], ring = PALETTE[RING_FOR[state.mode]];
  const line = (t, pal, cls) => `<div class="lg-line"><span class="t">${t}</span>${pal.items.map(i =>
    `<span class="lg-item"><span class="dot ${cls}" style="${cls === "fill" ? `background:${i[1]}` : `border-color:${i[1]}`}"></span>${i[2]}</span>`).join("")}</div>`;
  $("legend").innerHTML = line(`Riempimento = ${main.title}`, main, "fill") + line(`Bordo = ${ring.title}`, ring, "ring") +
    `<div class="note">Bordo tratteggiato = posizione approssimata al quartiere · marker quadrato = bilocale · ` +
    `<b style="color:${RISK_COLOR.medio}">!</b> / <b style="color:${RISK_COLOR.alto}">!</b> = rischio medio / alto · alone verde = nuovo.</div>`;
}

/* ------------------------------------------------------------------ mappa */
// stessa condizione del CSS: telefono (schermo stretto) o telefono in orizzontale
const mobileQuery = window.matchMedia("(max-width: 860px), (pointer: coarse) and (max-height: 520px)");
const isMobile = () => mobileQuery.matches;
if (isMobile()) $("app").classList.add("collapsed"); // cassetto chiuso fin dall'inizio, anche dietro la schermata password

const map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([41.9, 12.52], 12);
// su telefono i controlli stanno in alto a destra: in basso c'è la card a foglio
L.control.zoom({ position: isMobile() ? "topright" : "bottomleft" }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const cluster = L.markerClusterGroup({
  maxClusterRadius: 32, disableClusteringAtZoom: 15, spiderfyOnMaxZoom: true, showCoverageOnHover: false,
  iconCreateFunction: c => {
    const n = c.getChildCount(), s = n < 10 ? 34 : n < 40 ? 42 : 50;
    return L.divIcon({ html: `<div class="cl" style="width:${s}px;height:${s}px">${n}</div>`, className: "", iconSize: [s, s] });
  },
});
map.addLayer(cluster);

function pinIcon(rec, active) {
  const main = colorOf(rec, state.mode), ring = colorOf(rec, RING_FOR[state.mode]);
  const cls = ["pin", main.dark ? "dark" : "", active ? "active" : "", rec.geo_precision === "zone" ? "approx" : "",
    rec.kind === "bilocale" ? "bilo" : "",
    RISK_RANK[riskOf(rec).level] >= 2 ? `risk ${riskOf(rec).level}` : "",
    rec.history?.is_new ? "new" : "",
    state.favs.has(rec.uid) ? "fav" : ""].join(" ");
  return L.divIcon({
    html: `<div class="${cls}" style="background:${main.color};border-color:${ring.color}">${Math.round(priceShown(rec))}</div>`,
    className: "", iconSize: [38, 38], iconAnchor: [19, 19],
  });
}

function buildOverlays(meta) {
  const sap = L.marker([meta.sapienza.lat, meta.sapienza.lng], {
    icon: L.divIcon({ html: '<div class="sap">🎓</div>', className: "", iconSize: [30, 30], iconAnchor: [15, 15] }),
    zIndexOffset: 1000, keyboard: false,
  }).bindTooltip(meta.sapienza.name, { direction: "top" }).addTo(map);

  const metro = L.layerGroup();
  for (const ln of meta.metro.lines) {
    L.polyline(ln.stops.map(s => [s.lat, s.lng]), { color: LINE_COLORS[ln.ref] || ln.color, weight: 4, opacity: .75 }).addTo(metro);
  }
  for (const st of meta.metro.stations) {
    L.circleMarker([st.lat, st.lng], { radius: 4.5, weight: 2, color: LINE_COLORS[st.lines[0]] || "#333", fillColor: "#fff", fillOpacity: 1 })
      .bindTooltip(`${esc(st.name)} · ${st.lines.join("/")}`, { className: "st-label" }).addTo(metro);
  }
  metro.addTo(map);
  const gra = meta.gra.ring.length
    ? L.polygon(meta.gra.ring, { color: "#6a7486", weight: 2, dashArray: "6 6", fill: false, interactive: false }).addTo(map) : null;
  L.control.layers(null, { "Metro A/B/B1/C": metro, ...(gra ? { "GRA": gra } : {}), "Sapienza": sap }, { position: isMobile() ? "topright" : "bottomleft", collapsed: true }).addTo(map);
}

/* ------------------------------------------------------------------ filtri */
const val = id => $(id).value;
function passes(r) {
  if (!$("showProblems").checked && r.hidden_by_default) return false;
  if (r.paid_service) {
    if (!$("showPaid").checked) return false; // la casella ha la precedenza sul livello di rischio (sono tutti "alto")
  } else if (val("riskMax") !== "tutti" && RISK_RANK[riskOf(r).level] >= RISK_RANK[val("riskMax")]) return false;
  if (!state.kinds.has(r.kind)) return false;
  if (priceShown(r) > +val("priceMax")) return false;
  if (r.quality < +val("qualityMin")) return false;
  if (r.commute_min > +val("commuteMax")) return false;
  if ((r.surface || 0) < +val("surfaceMin") && +val("surfaceMin") > 0) return false;
  if ($("onlyGra").checked && !r.inside_gra) return false;
  if ($("onlyMetro").checked && !(r.metro_walk_m != null && r.metro_walk_m <= 900)) return false;
  if ($("onlyPrecise").checked && r.geo_precision === "zone") return false;
  if ($("onlyFav").checked && !state.favs.has(r.uid)) return false;
  if ($("onlyNew").checked && !r.history?.is_new) return false;
  if ($("noTransient").checked && (["transitorio", "studenti"].includes(r.facts?.contract) || r.flags.transitorio || r.flags.stagionale)) return false;
  const st = statusOf(r.uid);
  if ($("hideDiscarded").checked && st === "scartato" && !state.statuses.has("scartato")) return false;
  if (state.statuses.size && !state.statuses.has(st || "nessuno")) return false;
  if (state.sources.size && !r.sources.some(s => state.sources.has(s.source))) return false;
  if (state.lines.size && !(r.metro_walk_m != null && r.metro_walk_m <= 900 && (r.metro_lines || []).some(l => state.lines.has(l)))) return false;
  const q = val("search").trim().toLowerCase();
  if (q && !`${r.title} ${r.zone} ${r.address} ${r.description} ${r.agency}`.toLowerCase().includes(q)) return false;
  return true;
}

const SORTERS = {
  balance: (a, b) => balance(b) - balance(a),
  quality: (a, b) => b.quality - a.quality || a.price_total - b.price_total,
  price: (a, b) => a.price_total - b.price_total || b.quality - a.quality,
  monthly: (a, b) => costs(a).monthly - costs(b).monthly,
  entry: (a, b) => (costs(a).entry ?? 1e9) - (costs(b).entry ?? 1e9),
  commute: (a, b) => a.commute_min - b.commute_min || a.price_total - b.price_total,
  newest: (a, b) => (b.facts?.published_on || b.history?.first_seen || "").localeCompare(a.facts?.published_on || a.history?.first_seen || ""),
  ppm: (a, b) => (a.price_per_m2 ?? 1e9) - (b.price_per_m2 ?? 1e9),
};

function refresh(fit = false) {
  state.filtered = state.data.filter(passes).sort(SORTERS[val("sort")]);
  $("priceMaxVal").textContent = `${val("priceMax")} €`;
  $("qualityMinVal").textContent = val("qualityMin") === "0" ? "qualsiasi" : `≥ ${val("qualityMin")}`;
  $("commuteMaxVal").textContent = val("commuteMax") === "120" ? "qualsiasi" : `≤ ${val("commuteMax")} min`;
  $("surfaceMinVal").textContent = val("surfaceMin") === "0" ? "qualsiasi" : `≥ ${val("surfaceMin")} m²`;
  $("count").textContent = `${state.filtered.length} di ${state.data.length}`;
  $("tbCount").textContent = state.filtered.length;
  $("showMapCount").textContent = state.filtered.length;

  cluster.clearLayers();
  state.markers.clear();
  const layers = state.filtered.map(r => {
    const m = L.marker([r.lat, r.lng], { icon: pinIcon(r, r.uid === state.selected), riseOnHover: true, title: `${r.price_total} € · ${r.zone}` });
    m.on("click", () => select(r.uid));
    state.markers.set(r.uid, m);
    return m;
  });
  cluster.addLayers(layers);
  renderList();
  if (fit && state.filtered.length) map.fitBounds(L.latLngBounds(state.filtered.map(r => [r.lat, r.lng])).pad(0.08), { maxZoom: 14 });
}

function setSidebar(open) {
  $("app").classList.toggle("collapsed", !open);
  setTimeout(() => map.invalidateSize(), 260); // dopo l'animazione del cassetto
}

function fitFiltered() {
  if (state.filtered.length) map.fitBounds(L.latLngBounds(state.filtered.map(r => [r.lat, r.lng])).pad(0.08), { maxZoom: 14 });
}

function renderList() {
  const ol = $("list");
  if (!state.filtered.length) { ol.innerHTML = '<li class="empty">Nessun annuncio con questi filtri.</li>'; return; }
  ol.innerHTML = state.filtered.map(r => {
    const q = colorOf(r, "quality"), lv = riskOf(r).level, st = statusOf(r.uid);
    const rk = r.paid_service ? '<span class="rk alto">⚠ banca dati</span> · ' : RISK_RANK[lv] >= 2 ? `<span class="rk ${lv}">⚠ rischio ${lv}</span> · ` : "";
    const tags = (r.history?.is_new ? '<span class="tag new">nuovo</span>' : "") +
      (r.history?.price_change < 0 ? `<span class="tag drop">−${-r.history.price_change} €</span>` : "") +
      (st ? `<span class="tag" style="background:${STATUS[st][1]}">${STATUS[st][0]}</span>` : "");
    return `<li data-uid="${esc(r.uid)}" class="${r.uid === state.selected ? "sel" : ""}">
      <span class="p">${eur(priceShown(r))}</span>
      <span><div class="t">${tags}${r.kind === "bilocale" ? "Bilo · " : ""}${esc(r.zone || r.address || r.title)}${r.surface ? ` · ${r.surface} m²` : ""}</div>
      <div class="m">${rk}${r.commute_min} min · ${esc(r.commute_mode)}${r.geo_precision === "zone" ? " · pos. approx" : ""}${state.favs.has(r.uid) ? " · ★" : ""}</div></span>
      <span class="q" style="background:${q.color};${q.dark ? "color:#1c2330" : ""}">${r.quality}</span></li>`;
  }).join("");
}

/* ------------------------------------------------------------------ card */
function select(uid, fly = false) {
  const r = state.data.find(x => x.uid === uid);
  if (!r) return;
  const prev = state.selected;
  state.selected = uid;
  state.photoIdx = 0;
  for (const id of [prev, uid]) {
    const m = state.markers.get(id);
    if (m) m.setIcon(pinIcon(state.data.find(x => x.uid === id), id === uid));
  }
  const m = state.markers.get(uid);
  if (isMobile()) {
    // la card a foglio copre la parte bassa dello schermo: l'annuncio va portato nella metà alta
    const zoom = Math.max(map.getZoom(), 15), h = map.getSize().y;
    const center = map.unproject(map.project([r.lat, r.lng], zoom).add([0, h * 0.3]), zoom);
    map.flyTo(center, zoom, { duration: .6 }); // a zoom >= 15 il raggruppamento è disattivato: il marker è già visibile
  } else {
    if (fly || (m && !map.getBounds().contains(m.getLatLng()))) map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 15), { duration: .6 });
    if (m) cluster.zoomToShowLayer(m, () => {});
  }
  renderCard(r);
  history.replaceState(null, "", "#" + encodeURIComponent(uid));
  document.querySelectorAll("#list li").forEach(li => li.classList.toggle("sel", li.dataset.uid === uid));
  const sel = document.querySelector(`#list li[data-uid="${CSS.escape(uid)}"]`);
  if (sel) sel.scrollIntoView({ block: "nearest" });
}

function closeCard() {
  const prev = state.selected;
  state.selected = null;
  $("card").classList.add("hidden");
  const m = state.markers.get(prev);
  if (m) m.setIcon(pinIcon(state.data.find(x => x.uid === prev), false));
  history.replaceState(null, "", location.pathname);
  document.querySelectorAll("#list li.sel").forEach(li => li.classList.remove("sel"));
}

/** Domande da fare all'inserzionista: solo ciò che l'annuncio non dice. */
function questionsFor(r) {
  const f = r.facts || {}, qs = [];
  if (r.geo_precision === "zone") qs.push("Qual è l'indirizzo esatto dell'appartamento?");
  if (!f.contract || f.contract === "lungo termine") qs.push("Che tipo di contratto propone (4+4, 3+2 a canone concordato, transitorio)? Viene registrato?");
  if (f.residence == null) qs.push("È possibile prendere la residenza?");
  if (f.deposit_months == null) qs.push("Quante mensilità di cauzione sono richieste?");
  if (r.condo_fee == null && !r.flags.spese_incluse) qs.push("A quanto ammontano le spese condominiali e cosa comprendono (riscaldamento, acqua)?");
  if (f.utilities_included == null) qs.push("Le utenze (luce, gas, acqua, internet) sono incluse? Se no, a quanto ammontano in media?");
  if (!f.available) qs.push("Da quando è disponibile?");
  if (f.agency_fee && r.source !== "immobiliare") qs.push("È prevista una provvigione di agenzia? Di quanto?");
  if ((r.n_photos || 0) <= 3) qs.push("Può inviarmi altre foto (bagno, cucina, finestre)?");
  qs.push("Quando sarebbe possibile visitarlo?");
  return qs;
}

function messageFor(r) {
  const src = r.sources[0];
  return `Buongiorno,\nho visto il suo annuncio «${r.title}» (${r.price} €/mese) su ${src.label} e l'appartamento mi interessa. ` +
    `Prima di fissare una visita vorrei qualche informazione:\n\n${questionsFor(r).map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\n` +
    `Grazie e cordiali saluti,\n[il tuo nome]`;
}

const VISIT_CHECKS = [
  "Umidità e muffa (angoli, bagno, dietro i mobili), odore di chiuso",
  "Infissi e doppi vetri; rumore con le finestre chiuse; luce naturale",
  "Pressione dell'acqua, scarichi, acqua calda; caldaia con libretto e ultima revisione",
  "Impianto elettrico (quadro con salvavita, prese), segnale del telefono, internet disponibile",
  "Contatori: intestati a chi? Vanno volturati? Classe energetica (APE)",
  "Proprietario = intestatario (documento + visura catastale); contratto registrato entro 30 giorni",
  "Inventario dei mobili con foto; cauzione con bonifico tracciabile e ricevuta",
];

function gallery(r) {
  const ph = (r.photos && r.photos.length ? r.photos : r.photo ? [r.photo] : []);
  const i = Math.min(state.photoIdx, Math.max(0, ph.length - 1));
  const img = ph.length ? `<img src="${esc(safeUrl(ph[i]))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  const nav = ph.length > 1 ? `<button class="g-prev" id="gPrev" aria-label="Foto precedente">‹</button><button class="g-next" id="gNext" aria-label="Foto successiva">›</button><span class="g-count">${i + 1}/${ph.length}${r.n_photos > ph.length ? ` (di ${r.n_photos})` : ""}</span>` : "";
  return { html: `<span>Foto non disponibile</span>${img}${nav}`, n: ph.length };
}

function renderCard(r) {
  const q = colorOf(r, "quality"), pr = colorOf(r, "price"), cm = colorOf(r, "commute");
  const fav = state.favs.has(r.uid), f = r.facts || {}, c = costs(r), h = r.history || {}, mk = r.market;
  const txt = cl => (cl.dark ? "color:#1c2330" : "");
  const fee = r.flags.spese_incluse ? "incluse" : r.condo_fee != null ? `+${r.condo_fee} €` : "n.d.";
  const est = k => (c.estimated || []).includes(k) ? '<i class="est" title="Stima: l\'annuncio non lo dice">stima</i>' : "";

  const t = r.transit;
  const commute = t && r.commute_mode !== "a piedi"
    ? `<div><b>~${r.commute_min} min</b> porta a porta (fra ${t.range[0]} e ${t.range[1]} min a seconda dell'orario)</div>
       <div class="note">A piedi ${t.walk_to_stop} min fino alla fermata <b>${esc(t.stop)}</b>, poi ${esc(lineName(t.line) || "mezzi")}. Orari ufficiali di un mercoledì, arrivo entro 8:30–9:30, uscendo all'ora giusta.</div>`
    : r.commute_mode === "a piedi" ? `<div><b>${r.commute_min} min a piedi</b> (${r.dist_sapienza_km} km)</div>`
      : `<div>~${r.commute_min} min (${esc(r.commute_mode)}) <i class="est">stima</i></div>`;
  const metroLine = r.metro_station
    ? `<div class="note">Metro più vicina: ${esc((r.metro_lines || []).join("/"))} <b>${esc(r.metro_station)}</b> a ${r.metro_walk_m} m.</div>` : "";

  const rs = riskOf(r);
  const risk = rs.signals.length ? `<div class="box risk-box ${esc(rs.level)}"><h3>Segnali di rischio · ${esc(rs.level)}</h3>
      <ul>${rs.signals.map(s => `<li><b>${esc(s.label)}.</b> ${esc(s.detail)}</li>`).join("")}</ul>
      <div class="note">Non pagare nulla (caparra, «quota», «blocco») prima di aver visto la casa, conosciuto il proprietario e firmato un contratto da registrare.</div></div>` : "";
  const riskBadge = RISK_RANK[rs.level] >= 1
    ? `<span class="badge" style="background:${RISK_COLOR[rs.level]}">${r.paid_service ? "Banca dati a pagamento" : `Rischio ${esc(rs.level)}`}</span>` : "";
  const warn = r.problems.length ? `<div class="box warn"><h3>Attenzione</h3><ul>${r.problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul></div>` : "";

  const mkBadge = mk ? `<span class="badge neutral" title="Mediana di ${mk.n} annunci con indirizzo ${esc(mk.where)}: ${mk.median} €">${mk.delta_pct > 0 ? "+" : ""}${mk.delta_pct}% sulla zona</span>` : "";
  const prices = (h.prices || []).length > 1 ? `<div><span>Prezzo nel tempo</span>${h.prices.map(p => `${itDate(p[0])}: ${p[1]} €`).join(" → ")}</div>` : "";
  const ctx = r.context;
  const zone = ctx ? `<div class="box"><h3>Zona (entro 500 m a piedi)</h3>
      <div class="poi">${Object.entries(ctx.walk).map(([k, n]) => `<span class="${n ? "" : "zero"}"><b>${n}</b> ${esc(POI_LABEL[k] || k)}</span>`).join("")}</div>
      ${ctx.nearest_m?.supermercato ? `<div class="note">Supermercato più vicino a ~${Math.round(ctx.nearest_m.supermercato / 10) * 10} m.</div>` : ""}
      ${ctx.noise.length ? `<div class="note warn-txt">🔊 ${ctx.noise.map(esc).join(" · ")}</div>` : ""}
      <div class="note">Da OpenStreetMap: può mancare qualche negozio.</div></div>`
    : `<div class="box"><h3>Zona</h3><div class="note">Servizi e rumore non calcolati: la posizione è approssimata al quartiere.</div></div>`;

  const st = statusOf(r.uid), note = state.notes[r.uid]?.note || "";
  const mine = `<div class="box mine"><h3>La mia valutazione</h3>
      <div class="st-btns">${Object.entries(STATUS).map(([k, [lab, col]]) => `<button data-st="${k}" class="${st === k ? "on" : ""}" style="--c:${col}">${lab}</button>`).join("")}</div>
      <textarea id="noteTxt" rows="2" placeholder="Note (risposte dell'inserzionista, impressioni della visita…)">${esc(note)}</textarea></div>`;
  const qs = questionsFor(r);
  const ask = `<div class="box"><h3>Cosa chiedere (${qs.length})</h3><ol class="qs">${qs.map(x => `<li>${esc(x)}</li>`).join("")}</ol>
      <button class="btn" id="copyMsg">Copia messaggio per l'inserzionista</button>
      <details class="visit"><summary>Checklist per la visita</summary><ul>${VISIT_CHECKS.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details></div>`;

  const brk = r.quality_breakdown.map(b => `<div class="bar"><span>${esc(b.voce)}</span><div class="tr"><div class="fl" style="width:${Math.round(b.punti / b.max * 100)}%"></div></div><b>${b.punti}/${b.max}</b></div>`).join("");
  const links = r.sources.map((s, i) => `<a class="btn ${i ? "alt" : ""}" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)}${r.sources.length > 1 ? ` · ${eur(s.price)}` : ""} ↗</a>`).join("");
  const gmaps = `https://www.google.com/maps/dir/?api=1&origin=${r.lat},${r.lng}&destination=41.9029,12.5163&travelmode=transit`;
  const g = gallery(r);
  $("card").innerHTML = `
    <div class="c-photo">${g.html}
      <button class="c-fav ${fav ? "on" : ""}" id="favBtn" title="Preferito">${fav ? "★" : "☆"}</button>
      <button class="c-close" id="closeBtn" title="Chiudi (Esc)">✕</button></div>
    <div class="c-body">
      <div class="c-price"><span class="big">${eur(r.price)}</span><span class="sm">/mese · spese ${fee}</span>
        ${h.is_new ? '<span class="tag new">nuovo</span>' : ""}${h.price_change < 0 ? `<span class="tag drop">ribassato di ${-h.price_change} €</span>` : ""}</div>
      <div class="c-title">${esc(r.title || r.type)}</div>
      <div class="c-addr">${esc([r.address, r.zone].filter(Boolean).join(" · "))}${r.geo_precision === "zone" ? " <i>(posizione approssimata)</i>" : ""}</div>
      <div class="badges">
        <span class="badge" style="background:${q.color};${txt(q)}">Qualità ${r.quality}/100 · ${esc(r.quality_band)}</span>
        <span class="badge" style="background:${pr.color};${txt(pr)}">${esc(pr.label)}</span>
        <span class="badge" style="background:${cm.color};${txt(cm)}">~${r.commute_min} min</span>
        ${mkBadge}
        ${r.inside_gra ? "" : '<span class="badge" style="background:#6a7486">Fuori GRA</span>'}
        ${riskBadge}
      </div>
      ${risk}
      <div class="box cost"><h3>Costo reale</h3>
        <div class="cost-row"><div><span>Ogni mese</span><b>${eur(c.monthly)}</b></div><div><span>Per entrare</span><b>${eur(c.entry)}</b></div></div>
        <div class="note">Mese: canone ${eur(c.rent)} + spese ${eur(c.condo)} ${est("spese condominiali")} + utenze ${eur(c.utilities)} ${est("utenze")}.<br>
        Ingresso: cauzione ${eur(c.deposit)} (${c.deposit_months} mesi) ${est("cauzione")} + ${c.agency_fee ? `provvigione ${eur(c.agency_fee)} ${est("provvigione")} + ` : f.private ? "nessuna provvigione (privato) + " : ""}primo mese.</div></div>
      <div class="box"><h3>Contratto e condizioni</h3><div class="grid">
        <div><span>Contratto</span>${esc(CONTRACT[f.contract] || "non indicato")}</div>
        <div><span>Residenza</span>${f.residence === true ? "Possibile" : f.residence === false ? "<b>Non possibile</b>" : "non indicato"}</div>
        <div><span>Cauzione</span>${f.deposit_months != null ? `${f.deposit_months} mensilità` : "non indicata"}</div>
        <div><span>Disponibile</span>${esc(f.available || "non indicato")}</div>
        <div><span>Utenze</span>${f.utilities_included === true ? "Incluse" : f.utilities_included === false ? "Escluse" : "non indicato"}</div>
        <div><span>Persone</span>${f.max_people ? `massimo ${f.max_people}` : "non indicato"}</div>
        <div><span>Inserzionista</span>${f.private ? "Privato" : esc(r.agency || "Agenzia")}</div>
        <div><span>Sul mercato</span>${h.days_listed != null ? `da ${h.days_listed} ${h.days_listed === 1 ? "giorno" : "giorni"}` : "–"}${f.published_on ? ` (dal ${itDate(f.published_on)})` : f.updated_on ? ` · agg. ${itDate(f.updated_on)}` : ""}</div>
        ${prices}
        ${f.residence_note ? `<div><span>Nota</span>${esc(f.residence_note)}</div>` : ""}
      </div></div>
      <div class="box"><h3>Verso la Sapienza</h3>${commute}${metroLine}</div>
      ${mine}
      ${ask}
      <div class="box"><h3>L'appartamento</h3><div class="grid">
        <div><span>Superficie</span>${r.surface ? r.surface + " m²" : "n.d."}${r.price_per_m2 ? ` · ${r.price_per_m2} €/m²` : ""}</div>
        <div><span>Piano</span>${esc(r.floor_text || "n.d.")}${r.elevator != null && !/ascensore/i.test(r.floor_text || "") ? ` · asc. ${tri(r.elevator)}` : ""}</div>
        <div><span>Stato</span>${esc(COND[r.condition] || "n.d.")}</div>
        <div><span>Arredato</span>${tri(r.furnished)}</div>
        <div><span>Aria condizionata</span>${tri(r.air_conditioning)}</div>
        <div><span>Balcone / terrazzo</span>${tri(r.outdoor)}</div>
        <div><span>Riscaldamento</span>${r.heating_autonomous == null ? "n.d." : r.heating_autonomous ? "Autonomo" : "Centralizzato"}</div>
        <div><span>Classe energetica</span>${esc(r.energy || "n.d.")}</div>
      </div></div>
      ${zone}
      ${warn}
      <div class="box"><h3>Come si calcola la qualità</h3>${brk}</div>
      ${r.description ? `<div class="box"><h3>Descrizione dell'annuncio</h3><div class="desc">${esc(r.description)}</div></div>` : ""}
      <div class="links">${links}<a class="btn alt" href="${esc(gmaps)}" target="_blank" rel="noopener noreferrer">Percorso a Sapienza ↗</a></div>
      <div class="note">${r.sources.length > 1 ? `Annuncio presente su ${r.sources.length} portali. ` : ""}Agenzia/inserzionista: ${esc(r.agency || "n.d.")}</div>
    </div>`;
  $("card").classList.remove("hidden");
  $("closeBtn").onclick = closeCard;
  $("favBtn").onclick = () => {
    state.favs.has(r.uid) ? state.favs.delete(r.uid) : state.favs.add(r.uid);
    saveFavs();
    renderCard(r);
    const m = state.markers.get(r.uid);
    if (m) m.setIcon(pinIcon(r, true));
    renderList();
  };
  if (g.n > 1) {
    $("gPrev").onclick = e => { e.stopPropagation(); state.photoIdx = (state.photoIdx - 1 + g.n) % g.n; renderCard(r); };
    $("gNext").onclick = e => { e.stopPropagation(); state.photoIdx = (state.photoIdx + 1) % g.n; renderCard(r); };
  }
  $("card").querySelectorAll(".st-btns button").forEach(b => b.onclick = () => {
    const cur = state.notes[r.uid] || {};
    state.notes[r.uid] = { ...cur, status: cur.status === b.dataset.st ? "" : b.dataset.st, at: new Date().toISOString() };
    saveNotes();
    renderCard(r);
    renderList();
  });
  $("noteTxt").oninput = e => {
    state.notes[r.uid] = { ...(state.notes[r.uid] || {}), note: e.target.value, at: new Date().toISOString() };
    saveNotes();
  };
  $("copyMsg").onclick = async () => {
    try { await navigator.clipboard.writeText(messageFor(r)); toast("Messaggio copiato: incollalo nel modulo di contatto o su WhatsApp."); } catch { prompt("Copia il messaggio:", messageFor(r)); }
  };
}

/* ------------------------------------------------------------------ confronto */
function renderCompare() {
  const rows = state.data.filter(r => state.favs.has(r.uid));
  if (rows.length < 2) { toast("Aggiungi almeno due annunci ai preferiti ★ per confrontarli."); return; }
  const f = r => r.facts || {};
  const lines = [
    ["Zona", r => esc(r.zone || r.address || "–")],
    ["Tipologia", r => `${r.kind}${r.surface ? ` · ${r.surface} m²` : ""}`],
    ["Canone + spese", r => eur(r.price_total)],
    ["Costo reale al mese", r => `<b>${eur(costs(r).monthly)}</b>`],
    ["Costo d'ingresso", r => eur(costs(r).entry)],
    ["Tempo alla Sapienza", r => `${r.commute_min} min`],
    ["Qualità", r => `${r.quality}/100`],
    ["Rispetto alla zona", r => (r.market ? `${r.market.delta_pct > 0 ? "+" : ""}${r.market.delta_pct}%` : "–")],
    ["Contratto", r => esc(CONTRACT[f(r).contract] || "?")],
    ["Residenza", r => tri(f(r).residence)],
    ["Cauzione", r => (f(r).deposit_months != null ? `${f(r).deposit_months} mesi` : "?")],
    ["Arredato · clima", r => `${tri(r.furnished)} · ${tri(r.air_conditioning)}`],
    ["Piano", r => esc(r.floor_text || "–")],
    ["Servizi a piedi", r => (r.context ? `${r.context.walk.supermercato || 0} superm. · ${r.context.walk.farmacia || 0} farm.` : "–")],
    ["Rumore", r => (r.context?.noise.length ? esc(r.context.noise.join(", ")) : r.context ? "–" : "?")],
    ["Rischio", r => esc(riskOf(r).level)],
    ["Il mio stato", r => esc(STATUS[statusOf(r.uid)]?.[0] || "–")],
    ["Note", r => esc(state.notes[r.uid]?.note || "")],
  ];
  $("compare").innerHTML = `<div class="cmp-inner"><div class="cmp-head"><h2>Confronto dei preferiti (${rows.length})</h2><button class="c-close" id="cmpClose">✕</button></div>
    <div class="cmp-scroll"><table><thead><tr><th></th>${rows.map(r => `<th><a href="#" data-uid="${esc(r.uid)}">${esc(r.zone || r.title)}</a></th>`).join("")}</tr></thead>
    <tbody>${lines.map(([lab, fn]) => `<tr><th>${lab}</th>${rows.map(r => `<td>${fn(r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  $("compare").classList.remove("hidden");
  $("cmpClose").onclick = () => $("compare").classList.add("hidden");
  $("compare").querySelectorAll("thead a").forEach(a => a.onclick = e => { e.preventDefault(); $("compare").classList.add("hidden"); if (isMobile()) setSidebar(false); select(a.dataset.uid, true); });
}

/* ------------------------------------------------------------------ sincronizzazione fra dispositivi */
// i dati viaggiano nel frammento dell'URL (#sync=...), che il browser non invia mai al server
const enc64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dec64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)));

async function copySyncLink() {
  const payload = enc64(JSON.stringify({ v: 1, favs: [...state.favs], notes: state.notes }));
  const url = `${location.origin}${location.pathname}#sync=${payload}`;
  try { await navigator.clipboard.writeText(url); $("syncMsg").textContent = "Link copiato: aprilo sull'altro dispositivo (anche mandandolo a te stesso)."; } catch { prompt("Copia questo link:", url); }
}

function importSync() {
  const m = location.hash.match(/^#sync=([\w-]+)/);
  if (!m) return;
  try {
    const d = JSON.parse(dec64(m[1]));
    for (const u of d.favs || []) state.favs.add(u);
    for (const [u, n] of Object.entries(d.notes || {})) {
      if (!state.notes[u] || (n.at || "") > (state.notes[u].at || "")) state.notes[u] = n; // vince la modifica più recente
    }
    saveFavs(); saveNotes();
    const nf = (d.favs || []).length, nn = Object.keys(d.notes || {}).length;
    toast(`Sincronizzati ${nf} ${nf === 1 ? "preferito" : "preferiti"} e ${nn} ${nn === 1 ? "nota" : "note"}.`);
  } catch { toast("Link di sincronizzazione non valido."); }
  history.replaceState(null, "", location.pathname);
}

/* ------------------------------------------------------------------ copertura */
function renderCoverage(meta) {
  const cov = meta.coverage || {}, src = cov.sources || {}, h = cov.history || {};
  const LBL = { immobiliare: "Immobiliare.it", idealista: "Idealista", casa: "Casa.it", subito: "Subito" };
  const rows = Object.entries(src).map(([k, s]) => {
    const dec = Object.values(s.declared || {}).filter(v => typeof v === "number");
    const declared = k === "subito" ? s.declared?.appartamenti : dec.reduce((a, b) => a + b, 0);
    const note = k === "subito" ? " (tutti gli appartamenti; tenuti quelli da 1–2 locali)" : k === "casa" ? " (fino a 800 €)" : "";
    return `<li><b>${LBL[k] || k}</b>: ${s.collected} raccolti${declared ? ` su ${declared} dichiarati${note}` : ""}${s.with_errors ? `, ${s.with_errors} senza dettagli` : ""}</li>`;
  }).join("");
  const dates = (h.dates || []).map(itDate).join(", ");
  // i "nuovi" delle banche dati sono ripubblicazioni quotidiane: si contano a parte quelli utilizzabili
  const usableNew = state.data.filter(r => r.history?.is_new && !r.paid_service && riskOf(r).level !== "alto").length;
  $("coverage").innerHTML = `<ul>${rows}</ul>
    <div class="note">Raccolte: ${dates || "–"}. Nell'ultima: <b>${usableNew}</b> nuovi utilizzabili (${h.new_in_last ?? 0} contando le banche dati),
    <b>${h.gone_since_prev ?? 0}</b> spariti, ${h.price_drops ?? 0} ribassati.
    Non coperti: Bakeca e Wikicasa (bloccano i programmi), gruppi Facebook, passaparola.</div>`;
  $("newCount").textContent = `(${usableNew})`;
}

/* ------------------------------------------------------------------ avvio */
function setupControls() {
  document.querySelectorAll("#colorMode button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#colorMode button").forEach(x => x.classList.toggle("on", x === b));
    state.mode = b.dataset.mode;
    renderLegend();
    for (const [uid, m] of state.markers) m.setIcon(pinIcon(state.data.find(x => x.uid === uid), uid === state.selected));
  }));
  for (const id of ["priceMax", "qualityMin", "commuteMax", "surfaceMin"]) $(id).addEventListener("input", () => refresh());
  for (const id of ["onlyGra", "onlyMetro", "onlyPrecise", "onlyFav", "showProblems", "showPaid", "onlyNew", "noTransient", "hideDiscarded"]) $(id).addEventListener("change", () => refresh());
  for (const id of ["sort", "riskMax", "priceBasis"]) $(id).addEventListener("change", () => refresh());
  $("paidCount").textContent = `(${state.data.filter(r => r.paid_service).length})`;
  let t; $("search").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => refresh(), 200); });

  const srcs = [...new Set(state.data.flatMap(r => r.sources.map(s => [s.source, s.label].join("|"))))].sort();
  $("sources").innerHTML = '<span class="chip-title">Portale:</span>' + srcs.map(s => { const [k, l] = s.split("|"); return `<span class="chip" data-src="${esc(k)}">${esc(l)}</span>`; }).join("");
  $("sources").addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    c.classList.toggle("on"); state.sources.has(c.dataset.src) ? state.sources.delete(c.dataset.src) : state.sources.add(c.dataset.src); refresh();
  });
  $("kinds").addEventListener("click", e => {
    const c = e.target.closest(".chip"); if (!c) return;
    const k = c.dataset.kind;
    if (state.kinds.has(k) && state.kinds.size === 1) return; // almeno una tipologia attiva
    state.kinds.has(k) ? state.kinds.delete(k) : state.kinds.add(k);
    c.classList.toggle("on", state.kinds.has(k));
    refresh();
  });
  $("metroLines").insertAdjacentHTML("beforeend", ["A", "B", "B1", "C"].map(l => `<span class="chip line" data-line="${l}" style="--c:${LINE_COLORS[l]}">${l}</span>`).join(""));
  $("metroLines").addEventListener("click", e => {
    const c = e.target.closest(".chip.line"); if (!c) return;
    const on = c.classList.toggle("on"); c.style.background = on ? LINE_COLORS[c.dataset.line] : ""; c.style.borderColor = on ? LINE_COLORS[c.dataset.line] : "";
    on ? state.lines.add(c.dataset.line) : state.lines.delete(c.dataset.line); refresh();
  });
  $("statusChips").insertAdjacentHTML("beforeend", [...Object.entries(STATUS), ["nessuno", ["Senza stato"]]].map(([k, [lab]]) => `<span class="chip" data-st="${k}">${lab}</span>`).join(""));
  $("statusChips").addEventListener("click", e => {
    const c = e.target.closest(".chip[data-st]"); if (!c) return;
    const on = c.classList.toggle("on");
    on ? state.statuses.add(c.dataset.st) : state.statuses.delete(c.dataset.st); refresh();
  });
  $("reset").addEventListener("click", () => {
    $("priceMax").value = state.priceCap; $("qualityMin").value = 0; $("commuteMax").value = 120; $("surfaceMin").value = 0; $("search").value = "";
    for (const id of ["onlyMetro", "onlyPrecise", "onlyFav", "showProblems", "showPaid", "onlyNew", "noTransient"]) $(id).checked = false;
    $("onlyGra").checked = true; $("hideDiscarded").checked = true; $("riskMax").value = "alto"; $("priceBasis").value = "total";
    state.sources.clear(); state.lines.clear(); state.statuses.clear();
    state.kinds = new Set(["monolocale", "bilocale"]);
    document.querySelectorAll(".chip.on").forEach(c => { c.classList.remove("on"); c.style.background = ""; c.style.borderColor = ""; });
    document.querySelectorAll("#kinds .chip").forEach(c => c.classList.add("on"));
    refresh(true);
  });
  $("list").addEventListener("click", e => {
    const li = e.target.closest("li[data-uid]");
    if (!li) return;
    if (isMobile()) setSidebar(false); // su telefono il cassetto copre la mappa: si chiude per mostrare annuncio e card
    select(li.dataset.uid, true);
  });
  $("compareBtn").addEventListener("click", renderCompare);
  $("syncBtn").addEventListener("click", copySyncLink);
  $("toggleSidebar").addEventListener("click", () => setSidebar($("app").classList.contains("collapsed")));
  $("closeSidebar").addEventListener("click", () => setSidebar(false));
  $("backdrop").addEventListener("click", () => setSidebar(false));
  $("showMap").addEventListener("click", () => { setSidebar(false); fitFiltered(); });
  // la card a foglio si chiude trascinando verso il basso la parte alta (foto)
  let swipeY = null;
  $("card").addEventListener("touchstart", e => { swipeY = e.target.closest(".c-photo") && !e.target.closest("button") ? e.touches[0].clientY : null; }, { passive: true });
  $("card").addEventListener("touchend", e => {
    if (swipeY !== null && e.changedTouches[0].clientY - swipeY > 70) closeCard();
    swipeY = null;
  }, { passive: true });
  // ruotando il telefono o ridimensionando: cassetto chiuso su schermi stretti, pannello aperto su schermi larghi
  mobileQuery.addEventListener("change", () => { setSidebar(!isMobile()); });
  if (isMobile()) setSidebar(false); // all'avvio su telefono si vede subito la mappa
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeCard(); $("compare").classList.add("hidden"); }
  });
  map.on("click", closeCard);
}

/* ------------------------------------------------------------------ dati (in chiaro o cifrati) */
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const toB64 = u8 => btoa(String.fromCharCode(...u8));

async function deriveKey(password, box) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(box.salt), iterations: box.iter }, base, 256));
}

async function decryptBox(keyBytes, box) {
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(box.iv) }, key, b64(box.ct)); // errore se password errata
  const text = await new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return JSON.parse(text);
}

/** Chiede la password finché non è giusta. La chiave derivata (non la password) resta in sessionStorage fino alla chiusura della scheda. */
function unlock(box) {
  const lock = $("lock"), input = $("lockPw"), msg = $("lockMsg"), btn = $("lockBtn");
  return new Promise(async resolve => {
    try {
      const cached = sessionStorage.getItem("affitti-key");
      if (cached) { resolve(await decryptBox(b64(cached), box)); return; }
    } catch { /* chiave assente o non più valida: si chiede la password */ }
    lock.classList.remove("hidden");
    input.focus();
    $("lockForm").addEventListener("submit", async e => {
      e.preventDefault();
      btn.disabled = true; msg.textContent = "Verifica in corso…";
      try {
        const keyBytes = await deriveKey(input.value, box);
        const payload = await decryptBox(keyBytes, box);
        try { sessionStorage.setItem("affitti-key", toB64(keyBytes)); } catch { /* ignora */ }
        lock.classList.add("hidden");
        resolve(payload);
      } catch {
        msg.textContent = "Password errata.";
        input.select();
      } finally { btn.disabled = false; }
    });
  });
}

async function loadData() {
  // percorso relativo: funziona sia con Flask (/data/...) sia come sottopagina statica (es. /affitti/assets/data/...)
  const base = window.DATA_BASE || "data/";
  if (window.ENCRYPTED_DATA) {
    const box = await fetch(window.ENCRYPTED_DATA).then(r => r.json());
    const { annunci, meta } = await unlock(box);
    return [annunci, meta];
  }
  return Promise.all([fetch(base + "annunci.json").then(r => r.json()), fetch(base + "meta.json").then(r => r.json())]);
}

async function init() {
  importSync(); // prima di tutto: il frammento #sync=... va letto e tolto dall'indirizzo
  const [data, meta] = await loadData();
  state.data = data;
  // il tetto del filtro prezzo segue i dati (canone + spese, o costo reale con le utenze, possono superare gli 800 € della ricerca)
  state.priceCap = Math.ceil(Math.max(800, ...data.map(r => Math.max(r.price_total, costs(r).monthly))) / 10) * 10;
  $("priceMax").max = state.priceCap;
  $("priceMax").value = state.priceCap;
  $("updated").textContent = meta.updated || "–";
  buildOverlays(meta);
  setupControls();
  renderLegend();
  renderCoverage(meta);
  refresh(true);
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && state.data.some(r => r.uid === h)) select(h, true);
}
init().catch(err => { $("count").textContent = "errore di caricamento"; console.error(err); });
