/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

//@ts-check

"use strict";

const path = require("path");
const webpack = require("webpack");
const miniSVGDataURI = require("mini-svg-data-uri");
const CopyPlugin = require("copy-webpack-plugin");

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

/** @type WebpackConfig */
const extensionConfig = {
  target: "node", // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
  mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  entry: "./src/preload.ts", // CHANGED: Use preload.ts to force os module loading BEFORE any other code, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    os: "commonjs os", // Node.js built-in - must be external to ensure require cache works correctly
    zeromq: "commonjs zeromq", // zeromq has native bindings that must be excluded from webpack
    zeromqold: "commonjs zeromqold", // zeromqold (fallback) also has native bindings
    "cmake-ts": "commonjs cmake-ts", // required by zeromq for loading native modules
    "prebuild-install": "commonjs prebuild-install", // used by native modules, has os.platform() calls
    ws: "commonjs ws", // WebSocket library with optional native bindings (bufferUtil), pulls in prebuild-install
    bufferutil: "commonjs bufferutil", // Optional native module for ws
    "utf-8-validate": "commonjs utf-8-validate", // Optional native module for ws
    pyodide: "commonjs pyodide", // pyodide package is HUGE (~10MB+ WASM), must be external to avoid heap overflow during webpack bundling
    keytar: "commonjs keytar", // keytar has native bindings for OS keyring access - rebuilt for Electron
    // React packages must be EXTERNAL - they should NOT run in Node.js extension context
    // React code with hooks causes "Invalid hook call" warnings when bundled into extension.js
    react: "commonjs react",
    "react-dom": "commonjs react-dom",
    "@primer/react": "commonjs @primer/react", // Has CSS imports that fail in Node.js 22
    // @datalayer packages are BUNDLED (not external) so webpack can handle their React dependencies
    // When webpack encounters React imports in these packages, it externalizes them (because React is external above)
    // This prevents Node.js from trying to load packages with CSS imports at runtime
    "@jupyterlab/application": "commonjs @jupyterlab/application",
    "@jupyterlab/notebook": "commonjs @jupyterlab/notebook",
    "@jupyterlab/cells": "commonjs @jupyterlab/cells",
    "@jupyterlab/completer": "commonjs @jupyterlab/completer",
    "@lexical/react": "commonjs @lexical/react",
    lexical: "commonjs lexical",
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: "null-loader", // Ignore CSS imports in extension context (Node.js 22 can't load CSS)
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf|svg|png|jpg|jpeg|gif)$/,
        type: "asset/resource", // Handle font/image assets
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        test: /\.(c|m)?js/,
        resolve: {
          fullySpecified: false,
        },
      },
      // Ignore CSS files in extension bundle since they're not needed in Node.js context
      {
        test: /\.css$/,
        use: "null-loader",
      },
      // Handle other assets that might be imported
      {
        test: /\.(png|jpg|jpeg|gif|svg|woff|woff2|eot|ttf|otf)$/,
        use: "null-loader",
      },
      // Ignore Python wheel files (not needed in Node.js extension context)
      {
        test: /\.whl$/,
        use: "null-loader",
      },
      // Ignore WASM files (not needed in Node.js extension context)
      {
        test: /\.wasm$/,
        use: "null-loader",
      },
      // Python file loader (for Pyodide kernel in native notebooks)
      {
        test: /pyodide_kernel\.py$/,
        type: "asset/source",
      },
    ],
  },
  devtool: "nosources-source-map",
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

const webviewConfig = {
  target: "web",
  mode: "production", // Enable webpack production optimizations
  // Use inline source map to ease debug of webview
  // Xref. https://github.com/microsoft/vscode/issues/145292#issuecomment-1072879043
  devtool: "inline-source-map",
  entry: "./webview/notebook/main.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "webview.js",
  },
  optimization: {
    // Disable code splitting to avoid RuntimeIdRuntimeModule conflicts with WASM
    splitChunks: false,
    runtimeChunk: false,
  },
  // Suppress warnings from external dependencies
  ignoreWarnings: [
    {
      module: /node_modules\/@jupyterlite\/pyodide-kernel/,
      message:
        /Critical dependency: the request of a dependency is an expression/,
    },
  ],
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".svg"],
    symlinks: true,
    fallback: {
      process: require.resolve("process/browser"),
      stream: false,
      buffer: require.resolve("buffer/"),
      assert: false,
    },
    // Deduplicate CodeMirror modules to prevent multiple instances
    alias: {
      // Force all React imports to use the same instance
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "@codemirror/state": path.resolve(
        __dirname,
        "./node_modules/@codemirror/state",
      ),
      "@codemirror/view": path.resolve(
        __dirname,
        "./node_modules/@codemirror/view",
      ),
      "@codemirror/language": path.resolve(
        __dirname,
        "./node_modules/@codemirror/language",
      ),
      "@codemirror/commands": path.resolve(
        __dirname,
        "./node_modules/@codemirror/commands",
      ),
      "@codemirror/search": path.resolve(
        __dirname,
        "./node_modules/@codemirror/search",
      ),
      "@codemirror/autocomplete": path.resolve(
        __dirname,
        "./node_modules/@codemirror/autocomplete",
      ),
      "@codemirror/lint": path.resolve(
        __dirname,
        "./node_modules/@codemirror/lint",
      ),
      // Also deduplicate yjs to prevent synchronization issues
      yjs: path.resolve(__dirname, "./node_modules/yjs"),
      "y-protocols": path.resolve(__dirname, "./node_modules/y-protocols"),
      "y-websocket": path.resolve(__dirname, "./node_modules/y-websocket"),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "tsconfig.webview.json"),
            experimentalWatchApi: true,
            // transpileOnly enables hot-module-replacement
            transpileOnly: true,
          },
        },
      },
      { test: /\.raw\.css$/, type: "asset/source" },
      {
        test: /(?<!\.raw)\.css$/,
        use: [require.resolve("style-loader"), require.resolve("css-loader")],
      },
      {
        test: /\.(jpe?g|png|gif|ico|eot|ttf|map|woff2?)(\?v=\d+\.\d+\.\d+)?$/i,
        type: "asset/resource",
      },
      {
        // In .css files, svg is loaded as a data URI.
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        issuer: /\.css$/,
        type: "asset",
        generator: {
          dataUrl: (content) => miniSVGDataURI(content.toString()),
        },
      },
      {
        // In .ts and .tsx files (both of which compile to .js), svg files
        // must be loaded as a raw string instead of data URIs.
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        issuer: /\.js$/,
        type: "asset/source",
      },
      {
        test: /\.(c|m)?js/,
        resolve: {
          fullySpecified: false,
        },
      },
      // Ship the JupyterLite service worker.
      {
        resourceQuery: /text/,
        type: "asset/resource",
        generator: {
          filename: "[name][ext]",
        },
      },
      // Python file loader (for Pyodide kernel)
      {
        test: /pyodide_kernel\.py$/,
        type: "asset/source",
      },
      // Worker JavaScript loader (for Pyodide worker)
      {
        test: /pyodideWorker\.worker\.js$/,
        type: "asset/source",
      },
      // Rule for pyodide kernel wheel files
      {
        test: /\.whl$/,
        type: "asset/resource",
        generator: {
          filename: "pypi/[name][ext]",
        },
      },
      // Rule for other pyodide kernel resources
      {
        test: /pypi\/.*/,
        type: "asset/resource",
        generator: {
          filename: "pypi/[name][ext][query]",
        },
      },
      {
        test: /pyodide-kernel-extension\/schema\/.*/,
        type: "asset/resource",
        generator: {
          filename: "schema/[name][ext][query]",
        },
      },
    ],
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
    new CopyPlugin({
      patterns: [
        {
          from: "node_modules/@vscode/codicons/dist/codicon.css",
          to: "codicon.css",
        },
        {
          from: "node_modules/@vscode/codicons/dist/codicon.ttf",
          to: "codicon.ttf",
        },
        {
          from: "webview/styles/vscode-completion-theme.css",
          to: "vscode-completion-theme.css",
        },
      ],
    }),
  ],
};

// Config for Lexical editor webview
const lexicalWebviewConfig = {
  ...webviewConfig,
  entry: {
    main: "./webview/lexical/main.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: (pathData) => {
      return pathData.chunk.name === "main"
        ? "lexicalWebview.js"
        : "[name].lexical.js";
    },
    chunkFilename: "[name].lexical.chunk.js",
    // This will be overridden at runtime by __webpack_public_path__
    publicPath: "auto",
    webassemblyModuleFilename: "[hash].module.wasm",
  },
  experiments: {
    asyncWebAssembly: true,
  },
  optimization: {
    // WASM async loading (loro-crdt) requires runtime chunk
    // Creates lexical-runtime.js that must load BEFORE main bundle
    runtimeChunk: {
      name: "lexical-runtime",
    },
    splitChunks: false,
  },
  // Suppress warnings from external dependencies (inherited from webviewConfig)
  ignoreWarnings: [
    {
      module: /node_modules\/@jupyterlite\/pyodide-kernel/,
      message:
        /Critical dependency: the request of a dependency is an expression/,
    },
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "tsconfig.webview.json"),
            experimentalWatchApi: true,
            transpileOnly: true,
          },
        },
      },
      { test: /\.raw\.css$/, type: "asset/source" },
      {
        test: /(?<!\.raw)\.css$/,
        use: [require.resolve("style-loader"), require.resolve("css-loader")],
      },
      {
        test: /\.(jpe?g|png|gif|ico|eot|ttf|map|woff2?)(\?v=\d+\.\d+\.\d+)?$/i,
        type: "asset/resource",
      },
      {
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        issuer: /\.css$/,
        type: "asset",
        generator: {
          dataUrl: (content) => miniSVGDataURI(content.toString()),
        },
      },
      {
        test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
        issuer: /\.js$/,
        type: "asset/source",
      },
      {
        test: /\.(c|m)?js/,
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.wasm$/,
        type: "webassembly/async",
      },
      // Python file loader (for Pyodide kernel)
      {
        test: /pyodide_kernel\.py$/,
        type: "asset/source",
      },
      // Worker JavaScript loader (for Pyodide worker)
      {
        test: /pyodideWorker\.worker\.js$/,
        type: "asset/source",
      },
      // Rule for pyodide kernel wheel files
      {
        test: /\.whl$/,
        type: "asset/resource",
        generator: {
          filename: "pypi/[name][ext]",
        },
      },
      // Rule for other pyodide kernel resources
      {
        test: /pypi\/.*/,
        type: "asset/resource",
        generator: {
          filename: "pypi/[name][ext][query]",
        },
      },
      {
        test: /pyodide-kernel-extension\/schema\/.*/,
        type: "asset/resource",
        generator: {
          filename: "schema/[name][ext][query]",
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".svg", ".wasm"],
    symlinks: true,
    fallback: {
      process: require.resolve("process/browser"),
      stream: false,
      buffer: require.resolve("buffer/"),
      assert: false,
    },
    // Deduplicate CodeMirror modules to prevent multiple instances
    alias: {
      // Force all React imports to use the same instance
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      "@codemirror/state": path.resolve(
        __dirname,
        "./node_modules/@codemirror/state",
      ),
      "@codemirror/view": path.resolve(
        __dirname,
        "./node_modules/@codemirror/view",
      ),
      "@codemirror/language": path.resolve(
        __dirname,
        "./node_modules/@codemirror/language",
      ),
      "@codemirror/commands": path.resolve(
        __dirname,
        "./node_modules/@codemirror/commands",
      ),
      "@codemirror/search": path.resolve(
        __dirname,
        "./node_modules/@codemirror/search",
      ),
      "@codemirror/autocomplete": path.resolve(
        __dirname,
        "./node_modules/@codemirror/autocomplete",
      ),
      "@codemirror/lint": path.resolve(
        __dirname,
        "./node_modules/@codemirror/lint",
      ),
      // Also deduplicate yjs to prevent synchronization issues
      yjs: path.resolve(__dirname, "./node_modules/yjs"),
      "y-protocols": path.resolve(__dirname, "./node_modules/y-protocols"),
      "y-websocket": path.resolve(__dirname, "./node_modules/y-websocket"),
    },
  },
  plugins: [...webviewConfig.plugins],
};

// Config for Primer Showcase webview
const showcaseWebviewConfig = {
  target: "web",
  mode: "none",
  devtool: "inline-source-map",
  entry: "./webview/showcase/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "showcase.js",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    symlinks: true,
    fallback: {
      process: require.resolve("process/browser"),
      buffer: require.resolve("buffer/"),
    },
    alias: {
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "tsconfig.webview.json"),
            experimentalWatchApi: true,
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: [require.resolve("style-loader"), require.resolve("css-loader")],
      },
      {
        test: /\.(c|m)?js/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
};

// Config for ag-ui example webview
const aguiExampleConfig = {
  target: "web",
  mode: "none",
  devtool: "inline-source-map",
  entry: "./webview/datalayer-core/AgUIExample.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "aguiExample.js",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    symlinks: true,
    fallback: {
      process: require.resolve("process/browser"),
      buffer: require.resolve("buffer/"),
      stream: false,
    },
    alias: {
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
  ignoreWarnings: [
    {
      module: /node_modules\/@jupyterlite\/pyodide-kernel/,
      message:
        /Critical dependency: the request of a dependency is an expression/,
    },
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "tsconfig.webview.json"),
            experimentalWatchApi: true,
            transpileOnly: true,
          },
        },
      },
      { test: /\.raw\.css$/, type: "asset/source" },
      {
        test: /(?<!\.raw)\.css$/,
        use: [require.resolve("style-loader"), require.resolve("css-loader")],
      },
      {
        test: /\.svg/,
        type: "asset/inline",
        generator: {
          dataUrl: (content) => miniSVGDataURI(content.toString()),
        },
      },
      {
        test: /\.(png|jpg|jpeg|gif|woff|woff2|eot|ttf|otf)$/,
        type: "asset/resource",
      },
      {
        test: /\.(c|m)?js/,
        resolve: {
          fullySpecified: false,
        },
      },
      // Rule for pyodide kernel wheel files
      {
        test: /\.whl$/,
        type: "asset/resource",
        generator: {
          filename: "pypi/[name][ext]",
        },
      },
      // Rule for other pyodide kernel resources
      {
        test: /pypi\/.*/,
        type: "asset/resource",
        generator: {
          filename: "pypi/[name][ext][query]",
        },
      },
      {
        test: /pyodide-kernel-extension\/schema\/.*/,
        type: "asset/resource",
        generator: {
          filename: "schema/[name][ext][query]",
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
};

// Config for Datasource Dialog webview
const datasourceDialogConfig = {
  target: "web",
  mode: "production", // Enable webpack production optimizations
  devtool: "inline-source-map",
  entry: "./webview/datasource/main.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "datasourceDialog.js",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".svg"],
    symlinks: true,
    fallback: {
      process: require.resolve("process/browser"),
      buffer: require.resolve("buffer/"),
      stream: require.resolve("stream-browserify"),
      // Disable node modules not needed in browser
      fs: false,
      path: false,
      crypto: false,
    },
    alias: {
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      // Stub out react-router-dom since we don't use navigation in webview
      "react-router-dom": false,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "tsconfig.webview.json"),
            experimentalWatchApi: true,
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: [require.resolve("style-loader"), require.resolve("css-loader")],
      },
      {
        test: /\.svg$/,
        type: "asset/inline",
      },
      {
        test: /\.(c|m)?js/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
};

// Config for Datasource Edit Dialog webview
const datasourceEditDialogConfig = {
  target: "web",
  mode: "production", // Enable webpack production optimizations
  devtool: "inline-source-map",
  entry: "./webview/datasource/editMain.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "datasourceEditDialog.js",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".svg"],
    symlinks: true,
    fallback: {
      process: require.resolve("process/browser"),
      buffer: require.resolve("buffer/"),
      stream: require.resolve("stream-browserify"),
      // Disable node modules not needed in browser
      fs: false,
      path: false,
      crypto: false,
    },
    alias: {
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      // Stub out react-router-dom since we don't use navigation in webview
      "react-router-dom": false,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "tsconfig.webview.json"),
            experimentalWatchApi: true,
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: [require.resolve("style-loader"), require.resolve("css-loader")],
      },
      {
        test: /\.svg$/,
        type: "asset/inline",
      },
      {
        test: /\.(c|m)?js/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
};

// Config for Agent Chat webview
const agentChatWebviewConfig = {
  target: "web",
  mode: "production", // Enable webpack production optimizations
  devtool: process.env.WEBVIEW_DEBUG ? "inline-source-map" : "hidden-source-map",
  entry: "./webview/agentChat/agentChatWebview.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "agentChatWebview.js",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".svg"],
    symlinks: true,
    fallback: {
      process: require.resolve("process/browser"),
      buffer: require.resolve("buffer/"),
      stream: require.resolve("stream-browserify"),
      // Disable node modules not needed in browser
      fs: false,
      path: false,
      crypto: false,
    },
    alias: {
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
      // Stub out react-router-dom since we don't use navigation in webview
      "react-router-dom": false,
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            configFile: path.join(__dirname, "tsconfig.webview.json"),
            experimentalWatchApi: true,
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: [require.resolve("style-loader"), require.resolve("css-loader")],
      },
      {
        test: /\.svg$/,
        type: "asset/inline",
      },
      {
        test: /\.(c|m)?js/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
};

module.exports = [
  extensionConfig,
  webviewConfig,
  lexicalWebviewConfig,
  showcaseWebviewConfig,
  datasourceDialogConfig,
  datasourceEditDialogConfig,
  agentChatWebviewConfig,
  // aguiExampleConfig, // Commented out - file doesn't exist
];
