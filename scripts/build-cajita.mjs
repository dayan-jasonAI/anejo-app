import { build } from "esbuild";
await build({
  entryPoints: ["src/cajita/builder.js"],
  bundle: true,
  minify: true,
  target: ["es2022"],
  format: "iife",
  outfile: "public/assets/js/cajita-builder.js",
  legalComments: "eof",
});
