// Hook to ignore CSS imports and browser-only packages in Node.js
// Required for sync:tools script to work with Node 22
const Module = require('module');
const originalRequire = Module.prototype.require;

// Use jsdom to provide a complete DOM environment
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

// Provide all necessary browser globals
global.document = dom.window.document;
global.window = dom.window;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.WebSocket = dom.window.WebSocket;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.DragEvent = dom.window.DragEvent;
global.MutationObserver = dom.window.MutationObserver;
global.CSSStyleSheet = dom.window.CSSStyleSheet;
global.customElements = dom.window.customElements;
global.self = global.window;

// Add matchMedia stub
global.window.matchMedia = global.window.matchMedia || function() {
  return {
    matches: false,
    addListener: function() {},
    removeListener: function() {}
  };
};

// Create a universal stub that can be extended as a class and called
function createStub() {
  const stub = function() {
    // When called, return another stub (allows chaining like obj().method())
    return createStub();
  };
  stub.prototype = Object.create(Object.prototype);

  // Handle JSON serialization
  stub.toJSON = function() {
    return {};
  };
  stub.toString = function() {
    return '{}'; // Return valid JSON string
  };
  stub.valueOf = function() {
    return null; // Return null for primitive conversion
  };

  // Make stub iterable (for...of loops)
  stub[Symbol.iterator] = function() {
    return {
      next: function() {
        return { done: true, value: undefined };
      }
    };
  };

  return new Proxy(stub, {
    get(target, prop) {
      // Return the actual properties if they exist
      if (prop in target) return target[prop];
      if (prop === 'prototype') return target.prototype;
      if (prop === 'constructor') return target;
      if (prop === '__esModule') return true;
      if (prop === 'default') return stub;
      if (prop === 'toJSON') return target.toJSON;
      if (prop === 'toString') return target.toString;
      if (prop === 'valueOf') return target.valueOf;
      // Handle Symbol.iterator for iterability
      if (prop === Symbol.iterator) return target[Symbol.iterator];
      // Return undefined for other symbols
      if (typeof prop === 'symbol') return undefined;
      // Return a new stub for any other property
      return createStub();
    }
  });
}

Module.prototype.require = function (id) {
  // Ignore CSS imports
  if (id.endsWith('.css')) {
    return {};
  }

  // Stub out focus-visible (causes issues with tsx + jsdom)
  if (id === 'focus-visible' || id.includes('focus-visible')) {
    return {};
  }

  // Stub out browser-only Lumino packages (not needed for tool schema extraction)
  if (id.includes('@lumino/')) {
    return createStub();
  }

  // Stub out JupyterLab packages that depend on browser APIs
  if (id.includes('@jupyterlab/')) {
    return createStub();
  }

  // Stub out service worker files (web worker context)
  if (id.includes('service-worker')) {
    return {};
  }

  // Stub out @jupyterlite packages (but NOT the lite directory in jupyter-react to preserve exports)
  if (id.includes('@jupyterlite/')) {
    return createStub();
  }

  // Stub out @microsoft/fast-* (browser web components)
  if (id.includes('@microsoft/fast-')) {
    return createStub();
  }

  // Stub out @jupyter/web-components (browser UI)
  if (id.includes('@jupyter/web-components')) {
    return createStub();
  }

  // Stub out ipywidgets (browser-only widgets)
  if (id.includes('ipywidgets') || id.includes('/jupyter/ipywidgets')) {
    return createStub();
  }

  // Stub out CodeMirror (browser code editor)
  if (id.includes('codemirror') || id.includes('@codemirror/')) {
    return createStub();
  }

  // Note: Cannot stub components/viewer as it breaks barrel exports
  // The React warnings are harmless - they're just warnings about components being undefined

  return originalRequire.apply(this, arguments);
};
