/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The Profile page, the pure part: the signed-in user (core's `UserDTO`, or
 * its JSON) read as the identity core's `UserIdentity` shows — the display
 * name and initials as core's `User` model computes them, the origin from
 * the raw data — and the page's messages checked.
 */

import { UserDTO } from "@datalayer/core/lib/models/UserDTO";
import { describe, expect, it } from "vitest";

import {
  identityOf,
  PROFILE_EDIT_URL,
  profilePageMessageOf,
} from "../../ui/profile/profileIdentity";

describe("identityOf", () => {
  it("reads core's UserDTO through its getters, the origin from its raw data", () => {
    const user = new UserDTO({
      id: "u-1",
      uid: "u-1",
      handle_s: "grace",
      email_s: "g@example.com",
      first_name_t: "Grace",
      last_name_t: "Hopper",
      avatar_url_s: "https://avatars.example/g.png",
      avatar_icon_s: "rocket",
      origin_s: "github",
    });
    expect(identityOf(user)).toEqual({
      id: "u-1",
      username: "grace",
      display_name: "Grace Hopper",
      initials: "GH",
      avatar_url: "https://avatars.example/g.png",
      avatar_icon: "rocket",
      origin: "github",
    });
  });

  it("reads the user's JSON, with no picture and no origin", () => {
    expect(
      identityOf({
        uid: "u-2",
        handle: "ada",
        firstName: "Ada",
        lastName: "",
        displayName: "Ada",
        avatarUrl: "",
      }),
    ).toEqual({
      id: "u-2",
      username: "ada",
      display_name: "Ada",
      initials: "A",
    });
  });

  it("falls back on the handle when the user has no name", () => {
    expect(identityOf({ uid: "u-3", handle: "grace hopper" })).toEqual({
      id: "u-3",
      username: "grace hopper",
      display_name: "grace hopper",
      initials: "GH",
    });
  });
});

describe("the page", () => {
  it("edits the profile on the web's profile settings", () => {
    expect(PROFILE_EDIT_URL).toBe("https://datalayer.ai/settings/profile");
  });

  it("is answered for ready and edit only", () => {
    expect(profilePageMessageOf({ type: "ready" })).toEqual({ type: "ready" });
    expect(profilePageMessageOf({ type: "edit", url: "x" })).toEqual({
      type: "edit",
    });
    expect(profilePageMessageOf({ type: "open" })).toBeUndefined();
    expect(profilePageMessageOf(null)).toBeUndefined();
    expect(profilePageMessageOf("edit")).toBeUndefined();
  });
});
