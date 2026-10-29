/* Boots the page: loads the precomputed data and starts each chapter when it comes near the screen. */
import { initThemeToggle, whenNear } from "./ui.js?v=20261029a";
import * as learn from "./ch1-learn.js?v=20261029a";
import * as crowd from "./ch2-crowd.js?v=20261029a";
import * as sleep from "./ch3-sleep.js?v=20261029a";
import * as letters from "./ch4-letters.js?v=20261029a";
import * as senses from "./ch5-senses.js?v=20261029a";
import * as data from "./ch6-data.js?v=20261029a";

initThemeToggle(document.getElementById("theme-toggle"));

const json = fetch(new URL("../data/dreaming.json?v=20261029a", import.meta.url)).then(r => r.json());

const chapters = { learn, crowd, sleep, letters, senses, data };
for (const [id, mod] of Object.entries(chapters)) {
    const el = document.getElementById(id);
    whenNear(el, async () => {
        try { mod.init(el, await json); }
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
