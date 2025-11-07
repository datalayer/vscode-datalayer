/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Shared constants for kernel identification and management
 *
 * @module constants/kernelConstants
 */

/**
 * URL prefix used to identify local kernel connections.
 * Used across multiple files to detect and route local kernel traffic.
 */
export const LOCAL_KERNEL_URL_PREFIX = "local-kernel-";

/**
 * Checks if a URL represents a local kernel connection
 * @param url - The URL to check
 * @returns true if the URL is a local kernel URL
 */
export function isLocalKernelUrl(url: string): boolean {
  return url.includes(LOCAL_KERNEL_URL_PREFIX) && url.includes(".localhost");
}
