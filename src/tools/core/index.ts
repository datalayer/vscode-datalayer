/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Core Tool Framework - Platform Agnostic
 *
 * This module provides the foundation for the unified tool architecture,
 * enabling tool operations to work identically across VS Code, SaaS, and
 * ag-ui platforms through the 3-tier abstraction pattern:
 *
 * 1. Core Operations (this module) - Platform-agnostic business logic
 * 2. Tool Definitions - Unified schema for all tool metadata
 * 3. Platform Adapters - VS Code, SaaS, and ag-ui specific implementations
 *
 * @module tools/core
 */

// Export core interfaces
export * from "./interfaces";

// Export shared types
export * from "./types";

// Export all operations
export * from "./operations";
