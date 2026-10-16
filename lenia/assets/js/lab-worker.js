/* lab-worker.js — runs one experiment off the main thread and reports progress.
 * Jobs: kramers (lab.js), fd, rheo, edges, prepare (experiments.js). */
"use strict";
importScripts("core.js", "lab.js", "experiments.js");

let job = null, kind = null, timer = null, lastThumb = 0;

function make(k, p) {
  const X = self.Experiments;
  if (k === "kramers") return new self.KramersRun(p);
  if (k === "fd") return new X.FDRun(p);
  if (k === "rheo") return new X.RheoRun(p);
  if (k === "edges") {
    if (!p.base) p.base = X.prepareOrbium(p.N, p.R, p.cells);
    return new X.EdgeRun(p);
  }
  if (k === "prepare") {
    // a one-shot job: the protocol Orbium prepared at R on N = even(8R)
    return { done: false, run() { this.A = X.prepareOrbium(p.N, p.R, p.cells); this.done = true; return true; },
             summary() { return { done: this.done, A: this.A }; } };
  }
  throw new Error("unknown job " + k);
}

function loop() {
  if (!job) return;
  const done = job.run(60);
  const now = Date.now(), msg = { type: "progress", kind, summary: job.summary() };
  if (kind === "kramers" && (done || now - lastThumb > 300)) {
    msg.thumbs = job.thumbs();
    lastThumb = now;
    self.postMessage(msg, [msg.thumbs.buffer]);
  } else self.postMessage(msg);
  if (done) { self.postMessage({ type: "done", kind, summary: job.summary() }); job = null; return; }
  timer = setTimeout(loop, 0);
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.cmd === "start") {
    clearTimeout(timer);
    kind = m.job || "kramers";
    try {
      job = make(kind, m.params);
      self.postMessage(kind === "kramers" ? { type: "started", kind, ref: job.ref, A0: job.A0 } : { type: "started", kind });
      lastThumb = 0;
      loop();
    } catch (err) {
      job = null;
      self.postMessage({ type: "error", kind, message: String(err.message || err) });
    }
  } else if (m.cmd === "stop") {
    clearTimeout(timer);
    if (job) self.postMessage({ type: "done", kind, summary: job.summary(), stopped: true });
    job = null;
  }
};
