// A stand-in for `loop` in the extension-host suite (VSCODE VS-14): no
// Python, no model, no key. It answers `--version`, serves a local runtime
// (`serve`) with the routes the extension calls — the harness catalogue, the
// application configured, a session opened and listed — and serves an
// application's page (`apps run --web`), printing the lines the real
// command prints. Its approvals websocket (`/api/v1/tool-approvals/ws`)
// raises one approval for each session opened and takes the decision as
// the real one does (`agent.snapshot` / `tool_approval_decision`, VS-07);
// a session is described and its messages read by uid (VS-24). Nothing
// else; a request it does not know is a 404.
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const VERSION = "1.5.69";
const args = process.argv.slice(2);

const CATALOGUE = {
  harnesses: [
    {
      id: "claude-code",
      name: "Claude Code",
      acp: {
        command: "npx",
        args: ["-y", "@agentclientprotocol/claude-agent-acp@0.91.0"],
        load_session: true,
        modes: ["default", "plan"],
      },
      requires: { secrets: ["ANTHROPIC_API_KEY"], binaries: ["node", "git"] },
      terms: {
        served_to_third_parties: "api_key_only",
        licence:
          "Apache-2.0 (adapter); Anthropic Commercial Terms of Service (the agent)",
      },
      registered: {
        adapter: "@agentclientprotocol/claude-agent-acp",
        version: "0.91.0",
        credential: "ANTHROPIC_API_KEY",
        binaries: "Node 22, git",
      },
      capabilities: {
        resume: "load",
        fork_history: "replay",
        interrupt: true,
        steering: false,
        images: true,
        compaction: "own",
      },
      instructions_file: "CLAUDE.md",
    },
    {
      id: "fake",
      name: "Fake harness",
      acp: {
        command: "python3",
        args: ["acp_fake_agent.py"],
        load_session: false,
        modes: [],
      },
      requires: { secrets: [], binaries: [] },
      terms: { served_to_third_parties: "permitted", licence: "BSD-3-Clause" },
      registered: {
        adapter: "",
        version: "",
        credential: "none",
        binaries: "",
      },
      capabilities: {
        resume: "replay",
        fork_history: "replay",
        interrupt: true,
        steering: false,
        images: false,
        compaction: "none",
      },
      instructions_file: "AGENTS.md",
    },
  ],
};

function listen(server) {
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(server.address().port)),
  );
}

function body(request) {
  return new Promise((resolve) => {
    let text = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => (text += chunk));
    request.on("end", () => resolve(text));
  });
}

if (args[0] === "--version") {
  console.log(`agent_runtimes: ${VERSION}`);
  process.exit(0);
}

if (args[0] === "serve") {
  const sessions = [];
  let configured = null;
  // The approvals, as the runtime's websocket lists them: one raised per
  // session opened (`git push` of the fake harness), pending until decided.
  const approvals = [];
  const decisions = [];
  const sockets = new Set();
  const snapshot = () => ({
    version: "1.0",
    type: "agent.snapshot",
    agentId: "default",
    payload: {
      agentId: "default",
      approvals: approvals.map((approval) => ({ ...approval })),
      pendingApprovalCount: approvals.filter(
        (approval) => approval.status === "pending",
      ).length,
    },
  });
  const pushSnapshot = () => {
    const message = JSON.stringify(snapshot());
    for (const socket of sockets)
      if (socket.readyState === 1) socket.send(message);
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const json = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.method === "GET" && url.pathname === "/api/v1/harnesses")
      return json(200, CATALOGUE);
    if (request.method === "GET" && url.pathname === "/api/v1/apps")
      return json(200, {
        apps: configured
          ? [
              {
                id: configured.id,
                version: configured.version,
                name: configured.name,
                kind: configured.kind,
              },
            ]
          : [],
      });
    if (
      request.method === "POST" &&
      url.pathname === "/api/v1/apps/configure"
    ) {
      const asked = JSON.parse(await body(request));
      if (!asked.app || asked.app.schema !== "loop.app/v1")
        return json(422, {
          detail: {
            problems: [
              "The application is not an Appspec (schema loop.app/v1).",
            ],
          },
        });
      configured = asked.app;
      return json(200, { agent_id: "default", app: { id: configured.id } });
    }
    if (request.method === "POST" && url.pathname === "/api/v1/apps/sessions") {
      const asked = JSON.parse(await body(request));
      if (!configured)
        return json(404, {
          detail: `There is no agent ${asked.agent} on this runtime.`,
        });
      const uid = `stub${String(sessions.length + 1).padStart(8, "0")}`;
      const session = {
        uid,
        state: "open",
        turn: "idle",
        agent: asked.agent,
        app: {
          id: configured.id,
          version: configured.version,
          name: configured.name,
        },
        title: configured.name,
        turns: 0,
        held: true,
      };
      sessions.push(session);
      approvals.push({
        id: `approval-${uid}`,
        agent_id: "default",
        tool_name: "Run git push",
        tool_call_id: `call-${uid}`,
        tool_args: { command: "git push", _class: "execute" },
        status: "pending",
        created_at: new Date().toISOString(),
      });
      pushSnapshot();
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ type: "CUSTOM", name: "loop.session", value: session })}\n\n`,
      );
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/v1/apps/sessions")
      return json(200, { sessions, has_more: false });
    const byUid = url.pathname.match(
      /^\/api\/v1\/apps\/sessions\/([^/]+)(\/messages)?$/,
    );
    if (request.method === "GET" && byUid) {
      const session = sessions.find((candidate) => candidate.uid === byUid[1]);
      if (!session)
        return json(404, { detail: `There is no session ${byUid[1]} here.` });
      if (byUid[2])
        return json(200, {
          messages: [
            {
              id: `${session.uid}-u1`,
              role: "user",
              content: "Hello from the stub",
            },
            {
              id: `${session.uid}-a1`,
              role: "assistant",
              content: "The stub answers.",
            },
          ],
        });
      return json(200, {
        ...session,
        archived: false,
        lineage: { forked_from: null, imported_from: null },
        runs_on: null,
        harness: "fake",
      });
    }
    if (request.method === "GET" && url.pathname === "/stub/decisions")
      return json(200, { decisions });
    json(404, {
      detail: `The stub loop does not serve ${request.method} ${url.pathname}.`,
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname !== "/api/v1/tool-approvals/ws") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      sockets.add(ws);
      ws.send(JSON.stringify(snapshot()));
      ws.on("message", (raw) => {
        let message;
        try {
          message = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (
          message.type === "tool_approval_decision" &&
          typeof message.approvalId === "string" &&
          typeof message.approved === "boolean"
        ) {
          const approval = approvals.find(
            (candidate) => candidate.id === message.approvalId,
          );
          if (approval && approval.status === "pending") {
            approval.status = message.approved ? "approved" : "rejected";
            decisions.push({
              approvalId: message.approvalId,
              approved: message.approved,
            });
          }
          pushSnapshot();
        } else if (message.type === "request_snapshot") {
          ws.send(JSON.stringify(snapshot()));
        }
      });
      ws.on("close", () => sockets.delete(ws));
    });
  });
  const port = await listen(server);
  console.log(`Auto-selected free port ${port}`);
  console.log(
    `Uvicorn running on http://127.0.0.1:${port} (Press CTRL+C to quit)`,
  );
  process.on("SIGTERM", () => process.exit(0));
} else if (args[0] === "apps" && args[1] === "run") {
  const file = args[2];
  const web = args.includes("--web");
  if (!web) {
    console.log("✗ The stub loop serves an application with --web only.");
    process.exit(1);
  }
  const portIndex = args.indexOf("--port");
  const asked = portIndex >= 0 ? Number(args[portIndex + 1]) : 0;
  const name = file.split(/[\\/]/).pop();
  const server = createServer((request, response) => {
    if (request.url === "/app") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        `<!DOCTYPE html><html><body><h1>${name}</h1><p>served by the stub loop</p></body></html>`,
      );
      return;
    }
    response.writeHead(302, { Location: "/app" });
    response.end();
  });
  const port = await new Promise((resolve) =>
    server.listen(asked, "127.0.0.1", () => resolve(server.address().port)),
  );
  console.log(
    `🧪  ${name} is served on this machine at http://127.0.0.1:${port}/app${args.includes("--watch") ? `, reloaded when a file of ${process.cwd()} changes` : ""}. Ctrl-C stops it.`,
  );
  process.on("SIGTERM", () => process.exit(0));
} else {
  console.error(
    `The stub loop knows --version, serve and apps run --web; not: ${args.join(" ")}`,
  );
  process.exit(2);
}
