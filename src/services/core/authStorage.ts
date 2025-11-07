/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Authentication storage adapters for VS Code extension.
 * Provides bridges between VS Code SecretStorage, system keyring, and SDK auth.
 *
 * @module services/core/authStorage
 */

import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Abstract interface for authentication storage.
 * Compatible with @datalayer/core SDK when TypeScript version is updated.
 */
export interface IAuthStorage {
  /**
   * Get authentication token for a service.
   * @param service - Service URL (e.g., "https://prod1.datalayer.run")
   * @returns Token if found, null otherwise
   */
  getToken(service: string): Promise<string | null>;

  /**
   * Store authentication token for a service.
   * @param service - Service URL
   * @param token - Authentication token to store
   */
  setToken(service: string, token: string): Promise<void>;

  /**
   * Delete authentication token for a service.
   * @param service - Service URL
   */
  deleteToken(service: string): Promise<void>;
}

/**
 * VS Code SecretStorage adapter for SDK authentication.
 * Provides encrypted, cross-platform token storage using VS Code's SecretStorage API.
 *
 * @example
 * ```typescript
 * const storage = new VSCodeAuthStorage(context.secrets);
 * await storage.setToken('https://prod1.datalayer.run', 'token123');
 * const token = await storage.getToken('https://prod1.datalayer.run');
 * ```
 */
export class VSCodeAuthStorage implements IAuthStorage {
  private static readonly TOKEN_PREFIX = "datalayer.token";

  constructor(private secrets: vscode.SecretStorage) {}

  async getToken(service: string): Promise<string | null> {
    const key = `${VSCodeAuthStorage.TOKEN_PREFIX}.${this.normalizeService(service)}`;
    return (await this.secrets.get(key)) || null;
  }

  async setToken(service: string, token: string): Promise<void> {
    const key = `${VSCodeAuthStorage.TOKEN_PREFIX}.${this.normalizeService(service)}`;
    await this.secrets.store(key, token);
  }

  async deleteToken(service: string): Promise<void> {
    const key = `${VSCodeAuthStorage.TOKEN_PREFIX}.${this.normalizeService(service)}`;
    await this.secrets.delete(key);
  }

  /**
   * Convert service URL to safe storage key.
   * @param service - Service URL
   * @returns Normalized key (e.g., "prod1.datalayer.run")
   */
  private normalizeService(service: string): string {
    // Remove protocol and normalize: https://prod1.datalayer.run → prod1.datalayer.run
    return service.replace(/^https?:\/\//, "").replace(/\//g, "_");
  }
}

/**
 * System keychain/keyring adapter for discovering CLI-stored tokens.
 * Read-only on VS Code side to avoid conflicts with CLI.
 *
 * Supports:
 * - macOS: Keychain Access
 * - Linux: Secret Service (gnome-keyring, kwallet, etc.)
 * - Windows: Credential Manager
 *
 * @example
 * ```typescript
 * const storage = new KeyringAuthStorage();
 * const token = await storage.getToken('https://prod1.datalayer.run');
 * // Will discover token stored by `datalayer login` CLI command
 * ```
 */
export class KeyringAuthStorage implements IAuthStorage {
  async getToken(service: string): Promise<string | null> {
    try {
      if (process.platform === "darwin") {
        // macOS Keychain
        const { stdout } = await execAsync(
          `security find-generic-password -s "${service}" -a "access_token" -w 2>/dev/null`,
        );
        const token = stdout.trim();
        return token || null;
      } else if (process.platform === "linux") {
        // Linux Secret Service (gnome-keyring, kwallet, etc.)
        // Requires secret-tool to be installed
        try {
          const { stdout } = await execAsync(
            `secret-tool lookup service "${service}" account "access_token" 2>/dev/null`,
          );
          const token = stdout.trim();
          return token || null;
        } catch {
          // secret-tool not available or no token found
          return null;
        }
      } else if (process.platform === "win32") {
        // Windows Credential Manager
        // Note: Windows credential access is more complex
        // For now, return null - can be enhanced later
        return null;
      }
    } catch (error) {
      // Token not found or keyring not available
      return null;
    }
    return null;
  }

  async setToken(_service: string, _token: string): Promise<void> {
    // Read-only - don't write to system keyring from VS Code
    // This prevents conflicts with CLI
    throw new Error(
      "KeyringAuthStorage is read-only in VS Code. Use CLI to store tokens in system keyring.",
    );
  }

  async deleteToken(_service: string): Promise<void> {
    throw new Error(
      "KeyringAuthStorage is read-only in VS Code. Use CLI to manage system keyring tokens.",
    );
  }
}

/**
 * Cascading authentication storage that checks multiple sources in priority order.
 *
 * Discovery priority:
 * 1. VS Code SecretStorage (primary)
 * 2. System Keyring (fallback - CLI tokens)
 *
 * When a token is found in keyring, it's automatically migrated to VS Code SecretStorage.
 *
 * @example
 * ```typescript
 * const primary = new VSCodeAuthStorage(context.secrets);
 * const fallback = new KeyringAuthStorage();
 * const storage = new MultiAuthStorage(primary, fallback);
 *
 * // Will check VS Code storage first, then keyring
 * const token = await storage.getToken('https://prod1.datalayer.run');
 * ```
 */
export class MultiAuthStorage implements IAuthStorage {
  constructor(
    private primary: IAuthStorage, // VSCodeAuthStorage
    private fallback?: IAuthStorage, // KeyringAuthStorage (read-only)
  ) {}

  async getToken(service: string): Promise<string | null> {
    // Try primary first (VS Code SecretStorage)
    let token = await this.primary.getToken(service);
    if (token) {
      return token;
    }

    // Try fallback (system keyring from CLI)
    if (this.fallback) {
      token = await this.fallback.getToken(service);
      if (token) {
        // Found in keyring! Migrate to VS Code SecretStorage
        try {
          await this.primary.setToken(service, token);
        } catch (error) {
          // Migration failed but we still have the token
          console.warn("Failed to migrate token to VS Code storage:", error);
        }
        return token;
      }
    }

    return null;
  }

  async setToken(service: string, token: string): Promise<void> {
    // Always write to primary (VS Code SecretStorage)
    await this.primary.setToken(service, token);
  }

  async deleteToken(service: string): Promise<void> {
    await this.primary.deleteToken(service);
    // Don't delete from keyring - let user manage that via CLI
  }
}
