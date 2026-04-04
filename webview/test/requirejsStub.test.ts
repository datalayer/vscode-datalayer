/// <reference types="vitest/globals" />

/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import { initializeRequireJSStub } from "../utils/requirejsStub";

describe("initializeRequireJSStub", () => {
  beforeEach(() => {
    // Clear any existing stubs before each test
    delete window.define;
    delete window.require;
  });

  afterEach(() => {
    delete window.define;
    delete window.require;
  });

  it("sets window.define when it does not exist", () => {
    expect(window.define).toBeUndefined();
    initializeRequireJSStub();
    expect(window.define).toBeDefined();
    expect(typeof window.define).toBe("function");
  });

  it("sets window.require when it does not exist", () => {
    expect(window.require).toBeUndefined();
    initializeRequireJSStub();
    expect(window.require).toBeDefined();
    expect(typeof window.require).toBe("function");
  });

  it("does not overwrite existing window.define", () => {
    const existingDefine = vi.fn();
    window.define = existingDefine;
    initializeRequireJSStub();
    expect(window.define).toBe(existingDefine);
  });

  it("sets amd property on define", () => {
    initializeRequireJSStub();
    const define = window.define as ((
      name: string,
      module: unknown,
    ) => void) & { amd?: Record<string, unknown> };
    expect(define.amd).toBeDefined();
  });

  describe("define function", () => {
    it("stores modules that can be retrieved via require", () => {
      initializeRequireJSStub();
      const myModule = { foo: "bar" };
      window.define!("my-module", myModule);

      const callback = vi.fn();
      window.require!(["my-module"], callback);
      expect(callback).toHaveBeenCalledWith(myModule);
    });

    it("returns undefined for unregistered modules", () => {
      initializeRequireJSStub();
      const callback = vi.fn();
      window.require!(["nonexistent"], callback);
      expect(callback).toHaveBeenCalledWith(undefined);
    });
  });

  describe("require function", () => {
    it("handles multiple module names", () => {
      initializeRequireJSStub();
      const modA = { a: 1 };
      const modB = { b: 2 };
      window.define!("mod-a", modA);
      window.define!("mod-b", modB);

      const callback = vi.fn();
      window.require!(["mod-a", "mod-b"], callback);
      expect(callback).toHaveBeenCalledWith(modA, modB);
    });

    it("does nothing when callback is not provided", () => {
      initializeRequireJSStub();
      // Should not throw
      expect(() => window.require!(["some-module"])).not.toThrow();
    });
  });
});
