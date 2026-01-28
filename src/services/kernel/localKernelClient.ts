/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 * MIT License
 */

/**
 * Local kernel client using direct ZMQ communication.
 * Spawns ipykernel processes and connects via ZMQ sockets.
 *
 * @module services/kernel/localKernelClient
 */

import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import * as vscode from "vscode";
import type { Kernel } from "@jupyterlab/services";
import { NativeKernelInfo } from "./nativeKernelIntegration";
import { createRawKernel, IKernelConnection } from "./rawSocket";

/**
 * Client for local Python kernels using direct ZMQ communication.
 * Works with environments that only have ipykernel installed (no jupyter-server needed).
 */
export class LocalKernelClient {
  /** Kernel information including Python path and kernel spec */
  private _kernelInfo: NativeKernelInfo;

  /** Indicates whether this client has been disposed */
  private _disposed = false;

  /** The spawned kernel process */
  private _kernelProcess: ChildProcess | undefined;

  /** Path to the kernel connection file */
  private _connectionFile: string | undefined;

  /** The JupyterLab kernel connection instance */
  private _realKernel: Kernel.IKernelConnection | undefined;

  /** Optional document URI for setting kernel working directory */
  private _documentUri?: vscode.Uri;

  /**
   * Creates a new LocalKernelClient instance.
   * @param kernelInfo - Kernel information including Python path and kernel spec
   * @param documentUri - Optional document URI for setting kernel working directory
   */
  constructor(kernelInfo: NativeKernelInfo, documentUri?: vscode.Uri) {
    this._kernelInfo = kernelInfo;
    this._documentUri = documentUri;
  }

  /**
   * Start the local kernel by spawning ipykernel and connecting via ZMQ.
   * @throws Error if the client has been disposed or if kernel type is jupyter-server
   */
  public async start(): Promise<void> {
    if (this._disposed) {
      throw new Error("LocalKernelClient has been disposed");
    }

    console.log(
      "[LocalKernelClient] Starting kernel:",
      this._kernelInfo.displayName,
    );

    // For existing Jupyter servers, we should not be here
    if (this._kernelInfo.type === "jupyter-server") {
      throw new Error(
        "Use WebSocketKernelClient for Jupyter servers, not LocalKernelClient",
      );
    }

    // Spawn kernel process with ZMQ connection
    await this.spawnKernelProcess();
  }

  /**
   * Get the working directory for the kernel process.
   * - For file URIs: Returns the parent directory of the file
   * - For virtual URIs (datalayer://): Returns workspace root folder
   * - If no URI or workspace: Returns undefined (uses process cwd)
   *
   * @returns Absolute path to use as kernel working directory
   */
  private getKernelWorkingDirectory(): string | undefined {
    if (!this._documentUri) {
      console.log(
        "[LocalKernelClient] No document URI provided, using default working directory",
      );
      return undefined;
    }

    // Handle file:// URIs - extract parent directory
    if (this._documentUri.scheme === "file") {
      const filePath = this._documentUri.fsPath;
      const directory = path.dirname(filePath);

      console.log(
        `[LocalKernelClient] Using kernel working directory from file URI: ${directory}`,
      );

      // Validate directory exists
      if (fs.existsSync(directory)) {
        return directory;
      } else {
        console.warn(
          `[LocalKernelClient] Directory does not exist: ${directory}, using workspace root`,
        );
      }
    }

    // For virtual URIs (datalayer://), use workspace root
    // This matches VS Code's behavior for untitled files
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      console.log(
        `[LocalKernelClient] Using workspace root as working directory: ${workspaceRoot}`,
      );
      return workspaceRoot;
    }

    console.log(
      "[LocalKernelClient] No workspace folder found, using default working directory",
    );
    return undefined;
  }

  /**
   * Spawn the ipykernel process and create ZMQ connection.
   */
  private async spawnKernelProcess(): Promise<void> {
    const pythonPath = this._kernelInfo.pythonPath || "python3";

    // Create connection file with ZMQ ports
    const connection = await this.createConnectionFile();
    this._connectionFile = connection.file;

    console.log("[LocalKernelClient] Connection file:", this._connectionFile);
    console.log("[LocalKernelClient] Connection config:", connection.config);

    // Get working directory for kernel (notebook file's directory or workspace root)
    const cwd = this.getKernelWorkingDirectory();

    // Spawn ipykernel with connection file
    const args = ["-m", "ipykernel_launcher", "-f", this._connectionFile];

    console.log("[LocalKernelClient] Spawning:", pythonPath, args.join(" "));
    if (cwd) {
      console.log("[LocalKernelClient] Working directory:", cwd);
    }

    this._kernelProcess = spawn(pythonPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      cwd: cwd,
    });

    // Monitor kernel process output
    this._kernelProcess.stdout?.on("data", (data) => {
      console.log(`[Kernel stdout] ${data.toString()}`);
    });

    this._kernelProcess.stderr?.on("data", (data) => {
      console.error(`[Kernel stderr] ${data.toString()}`);
    });

    this._kernelProcess.on("exit", (code, signal) => {
      console.log(
        `[LocalKernelClient] Kernel process exited: code=${code}, signal=${signal}`,
      );
      this.dispose();
    });

    this._kernelProcess.on("error", (err) => {
      console.error("[LocalKernelClient] Kernel process error:", err);
    });

    // Wait for kernel to start (give it some time to bind to ports)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create ZMQ connection using @jupyterlab/services
    const clientId = crypto.randomBytes(16).toString("hex");
    const username = "datalayer";

    console.log("[LocalKernelClient] Creating raw kernel connection...");

    const { realKernel } = createRawKernel(
      connection.config,
      clientId,
      username,
    );
    this._realKernel = realKernel;

    // Monitor kernel status (check if signals exist)
    if (
      this._realKernel &&
      "statusChanged" in this._realKernel &&
      this._realKernel.statusChanged
    ) {
      this._realKernel.statusChanged.connect((_, status) => {
        console.log(`[LocalKernelClient] Kernel status: ${status}`);
      });
    }

    if (
      this._realKernel &&
      "iopubMessage" in this._realKernel &&
      this._realKernel.iopubMessage
    ) {
      this._realKernel.iopubMessage.connect((_, msg) => {
        console.log(`[LocalKernelClient] IOPub message:`, msg.header.msg_type);
      });
    }

    console.log("[LocalKernelClient] Kernel connection established!");
  }

  /**
   * Create a kernel connection file with random ports.
   * @returns Object containing the connection file path and configuration
   */
  private async createConnectionFile(): Promise<{
    file: string;
    config: IKernelConnection;
  }> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "datalayer-kernel-"));
    const connectionFile = path.join(tempDir, "kernel.json");

    // Use port 0 to let OS assign available ports
    const ports = {
      shell_port: await this.findFreePort(),
      iopub_port: await this.findFreePort(),
      stdin_port: await this.findFreePort(),
      control_port: await this.findFreePort(),
      hb_port: await this.findFreePort(),
    };

    const connection: IKernelConnection = {
      ...ports,
      ip: "127.0.0.1",
      key: crypto.randomBytes(32).toString("hex"),
      transport: "tcp",
      signature_scheme: "hmac-sha256",
      kernel_name: this._kernelInfo.kernelSpec?.name || "python3",
    };

    fs.writeFileSync(connectionFile, JSON.stringify(connection, null, 2));

    return { file: connectionFile, config: connection };
  }

  /**
   * Find a free port by letting the OS assign one.
   * @returns A free port number assigned by the operating system
   */
  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const net = require("net");
      const server = net.createServer();

      // Use port 0 to let OS assign any available port
      server.listen(0, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        reject(err);
      });
    });
  }

  /**
   * Execute code on the kernel.
   * @param code - The code to execute
   * @throws Error if kernel not started
   */
  public async executeCode(code: string): Promise<void> {
    if (!this._realKernel) {
      throw new Error("Kernel not started");
    }

    console.log("[LocalKernelClient] Executing code:", code);

    const future = this._realKernel.requestExecute({ code });

    future.onIOPub = (msg) => {
      console.log(
        "[LocalKernelClient] Execute IOPub:",
        msg.header.msg_type,
        msg.content,
      );
    };

    future.onReply = (msg) => {
      console.log("[LocalKernelClient] Execute reply:", msg.content);
    };

    await future.done;
  }

  /**
   * Get the underlying kernel connection.
   * @returns The JupyterLab kernel connection instance, or undefined if not started
   */
  public getKernel(): Kernel.IKernelConnection | undefined {
    return this._realKernel;
  }

  /**
   * Get the raw WebSocket for proxying (internal use by LocalKernelProxy).
   * @internal
   * @returns The raw WebSocket instance, or undefined if kernel not started
   */
  public getRawSocket(): unknown {
    if (!this._realKernel) {
      return undefined;
    }
    // Access the private _ws property for LocalKernelProxy
    // This is necessary because @jupyterlab/services doesn't expose the socket
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this._realKernel as any)._ws;
  }

  /**
   * Get kernel information.
   * @returns Kernel information object
   * @throws Error if kernel not started
   */
  public async getKernelInfo(): Promise<unknown> {
    if (!this._realKernel) {
      throw new Error("Kernel not started");
    }

    const info = await this._realKernel.info;
    return info;
  }

  /**
   * Restart the kernel.
   * @throws Error if kernel not started
   */
  public async restart(): Promise<void> {
    if (!this._realKernel) {
      throw new Error("Kernel not started");
    }

    console.log("[LocalKernelClient] Restarting kernel...");
    await this._realKernel.restart();
  }

  /**
   * Interrupt the kernel by sending SIGINT signal.
   * @throws Error if kernel process not running
   */
  public async interrupt(): Promise<void> {
    if (!this._kernelProcess || !this._kernelProcess.pid) {
      throw new Error("Kernel process not running");
    }

    console.log("[LocalKernelClient] Interrupting kernel...");

    // Send SIGINT to kernel process
    process.kill(this._kernelProcess.pid, "SIGINT");
  }

  /**
   * Dispose of the kernel client and clean up resources.
   */
  public dispose(): void {
    if (this._disposed) {
      return;
    }

    console.log("[LocalKernelClient] Disposing kernel client");

    this._disposed = true;

    // Shutdown kernel connection
    if (this._realKernel && !this._realKernel.isDisposed) {
      this._realKernel
        .shutdown()
        .catch((err) =>
          console.error("[LocalKernelClient] Error shutting down kernel:", err),
        );
    }

    // Kill kernel process
    if (this._kernelProcess && !this._kernelProcess.killed) {
      this._kernelProcess.kill("SIGTERM");
    }

    // Clean up connection file
    if (this._connectionFile && fs.existsSync(this._connectionFile)) {
      try {
        const dir = path.dirname(this._connectionFile);
        fs.unlinkSync(this._connectionFile);
        fs.rmdirSync(dir);
      } catch (err) {
        console.error(
          "[LocalKernelClient] Error cleaning up connection file:",
          err,
        );
      }
    }
  }
}
