/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Profile page (`datalayer.profile.open`, the *Profile* row of the
 * sidebar's Home view): the signed-in user the extension holds, read as the
 * identity core's `UserIdentity` shows — the same component the web's
 * profile page draws — and the messages the host and the page exchange.
 * Pure: no `vscode`, no React; the host (`commands/profile`) and the page
 * (`webview/profile`) share it. The page fetches nothing.
 *
 * @module ui/profile/profileIdentity
 */

import {
  asDisplayName,
  nameAsInitials,
  namesAsInitials,
} from "@datalayer/core/lib/utils/Name";
import type { UserIdentityProfile } from "@datalayer/core/lib/views/profile";

import { STUDIO_ORIGIN } from "../../chat/sessionVerbs";

/**
 * The signed-in user as the extension holds it: core's `UserDTO` (its
 * getters) or its JSON — the names, the handle, the pictures, and the raw
 * data where the origin is.
 */
export interface ProfileUserLike {
  uid?: string;
  id?: string;
  handle?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  avatarIcon?: string;
  /** The DTO's raw data (`origin_s` is the account's identity provider). */
  rawData?: () => Record<string, unknown>;
}

/**
 * Where an account comes from, when the user's raw data says it.
 *
 * @param user - The signed-in user.
 *
 * @returns Its origin (`github`, `linkedin`…), or undefined.
 */
function originOf(user: ProfileUserLike): string | undefined {
  if (typeof user.rawData !== "function") {
    return undefined;
  }
  try {
    const origin = user.rawData().origin_s;
    return typeof origin === "string" && origin ? origin : undefined;
  } catch {
    // A DTO that throws on reading (deleted) has no origin to show.
    return undefined;
  }
}

/**
 * The identity core's `UserIdentity` shows, from the signed-in user: its
 * display name and initials computed as core's `User` model computes them
 * (from the first and the last name, the handle when there is none).
 *
 * @param user - The signed-in user.
 *
 * @returns The identity, a plain object the page can be posted.
 */
export function identityOf(user: ProfileUserLike): UserIdentityProfile {
  const first = user.firstName ?? "";
  const last = user.lastName ?? "";
  const handle = user.handle ?? "";
  const display =
    asDisplayName(first, last) || user.displayName?.trim() || handle;
  const identity: UserIdentityProfile = {
    username: handle,
    display_name: display,
    initials: namesAsInitials(first, last) || nameAsInitials(display),
  };
  const id = user.uid || user.id;
  if (id) {
    identity.id = id;
  }
  if (user.avatarUrl) {
    identity.avatar_url = user.avatarUrl;
  }
  if (user.avatarIcon) {
    identity.avatar_icon = user.avatarIcon;
  }
  const origin = originOf(user);
  if (origin) {
    identity.origin = origin;
  }
  return identity;
}

/** The web's profile settings, where the profile is edited. */
export const PROFILE_EDIT_URL = `${STUDIO_ORIGIN}/settings/profile`;

/** The page's words. */
export const PROFILE_WORDS = {
  title: "Profile",
  edit: "Edit on Datalayer",
  signedOut: "Sign in to Datalayer to see your profile.",
} as const;

/** What the host tells the page. */
export type ProfileHostMessage =
  | { type: "profile"; body: UserIdentityProfile }
  | { type: "theme-changed"; theme: "light" | "dark" };

/** What the page asks the host. */
export type ProfilePageMessage = { type: "ready" } | { type: "edit" };

/**
 * The page's message, when it is one the host answers.
 *
 * @param raw - The message, before it is read.
 *
 * @returns The message, or undefined.
 */
export function profilePageMessageOf(
  raw: unknown,
): ProfilePageMessage | undefined {
  if (raw === null || typeof raw !== "object") {
    return undefined;
  }
  const type = (raw as { type?: unknown }).type;
  return type === "ready" || type === "edit" ? { type } : undefined;
}
