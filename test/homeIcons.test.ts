/**
 * THE HOME-SCREEN TILES. Rob's handout names the two pages PICKS and SCORES,
 * so those exact words must be under the tiles, on iPhone and Android alike,
 * and each page must point at a picture that is really there at the size it
 * claims. A missing icon is silent: the phone just draws a gray letter.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL("../" + f, import.meta.url));

/** Width and height out of a PNG's own header. */
function pngSize(f: string): [number, number] {
  const b = read(f);
  assert.equal(b.toString("latin1", 1, 4), "PNG", f + " is not a PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

for (const [page, label, manifest, icon] of [
  ["picks.html", "PICKS", "picks.webmanifest", "icon-picks"],
  ["score.html", "SCORES", "score.webmanifest", "icon-scores"],
]) {
  test(page + " is " + label + " on the home screen", () => {
    const html = read(page).toString();
    assert.match(html, new RegExp('<meta name="apple-mobile-web-app-title" content="' + label + '">'));
    assert.equal((html.match(/apple-mobile-web-app-title/g) || []).length, 1, "one label, not two");
    assert.match(html, new RegExp('<link rel="apple-touch-icon" sizes="180x180" href="' + icon + '-180.png">'));
    assert.match(html, new RegExp('<link rel="manifest" href="' + manifest + '">'));
    assert.deepEqual(pngSize(icon + "-180.png"), [180, 180]);

    const m = JSON.parse(read(manifest).toString());
    assert.equal(m.short_name, label);
    assert.equal(m.start_url, page);
    for (const i of m.icons) {
      const [w, h] = pngSize(i.src);
      assert.equal(i.sizes, w + "x" + h, i.src);
    }
    assert.ok(m.icons.some((i: any) => i.sizes === "192x192"), "Android wants 192");
    assert.ok(m.icons.some((i: any) => i.sizes === "512x512"), "Android wants 512");
  });
}

test("the two tiles are not the same picture", () => {
  assert.notDeepEqual(read("icon-picks-180.png"), read("icon-scores-180.png"));
});
