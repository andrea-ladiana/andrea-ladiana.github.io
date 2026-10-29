/* Boots the page: loads the small data file and starts each chapter when it comes near the screen. */
import { initThemeToggle, whenNear } from "./ui.js?v=20261029a";
import * as pairs from "./ch1-pairs.js?v=20261029a";
import * as capacity from "./ch2-capacity.js?v=20261029a";
import * as basins from "./ch3-basins.js?v=20261029a";
import * as fn from "./ch4-function.js?v=20261029a";
import * as receptors from "./ch5-receptors.js?v=20261029a";
import * as language from "./ch6-language.js?v=20261029a";

initThemeToggle(document.getElementById("theme-toggle"));

const json = fetch(new URL("../data/exponential.json?v=20261029a", import.meta.url)).then(r => r.json());

const chapters = { pairs, capacity, basins, function: fn, receptors, language };
for (const [id, mod] of Object.entries(chapters)) {
    const el = document.getElementById(id);
    whenNear(el, async () => {
        try { await mod.init(el, await json); }
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
