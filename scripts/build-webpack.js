/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Build every webpack config in its own child process.
 *
 * Why this exists: `webpack.config.js` exports an array of seven configs
 * (extension + six webviews). Webpack's MultiCompiler keeps *every* config's
 * compilation — module graphs, emitted assets and (in production) their
 * `hidden-source-map` files — resident in memory until the whole array
 * finishes. Since the `agentChat` webview now bundles `@datalayer/agent-runtimes`
 * (a ~16 MiB tree pulling in excalidraw, jupyter-react, the AI SDKs, mcp-ui,
 * etc.), the combined peak blew past the Node heap and OOM'd even at
 * `--max-old-space-size=12288`.
 *
 * Running each config as a separate `webpack --config-name <name>` process
 * means the OS reclaims all memory between configs, so peak usage is bounded
 * by the single largest bundle instead of the sum of all seven.
 *
 * Any CLI flags passed to this script (e.g. `--mode production
 * --devtool hidden-source-map`) are forwarded to every webpack invocation.
 */

"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

// Config names must match the `name` field of each config in webpack.config.js.
// Order matters only for readable logs; each build is independent.
const CONFIG_NAMES = [
  "extension",
  "webview",
  "lexical",
  "showcase",
  "datasource",
  "datasource-edit",
  "agentChat",
];

// Per-process heap. Building one config at a time means peak memory is bounded
// by the single largest bundle (currently the extension + agentChat, which pull
// in `@datalayer/core` / `@datalayer/agent-runtimes`). 12 GiB gives comfortable
// headroom for those while staying well under typical dev-machine RAM. Override
// via WEBPACK_HEAP_MB if a future bundle needs more.
const HEAP_MB = process.env.WEBPACK_HEAP_MB || "12288";

const passthroughArgs = process.argv.slice(2);

// Resolve the webpack-cli entry via Node's resolver so this works regardless
// of where node_modules is hoisted (monorepo root vs. local). We run it with
// `node` directly so the `--max-old-space-size` flag in NODE_OPTIONS applies.
const webpackCli = require.resolve("webpack-cli/bin/cli.js");

for (const name of CONFIG_NAMES) {
  const args = [webpackCli, "--config-name", name, ...passthroughArgs];
  console.log(`\n\u25b6 webpack --config-name ${name} ${passthroughArgs.join(" ")}\n`);

  // Strip any inherited `--max-old-space-size` (the dev shell commonly exports
  // one, e.g. 8192) so our per-process heap wins — otherwise the inherited
  // value, appearing later on the V8 command line, would take precedence.
  const inheritedOptions = (process.env.NODE_OPTIONS || "")
    .replace(/--max-old-space-size=\d+/g, "")
    .trim();
  const nodeOptions =
    `--max-old-space-size=${HEAP_MB} ${inheritedOptions}`.trim();

  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
    },
  });

  if (result.status !== 0) {
    const reason =
      result.signal != null ? `signal ${result.signal}` : `exit ${result.status}`;
    console.error(`\n\u2716 webpack config "${name}" failed (${reason}).`);
    process.exit(result.status || 1);
  }
}

console.log("\n\u2714 All webpack configs built successfully.");
