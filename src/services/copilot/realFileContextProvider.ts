import * as vscode from "vscode";
import * as path from "path";
import { getActiveCustomEditorUri } from "../../utils/activeDocument";

/**
 * Creates a real filesystem file that updates with current editor context.
 * Copilot can see this file and it auto-updates when you switch files.
 */
export class RealFileContextProvider {
  private contextFilePath: vscode.Uri | undefined;
  private updateTimeout: NodeJS.Timeout | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  async activate(): Promise<void> {
    // Create context file in workspace .vscode folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return;
    }

    const vscodeFolderPath = vscode.Uri.joinPath(
      workspaceFolder.uri,
      ".vscode",
    );
    this.contextFilePath = vscode.Uri.joinPath(
      vscodeFolderPath,
      ".copilot-active-context.md",
    );

    // Ensure .vscode folder exists
    try {
      await vscode.workspace.fs.createDirectory(vscodeFolderPath);
    } catch {
      // Already exists
    }

    // Create initial file
    await this.updateContextFile();

    // Watch for tab changes
    this.context.subscriptions.push(
      vscode.window.tabGroups.onDidChangeTabs(async () => {
        // Debounce updates
        if (this.updateTimeout) {
          clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => this.updateContextFile(), 300);
      }),
    );

    // Open the file invisibly (so Copilot can see it but user doesn't)
    await this.openContextFileInBackground();
  }

  private async updateContextFile(): Promise<void> {
    if (!this.contextFilePath) {
      return;
    }

    const uri = getActiveCustomEditorUri();

    let content = "# Active Editor Context\n\n";

    if (!uri) {
      content += "No file currently active.\n";
    } else {
      const fileName = path.basename(uri.fsPath);
      const fileType = uri.fsPath.endsWith(".ipynb")
        ? "Jupyter Notebook"
        : uri.fsPath.endsWith(".lexical")
          ? "Lexical Document"
          : "File";

      content += `**Current File**: \`${fileName}\`  \n`;
      content += `**Type**: ${fileType}  \n`;
      content += `**Path**: \`${uri.fsPath}\`  \n\n`;
      content += `---\n\n`;
      content += `> 💡 **For Copilot**: Use the \`datalayer_getActiveDocument\` tool to get the full content of this file.\n`;
    }

    // Write to file
    await vscode.workspace.fs.writeFile(
      this.contextFilePath,
      Buffer.from(content, "utf8"),
    );
  }

  private async openContextFileInBackground(): Promise<void> {
    if (!this.contextFilePath) {
      return;
    }

    // Open in preview mode (won't take focus)
    await vscode.window.showTextDocument(this.contextFilePath, {
      preview: true,
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.Beside,
    });

    // THEN close it immediately but it stays in "recent files"
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  }
}
