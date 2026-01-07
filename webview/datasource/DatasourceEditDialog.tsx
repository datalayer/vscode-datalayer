/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  FormControl,
  Heading,
  Text,
  TextInput,
  Textarea,
  Label,
} from "@primer/react";
import { EyeIcon, EyeClosedIcon } from "@primer/octicons-react";
import { PrimerVSCodeTheme } from "../theme/PrimerVSCodeTheme";

// VS Code API - declare and acquire
declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

interface DatasourceEditDialogProps {
  colorMode: "light" | "dark";
}

type DatasourceType =
  | "Amazon Athena"
  | "Google BigQuery"
  | "Microsoft Sentinel"
  | "Splunk";

interface DatasourceData {
  uid: string;
  type: DatasourceType;
  variant: string;
  name: string;
  description: string;
  database?: string;
  outputBucket?: string;
}

interface FormData {
  name: string;
  description: string;
}

export function DatasourceEditDialog({ colorMode }: DatasourceEditDialogProps) {
  const [isReady, setIsReady] = useState(false);
  const [datasource, setDatasource] = useState<DatasourceData | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    description: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordVisibility, setPasswordVisibility] = useState(false);

  useEffect(() => {
    // Listen for messages from extension
    window.addEventListener("message", (event) => {
      const message = event.data;

      switch (message.type) {
        case "init-edit":
          // Extension sent datasource data
          const ds: DatasourceData = message.body.datasource;
          setDatasource(ds);
          setFormData({
            name: ds.name,
            description: ds.description,
          });
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

    if (!formData.description || formData.description.length < 3) {
      newErrors.description = "Description must be at least 3 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !datasource) return;

    setIsSubmitting(true);

    // Build request body
    const body = {
      uid: datasource.uid,
      name: formData.name.trim(),
      description: formData.description.trim(),
    };

    // Send update request to extension
    vscode.postMessage({
      type: "update-datasource",
      body,
    });
  };

  if (!isReady || !datasource) {
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
      <Box sx={{ p: 3 }}>
        <Heading as="h1" sx={{ mb: 3 }}>
          Edit Datasource
        </Heading>

        {errors.submit && (
          <Box
            sx={{
              p: 2,
              mb: 3,
              bg: "danger.subtle",
              borderColor: "danger.emphasis",
              borderWidth: 1,
              borderStyle: "solid",
              borderRadius: 2,
            }}
          >
            <Text sx={{ color: "danger.fg" }}>{errors.submit}</Text>
          </Box>
        )}

        <Box display="flex" sx={{ gap: 4 }}>
          {/* Left column - Avatar and info */}
          <Box sx={{ minWidth: 200 }}>
            <Box
              sx={{
                width: 100,
                height: 100,
                borderRadius: "50%",
                bg: "accent.emphasis",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                fontWeight: "bold",
                color: "fg.onEmphasis",
                mb: 3,
              }}
            >
              {datasource.name.charAt(0).toUpperCase()}
            </Box>
            <Text as="h2" sx={{ fontSize: 3, fontWeight: "bold", mb: 2 }}>
              {datasource.name}
            </Text>
            <Box mt={2}>
              <Label size="large">{datasource.variant}</Label>
            </Box>
          </Box>

          {/* Right column - Form */}
          <Box sx={{ flex: 1 }}>
            <FormControl required disabled={isSubmitting} sx={{ mb: 3 }}>
              <FormControl.Label>Name</FormControl.Label>
              <TextInput
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                validationStatus={errors.name ? "error" : undefined}
                block
              />
              {errors.name && (
                <FormControl.Validation variant="error">
                  {errors.name}
                </FormControl.Validation>
              )}
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
                rows={5}
              />
              {errors.description && (
                <FormControl.Validation variant="error">
                  {errors.description}
                </FormControl.Validation>
              )}
            </FormControl>

            {datasource.database && (
              <FormControl disabled sx={{ mb: 3 }}>
                <FormControl.Label>Database</FormControl.Label>
                <TextInput
                  placeholder="Database"
                  contrast
                  size="large"
                  type={passwordVisibility ? "text" : "password"}
                  value={datasource.database}
                  trailingAction={
                    <TextInput.Action
                      onClick={() => setPasswordVisibility(!passwordVisibility)}
                      icon={passwordVisibility ? EyeClosedIcon : EyeIcon}
                      aria-label={
                        passwordVisibility ? "Hide database" : "Reveal database"
                      }
                    />
                  }
                  block
                />
              </FormControl>
            )}

            {datasource.outputBucket && (
              <FormControl disabled sx={{ mb: 3 }}>
                <FormControl.Label>Output Bucket</FormControl.Label>
                <TextInput
                  placeholder="Output bucket"
                  contrast
                  size="large"
                  type={passwordVisibility ? "text" : "password"}
                  value={datasource.outputBucket}
                  trailingAction={
                    <TextInput.Action
                      onClick={() => setPasswordVisibility(!passwordVisibility)}
                      icon={passwordVisibility ? EyeClosedIcon : EyeIcon}
                      aria-label={
                        passwordVisibility
                          ? "Hide output bucket"
                          : "Reveal output bucket"
                      }
                    />
                  }
                  block
                />
              </FormControl>
            )}

            <Box sx={{ display: "flex", gap: 2, mt: 4 }}>
              <Button
                onClick={handleSubmit}
                variant="primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating..." : "Update"}
              </Button>
              <Button
                onClick={() => vscode.postMessage({ type: "cancel" })}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </PrimerVSCodeTheme>
  );
}
