/* Boots the page: loads the precomputed spectra and starts each chapter when it comes near the screen. */
import { initThemeToggle, whenNear } from "./ui.js?v=20261029a";
import * as grow from "./ch1-grow.js?v=20261029a";
import * as listen from "./ch2-listen.js?v=20261029a";
import * as trapped from "./ch3-trapped.js?v=20261029a";
import * as zoom from "./ch4-zoom.js?v=20261029a";
import * as ladder from "./ch5-ladder.js?v=20261029a";
import * as shadows from "./ch6-shadows.js?v=20261029a";
import * as butterfly from "./epilogue.js?v=20261029a";

initThemeToggle(document.getElementById("theme-toggle"));

const data = fetch(new URL("../data/spectrum.json?v=20261029a", import.meta.url)).then(r => r.json());

const chapters = { grow, listen, trapped, zoom, ladder, shadows, butterfly };
for (const [id, mod] of Object.entries(chapters)) {
    const el = document.getElementById(id);
    whenNear(el, async () => {
        try { mod.init(el, await data); }
        catch (err) { console.error(`chapter ${id}:`, err); }
    });
}

// highlight the chapter being read in the top bar
const links = new Map([...document.querySelectorAll(".topbar nav a")].map(a => [a.hash.slice(1), a]));
const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {
        links.forEach(a => a.classList.remove("active"));
        links.get(e.target.id)?.classList.add("active");
    }
}, { rootMargin: "-45% 0px -50% 0px" });
Object.keys(chapters).forEach(id => io.observe(document.getElementById(id)));
io.observe(document.querySelector(".hero"));
