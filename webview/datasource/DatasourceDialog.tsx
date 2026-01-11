/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  Flash,
  FormControl,
  Heading,
  Select,
  Text,
  TextInput,
  Textarea,
} from "@primer/react";
import { AlertIcon } from "@primer/octicons-react";
import { PrimerVSCodeTheme } from "../theme/PrimerVSCodeTheme";

// VS Code API - declare and acquire
declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

interface DatasourceDialogProps {
  colorMode: "light" | "dark";
}

type DatasourceType =
  | "Amazon Athena"
  | "Google BigQuery"
  | "Microsoft Sentinel"
  | "Splunk";

interface FormData {
  type: DatasourceType;
  name: string;
  description: string;
  database?: string;
  output_bucket?: string;
}

export function DatasourceDialog({ colorMode }: DatasourceDialogProps) {
  const [isReady, setIsReady] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    type: "Amazon Athena",
    name: "",
    description: "",
    database: "",
    output_bucket: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Listen for messages from extension
    window.addEventListener("message", (event) => {
      const message = event.data;

      switch (message.type) {
        case "init":
          // Extension is ready
          setIsReady(true);
          break;
        case "datasource-error":
          // Error from extension
          setErrors({
            submit: message.body.error,
          });
          setIsSubmitting(false);
          break;
      }
    });

    // Signal ready
    vscode.postMessage({ type: "ready" });
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.length < 3) {
      newErrors.name = "Name must be at least 3 characters";
    }

    if (!formData.description) {
      newErrors.description = "Description is required";
    }

    if (formData.type === "Amazon Athena") {
      if (!formData.database) {
        newErrors.database = "Database is required for Amazon Athena";
      }
      if (!formData.output_bucket) {
        newErrors.output_bucket = "Output bucket is required for Amazon Athena";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);

    // Build request body - core library will handle API mapping
    const body = {
      type: formData.type,
      name: formData.name.trim(),
      description: formData.description.trim(),
      database: formData.database?.trim() || "",
      output_bucket: formData.output_bucket?.trim() || "",
    };

    // Send form data to extension for processing
    vscode.postMessage({
      type: "create-datasource",
      body,
    });
  };

  const getRequiredSecrets = (): string => {
    switch (formData.type) {
      case "Amazon Athena":
        return "AWS_SECRET_ACCESS_KEY, AWS_ACCESS_KEY_ID, AWS_DEFAULT_REGION";
      case "Google BigQuery":
        return "GOOGLE_APPLICATION_CREDENTIALS";
      case "Microsoft Sentinel":
        return "AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, MSSENTINEL_WORKSPACE_ID, MSSENTINEL_WORKSPACE_NAME";
      case "Splunk":
        return "SPLUNK_HOST, SPLUNK_PORT, SPLUNK_USERNAME, SPLUNK_PASSWORD";
    }
  };

  if (!isReady) {
    return (
      <PrimerVSCodeTheme colorMode={colorMode}>
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Text>Loading...</Text>
        </Box>
      </PrimerVSCodeTheme>
    );
  }

  return (
    <PrimerVSCodeTheme colorMode={colorMode}>
      <Box sx={{ p: 3, maxWidth: 600 }}>
        <Heading as="h1" sx={{ mb: 3 }}>
          Create Datasource
        </Heading>

        <Flash variant="warning" sx={{ mb: 3 }}>
          <AlertIcon />
          <Box>
            <Text sx={{ fontWeight: "bold", display: "inline" }}>
              Required secrets:{" "}
            </Text>
            <Text sx={{ fontSize: 1, display: "inline" }}>
              {getRequiredSecrets()}
            </Text>
          </Box>
        </Flash>

        {errors.submit && (
          <Flash variant="danger" sx={{ mb: 3 }}>
            {errors.submit}
          </Flash>
        )}

        <FormControl required disabled={isSubmitting} sx={{ mb: 3 }}>
          <FormControl.Label>Type</FormControl.Label>
          <Select
            value={formData.type}
            onChange={(e) =>
              setFormData({
                ...formData,
                type: e.target.value as DatasourceType,
              })
            }
          >
            <Select.Option value="Amazon Athena">Amazon Athena</Select.Option>
            <Select.Option value="Google BigQuery">
              Google BigQuery
            </Select.Option>
            <Select.Option value="Microsoft Sentinel">
              Microsoft Sentinel
            </Select.Option>
            <Select.Option value="Splunk">Splunk</Select.Option>
          </Select>
        </FormControl>

        <FormControl required disabled={isSubmitting} sx={{ mb: 3 }}>
          <FormControl.Label>Name</FormControl.Label>
          <TextInput
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            validationStatus={errors.name ? "error" : undefined}
            block
          />
          {errors.name && (
            <FormControl.Validation variant="error">
              {errors.name}
            </FormControl.Validation>
          )}
          <FormControl.Caption>
            Short name that uniquely identifies your datasource
          </FormControl.Caption>
        </FormControl>

        <FormControl required disabled={isSubmitting} sx={{ mb: 3 }}>
          <FormControl.Label>Description</FormControl.Label>
          <Textarea
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            validationStatus={errors.description ? "error" : undefined}
            block
            rows={3}
          />
          {errors.description && (
            <FormControl.Validation variant="error">
              {errors.description}
            </FormControl.Validation>
          )}
        </FormControl>

        {formData.type === "Amazon Athena" && (
          <>
            <FormControl required disabled={isSubmitting} sx={{ mb: 3 }}>
              <FormControl.Label>Database</FormControl.Label>
              <TextInput
                value={formData.database || ""}
                onChange={(e) =>
                  setFormData({ ...formData, database: e.target.value })
                }
                validationStatus={errors.database ? "error" : undefined}
                block
              />
              {errors.database && (
                <FormControl.Validation variant="error">
                  {errors.database}
                </FormControl.Validation>
              )}
            </FormControl>

            <FormControl required disabled={isSubmitting} sx={{ mb: 3 }}>
              <FormControl.Label>Output Bucket</FormControl.Label>
              <TextInput
                value={formData.output_bucket || ""}
                onChange={(e) =>
                  setFormData({ ...formData, output_bucket: e.target.value })
                }
                placeholder="s3://my-bucket/path/"
                validationStatus={errors.output_bucket ? "error" : undefined}
                block
              />
              {errors.output_bucket && (
                <FormControl.Validation variant="error">
                  {errors.output_bucket}
                </FormControl.Validation>
              )}
            </FormControl>
          </>
        )}

        <Box sx={{ display: "flex", gap: 2, mt: 4 }}>
          <Button
            onClick={handleSubmit}
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
          <Button
            onClick={() => vscode.postMessage({ type: "cancel" })}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </Box>
      </Box>
    </PrimerVSCodeTheme>
  );
}
