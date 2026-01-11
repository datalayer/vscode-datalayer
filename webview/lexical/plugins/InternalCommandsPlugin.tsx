/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Plugin to handle internal commands from VS Code extension.
 * Responds to tool operations (get blocks, insert/delete/update blocks, etc.)
 *
 * @module lexical/plugins/InternalCommandsPlugin
 */

import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  INSERT_JUPYTER_INPUT_OUTPUT_COMMAND,
  editorStateToBlocks,
  getBlockCount,
  getRegisteredNodes,
  type LexicalBlock,
  lexicalToolOperations,
  type ToolOperation,
  DefaultExecutor as LexicalDefaultExecutor,
  useLexicalStore,
} from "@datalayer/jupyter-lexical";
// NOTE: LexicalDocumentController removed - legacy message handlers below are deprecated
// All tool operations should now use the Runner pattern (tool-execution messages)
import {
  createLexicalRunner,
  setupToolExecutionListener,
} from "../../services/runnerSetup";

/**
 * Plugin that listens to internal command messages from the VS Code extension
 * and executes the corresponding operations on the Lexical editor.
 */
export function InternalCommandsPlugin({
  vscode,
  lexicalId,
}: {
  vscode?: { postMessage: (message: unknown) => void };
  lexicalId?: string | null;
}): null {
  const [editor] = useLexicalComposerContext();
  // Get lexical store state for DefaultExecutor
  const lexicalStoreState = useLexicalStore();
  // Legacy controller ref - deprecated, kept for backward compatibility
  const controllerRef = useRef<any>(null);

  // Set up tool execution listener using Runner pattern
  useEffect(() => {
    if (!vscode) {
      console.warn(
        "[InternalCommandsPlugin] No vscode API provided, skipping tool execution setup",
      );
      return;
    }

    // Check if lexicalId is available
    if (!lexicalId) {
      console.warn(
        "[InternalCommandsPlugin] No lexicalId available yet, skipping tool execution setup",
      );
      return;
    }

    // Create DefaultExecutor for direct state manipulation
    const executor = new LexicalDefaultExecutor(lexicalId, lexicalStoreState);

    // Create runner with lexical operations, lexicalId, AND executor
    const runner = createLexicalRunner(
      lexicalToolOperations as Record<string, ToolOperation<unknown, unknown>>,
      lexicalId,
      executor,
    );

    // Set up listener for tool-execution messages from extension
    const cleanup = setupToolExecutionListener(runner, vscode);

    return cleanup;
  }, [vscode, lexicalId, lexicalStoreState]); // Recreate runner when lexicalId or store changes

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "lexical-get-blocks": {
          // Get all blocks
          const blocks = editorStateToBlocks(editor);

          if (message.requestId && vscode) {
            vscode.postMessage({
              type: "response",
              requestId: message.requestId,
              body: blocks,
            });
          }
          break;
        }

        case "lexical-get-metadata": {
          // Get metadata about the Lexical document
          const metadata = {
            blockCount: getBlockCount(editor),
            registeredNodes: getRegisteredNodes(editor).map(
              (n: { type: string; className?: string }) => n.type,
            ),
          };

          if (message.requestId && vscode) {
            vscode.postMessage({
              type: "response",
              requestId: message.requestId,
              body: metadata,
            });
          }
          break;
        }

        case "lexical-insert-block": {
          // Insert a new block using the document controller
          const { block, afterBlockId } = message.body;

          if (!controllerRef.current) {
            console.error(
              "[InternalCommandsPlugin] Controller not initialized",
            );
            if (message.requestId && vscode) {
              vscode.postMessage({
                type: "response",
                requestId: message.requestId,
                body: {
                  success: false,
                  error: "Controller not initialized",
                },
              });
            }
            break;
          }

          // Use the controller to insert the block
          controllerRef.current
            .insertBlock(block as LexicalBlock, afterBlockId)
            .then((result: { success: boolean; error?: string }) => {
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: result,
                });
              }
            })
            .catch((error: unknown) => {
              console.error(
                "[InternalCommandsPlugin] Failed to insert block:",
                error,
              );
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: {
                    success: false,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                });
              }
            });
          break;
        }

        case "lexical-insert-blocks": {
          // Insert multiple blocks
          const { blocks, afterBlockId } = message.body;

          if (!controllerRef.current) {
            console.error(
              "[InternalCommandsPlugin] Controller not initialized",
            );
            if (message.requestId && vscode) {
              vscode.postMessage({
                type: "response",
                requestId: message.requestId,
                body: {
                  success: false,
                  error: "Controller not initialized",
                },
              });
            }
            break;
          }

          controllerRef.current
            .insertBlocks(blocks, afterBlockId)
            .then((result: { success: boolean; error?: string }) => {
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: result,
                });
              }
            })
            .catch((error: unknown) => {
              console.error(
                "[InternalCommandsPlugin] Failed to insert blocks:",
                error,
              );
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: {
                    success: false,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                });
              }
            });
          break;
        }

        case "lexical-delete-block": {
          // Delete a block by ID
          const { blockId } = message.body;

          if (!controllerRef.current) {
            console.error(
              "[InternalCommandsPlugin] Controller not initialized",
            );
            if (message.requestId && vscode) {
              vscode.postMessage({
                type: "response",
                requestId: message.requestId,
                body: {
                  success: false,
                  error: "Controller not initialized",
                },
              });
            }
            break;
          }

          controllerRef.current
            .deleteBlock(blockId)
            .then((result: { success: boolean; error?: string }) => {
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: result,
                });
              }
            })
            .catch((error: unknown) => {
              console.error(
                "[InternalCommandsPlugin] Failed to delete block:",
                error,
              );
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: {
                    success: false,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                });
              }
            });
          break;
        }

        case "lexical-update-block": {
          // Update a block by ID
          const { blockId, block } = message.body;

          if (!controllerRef.current) {
            console.error(
              "[InternalCommandsPlugin] Controller not initialized",
            );
            if (message.requestId && vscode) {
              vscode.postMessage({
                type: "response",
                requestId: message.requestId,
                body: {
                  success: false,
                  error: "Controller not initialized",
                },
              });
            }
            break;
          }

          controllerRef.current
            .updateBlock(blockId, block as LexicalBlock)
            .then((result: { success: boolean; error?: string }) => {
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: result,
                });
              }
            })
            .catch((error: unknown) => {
              console.error(
                "[InternalCommandsPlugin] Failed to update block:",
                error,
              );
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: {
                    success: false,
                    error:
                      error instanceof Error ? error.message : String(error),
                  },
                });
              }
            });
          break;
        }

        case "lexical-get-registered-nodes": {
          // Get registered node types from editor._nodes
          const registeredNodes = getRegisteredNodes(editor);

          if (message.requestId && vscode) {
            vscode.postMessage({
              type: "response",
              requestId: message.requestId,
              body: registeredNodes,
            });
          }
          break;
        }

        case "dispatch-lexical-command": {
          // Dispatch a Lexical editor command (e.g., INSERT_JUPYTER_INPUT_OUTPUT_COMMAND)
          if (message.commandType === "INSERT_JUPYTER_INPUT_OUTPUT") {
            editor.dispatchCommand(
              INSERT_JUPYTER_INPUT_OUTPUT_COMMAND,
              message.payload,
            );
          } else {
            console.warn(
              `[InternalCommandsPlugin] Unknown command type: ${message.commandType}`,
            );
          }
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [editor, vscode]);

  return null;
}
