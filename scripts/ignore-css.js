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
// The *constructors*, not just the instances: `@microsoft/fast-foundation`
// branches on `target instanceof Document` while registering design tokens, and
// an undefined global there is a ReferenceError rather than a false.
global.Document = dom.window.Document;
global.DocumentFragment = dom.window.DocumentFragment;
global.ShadowRoot = dom.window.ShadowRoot;
global.HTMLStyleElement = dom.window.HTMLStyleElement;
global.CSSStyleDeclaration = dom.window.CSSStyleDeclaration;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.DragEvent = dom.window.DragEvent;
global.MutationObserver = dom.window.MutationObserver;
global.CSSStyleSheet = dom.window.CSSStyleSheet;
// Two copies of a package that defines a custom element both call `define`
// with the same name, and the second throws NotSupportedError. Primer pulls in
// `@github/relative-time-element`, and it is installed per workspace rather
// than hoisted, so importing the tool definitions reaches two of them. This
// script only reads tool metadata — the first definition wins and the repeats
// are ignored, rather than aborting the build over a registry nothing renders.
const customElementRegistry = dom.window.customElements;
const defineCustomElement = customElementRegistry.define.bind(customElementRegistry);
customElementRegistry.define = function (name, constructor, options) {
  if (customElementRegistry.get(name)) {
    return;
  }
  defineCustomElement(name, constructor, options);
};
global.customElements = customElementRegistry;
global.self = global.window;
// Browser code reaches for these as bare globals rather than `window.`, and
// jsdom only puts them on its window — an unqualified reference is then a
// ReferenceError rather than a missing feature. Copied wholesale rather than
// one at a time, because each omission only shows up as the next crash in a
// graph this size (`@microsoft/fast-element` schedules through the global rAF,
// `@jupyter/web-components` reads the theme through `getComputedStyle`).
for (const name of [
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'DOMParser',
  'XMLSerializer',
  'NodeFilter',
  'Range',
  'getSelection',
  'HTMLIFrameElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLAnchorElement',
  'SVGElement',
  'DOMException',
  'Text',
  'Comment',
  'AbortController',
  'IntersectionObserver',
  'ResizeObserver',
]) {
  const value = dom.window[name];
  if (typeof value === 'function') {
    global[name] = typeof value.prototype === 'object' ? value : value.bind(dom.window);
  }
}

// jsdom implements neither observer. Nothing here renders, so both only have to
// be constructible and silent.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
// jsdom implements neither `DragEvent` nor `PointerEvent`, and `@lumino/dragdrop`
// declares `class Event extends DragEvent` at module scope — an undefined base
// class is a TypeError the moment the module is imported, before any of this is
// used. Both carry no behaviour here; they only have to be extendable.
if (typeof dom.window.DragEvent !== 'function') {
  global.DragEvent = class DragEvent extends dom.window.MouseEvent {};
  global.window.DragEvent = global.DragEvent;
}
if (typeof dom.window.PointerEvent !== 'function') {
  global.PointerEvent = class PointerEvent extends dom.window.MouseEvent {};
  global.window.PointerEvent = global.PointerEvent;
}

global.ResizeObserver = global.ResizeObserver || NoopObserver;
global.IntersectionObserver = global.IntersectionObserver || NoopObserver;
global.window.ResizeObserver = global.window.ResizeObserver || NoopObserver;
global.window.IntersectionObserver = global.window.IntersectionObserver || NoopObserver;

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
