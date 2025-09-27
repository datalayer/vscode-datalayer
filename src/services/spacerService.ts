/*
 * Copyright (c) 2021-2023 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Spacer service for managing Datalayer spaces and documents.
 * Provides SDK-based operations for spaces, notebooks, and lexical documents.
 *
 * @module services/spacerService
 */

import * as vscode from "vscode";
import { getSDKInstance } from "./sdkAdapter";

/**
 * Singleton service for managing Datalayer spaces and documents.
 * Provides high-level operations using SDK model instances.
 *
 * @example
 * ```typescript
 * const service = SDKSpacerService.getInstance();
 * const spaces = await service.getUserSpaces();
 * ```
 */
export class SDKSpacerService {
  private static instance: SDKSpacerService;

  private constructor() {}

  /**
   * Gets the singleton instance of SDKSpacerService.
   *
   * @returns The singleton service instance
   */
  static getInstance(): SDKSpacerService {
    if (!SDKSpacerService.instance) {
      SDKSpacerService.instance = new SDKSpacerService();
    }
    return SDKSpacerService.instance;
  }

  /**
   * Gets all spaces for the authenticated user.
   *
   * @returns Array of SDK Space model instances
   */
  async getUserSpaces() {
    console.log("[SDKSpacer] Fetching user spaces");

    try {
      const sdk = getSDKInstance();
      const spaces = await (sdk as any).getMySpaces();

      console.log("[SDKSpacer] Fetched spaces count:", spaces?.length);
      return spaces || [];
    } catch (error) {
      console.error("[SDKSpacer] Error fetching spaces:", error);
      if (
        error instanceof Error &&
        error.message.includes("Not authenticated")
      ) {
        vscode.window
          .showErrorMessage("Please login to Datalayer to view spaces", "Login")
          .then((selection) => {
            if (selection === "Login") {
              vscode.commands.executeCommand("datalayer.login");
            }
          });
      }
      throw error;
    }
  }

  /**
   * Gets all items in a specific space.
   *
   * @param spaceId - Space unique identifier
   * @returns Array of SDK Notebook, Lexical, and Cell model instances
   */
  async getSpaceItems(spaceId: string) {
    console.log("[SDKSpacer] Fetching items for space:", spaceId);

    try {
      const sdk = getSDKInstance();

      // Get the space to access its items
      const spaces = await (sdk as any).getMySpaces();
      const space = spaces.find((s: any) => s.uid === spaceId);

      if (!space) {
        throw new Error(`Space with ID ${spaceId} not found`);
      }

      // Get items from the space - returns Notebook, Lexical, and Cell model instances
      const items = await space.getItems();
      console.log("[SDKSpacer] Fetched items:", items.length);

      return items || [];
    } catch (error) {
      console.error("[SDKSpacer] Error fetching space items:", error);
      throw error;
    }
  }

  /**
   * Gets notebook details by ID.
   *
   * @param notebookId - Notebook unique identifier
   * @returns SDK Notebook model instance
   */
  async getNotebookDetails(notebookId: string) {
    console.log("[SDKSpacer] Fetching notebook details:", notebookId);

    try {
      const sdk = getSDKInstance();
      const notebook = await (sdk as any).getNotebook(notebookId);
      return notebook;
    } catch (error) {
      console.error("[SDKSpacer] Error fetching notebook:", error);
      throw error;
    }
  }

  /**
   * Gets notebook content from model instance.
   *
   * @param notebookModel - SDK Notebook model instance
   * @returns Notebook content
   */
  async getNotebookContent(notebookModel: any) {
    console.log("[SDKSpacer] Fetching notebook content:", notebookModel.uid);

    try {
      // The model instance has getContent() method
      const content = await notebookModel.getContent();
      console.log("[SDKSpacer] Notebook content fetched successfully");
      return content;
    } catch (error) {
      console.error("[SDKSpacer] Error fetching notebook content:", error);
      throw error;
    }
  }

  /**
   * Gets document content from model instance.
   *
   * @param documentModel - SDK Notebook or Lexical model instance
   * @returns Document content
   */
  async getDocumentContent(documentModel: any) {
    console.log("[SDKSpacer] Fetching document content:", documentModel.uid);

    try {
      // Both Notebook and Lexical models have getContent() method
      const content = await documentModel.getContent();
      console.log("[SDKSpacer] Document content fetched successfully");
      return content;
    } catch (error) {
      console.error("[SDKSpacer] Error fetching document content:", error);
      throw error;
    }
  }

  /**
   * Creates a new notebook in a space.
   *
   * @param spaceId - Target space identifier
   * @param name - Notebook name
   * @param description - Optional description
   * @returns SDK Notebook model instance
   */
  async createNotebook(spaceId: string, name: string, description?: string) {
    console.log("[SDKSpacer] Creating notebook in space:", spaceId);

    try {
      const sdk = getSDKInstance();
      const formData = new FormData();
      formData.append("spaceId", spaceId);
      formData.append("name", name);
      if (description) {
        formData.append("description", description);
      }
      formData.append("notebookType", "jupyter");

      const notebook = await (sdk as any).createNotebook(formData);
      console.log("[SDKSpacer] Notebook created successfully");
      return notebook;
    } catch (error) {
      console.error("[SDKSpacer] Error creating notebook:", error);
      throw error;
    }
  }

  /**
   * Creates a new space.
   *
   * @param name - Space name
   * @param description - Optional description
   * @param isPublic - Whether space should be public (default: false)
   * @returns SDK Space model instance
   */
  async createSpace(
    name: string,
    description?: string,
    isPublic: boolean = false
  ) {
    console.log("[SDKSpacer] Creating space:", name);

    try {
      const sdk = getSDKInstance();
      const spaceHandle = name.toLowerCase().replace(/\s+/g, "-");

      const formData = new FormData();
      formData.append("name", name);
      formData.append("handle", spaceHandle);
      if (description) {
        formData.append("description", description);
      }
      formData.append("visibility", isPublic ? "public" : "private");
      formData.append("variant", "standard");

      const space = await (sdk as any).createSpace(formData);
      console.log("[SDKSpacer] Space created successfully");
      return space;
    } catch (error) {
      console.error("[SDKSpacer] Error creating space:", error);
      throw error;
    }
  }

  /**
   * Creates a new lexical document in a space.
   *
   * @param spaceId - Target space identifier
   * @param name - Document name
   * @param description - Optional description
   * @returns SDK Lexical model instance
   */
  async createLexicalDocument(
    spaceId: string,
    name: string,
    description?: string
  ) {
    console.log("[SDKSpacer] Creating lexical document in space:", spaceId);

    try {
      const sdk = getSDKInstance();
      const formData = new FormData();
      formData.append("spaceId", spaceId);
      formData.append("name", name);
      if (description) {
        formData.append("description", description);
      }
      formData.append("documentType", "lexical");

      const lexical = await (sdk as any).createLexical(formData);
      console.log("[SDKSpacer] Lexical document created successfully");
      return lexical;
    } catch (error) {
      console.error("[SDKSpacer] Error creating lexical document:", error);
      throw error;
    }
  }

  /**
   * Updates an item's name and description.
   * Works with both Notebook and Lexical model instances.
   *
   * @param itemModel - SDK model instance to update
   * @param newName - New name for the item
   * @param description - Optional new description
   * @returns True if update succeeded
   */
  async updateItemName(itemModel: any, newName: string, description?: string) {
    console.log("[SDKSpacer] Updating item name:", itemModel.uid, newName);

    try {
      // Both Notebook and Lexical models have update() method
      await itemModel.update({
        name: newName,
        description: description || itemModel.description || "",
      });

      console.log("[SDKSpacer] Item name updated successfully");
      return true;
    } catch (error) {
      console.error("[SDKSpacer] Error updating item name:", error);
      throw error;
    }
  }

  /**
   * Deletes an item from a space.
   * Works with both Notebook and Lexical model instances.
   *
   * @param itemModel - SDK model instance to delete
   * @returns True if deletion succeeded
   */
  async deleteItem(itemModel: any) {
    console.log("[SDKSpacer] Deleting item:", itemModel.uid);

    try {
      // Both Notebook and Lexical models have delete() method
      await itemModel.delete();
      console.log("[SDKSpacer] Item deleted successfully");
      return true;
    } catch (error) {
      console.error("[SDKSpacer] Error deleting item:", error);
      throw error;
    }
  }

  /**
   * Gets collaboration session ID for lexical documents.
   * Returns the document UID as the session ID for Datalayer collaboration.
   *
   * @param documentId - Lexical document UID
   * @returns Result object with session ID
   */
  async getLexicalCollaborationSessionId(documentId: string): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    // For Lexical documents in Datalayer, the document UID IS the session ID
    console.log(
      `[SDKSpacer] Using document UID as lexical collaboration session ID: ${documentId}`
    );

    return {
      success: true,
      sessionId: documentId,
    };
  }
}
