// Builds the three pieces into dist/:
//   dist/CustomPresence.plugin.js  BetterDiscord plugin (copy into BD's plugins folder)
//   dist/extension/                Waterfox extension (load or zip as an .xpi)
//   dist/helper/                   local helper + installer
import { build } from "esbuild";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";

const pkg = JSON.parse(await readFile("package.json", "utf8"));

const banner = `/**
 * @name CustomPresence
 * @author TheRealestNwah
 * @description Show any program as a game, plus YouTube, Twitch, Plex and Plexamp activity. Each one toggleable.
 * @version ${pkg.version}
 * @source https://github.com/TheRealestNwah/custom-presence
 * @website https://github.com/TheRealestNwah/custom-presence
 */`;

await rm("dist", { recursive: true, force: true });

const common = { bundle: true, target: "es2022", logLevel: "info", legalComments: "none" };

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/plugin/index.ts"],
    outfile: "dist/CustomPresence.plugin.js",
    format: "cjs",
    platform: "browser",
    banner: { js: banner },
    footer: { js: "module.exports = module.exports.default;" },
  }),
  build({
    ...common,
    entryPoints: ["src/extension/background.ts", "src/extension/content.ts"],
    outdir: "dist/extension",
    format: "iife",
    platform: "browser",
  }),
  build({
    ...common,
    entryPoints: ["src/helper/main.ts"],
    outfile: "dist/helper/helper.cjs",
    format: "cjs",
    platform: "node",
    target: "node20",
  }),
]);

await mkdir("dist/extension", { recursive: true });
await copyFile("src/extension/manifest.json", "dist/extension/manifest.json");
await copyFile("src/helper/install.ps1", "dist/helper/install.ps1");
