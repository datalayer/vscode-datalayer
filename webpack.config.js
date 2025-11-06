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
  entry: "./src/extension.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    // modules added here also need to be added in the .vscodeignore file
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
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
    ],
  },
  devtool: "nosources-source-map",
  infrastructureLogging: {
    level: "log", // enables logging required for problem matchers
  },
};

const webviewConfig = {
  target: "web",
  mode: "none",
  // Use inline source map to ease debug of webview
  // Xref. https://github.com/microsoft/vscode/issues/145292#issuecomment-1072879043
  devtool: "inline-source-map",
  entry: "./webview/notebook/main.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "webview.js",
  },
  optimization: {
    // Split React into a separate chunk to ensure single instance
    splitChunks: {
      cacheGroups: {
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
          name: "react-vendors",
          chunks: "all",
          priority: 20,
        },
      },
    },
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
      ],
    }),
  ],
};

// Config for Lexical editor webview
const lexicalWebviewConfig = {
  ...webviewConfig,
  entry: "./webview/lexical/main.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "lexicalWebview.js",
    // This will be overridden at runtime by __webpack_public_path__
    publicPath: "auto",
    webassemblyModuleFilename: "[hash].module.wasm",
  },
  experiments: {
    asyncWebAssembly: true,
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
      // Ship the JupyterLite service worker.
      {
        resourceQuery: /text/,
        type: "asset/resource",
        generator: {
          filename: "[name][ext]",
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

module.exports = [extensionConfig, webviewConfig, lexicalWebviewConfig, showcaseWebviewConfig];
