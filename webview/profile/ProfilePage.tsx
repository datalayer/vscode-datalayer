/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Profile page (`datalayer.profile.open`): the signed-in user, drawn by
 * core's `UserIdentity` — the component the web's profile page draws — from
 * the identity the extension host posts (`ui/profile/profileIdentity`); the
 * page fetches nothing. *Edit on Datalayer* asks the host to open the web's
 * profile settings.
 *
 * @module webview/profile/ProfilePage
 */

import React, { useEffect, useState } from "react";
import { Button, Heading } from "@primer/react";
import { Box } from "@datalayer/primer-addons";
import { LinkExternalIcon } from "@primer/octicons-react";
import { CenteredSpinner } from "@datalayer/core/lib/components/display/CenteredSpinner";
import {
  UserIdentity,
  type UserIdentityProfile,
} from "@datalayer/core/lib/views/profile/UserIdentity";
import {
  PROFILE_WORDS,
  type ProfileHostMessage,
  type ProfilePageMessage,
} from "../../src/ui/profile/profileIdentity";
import { PrimerVSCodeTheme } from "../theme/PrimerVSCodeTheme";

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();

/**
 * Asks the extension host.
 *
 * @param message - What the page asks.
 */
function post(message: ProfilePageMessage): void {
  vscode.postMessage(message);
}

/** Props of the page. */
export interface ProfilePageProps {
  /** VS Code's color mode. */
  colorMode: "light" | "dark";
}

/**
 * The Profile page.
 *
 * @param props - The page's props.
 *
 * @returns React element.
 */
export function ProfilePage({
  colorMode,
}: ProfilePageProps): React.JSX.Element {
  const [identity, setIdentity] = useState<UserIdentityProfile | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<ProfileHostMessage>) => {
      if (event.data?.type === "profile") {
        setIdentity(event.data.body);
      }
    };
    window.addEventListener("message", onMessage);
    // Listening: the host posts the signed-in user.
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <PrimerVSCodeTheme colorMode={colorMode}>
      <Box sx={{ p: 4, maxWidth: 880 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 3, mb: 4 }}>
          <Heading as="h1" sx={{ fontSize: 4, flex: 1 }}>
            {PROFILE_WORDS.title}
          </Heading>
          <Button
            variant="primary"
            trailingVisual={LinkExternalIcon}
            onClick={() => post({ type: "edit" })}
          >
            {PROFILE_WORDS.edit}
          </Button>
        </Box>
        {identity ? (
          <UserIdentity identity={identity} />
        ) : (
          <CenteredSpinner message="Reading your profile…" />
        )}
      </Box>
    </PrimerVSCodeTheme>
  );
}
