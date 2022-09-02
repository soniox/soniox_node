#!/usr/bin/env node

const esbuild = require("esbuild");

// Automatically exclude all node_modules from the bundled version
const { nodeExternalsPlugin } = require("esbuild-node-externals");
const { Generator } = require("npm-dts");

const isDevelopmentEnv = process.env.NODE_ENV === "development";

new Generator({
  entry: "src/speech_client.ts",
  output: "dist/index.d.ts",
}).generate();

const config = {
  entryPoints: ["./src/speech_client.ts"],
  outfile: "./dist/index.js",
  platform: "node",
  target: "node14",
  bundle: true,
  minify: true,
  sourcemap: true,
  plugins: [nodeExternalsPlugin()],
};

if (isDevelopmentEnv) {
  config.watch = {
    onRebuild(error) {
      error
        ? console.error("Rebuild failed:", error)
        : console.log(`${new Date().toLocaleTimeString()}: Rebuild success.`);
    },
  };
}

esbuild
  .build(config)
  .then((result) => {
    if (isDevelopmentEnv) {
      console.log("Watching files for changes...");
    }
  })
  .catch(() => process.exit(1));
