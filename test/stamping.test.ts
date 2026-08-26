/**
 * The build id, stamped into every asset URL.
 *
 * WHY. The pages load their code with plain `<script src="engine.js">` and
 * `<link href="clubhouse.css">`. A browser caches those on their own schedule,
 * separately from the HTML — so a phone can hold NEW HTML against OLD
 * JAVASCRIPT.
 *
 * THAT IS WORSE THAN A STALE BUILD, BECAUSE IT FAILS SILENTLY. It happened
 * twice in one afternoon on 25 August. The second time, new HTML destructured
 * `bySurname` out of a cached display.js that did not have it yet; the binding
 * was `undefined`, `.sort(undefined)` is a no-op rather than an error, and a
 * list of forty men simply rendered in the wrong order with nothing in the
 * console and nothing on the screen to say so.
 *
 * Stamping makes each build's assets a different URL, so once the new HTML
 * lands nothing it references can come from an old cache. The HTML carries no
 * stamp: it is the thing that revalidates.
 *
 * A QUERY ON A file:// URL IS IGNORED and the file still loads, so a
 * double-clicked page keeps working. Verified in Chrome — script and
 * stylesheet both load from file:// with ?v= on them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const read = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGES = ["leaderboard.html", "picks.html", "results.html"];
const HOOK = read(".githooks/pre-commit");

/** Every local .js/.css reference on a page, with whatever query it carries. */
function assets(html: string) {
  return [...html.matchAll(/(?:src|href)="([A-Za-z0-9_.-]+\.(?:js|css))(\?v=[0-9a-f]+)?"/g)]
    .map((m) => ({ file: m[1], stamp: m[2] || null }));
}

test("every asset every page loads carries a stamp", () => {
  for (const page of PAGES) {
    const found = assets(read(page));
    assert.ok(found.length > 0, page + " loads nothing?");
    const bare = found.filter((a) => !a.stamp);
    assert.deepEqual(bare, [], page + " has unstamped assets: " + JSON.stringify(bare));
  }
});

test("one build id across all three pages", () => {
  const stamps = new Set(PAGES.flatMap((p) => assets(read(p)).map((a) => a.stamp)));
  assert.equal(stamps.size, 1, "pages disagree about the build: " + [...stamps].join(", "));
});

test("the stamp is the build version.js reports", () => {
  const stamp = assets(read("leaderboard.html"))[0].stamp!.replace("?v=", "");
  const version = read("version.js");
  assert.match(version, new RegExp('build: "' + stamp + '"'),
    "the URL says " + stamp + " and version.js says something else");
});

/* ---- the two rules that make the id mean anything ---- */

test("EVERY STAMPED FILE IS FINGERPRINTED", () => {
  /* A file that can be stamped but is not fingerprinted is the original bug
     wearing a hat: change it and the build id — and therefore its URL — does
     not move, so the browser goes on serving the old copy. display.js,
     clubhouse.css, exporter.js, results.js, fieldlink.js and boardimage.js
     were all missing from the old list, and display.js is the one that bit. */
  const stamped = new Set(PAGES.flatMap((p) => assets(read(p)).map((a) => a.file)));
  const app = HOOK.slice(HOOK.indexOf("APP="), HOOK.indexOf("BUILD="));
  for (const file of stamped) {
    if (file === "version.js") continue;      // holds the answer; cannot help compute it
    assert.ok(app.includes(file), file + " is stamped but not fingerprinted");
  }
});

test("version.js is stamped but NOT fingerprinted", () => {
  // It holds the answer, so it cannot be part of the question.
  const app = HOOK.slice(HOOK.indexOf("APP="), HOOK.indexOf("BUILD="));
  assert.equal(app.includes("version.js"), false);
  assert.ok(assets(read("leaderboard.html")).some((a) => a.file === "version.js" && a.stamp));
});

test("THE STAMPS ARE STRIPPED BEFORE HASHING", () => {
  // Otherwise the stamp is part of what is hashed, so every commit produces a
  // new id even when nothing about the app changed — and the id stops meaning
  // "the app moved".
  assert.match(HOOK, /sed -E 's\/\\\?v=\[0-9a-f\]\+\/\/g' \| git hash-object --stdin/);
});

test("the build id does not drift when nothing changes", () => {
  // The hook's own arithmetic, run twice over the index. Same input, same id —
  // which is only true because the stamps come out before the hash goes in.
  const build = () => execFileSync("sh", ["-c", `
    APP="engine.js importer.js exporter.js results.js fieldlink.js boardimage.js
         display.js clubhouse.css leaderboard.html picks.html results.html index.html"
    { for f in $APP; do git show ":$f" 2>/dev/null || true; done
      for f in $(git ls-files 'src/*.ts'); do git show ":$f" 2>/dev/null || true; done
    } | sed -E 's/\\?v=[0-9a-f]+//g' | git hash-object --stdin | cut -c1-7`],
    { cwd: new URL("../", import.meta.url).pathname, encoding: "utf8" }).trim();
  assert.equal(build(), build());
  assert.match(build(), /^[0-9a-f]{7}$/);
});

/* ---- and it must not have broken anything ---- */

test("only .js and .css are stamped — a link to another page is left alone", () => {
  const html = read("picks.html");
  assert.match(html, /href="index\.html"/, "no stamp on a page link");
  assert.match(html, /href="leaderboard\.html"/);
});

test("nothing with a scheme on it is touched", () => {
  for (const page of PAGES) {
    const html = read(page);
    // Only bare filenames are stamped, so an absolute URL cannot pick one up.
    assert.equal(/https?:\/\/[^"]*\?v=[0-9a-f]+/.test(html), false, page);
  }
});

test("the shared view still loads exactly what it did", () => {
  const html = read("results.html");
  const files = assets(html).map((a) => a.file).sort();
  assert.deepEqual(files, ["clubhouse.css", "display.js", "results.js"],
    "results.html is read-only by construction — no engine, no importer, no exporter");
});
