/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Runtime executor for direct code execution on Datalayer cloud runtimes.
 *
 * This module provides helpers for executing code directly on active Datalayer runtimes
 * without requiring an open document. It uses the Jupyter kernel protocol over WebSockets
 * to connect to the runtime and execute code.
 *
 * @module tools/utils/runtimeExecutor
 */

import { ServerConnection, KernelManager, Kernel } from "@jupyterlab/services";
import { KernelExecutor } from "@datalayer/jupyter-react";
import type { RuntimeDTO } from "@datalayer/core/lib/models/RuntimeDTO";
import type { IOutput } from "@jupyterlab/nbformat";

/**
 * Result of code execution on a runtime.
 * Contains standard Jupyter output objects and execution metadata.
 */
export interface ExecuteCodeResult {
  /** Whether execution completed successfully (no connection errors) */
  success: boolean;
  /** Standard Jupyter outputs (stream, execute_result, display_data, error) */
  outputs?: IOutput[];
  /** Error message if execution failed */
  error?: string;
  /** Execution count from the kernel */
  executionCount?: number;
}

/**
 * Execute code directly on a Datalayer runtime using Jupyter kernel protocol.
 *
 * This function:
 * 1. Creates a WebSocket connection to the runtime
 * 2. Connects to the default kernel (or starts a new one)
 * 3. Executes the code using KernelExecutor
 * 4. Returns standard Jupyter IOutput[] objects
 *
 * @param runtime - The runtime to execute code on (must have ingress and token)
 * @param code - Python code to execute
 * @returns Promise resolving to execution result with outputs
 *
 * @example
 * ```typescript
 * const runtime = await strategy.tryConnect({ runtimesTreeProvider });
 * const result = await executeOnRuntime(runtime, "print('hello')");
 * if (result.success) {
 *   console.log("Outputs:", result.outputs);
 * }
 * ```
 */
export async function executeOnRuntime(
  runtime: RuntimeDTO,
  code: string,
): Promise<ExecuteCodeResult> {
  let kernelConnection: Kernel.IKernelConnection | undefined;
  let kernelManager: KernelManager | undefined;

  try {
    console.log(
      `[runtimeExecutor] Executing code on runtime: ${runtime.givenName}`,
    );
    console.log(`[runtimeExecutor] Runtime ingress: ${runtime.ingress}`);

    // Step 1: Create kernel connection
    const { connection, manager } = await createKernelConnection(runtime);
    kernelConnection = connection;
    kernelManager = manager;

    console.log(`[runtimeExecutor] Kernel connected: ${kernelConnection.id}`);

    // Step 2: Create executor and execute code
    const executor = new KernelExecutor({
      connection: kernelConnection,
      suppressCodeExecutionErrors: true, // Don't throw on execution errors
    });

    console.log(`[runtimeExecutor] Executing code...`);

    // Start execution with 30 second timeout
    const executionPromise = executor.execute(code, {
      stopOnError: true,
      suppressCodeExecutionErrors: true,
    });

    // Race execution against timeout
    const timeoutMs = 30000; // 30 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Execution timeout (30s)")), timeoutMs);
    });

    await Promise.race([executionPromise, timeoutPromise]);

    // Wait for execution to complete
    await executor.done;

    console.log(
      `[runtimeExecutor] Execution complete, ${executor.outputs.length} outputs`,
    );

    // Step 3: Extract outputs
    const outputs = executor.outputs;
    // execution_count is in the reply message, not available directly in future.msg
    const executionCount = undefined; // TODO: Get from reply message if needed

    return {
      success: true,
      outputs,
      executionCount: executionCount ? Number(executionCount) : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[runtimeExecutor] Execution failed:`, errorMessage);

    return {
      success: false,
      error: `Code execution failed: ${errorMessage}`,
    };
  } finally {
    // Clean up: dispose kernel connection and manager
    if (kernelConnection) {
      try {
        console.log(
          `[runtimeExecutor] Disposing kernel connection: ${kernelConnection.id}`,
        );
        await kernelConnection.shutdown();
        kernelConnection.dispose();
      } catch (cleanupError) {
        console.warn(
          "[runtimeExecutor] Error during kernel cleanup:",
          cleanupError,
        );
      }
    }

    if (kernelManager) {
      try {
        kernelManager.dispose();
      } catch (cleanupError) {
        console.warn(
          "[runtimeExecutor] Error during kernel manager cleanup:",
          cleanupError,
        );
      }
    }
  }
}

/**
 * Create a WebSocket kernel connection for a Datalayer runtime.
 *
 * This function:
 * 1. Creates ServerConnection settings with runtime ingress and token
 * 2. Creates a KernelManager for managing kernels
 * 3. Lists existing kernels and connects to the default Python kernel
 * 4. If no kernel exists, starts a new Python kernel
 *
 * @param runtime - The runtime to connect to
 * @returns Promise resolving to kernel connection and manager
 * @throws Error if connection fails
 *
 * @internal
 */
async function createKernelConnection(runtime: RuntimeDTO): Promise<{
  connection: Kernel.IKernelConnection;
  manager: KernelManager;
}> {
  console.log(
    `[runtimeExecutor] Creating kernel connection to runtime: ${runtime.givenName}`,
  );

  // Step 1: Create server connection settings
  const baseUrl = runtime.ingress;
  const wsUrl = runtime.ingress.replace(/^http/, "ws");
  const token = runtime.token;

  console.log(`[runtimeExecutor] Base URL: ${baseUrl}`);
  console.log(`[runtimeExecutor] WebSocket URL: ${wsUrl}`);

  const serverSettings = ServerConnection.makeSettings({
    baseUrl,
    wsUrl,
    token,
    appendToken: true,
  });

  // Step 2: Create kernel manager
  const kernelManager = new KernelManager({ serverSettings });

  try {
    // Step 3: Refresh kernel list
    console.log("[runtimeExecutor] Refreshing kernel list...");
    await kernelManager.refreshRunning();

    // Step 4: Try to connect to existing default kernel
    const runningKernels = Array.from(kernelManager.running());
    console.log(
      `[runtimeExecutor] Found ${runningKernels.length} running kernel(s)`,
    );

    if (runningKernels.length > 0) {
      // Use the first available kernel (typically the default Python kernel)
      const kernelModel = runningKernels[0];
      console.log(
        `[runtimeExecutor] Connecting to existing kernel: ${kernelModel.id} (${kernelModel.name})`,
      );

      const connection = kernelManager.connectTo({ model: kernelModel });
      return { connection, manager: kernelManager };
    }

    // Step 5: No kernel exists, start a new Python kernel
    console.log(
      "[runtimeExecutor] No running kernels, starting new Python kernel...",
    );

    const connection = await kernelManager.startNew({ name: "python3" });
    console.log(`[runtimeExecutor] Started new kernel: ${connection.id}`);

    return { connection, manager: kernelManager };
  } catch (error) {
    // Clean up kernel manager on failure
    kernelManager.dispose();
    throw new Error(
      `Failed to create kernel connection: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
