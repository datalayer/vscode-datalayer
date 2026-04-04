/*
 * Copyright (c) 2021-2025 Datalayer, Inc.
 *
 * MIT License
 */

import type { SpaceDTO } from "@datalayer/core/lib/models/SpaceDTO";
import * as assert from "assert";
import * as vscode from "vscode";

import type { Document, SpaceItemData } from "../../models/spaceItem";
import { ItemType, SpaceItem } from "../../models/spaceItem";

suite("SpaceItem Tests", () => {
  suite("ItemType enum", () => {
    test("has expected values", () => {
      assert.strictEqual(ItemType.ROOT, "root");
      assert.strictEqual(ItemType.SPACE, "space");
      assert.strictEqual(ItemType.NOTEBOOK, "notebook");
      assert.strictEqual(ItemType.DOCUMENT, "document");
      assert.strictEqual(ItemType.FOLDER, "folder");
      assert.strictEqual(ItemType.CELL, "cell");
      assert.strictEqual(ItemType.LOADING, "loading");
      assert.strictEqual(ItemType.ERROR, "error");
    });
  });

  suite("Constructor and contextValue", () => {
    test("sets contextValue from data type", () => {
      const data: SpaceItemData = { type: ItemType.SPACE };
      const item = new SpaceItem(
        "My Space",
        vscode.TreeItemCollapsibleState.Collapsed,
        data,
      );

      assert.strictEqual(item.contextValue, "space");
    });

    test("sets label correctly", () => {
      const data: SpaceItemData = { type: ItemType.ROOT };
      const item = new SpaceItem(
        "Root Label",
        vscode.TreeItemCollapsibleState.Expanded,
        data,
      );

      assert.strictEqual(item.label, "Root Label");
    });

    test("stores parent reference", () => {
      const parentData: SpaceItemData = { type: ItemType.SPACE };
      const parent = new SpaceItem(
        "Parent",
        vscode.TreeItemCollapsibleState.Collapsed,
        parentData,
      );
      const childData: SpaceItemData = { type: ItemType.NOTEBOOK };
      const child = new SpaceItem(
        "Child",
        vscode.TreeItemCollapsibleState.None,
        childData,
        parent,
      );

      assert.strictEqual(child.parent, parent);
    });
  });

  suite("Tooltip", () => {
    test("ROOT shows 'Datalayer Spaces' with username", () => {
      const data: SpaceItemData = {
        type: ItemType.ROOT,
        username: "testuser",
      };
      const item = new SpaceItem(
        "Spaces",
        vscode.TreeItemCollapsibleState.Expanded,
        data,
      );

      assert.strictEqual(item.tooltip, "Datalayer Spaces - testuser");
    });

    test("ROOT shows 'Datalayer Spaces' without username", () => {
      const data: SpaceItemData = { type: ItemType.ROOT };
      const item = new SpaceItem(
        "Spaces",
        vscode.TreeItemCollapsibleState.Expanded,
        data,
      );

      assert.strictEqual(item.tooltip, "Datalayer Spaces");
    });

    test("SPACE tooltip is the label", () => {
      const data: SpaceItemData = { type: ItemType.SPACE };
      const item = new SpaceItem(
        "My Space",
        vscode.TreeItemCollapsibleState.Collapsed,
        data,
      );

      assert.strictEqual(item.tooltip, "My Space");
    });

    test("NOTEBOOK tooltip includes spaceName when available", () => {
      const data: SpaceItemData = {
        type: ItemType.NOTEBOOK,
        spaceName: "Research",
      };
      const item = new SpaceItem(
        "analysis.ipynb",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual(item.tooltip, "analysis.ipynb\nSpace: Research");
    });

    test("DOCUMENT tooltip shows label only without spaceName", () => {
      const data: SpaceItemData = { type: ItemType.DOCUMENT };
      const item = new SpaceItem(
        "doc.lexical",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual(item.tooltip, "doc.lexical");
    });

    test("ERROR tooltip shows error message", () => {
      const data: SpaceItemData = {
        type: ItemType.ERROR,
        error: "Connection failed",
      };
      const item = new SpaceItem(
        "Error",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual(item.tooltip, "Connection failed");
    });

    test("LOADING tooltip is undefined", () => {
      const data: SpaceItemData = { type: ItemType.LOADING };
      const item = new SpaceItem(
        "Loading...",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual(item.tooltip, undefined);
    });
  });

  suite("Icons", () => {
    test("ROOT uses menu icon", () => {
      const data: SpaceItemData = { type: ItemType.ROOT };
      const item = new SpaceItem(
        "Root",
        vscode.TreeItemCollapsibleState.Expanded,
        data,
      );

      assert.ok(item.iconPath instanceof vscode.ThemeIcon);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "menu");
    });

    test("SPACE with default variant uses library icon", () => {
      const data: SpaceItemData = {
        type: ItemType.SPACE,
        space: { variant: "default" } as SpaceDTO,
      };
      const item = new SpaceItem(
        "Space",
        vscode.TreeItemCollapsibleState.Collapsed,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "library");
    });

    test("SPACE with non-default variant uses folder icon", () => {
      const data: SpaceItemData = {
        type: ItemType.SPACE,
        space: { variant: "shared" } as SpaceDTO,
      };
      const item = new SpaceItem(
        "Space",
        vscode.TreeItemCollapsibleState.Collapsed,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "folder");
    });

    test("SPACE without space data uses folder icon", () => {
      const data: SpaceItemData = { type: ItemType.SPACE };
      const item = new SpaceItem(
        "Space",
        vscode.TreeItemCollapsibleState.Collapsed,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "folder");
    });

    test("NOTEBOOK uses notebook icon", () => {
      const data: SpaceItemData = { type: ItemType.NOTEBOOK };
      const item = new SpaceItem(
        "nb.ipynb",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "notebook");
    });

    test("FOLDER uses folder icon", () => {
      const data: SpaceItemData = { type: ItemType.FOLDER };
      const item = new SpaceItem(
        "src",
        vscode.TreeItemCollapsibleState.Collapsed,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "folder");
    });

    test("CELL uses code icon", () => {
      const data: SpaceItemData = { type: ItemType.CELL };
      const item = new SpaceItem(
        "Cell 1",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "code");
    });

    test("LOADING uses loading~spin icon", () => {
      const data: SpaceItemData = { type: ItemType.LOADING };
      const item = new SpaceItem(
        "Loading...",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual(
        (item.iconPath as vscode.ThemeIcon).id,
        "loading~spin",
      );
    });

    test("ERROR uses error icon", () => {
      const data: SpaceItemData = { type: ItemType.ERROR };
      const item = new SpaceItem(
        "Error",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "error");
    });
  });

  suite("Document Icons", () => {
    test("DOCUMENT without document data uses file icon", () => {
      const data: SpaceItemData = { type: ItemType.DOCUMENT };
      const item = new SpaceItem(
        "unknown",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "file");
    });

    test("lexical document uses file-text icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "document", name: "doc.dlex" } as Document,
      };
      const item = new SpaceItem(
        "doc.dlex",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "file-text");
    });

    test(".py file uses file-code icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "file", name: "script.py" } as Document,
      };
      const item = new SpaceItem(
        "script.py",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "file-code");
    });

    test(".ipynb file uses notebook icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "file", name: "nb.ipynb" } as Document,
      };
      const item = new SpaceItem(
        "nb.ipynb",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "notebook");
    });

    test(".md file uses markdown icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "file", name: "README.md" } as Document,
      };
      const item = new SpaceItem(
        "README.md",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "markdown");
    });

    test(".json file uses json icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "file", name: "config.json" } as Document,
      };
      const item = new SpaceItem(
        "config.json",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "json");
    });

    test(".csv file uses table icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "file", name: "data.csv" } as Document,
      };
      const item = new SpaceItem(
        "data.csv",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "table");
    });

    test(".pdf file uses file-pdf icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "file", name: "report.pdf" } as Document,
      };
      const item = new SpaceItem(
        "report.pdf",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "file-pdf");
    });

    test(".png file uses file-media icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "file", name: "image.png" } as Document,
      };
      const item = new SpaceItem(
        "image.png",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "file-media");
    });

    test("unknown extension uses file icon", () => {
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: { type: "file", name: "data.parquet" } as Document,
      };
      const item = new SpaceItem(
        "data.parquet",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, "file");
    });
  });

  suite("Commands", () => {
    test("NOTEBOOK with document has openDocument command", () => {
      const doc = { type: "notebook", name: "nb.ipynb" } as Document;
      const data: SpaceItemData = {
        type: ItemType.NOTEBOOK,
        document: doc,
        spaceName: "MySpace",
      };
      const item = new SpaceItem(
        "nb.ipynb",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.ok(item.command);
      assert.strictEqual(item.command!.command, "datalayer.openDocument");
      assert.strictEqual(item.command!.title, "Open Notebook");
      assert.deepStrictEqual(item.command!.arguments, [doc, "MySpace"]);
    });

    test("DOCUMENT with document has openDocument command", () => {
      const doc = { type: "document", name: "doc.dlex" } as Document;
      const data: SpaceItemData = {
        type: ItemType.DOCUMENT,
        document: doc,
        spaceName: "Space1",
      };
      const item = new SpaceItem(
        "doc.dlex",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.ok(item.command);
      assert.strictEqual(item.command!.command, "datalayer.openDocument");
      assert.strictEqual(item.command!.title, "Open");
    });

    test("CELL with document has openDocument command", () => {
      const doc = { type: "notebook", name: "nb.ipynb" } as Document;
      const data: SpaceItemData = {
        type: ItemType.CELL,
        document: doc,
        spaceName: "Space1",
      };
      const item = new SpaceItem(
        "Cell 1",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.ok(item.command);
      assert.strictEqual(item.command!.title, "Open Cell");
    });

    test("ERROR with login message has login command", () => {
      const data: SpaceItemData = {
        type: ItemType.ERROR,
        error: "Please login first",
      };
      const item = new SpaceItem(
        "Error",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.ok(item.command);
      assert.strictEqual(item.command!.command, "datalayer.login");
    });

    test("ERROR with login in label has login command", () => {
      const data: SpaceItemData = {
        type: ItemType.ERROR,
        error: "Connection error",
      };
      const item = new SpaceItem(
        "Please login to continue",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.ok(item.command);
      assert.strictEqual(item.command!.command, "datalayer.login");
    });

    test("ERROR without login message has refreshSpaces command", () => {
      const data: SpaceItemData = {
        type: ItemType.ERROR,
        error: "Network error",
      };
      const item = new SpaceItem(
        "Error occurred",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.ok(item.command);
      assert.strictEqual(item.command!.command, "datalayer.refreshSpaces");
    });

    test("SPACE has no command", () => {
      const data: SpaceItemData = { type: ItemType.SPACE };
      const item = new SpaceItem(
        "Space",
        vscode.TreeItemCollapsibleState.Collapsed,
        data,
      );

      assert.strictEqual(item.command, undefined);
    });

    test("NOTEBOOK without document has no command", () => {
      const data: SpaceItemData = { type: ItemType.NOTEBOOK };
      const item = new SpaceItem(
        "nb.ipynb",
        vscode.TreeItemCollapsibleState.None,
        data,
      );

      assert.strictEqual(item.command, undefined);
    });
  });
});
