/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Unified Smart Create Document Operation
 *
 * Intelligently creates documents (notebooks or lexical) based on context.
 * This is the CORE unified logic shared by both createNotebook and createLexical.
 *
 * @module tools/vscode/createDocument
 */

import type { ToolOperation } from "@datalayer/jupyter-react";

type DocumentLocation = "local" | "cloud";
type DocumentType = "notebook" | "lexical";

interface IntentDetectionResult {
  location: DocumentLocation;
  confidence: number; // 0-100
  reason: string;
  chatMessage: string;
}

/**
 * Parameters for unified document creation
 */
export interface CreateDocumentParams {
  name: string;
  description?: string;
  spaceName?: string;
  spaceId?: string;
  location?: "local" | "cloud" | "remote";
  documentType: DocumentType;
  initialCells?: unknown[]; // For notebooks only
}

/**
 * Result of document creation
 */
export interface CreateDocumentResult {
  success: boolean;
  uri: string;
  documentId?: string;
  notebookId?: string; // Backward compat
  error?: string;
  chatMessage?: string;
}

/**
 * Unified Smart Create Document Operation
 *
 * Single operation that creates EITHER notebooks OR lexical documents,
 * EITHER local OR cloud, based on intelligent context detection.
 *
 * Intent detection priority (highest to lowest):
 * 1. 95% confidence: Explicit location parameter
 * 2. 90% confidence: Space name mentioned (→ cloud)
 * 3. 88% confidence: Keywords in name/description
 * 4. 85% confidence: Majority type from open documents
 * 5. 80% confidence: Active document context
 * 6. 65% confidence: Multiple documents of same type open
 * 7. 60% confidence: Environment signals (workspace/auth)
 * 8. <50% confidence: Ambiguous → Prompt user
 */
export const createDocumentOperation: ToolOperation<
  CreateDocumentParams,
  CreateDocumentResult
> = {
  name: "createDocument",

  async execute(params, context): Promise<CreateDocumentResult> {
    const {
      name,
      description,
      spaceName,
      spaceId,
      documentType,
      initialCells,
    } = params;
    const { sdk, auth, extras } = context;

    // Detect intent
    const intent = await detectIntent(params, context);

    let finalLocation: DocumentLocation = intent.location;
    let chatFeedback = intent.chatMessage;

    // If confidence is low (< 50%), need to prompt user
    if (intent.confidence < 50) {
      const extrasWithPrompt = extras as {
        promptForLocation?: (
          spaceName?: string,
        ) => Promise<DocumentLocation | undefined>;
      };

      if (extrasWithPrompt?.promptForLocation) {
        const chosen = await extrasWithPrompt.promptForLocation(spaceName);
        if (!chosen) {
          return {
            success: false,
            uri: "",
            error: "Document creation cancelled - no location selected",
          };
        }
        finalLocation = chosen;
        chatFeedback = `You selected **${finalLocation}** ${documentType}`;
      } else {
        // No prompt available, default to local
        finalLocation = "local";
        chatFeedback = `Creating **local** ${documentType} (default choice, no context available)`;
      }
    }

    // Execute based on document type and location
    if (documentType === "notebook") {
      if (finalLocation === "cloud") {
        return createCloudNotebook(
          {
            name,
            description,
            spaceName: spaceName || "Library space",
            spaceId,
            initialCells,
          },
          { sdk, auth },
          chatFeedback,
        );
      } else {
        return createLocalNotebook(
          { name, initialCells },
          { extras },
          chatFeedback,
        );
      }
    } else {
      // lexical
      if (finalLocation === "cloud") {
        return createCloudLexical(
          {
            name,
            description,
            spaceName: spaceName || "Library space",
            spaceId,
          },
          { sdk, auth },
          chatFeedback,
        );
      } else {
        return createLocalLexical({ name }, { extras }, chatFeedback);
      }
    }
  },
};

/**
 * Detects user intent for document location based on rich context analysis
 */
async function detectIntent(
  params: CreateDocumentParams,
  context: { extras?: unknown },
): Promise<IntentDetectionResult> {
  const {
    name = "",
    description = "",
    spaceName,
    location,
    documentType,
  } = params;
  const { extras } = context;

  // Extract context from extras (provided by platform adapter)
  const extrasWithContext = extras as {
    hasWorkspace?: boolean;
    isAuthenticated?: boolean;
    activeNotebookUri?: string;
    openNotebookUris?: string[];
    notebookAnalysis?: {
      nativeCount: number;
      localDatalayerCount: number;
      cloudDatalayerCount: number;
      totalCount: number;
      majorityType: "native" | "local" | "cloud" | "none";
    };
  };

  const hasWorkspace = extrasWithContext.hasWorkspace ?? false;
  const isAuthenticated = extrasWithContext.isAuthenticated ?? false;
  const activeNotebook = extrasWithContext.activeNotebookUri;
  const openNotebooks = extrasWithContext.openNotebookUris ?? [];
  const notebookAnalysis = extrasWithContext.notebookAnalysis;

  const docTypeLabel =
    documentType === "notebook" ? "notebook" : "lexical document";

  // Priority 1: Explicit location parameter (95% confidence)
  if (location) {
    const loc: DocumentLocation = location === "remote" ? "cloud" : location;
    return {
      location: loc,
      confidence: 95,
      reason: `Explicit location: ${location}`,
      chatMessage: `Creating **${loc}** ${docTypeLabel} (you specified "${location}")`,
    };
  }

  // Priority 2: Space name mentioned (90% confidence → cloud)
  if (spaceName) {
    return {
      location: "cloud",
      confidence: 90,
      reason: `Space specified: ${spaceName}`,
      chatMessage: `Creating **cloud** ${docTypeLabel} in space "${spaceName}"`,
    };
  }

  // Priority 3: Keywords in name/description (88% confidence)
  const textToCheck = `${name} ${description}`.toLowerCase();
  const localKeywords = ["local", "workspace", "file", "disk"];
  const cloudKeywords = [
    "cloud",
    "remote",
    "space",
    "datalayer",
    "shared",
    "collaborative",
  ];

  const hasLocalKeyword = localKeywords.some((kw) => textToCheck.includes(kw));
  const hasCloudKeyword = cloudKeywords.some((kw) => textToCheck.includes(kw));

  if (hasLocalKeyword && !hasCloudKeyword) {
    return {
      location: "local",
      confidence: 88,
      reason: "Local keywords detected",
      chatMessage: `Creating **local** ${docTypeLabel} (detected keywords like "${localKeywords.find((kw) => textToCheck.includes(kw))}")`,
    };
  }

  if (hasCloudKeyword && !hasLocalKeyword) {
    return {
      location: "cloud",
      confidence: 88,
      reason: "Cloud keywords detected",
      chatMessage: `Creating **cloud** ${docTypeLabel} (detected keywords like "${cloudKeywords.find((kw) => textToCheck.includes(kw))}")`,
    };
  }

  // Priority 4: Majority type from document analysis (85% confidence)
  if (notebookAnalysis && notebookAnalysis.totalCount > 0) {
    const {
      majorityType,
      localDatalayerCount,
      cloudDatalayerCount,
      nativeCount,
      totalCount,
    } = notebookAnalysis;

    if (majorityType === "cloud") {
      return {
        location: "cloud",
        confidence: 85,
        reason: `Majority of open documents are cloud (${cloudDatalayerCount}/${totalCount})`,
        chatMessage: `Creating **cloud** ${docTypeLabel} (you have ${cloudDatalayerCount} cloud document${cloudDatalayerCount > 1 ? "s" : ""} open)`,
      };
    }

    if (majorityType === "local") {
      const localTotal = localDatalayerCount + nativeCount;
      return {
        location: "local",
        confidence: 85,
        reason: `Majority of open documents are local (${localTotal}/${totalCount})`,
        chatMessage: `Creating **local** ${docTypeLabel} (you have ${localTotal} local document${localTotal > 1 ? "s" : ""} open)`,
      };
    }
  }

  // Priority 5: Active document context (80% confidence)
  if (activeNotebook) {
    if (activeNotebook.startsWith("datalayer:")) {
      return {
        location: "cloud",
        confidence: 80,
        reason: "Active cloud document",
        chatMessage: `Creating **cloud** ${docTypeLabel} (you have a cloud document open)`,
      };
    } else {
      return {
        location: "local",
        confidence: 80,
        reason: "Active local document",
        chatMessage: `Creating **local** ${docTypeLabel} (you have a local document open)`,
      };
    }
  }

  // Priority 6: Check all open documents (65% confidence)
  let localCount = 0;
  let cloudCount = 0;

  for (const nb of openNotebooks) {
    if (nb.startsWith("datalayer:")) {
      cloudCount++;
    } else {
      localCount++;
    }
  }

  if (localCount > 0 && cloudCount === 0) {
    return {
      location: "local",
      confidence: 65,
      reason: `${localCount} local document(s) open`,
      chatMessage: `Creating **local** ${docTypeLabel} (you have ${localCount} local document${localCount > 1 ? "s" : ""} open)`,
    };
  }

  if (cloudCount > 0 && localCount === 0) {
    return {
      location: "cloud",
      confidence: 65,
      reason: `${cloudCount} cloud document(s) open`,
      chatMessage: `Creating **cloud** ${docTypeLabel} (you have ${cloudCount} cloud document${cloudCount > 1 ? "s" : ""} open)`,
    };
  }

  // Priority 7: Environment signals (60% confidence)
  if (isAuthenticated && !hasWorkspace) {
    return {
      location: "cloud",
      confidence: 60,
      reason: "Authenticated, no workspace",
      chatMessage: `Creating **cloud** ${docTypeLabel} (you're authenticated but no workspace is open)`,
    };
  }

  if (hasWorkspace && !isAuthenticated) {
    return {
      location: "local",
      confidence: 60,
      reason: "Workspace open, not authenticated",
      chatMessage: `Creating **local** ${docTypeLabel} (workspace is open but you're not authenticated)`,
    };
  }

  // Priority 8: Both available → Ambiguous (30% confidence)
  if (hasWorkspace && isAuthenticated) {
    return {
      location: "local",
      confidence: 30,
      reason: "Ambiguous: both options available",
      chatMessage: `I'll ask you where to create the ${docTypeLabel} (both local and cloud are available)`,
    };
  }

  // Priority 9: Neither available → Default to local (25% confidence)
  return {
    location: "local",
    confidence: 25,
    reason: "No signals, defaulting to local",
    chatMessage: `Creating **local** ${docTypeLabel} (default choice)`,
  };
}

/**
 * Creates a cloud notebook in Datalayer space
 */
async function createCloudNotebook(
  params: {
    name: string;
    description?: string;
    spaceName: string;
    spaceId?: string;
    initialCells?: unknown[];
  },
  context: { sdk?: unknown; auth?: unknown },
  chatMessage?: string,
): Promise<CreateDocumentResult> {
  const { name, description, spaceName, spaceId } = params;
  const { sdk, auth } = context;

  if (!sdk) {
    return {
      success: false,
      uri: "",
      error:
        "SDK is required for cloud notebook creation. Ensure you're authenticated.",
      chatMessage,
    };
  }

  if (
    !auth ||
    !(auth as { isAuthenticated?: () => boolean }).isAuthenticated?.()
  ) {
    return {
      success: false,
      uri: "",
      error:
        "Authentication is required for cloud notebook creation. Please login to Datalayer first.",
      chatMessage,
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = sdk as any;
    const finalName = name.endsWith(".ipynb") ? name : `${name}.ipynb`;

    let targetSpaceId = spaceId;

    if (!targetSpaceId) {
      const spaces = await client.getMySpaces();

      if (!spaces || spaces.length === 0) {
        return {
          success: false,
          uri: "",
          error: "No spaces available. Please create a space first.",
          chatMessage,
        };
      }

      const targetSpace = spaces.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) =>
          s.name?.toLowerCase() === spaceName.toLowerCase() ||
          s.name?.toLowerCase().includes(spaceName.toLowerCase()),
      );

      if (!targetSpace) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const availableSpaces = spaces.map((s: any) => s.name).join(", ");
        return {
          success: false,
          uri: "",
          error: `Space "${spaceName}" not found. Available spaces: ${availableSpaces}`,
          chatMessage,
        };
      }

      targetSpaceId = targetSpace.uid;
    }

    const notebook = await client.createNotebook(
      targetSpaceId,
      finalName,
      description || "",
    );

    if (!notebook) {
      return {
        success: false,
        uri: "",
        error: "Failed to create notebook (SDK returned null)",
        chatMessage,
      };
    }

    const uri = `datalayer:/${targetSpaceId}/${finalName}`;

    return {
      success: true,
      notebookId: notebook.uid,
      documentId: notebook.uid,
      uri,
      chatMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      uri: "",
      error: `Failed to create cloud notebook: ${errorMessage}`,
      chatMessage,
    };
  }
}

/**
 * Creates a local notebook file
 */
async function createLocalNotebook(
  params: { name: string; initialCells?: unknown[] },
  context: { extras?: unknown },
  chatMessage?: string,
): Promise<CreateDocumentResult> {
  const { name, initialCells } = params;
  const { extras } = context;

  try {
    const finalName = name.endsWith(".ipynb") ? name : `${name}.ipynb`;

    const extrasWithFile = extras as {
      createLocalFile?: (filename: string, content: unknown) => Promise<string>;
    };
    const createFile = extrasWithFile?.createLocalFile;

    if (!createFile) {
      throw new Error(
        "createLocalFile callback is required in extras for local notebook creation",
      );
    }

    const emptyNotebook = {
      cells: initialCells || [],
      metadata: {
        kernelspec: {
          name: "python3",
          display_name: "Python 3",
          language: "python",
        },
        language_info: {
          name: "python",
          version: "3.x",
          mimetype: "text/x-python",
          file_extension: ".py",
        },
      },
      nbformat: 4,
      nbformat_minor: 5,
    };

    const uri = await createFile(finalName, emptyNotebook);

    return {
      success: true,
      uri,
      chatMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      uri: "",
      error: `Failed to create local notebook: ${errorMessage}`,
      chatMessage,
    };
  }
}

/**
 * Creates a cloud lexical document in Datalayer space
 */
async function createCloudLexical(
  params: {
    name: string;
    description?: string;
    spaceName: string;
    spaceId?: string;
  },
  context: { sdk?: unknown; auth?: unknown },
  chatMessage?: string,
): Promise<CreateDocumentResult> {
  const { name, description, spaceName, spaceId } = params;
  const { sdk, auth } = context;

  if (!sdk) {
    return {
      success: false,
      uri: "",
      error:
        "SDK is required for cloud lexical creation. Ensure you're authenticated.",
      chatMessage,
    };
  }

  if (
    !auth ||
    !(auth as { isAuthenticated?: () => boolean }).isAuthenticated?.()
  ) {
    return {
      success: false,
      uri: "",
      error:
        "Authentication is required for cloud lexical creation. Please login to Datalayer first.",
      chatMessage,
    };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = sdk as any;
    const finalName = name.endsWith(".lexical") ? name : `${name}.lexical`;

    let targetSpaceId = spaceId;

    if (!targetSpaceId) {
      const spaces = await client.getMySpaces();

      if (!spaces || spaces.length === 0) {
        return {
          success: false,
          uri: "",
          error: "No spaces available. Please create a space first.",
          chatMessage,
        };
      }

      const targetSpace = spaces.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) =>
          s.name?.toLowerCase() === spaceName.toLowerCase() ||
          s.name?.toLowerCase().includes(spaceName.toLowerCase()),
      );

      if (!targetSpace) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const availableSpaces = spaces.map((s: any) => s.name).join(", ");
        return {
          success: false,
          uri: "",
          error: `Space "${spaceName}" not found. Available spaces: ${availableSpaces}`,
          chatMessage,
        };
      }

      targetSpaceId = targetSpace.uid;
    }

    const lexical = await client.createLexical(
      targetSpaceId,
      finalName,
      description || "",
    );

    if (!lexical) {
      return {
        success: false,
        uri: "",
        error: "Failed to create lexical document (SDK returned null)",
        chatMessage,
      };
    }

    const uri = `datalayer:/${targetSpaceId}/${finalName}`;

    return {
      success: true,
      documentId: lexical.uid,
      uri,
      chatMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      uri: "",
      error: `Failed to create cloud lexical: ${errorMessage}`,
      chatMessage,
    };
  }
}

/**
 * Creates a local lexical document file
 */
async function createLocalLexical(
  params: { name: string },
  context: { extras?: unknown },
  chatMessage?: string,
): Promise<CreateDocumentResult> {
  const { name } = params;
  const { extras } = context;

  try {
    const finalName = name.endsWith(".lexical") ? name : `${name}.lexical`;

    const extrasWithFile = extras as {
      createLocalFile?: (filename: string, content: unknown) => Promise<string>;
    };
    const createFile = extrasWithFile?.createLocalFile;

    if (!createFile) {
      throw new Error(
        "createLocalFile callback is required in extras for local lexical creation",
      );
    }

    const emptyLexical = {
      root: {
        children: [],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    };

    const uri = await createFile(finalName, emptyLexical);

    return {
      success: true,
      uri,
      chatMessage,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      uri: "",
      error: `Failed to create local lexical: ${errorMessage}`,
      chatMessage,
    };
  }
}
