/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Common test utilities and helper functions.
 * Provides assertions, timing utilities, and test data generators.
 *
 * @module test/utils/testHelpers
 */

import * as assert from "assert";

/**
 * Asserts that a promise rejects with a specific error message.
 */
export async function assertRejects(
  fn: () => Promise<any>,
  expectedMessage?: string | RegExp,
): Promise<void> {
  try {
    await fn();
    assert.fail("Expected promise to reject, but it resolved");
  } catch (error: any) {
    if (expectedMessage) {
      if (typeof expectedMessage === "string") {
        assert.ok(
          error.message.includes(expectedMessage),
          `Expected error message to include "${expectedMessage}", got "${error.message}"`,
        );
      } else {
        assert.ok(
          expectedMessage.test(error.message),
          `Expected error message to match ${expectedMessage}, got "${error.message}"`,
        );
      }
    }
  }
}

/**
 * Asserts that a promise resolves successfully.
 */
export async function assertResolves<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    assert.fail(
      `Expected promise to resolve, but it rejected with: ${error.message}`,
    );
  }
}

/**
 * Creates a deferred promise that can be resolved/rejected externally.
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Waits for a condition to become true.
 */
export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number; message?: string } = {},
): Promise<void> {
  const {
    timeout = 2000,
    interval = 50,
    message = "Condition not met",
  } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`${message} (timeout after ${timeout}ms)`);
}

/**
 * Sleeps for the specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Captures all event emissions from a VS Code event.
 */
export class EventCapture<T> {
  private events: T[] = [];
  private disposable: any;

  constructor(event: any) {
    this.disposable = event((e: T) => {
      this.events.push(e);
    });
  }

  get captured(): readonly T[] {
    return this.events;
  }

  get count(): number {
    return this.events.length;
  }

  get last(): T | undefined {
    return this.events[this.events.length - 1];
  }

  dispose(): void {
    this.disposable?.dispose();
  }

  clear(): void {
    this.events = [];
  }
}

/**
 * Asserts that two objects are deeply equal, with better error messages.
 */
export function assertDeepEqual<T>(
  actual: T,
  expected: T,
  message?: string,
): void {
  try {
    assert.deepStrictEqual(actual, expected, message);
  } catch (error: any) {
    console.error("Expected:", JSON.stringify(expected, null, 2));
    console.error("Actual:", JSON.stringify(actual, null, 2));
    throw error;
  }
}

/**
 * Asserts that an array contains a specific item.
 */
export function assertContains<T>(array: T[], item: T, message?: string): void {
  assert.ok(
    array.includes(item),
    message || `Expected array to contain ${JSON.stringify(item)}`,
  );
}

/**
 * Asserts that an object has a specific property.
 */
export function assertHasProperty<T extends object>(
  obj: T,
  property: keyof T,
  message?: string,
): void {
  assert.ok(
    property in obj,
    message || `Expected object to have property ${String(property)}`,
  );
}

/**
 * Generates a random string for test data.
 */
export function randomString(length: number = 10): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length);
}

/**
 * Generates a mock JWT token for testing.
 */
export function generateMockJWT(payload: any = {}): string {
  const header = { alg: "HS256", typ: "JWT" };
  const defaultPayload = {
    sub: "test-user",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...payload,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  );
  const encodedPayload = Buffer.from(JSON.stringify(defaultPayload)).toString(
    "base64url",
  );
  const signature = "mock-signature";

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Creates a test timeout that fails if not completed in time.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(message || `Test timeout after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Flushes all pending promises/timers.
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Retries an async operation multiple times.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; delay?: number } = {},
): Promise<T> {
  const { maxAttempts = 3, delay = 100 } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Retry failed");
}
