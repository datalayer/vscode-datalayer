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

import { createDocumentParamsSchema } from "../schemas/createDocument";
import { createCloudLexical, createLocalLexical } from "./createLexicalHelpers";
import {
  createCloudNotebook,
  createLocalNotebook,
} from "./createNotebookHelpers";

/** Document location type: local file system or cloud platform */
type DocumentLocation = "local" | "cloud";

/** Document type: Jupyter notebook or Lexical rich text. */
export type DocumentType = "notebook" | "lexical";

/**
 * Result of user intent detection for document location based on context analysis.
 */
interface IntentDetectionResult {
  /** Target location for document creation. */
  location: DocumentLocation;
  /** Confidence score (0-100) based on detection priority. */
  confidence: number;
  /** Reason explaining the detected location. */
  reason: string;
  /** Chat message to display to user about the choice. */
  chatMessage: string;
}

/**
 * Parameters for unified document creation supporting both local and cloud targets.
 */
export interface CreateDocumentParams {
  /** Name of the document. */
  name: string;
  /** Optional description of the document. */
  description?: string;
  /** Target space name for cloud documents. */
  spaceName?: string;
  /** Target space ID for cloud documents. */
  spaceId?: string;
  /** Document location ("local", "cloud", or "remote" synonym for cloud). */
  location?: "local" | "cloud" | "remote";
  /** Type of document to create. */
  documentType: DocumentType;
  /** Initial cells for notebooks (array of cell objects). */
  initialCells?: unknown[];
}

/**
 * Result of document creation operation including URI and optional metadata.
 */
export interface CreateDocumentResult {
  /** Whether document creation succeeded. */
  success: boolean;
  /** URI of the created document. */
  uri: string;
  /** ID of the created document. */
  documentId?: string;
  /** ID of the created notebook (backward compatibility). */
  notebookId?: string;
  /** Space name where cloud document was created. */
  spaceName?: string;
  /** Error message if creation failed. */
  error?: string;
  /** Chat message describing the result. */
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
 * Tool operation for creating documents (notebooks or lexical).
 */
export const createDocumentOperation: ToolOperation<
  CreateDocumentParams,
  CreateDocumentResult
> = {
  /** Tool name for MCP registration. */
  name: "createDocument",

  /**
   * Executes document creation with smart intent detection for location.
   * @param params - Document creation parameters.
   * @param context - Tool execution context with Datalayer and auth.
   *
   * @returns Result of document creation.
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
    const datalayer = (extras as Record<string, unknown>)?.datalayer;
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
          { datalayer, auth, extras: extras as Record<string, unknown> },
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
          { datalayer, auth, extras: extras as Record<string, unknown> },
          chatFeedback,
        );
      } else {
        return createLocalLexical({ name }, { extras }, chatFeedback);
      }
    }
  },
};

/**
 * Detects user intent for document location based on rich context analysis.
 * @param params - Document creation parameters.
 * @param context - Execution context with extras containing workspace and auth info.
 * @param context.extras - Additional context like workspace folders and auth state.
 *
 * @returns Intent detection result with location, confidence, reason, and message.
 */
/**
 * Detects intent from keywords in name/description text.
 * @param textToCheck - Lowercased combined text of name and description.
 * @param docTypeLabel - Document type label for chat messages.
 *
 * @returns Intent result if keyword-based detection succeeds, null otherwise.
 */
function detectKeywordIntent(
  textToCheck: string,
  docTypeLabel: string,
): IntentDetectionResult | null {
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

  return null;
}

/**
 * Detects intent from open document analysis (majority type).
 * @param notebookAnalysis - Analysis of currently open documents.
 * @param notebookAnalysis.nativeCount - Number of notebooks opened via VS Code native editor.
 * @param notebookAnalysis.localDatalayerCount - Number of notebooks opened locally via Datalayer editor.
 * @param notebookAnalysis.cloudDatalayerCount - Number of notebooks opened from a cloud Datalayer space.
 * @param notebookAnalysis.totalCount - Total number of open notebooks across all editor types.
 * @param notebookAnalysis.majorityType - Which editor type has the most open notebooks.
 * @param docTypeLabel - Document type label for chat messages.
 *
 * @returns Intent result if analysis produces a signal, null otherwise.
 */
function detectAnalysisIntent(
  notebookAnalysis: {
    nativeCount: number;
    localDatalayerCount: number;
    cloudDatalayerCount: number;
    totalCount: number;
    majorityType: "native" | "local" | "cloud" | "none";
  },
  docTypeLabel: string,
): IntentDetectionResult | null {
  if (notebookAnalysis.totalCount === 0) {
    return null;
  }

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

  return null;
}

/**
 * Detects intent from open notebook URIs by counting local vs cloud.
 * @param openNotebooks - URIs of all open notebooks.
 * @param docTypeLabel - Document type label for chat messages.
 *
 * @returns Intent result if a clear signal exists, null otherwise.
 */
function detectOpenNotebookIntent(
  openNotebooks: string[],
  docTypeLabel: string,
): IntentDetectionResult | null {
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

  return null;
}

/**
 * Determines intent from environment signals (workspace state and authentication).
 * @param hasWorkspace - Whether a VS Code workspace is open.
 * @param isAuthenticated - Whether the user is authenticated with Datalayer.
 * @param docTypeLabel - Document type label for chat messages.
 *
 * @returns Intent result based on environment signals.
 */
function detectEnvironmentIntent(
  hasWorkspace: boolean,
  isAuthenticated: boolean,
  docTypeLabel: string,
): IntentDetectionResult {
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

  if (hasWorkspace && isAuthenticated) {
    return {
      location: "cloud",
      confidence: 70,
      reason: "Authenticated user with workspace - prefer cloud",
      chatMessage: `Creating **cloud** ${docTypeLabel} (you're authenticated to Datalayer - use 'location: local' to override)`,
    };
  }

  return {
    location: "local",
    confidence: 25,
    reason: "No signals, defaulting to local",
    chatMessage: `Creating **local** ${docTypeLabel} (default choice)`,
  };
}

/**
 * Determines whether a new document should be created locally or in the cloud based on environment signals.
 * @param params - Document creation parameters including optional explicit location preference.
 * @param context - Execution context with optional additional state from the caller.
 * @param context.extras - Additional runtime state such as open notebook URIs and authentication status.
 *
 * @returns Resolved intent indicating cloud or local with a confidence score.
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

  // Priority 2: Space name mentioned (90% confidence)
  if (spaceName) {
    return {
      location: "cloud",
      confidence: 90,
      reason: `Space specified: ${spaceName}`,
      chatMessage: `Creating **cloud** ${docTypeLabel} in space "${spaceName}"`,
    };
  }

  // Priority 3: Keywords in name/description (88% confidence)
  const keywordResult = detectKeywordIntent(
    `${name} ${description}`.toLowerCase(),
    docTypeLabel,
  );
  if (keywordResult) {
    return keywordResult;
  }

  // Priority 4: Majority type from document analysis (85% confidence)
  if (notebookAnalysis) {
    const analysisResult = detectAnalysisIntent(notebookAnalysis, docTypeLabel);
    if (analysisResult) {
      return analysisResult;
    }
  }

  // Priority 5: Active document context (80% confidence)
  if (activeNotebook) {
    const isCloud = activeNotebook.startsWith("datalayer:");
    return {
      location: isCloud ? "cloud" : "local",
      confidence: 80,
      reason: isCloud ? "Active cloud document" : "Active local document",
      chatMessage: `Creating **${isCloud ? "cloud" : "local"}** ${docTypeLabel} (you have a ${isCloud ? "cloud" : "local"} document open)`,
    };
  }

  // Priority 6: Check all open documents (65% confidence)
  const notebookResult = detectOpenNotebookIntent(openNotebooks, docTypeLabel);
  if (notebookResult) {
    return notebookResult;
  }

  // Priorities 7-9: Environment signals and defaults
  return detectEnvironmentIntent(hasWorkspace, isAuthenticated, docTypeLabel);
}
