/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
        "bump",
      ],
    ],
    "subject-case": [0],
    "body-max-line-length": [0],
  },
};
