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
import { INSERT_JUPYTER_INPUT_OUTPUT_COMMAND } from "@datalayer/jupyter-lexical";
import {
  editorStateToBlocks,
  getBlockCount,
  getRegisteredNodes,
  type LexicalBlock,
} from "../../../src/datalayer-lexical/lexicalBlockUtils";
import { LexicalDocumentController } from "../../../src/datalayer-lexical/LexicalDocumentController";

/**
 * Plugin that listens to internal command messages from the VS Code extension
 * and executes the corresponding operations on the Lexical editor.
 */
export function InternalCommandsPlugin({
  vscode,
}: {
  vscode?: { postMessage: (message: unknown) => void };
}): null {
  const [editor] = useLexicalComposerContext();
  const controllerRef = useRef<LexicalDocumentController | null>(null);

  // Initialize controller
  useEffect(() => {
    controllerRef.current = new LexicalDocumentController(editor);
  }, [editor]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      console.log(`[InternalCommandsPlugin] Received message:`, message.type);

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
            registeredNodes: getRegisteredNodes(editor).map((n) => n.type),
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
          console.log(
            `[InternalCommandsPlugin] Received lexical-insert-block message:`,
            message,
          );
          const { block, afterBlockId } = message.body;
          console.log(`[InternalCommandsPlugin] Block data:`, {
            block,
            afterBlockId,
          });

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
            .then((result) => {
              console.log(`[InternalCommandsPlugin] Insert result:`, result);
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: result,
                });
              }
            })
            .catch((error) => {
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
            .then((result) => {
              console.log(
                `[InternalCommandsPlugin] Insert blocks result:`,
                result,
              );
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: result,
                });
              }
            })
            .catch((error) => {
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
            .then((result) => {
              console.log(`[InternalCommandsPlugin] Delete result:`, result);
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: result,
                });
              }
            })
            .catch((error) => {
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
            .then((result) => {
              console.log(`[InternalCommandsPlugin] Update result:`, result);
              if (message.requestId && vscode) {
                vscode.postMessage({
                  type: "response",
                  requestId: message.requestId,
                  body: result,
                });
              }
            })
            .catch((error) => {
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
          console.log(
            `[InternalCommandsPlugin] Dispatching Lexical command: ${message.commandType}`,
            message.payload,
          );

          if (message.commandType === "INSERT_JUPYTER_INPUT_OUTPUT") {
            editor.dispatchCommand(
              INSERT_JUPYTER_INPUT_OUTPUT_COMMAND,
              message.payload,
            );
            console.log(
              `[InternalCommandsPlugin] ✓ Jupyter cell command dispatched`,
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
