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
import { validateWithZod } from "@datalayer/jupyter-react";
import {
  createCloudNotebook,
  createLocalNotebook,
} from "./createNotebookHelpers";
import { createCloudLexical, createLocalLexical } from "./createLexicalHelpers";
import { createDocumentParamsSchema } from "../schemas/createDocument";

/** Document location type: local file system or cloud platform */
type DocumentLocation = "local" | "cloud";

/** Document type: Jupyter notebook or Lexical rich text */
type DocumentType = "notebook" | "lexical";

/**
 * Result of user intent detection for document location
 */
interface IntentDetectionResult {
  /** Target location for document creation */
  location: DocumentLocation;
  /** Confidence score (0-100) based on detection priority */
  confidence: number;
  /** Reason explaining the detected location */
  reason: string;
  /** Chat message to display to user about the choice */
  chatMessage: string;
}

/**
 * Parameters for unified document creation
 */
export interface CreateDocumentParams {
  /** Name of the document */
  name: string;
  /** Optional description of the document */
  description?: string;
  /** Target space name for cloud documents */
  spaceName?: string;
  /** Target space ID for cloud documents */
  spaceId?: string;
  /** Document location ("local", "cloud", or "remote" synonym for cloud) */
  location?: "local" | "cloud" | "remote";
  /** Type of document to create */
  documentType: DocumentType;
  /** Initial cells for notebooks (array of cell objects) */
  initialCells?: unknown[];
}

/**
 * Result of document creation operation
 */
export interface CreateDocumentResult {
  /** Whether document creation succeeded */
  success: boolean;
  /** URI of the created document */
  uri: string;
  /** ID of the created document */
  documentId?: string;
  /** ID of the created notebook (backward compatibility) */
  notebookId?: string;
  /** Space name where cloud document was created */
  spaceName?: string;
  /** Error message if creation failed */
  error?: string;
  /** Chat message describing the result */
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
/**
 * Tool operation for creating documents (notebooks or lexical)
 */
export const createDocumentOperation: ToolOperation<
  CreateDocumentParams,
  CreateDocumentResult
> = {
  /** Tool name for MCP registration */
  name: "createDocument",

  /**
   * Execute document creation
   * @param params - Document creation parameters
   * @param context - Tool execution context with SDK and auth
   * @returns Result of document creation
   */
  async execute(params, context): Promise<CreateDocumentResult> {
    // Validate params with Zod
    const validated = validateWithZod(
      createDocumentParamsSchema,
      params,
      "createDocument",
    );

    const {
      name,
      description,
      spaceName,
      spaceId,
      documentType,
      initialCells,
    } = validated;
    const { extras } = context;
    const sdk = (extras as Record<string, unknown>)?.sdk;
    const auth = (extras as Record<string, unknown>)?.auth;

    // Detect intent
    const intent = await detectIntent(validated, context);

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
          { sdk, auth, extras: extras as Record<string, unknown> },
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
          { sdk, auth, extras: extras as Record<string, unknown> },
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
 * @param params - Document creation parameters
 * @param context - Execution context with extras containing workspace and auth info
 * @returns Intent detection result with location, confidence, reason, and message
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

  /**
   * Context provided by platform adapter containing workspace and document analysis
   */
  const extrasWithContext = extras as {
    /** Whether a workspace is open */
    hasWorkspace?: boolean;
    /** Whether user is authenticated */
    isAuthenticated?: boolean;
    /** URI of currently active notebook */
    activeNotebookUri?: string;
    /** URIs of all open notebooks */
    openNotebookUris?: string[];
    /** Analysis of open notebooks by type */
    notebookAnalysis?: {
      /** Count of native Jupyter notebooks */
      nativeCount: number;
      /** Count of local Datalayer notebooks */
      localDatalayerCount: number;
      /** Count of cloud Datalayer notebooks */
      cloudDatalayerCount: number;
      /** Total notebook count */
      totalCount: number;
      /** Majority type among open notebooks */
      majorityType: "native" | "local" | "cloud" | "none";
    };
  };

  /** Whether workspace is currently open */
  const hasWorkspace = extrasWithContext.hasWorkspace ?? false;
  /** Whether user is authenticated with Datalayer */
  const isAuthenticated = extrasWithContext.isAuthenticated ?? false;
  /** URI of the currently active notebook document */
  const activeNotebook = extrasWithContext.activeNotebookUri;
  /** Array of URIs for all open notebook documents */
  const openNotebooks = extrasWithContext.openNotebookUris ?? [];
  /** Analysis of open documents by location type */
  const notebookAnalysis = extrasWithContext.notebookAnalysis;

  /** User-friendly label for the document type */
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
  /** Combined text of name and description for keyword analysis */
  const textToCheck = `${name} ${description}`.toLowerCase();
  /** Keywords indicating preference for local documents */
  const localKeywords = ["local", "workspace", "file", "disk"];
  /** Keywords indicating preference for cloud documents */
  const cloudKeywords = [
    "cloud",
    "remote",
    "space",
    "datalayer",
    "shared",
    "collaborative",
  ];

  /** Whether local keywords found in name/description */
  const hasLocalKeyword = localKeywords.some((kw) => textToCheck.includes(kw));
  /** Whether cloud keywords found in name/description */
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
    /** Destructure notebook analysis data */
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
      /** Total count of local documents (Datalayer + native) */
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
  /** Count of local documents among open notebooks */
  let localCount = 0;
  /** Count of cloud documents among open notebooks */
  let cloudCount = 0;

  /** Analyze all open notebooks to count local vs cloud */
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

  // Priority 8: Both available → Prefer cloud when authenticated (70% confidence)
  // User preference: when logged in to Datalayer, default to cloud/remote
  if (hasWorkspace && isAuthenticated) {
    return {
      location: "cloud",
      confidence: 70,
      reason: "Authenticated user with workspace → prefer cloud",
      chatMessage: `Creating **cloud** ${docTypeLabel} (you're authenticated to Datalayer - use 'location: local' to override)`,
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
