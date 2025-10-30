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
import type { Kernel } from "@jupyterlab/services";
import { NativeKernelInfo } from "./nativeKernelIntegration";
import { createRawKernel, IKernelConnection } from "./rawSocket";

/**
 * Client for local Python kernels using direct ZMQ communication.
 * Works with environments that only have ipykernel installed (no jupyter-server needed).
 */
export class LocalKernelClient {
  private _kernelInfo: NativeKernelInfo;
  private _disposed = false;
  private _kernelProcess: ChildProcess | undefined;
  private _connectionFile: string | undefined;
  private _realKernel: Kernel.IKernelConnection | undefined;

  constructor(kernelInfo: NativeKernelInfo) {
    this._kernelInfo = kernelInfo;
  }

  /**
   * Start the local kernel by spawning ipykernel and connecting via ZMQ.
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
   * Spawn the ipykernel process and create ZMQ connection.
   */
  private async spawnKernelProcess(): Promise<void> {
    const pythonPath = this._kernelInfo.pythonPath || "python3";

    // Create connection file with ZMQ ports
    const connection = await this.createConnectionFile();
    this._connectionFile = connection.file;

    console.log("[LocalKernelClient] Connection file:", this._connectionFile);
    console.log("[LocalKernelClient] Connection config:", connection.config);

    // Spawn ipykernel with connection file
    const args = ["-m", "ipykernel_launcher", "-f", this._connectionFile];

    console.log("[LocalKernelClient] Spawning:", pythonPath, args.join(" "));

    this._kernelProcess = spawn(pythonPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
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
   */
  private async createConnectionFile(): Promise<{
    file: string;
    config: IKernelConnection;
  }> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "datalayer-kernel-"));
    const connectionFile = path.join(tempDir, "kernel.json");

    // Find free ports
    const ports = {
      shell_port: await this.findFreePort(50000),
      iopub_port: await this.findFreePort(50001),
      stdin_port: await this.findFreePort(50002),
      control_port: await this.findFreePort(50003),
      hb_port: await this.findFreePort(50004),
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
   * Find a free port starting from the given port.
   */
  private async findFreePort(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const net = require("net");
      const server = net.createServer();

      server.listen(startPort, () => {
        const port = server.address().port;
        server.close(() => resolve(port));
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          resolve(this.findFreePort(startPort + 1));
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Execute code on the kernel.
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
   * Get the underlying @jupyterlab/services kernel connection.
   */
  public getKernel(): Kernel.IKernelConnection | undefined {
    return this._realKernel;
  }

  /**
   * Get kernel information.
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
   */
  public async restart(): Promise<void> {
    if (!this._realKernel) {
      throw new Error("Kernel not started");
    }

    console.log("[LocalKernelClient] Restarting kernel...");
    await this._realKernel.restart();
  }

  /**
   * Interrupt the kernel.
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
