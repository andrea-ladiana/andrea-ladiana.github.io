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
const FLAG_LABEL = {
  transitorio: "Contratto transitorio", no_residenti: "Non per residenti a Roma", uso_ufficio: "Uso ufficio / deposito",
  stanza: "Stanza in appartamento", seminterrato: "Seminterrato", stagionale: "Affitto stagionale / breve",
  solo_studenti: "Riservato a studenti/ragazze", spese_incluse: "Spese incluse",
};

const RISK_RANK = { nessuno: 0, basso: 1, medio: 2, alto: 3 };
const RISK_COLOR = { alto: "#d73027", medio: "#f08c00", basso: "#8a94a6" };
const riskOf = r => r.risk || { level: "nessuno", score: 0, signals: [] }; // dati esportati prima dei segnali di rischio

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : "#");
const tri = v => (v === true ? "Sì" : v === false ? "No" : "–");
const eur = n => (n == null ? "–" : `${Math.round(n)} €`);

const state = {
  data: [], mode: "price", selected: null, filtered: [],
  markers: new Map(), favs: new Set(), sources: new Set(), lines: new Set(), kinds: new Set(["monolocale", "bilocale"]),
};
try { state.favs = new Set(JSON.parse(localStorage.getItem("favs") || "[]")); } catch { /* storage non disponibile */ }
const saveFavs = () => { try { localStorage.setItem("favs", JSON.stringify([...state.favs])); } catch { /* ignora */ } };

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
    `<b style="color:${RISK_COLOR.medio}">!</b> / <b style="color:${RISK_COLOR.alto}">!</b> = rischio medio / alto.</div>`;
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
    state.favs.has(rec.uid) ? "fav" : ""].join(" ");
  return L.divIcon({
    html: `<div class="${cls}" style="background:${main.color};border-color:${ring.color}">${Math.round(rec.price_total)}</div>`,
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
  if (r.price_total > +val("priceMax")) return false;
  if (r.quality < +val("qualityMin")) return false;
  if (r.commute_min > +val("commuteMax")) return false;
  if ((r.surface || 0) < +val("surfaceMin") && +val("surfaceMin") > 0) return false;
  if ($("onlyGra").checked && !r.inside_gra) return false;
  if ($("onlyMetro").checked && !(r.metro_walk_m != null && r.metro_walk_m <= 900)) return false;
  if ($("onlyPrecise").checked && r.geo_precision === "zone") return false;
  if ($("onlyFav").checked && !state.favs.has(r.uid)) return false;
  if (state.sources.size && !r.sources.some(s => state.sources.has(s.source))) return false;
  if (state.lines.size && !(r.metro_walk_m != null && r.metro_walk_m <= 900 && (r.metro_lines || []).some(l => state.lines.has(l)))) return false;
  const q = val("search").trim().toLowerCase();
  if (q && !`${r.title} ${r.zone} ${r.address} ${r.description}`.toLowerCase().includes(q)) return false;
  return true;
}

const SORTERS = {
  quality: (a, b) => b.quality - a.quality || a.price_total - b.price_total,
  price: (a, b) => a.price_total - b.price_total || b.quality - a.quality,
  commute: (a, b) => a.commute_min - b.commute_min || a.price_total - b.price_total,
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
    const q = colorOf(r, "quality"), lv = riskOf(r).level;
    const rk = r.paid_service ? '<span class="rk alto">⚠ banca dati</span> · ' : RISK_RANK[lv] >= 2 ? `<span class="rk ${lv}">⚠ rischio ${lv}</span> · ` : "";
    return `<li data-uid="${esc(r.uid)}" class="${r.uid === state.selected ? "sel" : ""}">
      <span class="p">${eur(r.price_total)}</span>
      <span><div class="t">${r.kind === "bilocale" ? "Bilo · " : ""}${esc(r.zone || r.address || r.title)}${r.surface ? ` · ${r.surface} m²` : ""}</div>
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

function renderCard(r) {
  const q = colorOf(r, "quality"), pr = colorOf(r, "price"), cm = colorOf(r, "commute");
  const fav = state.favs.has(r.uid);
  const txt = c => (c.dark ? "color:#1c2330" : "");
  const fee = r.flags.spese_incluse ? "incluse" : r.condo_fee ? `+${r.condo_fee} €` : "n.d.";
  const metroLine = r.metro_station
    ? `Metro ${esc((r.metro_lines || []).join("/"))} <b>${esc(r.metro_station)}</b> a ${r.metro_walk_m} m a piedi · ~${r.metro_min} min in tutto`
    : "Nessuna stazione metro entro 1,3 km";
  const brk = r.quality_breakdown.map(b => `<div class="bar"><span>${esc(b.voce)}</span><div class="tr"><div class="fl" style="width:${Math.round(b.punti / b.max * 100)}%"></div></div><b>${b.punti}/${b.max}</b></div>`).join("");
  const warn = r.problems.length ? `<div class="box warn"><h3>Attenzione</h3><ul>${r.problems.map(p => `<li>${esc(p)}</li>`).join("")}</ul></div>` : "";
  const rs = riskOf(r);
  const risk = rs.signals.length ? `<div class="box risk-box ${esc(rs.level)}"><h3>Segnali di rischio · ${esc(rs.level)}</h3>
      <ul>${rs.signals.map(s => `<li><b>${esc(s.label)}.</b> ${esc(s.detail)}</li>`).join("")}</ul>
      <div class="note">Non pagare nulla (caparra, «quota», «blocco») prima di aver visto la casa, conosciuto il proprietario e firmato un contratto da registrare.</div></div>` : "";
  const riskBadge = RISK_RANK[rs.level] >= 1
    ? `<span class="badge" style="background:${RISK_COLOR[rs.level]}">${r.paid_service ? "Banca dati a pagamento" : `Rischio ${esc(rs.level)}`}</span>` : "";
  const links = r.sources.map((s, i) => `<a class="btn ${i ? "alt" : ""}" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.label)}${r.sources.length > 1 ? ` · ${eur(s.price)}` : ""} ↗</a>`).join("");
  const gmaps = `https://www.google.com/maps/dir/?api=1&origin=${r.lat},${r.lng}&destination=41.9029,12.5163&travelmode=transit`;
  $("card").innerHTML = `
    <div class="c-photo"><span>Foto non disponibile</span>${r.photo ? `<img src="${esc(safeUrl(r.photo))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
      <button class="c-fav ${fav ? "on" : ""}" id="favBtn" title="Preferito">${fav ? "★" : "☆"}</button>
      <button class="c-close" id="closeBtn" title="Chiudi (Esc)">✕</button></div>
    <div class="c-body">
      <div class="c-price"><span class="big">${eur(r.price)}</span><span class="sm">/mese · spese ${fee}</span></div>
      <div class="c-title">${esc(r.title || r.type)}</div>
      <div class="c-addr">${esc([r.address, r.zone].filter(Boolean).join(" · "))}${r.geo_precision === "zone" ? " <i>(posizione approssimata)</i>" : ""}</div>
      <div class="badges">
        <span class="badge" style="background:${q.color};${txt(q)}">Qualità ${r.quality}/100 · ${esc(r.quality_band)}</span>
        <span class="badge" style="background:${pr.color};${txt(pr)}">${esc(pr.label)}</span>
        <span class="badge" style="background:${cm.color};${txt(cm)}">~${r.commute_min} min</span>
        ${r.inside_gra ? "" : '<span class="badge" style="background:#6a7486">Fuori GRA</span>'}
        ${riskBadge}
      </div>
      <div class="grid">
        <div><span>Superficie</span>${r.surface ? r.surface + " m²" : "n.d."}${r.price_per_m2 ? ` · ${r.price_per_m2} €/m²` : ""}</div>
        <div><span>Piano</span>${esc(r.floor_text || "n.d.")}${r.elevator != null && !/ascensore/i.test(r.floor_text || "") ? ` · asc. ${tri(r.elevator)}` : ""}</div>
        <div><span>Stato</span>${esc(COND[r.condition] || "n.d.")}</div>
        <div><span>Arredato</span>${tri(r.furnished)}</div>
        <div><span>Aria condizionata</span>${tri(r.air_conditioning)}</div>
        <div><span>Balcone / terrazzo</span>${tri(r.outdoor)}</div>
        <div><span>Riscaldamento</span>${r.heating_autonomous == null ? "n.d." : r.heating_autonomous ? "Autonomo" : "Centralizzato"}</div>
        <div><span>Classe energetica</span>${esc(r.energy || "n.d.")}</div>
      </div>
      <div class="box"><h3>Verso la Sapienza (stima)</h3>
        <div>${metroLine}</div>
        <div class="note">A piedi ${r.walk_min} min · bus/altro ~${r.bus_min} min · distanza ${r.dist_sapienza_km} km. Migliore: <b>${esc(r.commute_mode)}</b>. Stima da modello, non un orario reale.</div>
      </div>
      ${risk}
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
  for (const id of ["onlyGra", "onlyMetro", "onlyPrecise", "onlyFav", "showProblems", "showPaid"]) $(id).addEventListener("change", () => refresh());
  $("sort").addEventListener("change", () => refresh());
  $("riskMax").addEventListener("change", () => refresh());
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
  $("reset").addEventListener("click", () => {
    $("priceMax").value = state.priceCap; $("qualityMin").value = 0; $("commuteMax").value = 120; $("surfaceMin").value = 0; $("search").value = "";
    for (const id of ["onlyMetro", "onlyPrecise", "onlyFav", "showProblems", "showPaid"]) $(id).checked = false;
    $("riskMax").value = "alto";
    $("onlyGra").checked = true; state.sources.clear(); state.lines.clear();
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
  $("toggleSidebar").addEventListener("click", () => setSidebar($("app").classList.contains("collapsed")));
  $("closeSidebar").addEventListener("click", () => setSidebar(false));
  $("backdrop").addEventListener("click", () => setSidebar(false));
  $("showMap").addEventListener("click", () => { setSidebar(false); fitFiltered(); });
  // la card a foglio si chiude trascinando verso il basso la parte alta (foto)
  let swipeY = null;
  $("card").addEventListener("touchstart", e => { swipeY = e.target.closest(".c-photo") ? e.touches[0].clientY : null; }, { passive: true });
  $("card").addEventListener("touchend", e => {
    if (swipeY !== null && e.changedTouches[0].clientY - swipeY > 70) closeCard();
    swipeY = null;
  }, { passive: true });
  // ruotando il telefono o ridimensionando: cassetto chiuso su schermi stretti, pannello aperto su schermi larghi
  mobileQuery.addEventListener("change", () => { setSidebar(!isMobile()); });
  if (isMobile()) setSidebar(false); // all'avvio su telefono si vede subito la mappa
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeCard(); });
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
  const [data, meta] = await loadData();
  state.data = data;
  // il tetto del filtro prezzo segue i dati (canone + spese può superare gli 800 € della ricerca)
  state.priceCap = Math.ceil(Math.max(800, ...data.map(r => r.price_total)) / 10) * 10;
  $("priceMax").max = state.priceCap;
  $("priceMax").value = state.priceCap;
  $("updated").textContent = meta.updated || "–";
  buildOverlays(meta);
  setupControls();
  renderLegend();
  refresh(true);
  const h = decodeURIComponent(location.hash.slice(1));
  if (h && state.data.some(r => r.uid === h)) select(h, true);
}
init().catch(err => { $("count").textContent = "errore di caricamento"; console.error(err); });
