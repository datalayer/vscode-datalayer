/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Datasources for the extension host, over the Contents service.
 *
 * Datalayer Core 1.2 moved datasources out of IAM: a datasource is a
 * `kind: "datasource"` content source, created, listed, updated and archived
 * through `@datalayer/core/lib/api/contents`. The settings tree and the
 * datasource dialogs keep the flat shape they always displayed
 * (`DatasourceJSON`); this module is the one place that maps it onto the
 * catalog's `CatalogSource`.
 *
 * @module services/datasources
 */

import type {
  CatalogSource,
  ContentSourceCreate,
  ContentSourceUpdate,
  DatasourceConfiguration,
  DatasourceConnectorType,
} from "@datalayer/core/lib/api/contents";
import {
  archiveSource,
  createSource,
  DATASOURCE_CONNECTOR_LABELS,
  getSource,
  listSources,
  updateSource,
} from "@datalayer/core/lib/api/contents";
import { randomUUID } from "crypto";

import { getServiceContainer } from "../extension";
import { getValidatedSettingsGroup } from "./config/settingsValidator";

/** The flat datasource the tree items and the dialogs display. */
export interface DatasourceJSON {
  /** The content source uid. */
  uid: string;
  /** The connector's display name, e.g. `Amazon Athena`. */
  type: string;
  /** The connector type, e.g. `athena`. */
  variant?: string;
  name: string;
  description: string;
  /** The database (Athena, SQL) or project (BigQuery) queries run in. */
  database?: string;
  /**
   * Kept for the dialogs that still show it: the Contents service holds the
   * output bucket in the datasource's Secret, not on the source.
   */
  outputBucket?: string;
  createdAt?: Date;
  updatedAt?: Date;
  /** The catalog entry's etag, required by updates and deletion. */
  etag?: string;
}

/** What the dialogs send: the display type plus the flat fields. */
export interface DatasourceInput {
  type: string;
  name: string;
  description?: string;
  database?: string;
  output_bucket?: string;
}

/** Where the Contents service is and who is asking. */
export interface DatasourceConnection {
  contentsUrl: string;
  token: string;
}

/** The connectors a datasource can be created with, by their display name. */
const CONNECTOR_BY_LABEL: Record<string, DatasourceConnectorType> = {
  "Amazon Athena": "athena",
  "Google BigQuery": "bigquery",
  "SQL database": "sql",
  athena: "athena",
  bigquery: "bigquery",
  sql: "sql",
};

/**
 * Resolves the Contents connection from the signed-in SDK client and the
 * services settings (Contents runs on the runtimes host).
 *
 * @returns The Contents URL and the caller's token.
 *
 * @throws When nobody is signed in.
 */
export function datasourceConnection(): DatasourceConnection {
  const token = getServiceContainer().datalayer.getToken();
  const contentsUrl = getValidatedSettingsGroup("services").runtimesUrl;
  if (!token) {
    throw new Error("Sign in to Datalayer to manage datasources.");
  }
  return { contentsUrl, token };
}

/**
 * The connector type a dialog's display type names.
 *
 * @param type - The display type, e.g. `Amazon Athena`, or a connector type.
 *
 * @returns The connector type the Contents service knows the display name as.
 *
 * @throws When the Contents service has no such connector.
 */
export function connectorTypeOf(type: string): DatasourceConnectorType {
  const connector = CONNECTOR_BY_LABEL[type];
  if (!connector) {
    const offered = Object.keys(CONNECTOR_BY_LABEL)
      .filter((label) => label.includes(" "))
      .join(", ");
    throw new Error(
      `"${type}" is not a connector the Contents service offers; choose one of ${offered}.`,
    );
  }
  return connector;
}

/**
 * Flattens a catalog entry into what the tree and the dialogs display.
 *
 * @param entry - A `kind: "datasource"` catalog entry with its etag.
 * @param entry.source - The content source.
 * @param entry.etag - The version an update or a deletion must present.
 *
 * @returns The entry as the tree and the dialogs display it.
 */
export function toDatasourceJSON(entry: {
  source: CatalogSource["source"];
  etag?: string;
}): DatasourceJSON {
  const { source, etag } = entry;
  const configuration =
    source.configuration as Partial<DatasourceConfiguration>;
  const connector = configuration.connectorType;
  return {
    uid: source.uid,
    type: connector
      ? (DATASOURCE_CONNECTOR_LABELS[connector] ?? connector)
      : "Datasource",
    variant: connector,
    name: source.name,
    description: source.description ?? "",
    database: configuration.databaseOrProject ?? undefined,
    createdAt: source.createdAt ? new Date(source.createdAt) : undefined,
    updatedAt: source.updatedAt ? new Date(source.updatedAt) : undefined,
    etag,
  };
}

/**
 * Lists the caller's datasources.
 *
 * @param connection - Where the Contents service is and who is asking.
 *
 * @returns Every `kind: "datasource"` source, flattened.
 */
export async function listDatasources(
  connection: DatasourceConnection,
): Promise<DatasourceJSON[]> {
  const items: DatasourceJSON[] = [];
  let cursor: string | undefined;
  do {
    const page = await listSources(
      connection.token,
      { kind: "datasource", cursor },
      connection.contentsUrl,
    );
    items.push(...page.items.map((entry) => toDatasourceJSON(entry)));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

/**
 * Reads one datasource, with the etag an update or a deletion needs.
 *
 * @param connection - Where the Contents service is and who is asking.
 * @param uid - The content source uid.
 *
 * @returns The flat datasource.
 */
export async function getDatasource(
  connection: DatasourceConnection,
  uid: string,
): Promise<DatasourceJSON> {
  const entry = await getSource(connection.token, uid, connection.contentsUrl);
  return toDatasourceJSON({ source: entry.value.source, etag: entry.etag });
}

/**
 * Creates a datasource from the dialog's fields.
 *
 * The source is created without a credential: the dialog has no Secret
 * picker yet, so the datasource shows in the catalog and the user attaches
 * the Secret from the web application before querying it.
 *
 * @param connection - Where the Contents service is and who is asking.
 * @param input - The dialog's fields.
 *
 * @returns The created datasource.
 */
export async function createDatasource(
  connection: DatasourceConnection,
  input: DatasourceInput,
): Promise<DatasourceJSON> {
  const connectorType = connectorTypeOf(input.type);
  const source: ContentSourceCreate = {
    kind: "datasource",
    name: input.name.trim(),
    description: input.description?.trim() || null,
    capabilities: ["query"],
    configuration: {
      kind: "datasource",
      connectorType,
      databaseOrProject: input.database?.trim() || null,
      networkRoute: "direct",
    },
  };
  const entry = await createSource(
    connection.token,
    source,
    `vscode-datasource:${randomUUID()}`,
    connection.contentsUrl,
  );
  return toDatasourceJSON({ source: entry.value.source, etag: entry.etag });
}

/**
 * Updates a datasource's name, description and database.
 *
 * @param connection - Where the Contents service is and who is asking.
 * @param uid - The content source uid.
 * @param input - The dialog's fields; only the ones present change.
 *
 * @returns The updated datasource.
 */
export async function updateDatasource(
  connection: DatasourceConnection,
  uid: string,
  input: Partial<DatasourceInput>,
): Promise<DatasourceJSON> {
  const current = await getSource(
    connection.token,
    uid,
    connection.contentsUrl,
  );
  const update: ContentSourceUpdate = {};
  if (input.name !== undefined) {
    update.name = input.name.trim();
  }
  if (input.description !== undefined) {
    update.description = input.description.trim() || null;
  }
  if (input.database !== undefined || input.type !== undefined) {
    const configuration = current.value.source
      .configuration as DatasourceConfiguration;
    update.configuration = {
      ...configuration,
      connectorType: input.type
        ? connectorTypeOf(input.type)
        : configuration.connectorType,
      databaseOrProject:
        input.database !== undefined
          ? input.database.trim() || null
          : configuration.databaseOrProject,
    };
  }
  const entry = await updateSource(
    connection.token,
    uid,
    update,
    current.etag,
    connection.contentsUrl,
  );
  return toDatasourceJSON({ source: entry.value.source, etag: entry.etag });
}

/**
 * Deletes a datasource: the catalog archives the source.
 *
 * @param connection - Where the Contents service is and who is asking.
 * @param uid - The content source uid.
 */
export async function deleteDatasource(
  connection: DatasourceConnection,
  uid: string,
): Promise<void> {
  const current = await getSource(
    connection.token,
    uid,
    connection.contentsUrl,
  );
  await archiveSource(
    connection.token,
    uid,
    current.etag,
    connection.contentsUrl,
  );
}
