# Release Guide

## 🚀 Making a Release

```bash
# 1. Test locally
npm run check && npm run docs && npm run compile

# 2. Bump version and create version tag on your local git clone
# major (X.y.z) | minor (x.Y.z) | patch (x.y.Z)
npm version patch

# 3a. Push main branch and tags to trigger release workflow
git push origin main --follow-tags

# 3b. (Optional) Push all the tags
git push origin --tags

# 3c. (Optional) Push the specific tag
# where x, y, x represent the actual numeric values of the version
git push origin vx.y.z
```

**That's it!** GitHub Actions automatically:

- Builds extension
- Creates GitHub release
- Publishes to VS Code Marketplace

**Watch progress:** https://github.com/datalayer/vscode-datalayer/actions

---

## ⚙️ One-Time Setup

### 1. Create Marketplace Token

1. Go to https://dev.azure.com/
2. Sign in → Profile icon → **Personal access tokens** → **New Token**
3. Settings:
   - Name: `vscode-marketplace`
   - Organization: **All accessible organizations**
   - Expiration: **1 year**
   - Scopes: **Marketplace** → ✅ **Acquire** and ✅ **Manage**
4. Copy token

### 2. Add to GitHub

1. Repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `VSCE_KEY`
4. Paste token → **Add secret**

---

## 🔙 If Release Fails

### Option 1: Fix and Re-release (Recommended)

```bash
# Fix the issue, then:
npm version patch
git push origin main --follow-tags
```

### Option 2: Delete Release

```bash
# 1. Unpublish from marketplace
npx vsce unpublish Datalayer.datalayer-jupyter-vscode@0.0.11

# 2. Delete GitHub release (go to releases page and click delete)

# 3. Delete tag
git tag -d v0.0.11
git push origin --delete v0.0.11
```

**⚠️ Warning:** Users who already installed v0.0.11 keep it. Better to publish v0.0.12 with fixes.

---

## 🧪 Test First (First Time Only)

```bash
# Create test release (NOT published to marketplace)
npm version prerelease --preid=test  # v0.0.11-test.0
git push origin main --follow-tags

# If successful, create real release
npm version patch
git push origin main --follow-tags
```

Pre-releases (with `-` in version) only go to GitHub, not marketplace.

---

## ❓ Common Issues

**"401 Unauthorized"** → Token expired. Create new token, update `VSCE_KEY` secret

**"Extension already exists"** → Can't republish same version. Use `npm version patch`

**Build fails** → Fix locally: `npm run compile && npm run lint && npx tsc --noEmit`

---

**Resources:**

- [Marketplace](https://marketplace.visualstudio.com/items?itemName=Datalayer.datalayer-jupyter-vscode)
- [Releases](https://github.com/datalayer/vscode-datalayer/releases)
- [Actions](https://github.com/datalayer/vscode-datalayer/actions)
