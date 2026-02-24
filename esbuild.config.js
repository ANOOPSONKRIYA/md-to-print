/**
 * esbuild configuration — bundles CodeMirror 6 + renderer JS into one file.
 *
 * Usage: node esbuild.config.js
 */
const esbuild = require("esbuild");
const path = require("path");

const isWatch = process.argv.includes("--watch");

async function build() {
  const ctx = await esbuild.context({
    entryPoints: [path.join(__dirname, "src", "renderer", "app.js")],
    bundle: true,
    outfile: path.join(__dirname, "src", "renderer", "dist", "bundle.js"),
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    sourcemap: true,
    minify: !isWatch,
    logLevel: "info",
  });

  if (isWatch) {
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
