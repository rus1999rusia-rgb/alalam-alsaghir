import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const source = new URL("../dist/", import.meta.url);
const output = new URL("../docs/", import.meta.url);
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] || "alalam-alsaghir";
const base = repository.endsWith(".github.io") ? "/" : `/${repository}/`;
const pages = new Set(["math-lab", "research", "school-trip", "reading", "stars", "class", "submit", "admin"]);
const assets = new Set(["styles.css", "kids-learning.svg", "common.js", "home.js", "section.js", "class.js", "submit.js", "stars.js", "admin.js"]);

function rewrite(content) {
  return content
    .replace(/href="\/"/g, `href="${base}"`)
    .replace(/(["'`])\/([\w.-]+)(?=\?|["'`])/g, (match, quote, name) => {
      if (pages.has(name)) return `${quote}${base}${name}/`;
      if (assets.has(name)) return `${quote}${base}${name}`;
      return match;
    });
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of await readdir(source)) {
  if (name === "vercel.json") continue;
  if (name.endsWith(".html")) {
    const route = name.slice(0, -5);
    const destination = route === "index" ? output : new URL(`${route}/`, output);
    await mkdir(destination, { recursive: true });
    await writeFile(new URL("index.html", destination), rewrite(await readFile(new URL(name, source), "utf8")));
  } else if (name.endsWith(".js")) {
    await writeFile(new URL(name, output), rewrite(await readFile(new URL(name, source), "utf8")));
  } else {
    await cp(new URL(name, source), new URL(name, output), { recursive: true });
  }
}
await writeFile(new URL(".nojekyll", output), "");
console.log(`Built GitHub Pages site at ${join(output.pathname)} with base ${base}`);
