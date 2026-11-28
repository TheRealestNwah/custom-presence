// Packages a build for a GitHub release (run `npm run build` first; `npm run package` does both):
//   dist/custom-presence.xpi              the Waterfox extension
//   dist/CustomPresence-<version>.zip     everything a user needs, plus install.txt
import { zipSync } from "fflate";
import { readdir, readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));

/** Every file under dir, keyed by its path relative to dir (forward slashes, as zips expect). */
async function filesIn(dir) {
  const out = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = `${entry.parentPath}/${entry.name}`.replaceAll("\\", "/");
    out[full.slice(dir.length + 1)] = await readFile(full);
  }
  return out;
}

const xpi = zipSync(await filesIn("dist/extension"));
await writeFile("dist/custom-presence.xpi", xpi);

// Notepad-friendly line endings, with the version filled in.
const install = (await readFile("scripts/install.txt", "utf8")).replaceAll("{{version}}", pkg.version).replace(/\r?\n/g, "\r\n");

const helper = await filesIn("dist/helper");
const zip = zipSync({
  "install.txt": Buffer.from(install),
  "CustomPresence.plugin.js": await readFile("dist/CustomPresence.plugin.js"),
  "custom-presence.xpi": xpi,
  ...Object.fromEntries(Object.entries(helper).map(([name, data]) => [`helper/${name}`, data])),
});
const name = `dist/CustomPresence-${pkg.version}.zip`;
await writeFile(name, zip);
console.log(`wrote dist/custom-presence.xpi and ${name}`);
