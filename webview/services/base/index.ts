/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * @module services/base
 *
 * Base classes for service manager implementations.
 * Provides Template Method pattern for kernel and session managers.
 */

export {
  BaseKernelManager,
  type ITypedKernelManager,
  type KernelManagerType,
} from "./baseKernelManager";
export {
  BaseSessionManager,
  type SessionManagerType,
} from "./baseSessionManager";
