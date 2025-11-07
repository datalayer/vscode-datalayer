# Python SDK Integration Guide for Unified Authentication

This document provides step-by-step instructions for integrating the AuthManager into the Python DatalayerClient and CLI.

## Overview

The Python `AuthManager` class has already been created in `datalayer_core/auth/manager.py`. Now we need to:

1. Integrate it into the `DatalayerClient` class
2. Update the CLI to use the client's authentication methods
3. Enable auto-discovery of tokens from keyring

## Step 1: Update DatalayerClient (`datalayer_core/client/client.py`)

### 1.1 Add Import

At the top of `client.py`, add:

```python
from datalayer_core.auth import AuthManager
```

### 1.2 Modify `__init__` Method

Add `auto_discover` parameter and initialize AuthManager:

```python
def __init__(
    self,
    token: str | None = None,
    auto_discover: bool = True,  # NEW PARAMETER
    iam_run_url: str | None = None,
    runtimes_run_url: str | None = None,
    spacer_run_url: str | None = None,
):
    """Initialize Datalayer Client.

    Args:
        token: Authentication token. If None and auto_discover=True, will attempt
               to discover token from environment variables or keyring.
        auto_discover: If True, automatically discover token from environment or keyring
        iam_run_url: IAM service URL
        runtimes_run_url: Runtimes service URL
        spacer_run_url: Spacer service URL
    """
    # Initialize URLs object (existing code)
    self._urls = DatalayerURLs(
        iam_run_url=iam_run_url,
        runtimes_run_url=runtimes_run_url,
        spacer_run_url=spacer_run_url,
    )

    # Initialize AuthManager
    self.auth = AuthManager(self._urls)

    # Auto-discover token if not provided
    if token is None and auto_discover:
        discovered_token = self.auth.get_stored_token()
        if discovered_token:
            token = discovered_token

    # Set token (existing code)
    self._token = token

    # ... rest of existing __init__ code ...
```

### 1.3 Add Authentication Methods

Add these methods to the `DatalayerClient` class:

```python
def login_browser(self, port: int | None = None) -> dict:
    """Login using browser OAuth flow.

    Opens browser for GitHub OAuth authentication. Token is automatically
    stored in system keyring if available.

    Args:
        port: Optional port for local HTTP server (default: random available port)

    Returns:
        dict: User information from whoami endpoint

    Raises:
        AuthenticationError: If login fails

    Example:
        >>> client = DatalayerClient()
        >>> user = client.login_browser()
        >>> print(f"Logged in as {user['displayName']}")
    """
    token, user = self.auth.login_with_browser(port=port)
    self._token = token
    return user


def login_password(self, handle: str, password: str) -> dict:
    """Login using username/email and password.

    Authenticates with Datalayer platform using credentials. Token is
    automatically stored in system keyring if available.

    Args:
        handle: Username or email address
        password: User password

    Returns:
        dict: User information from login endpoint

    Raises:
        AuthenticationError: If login fails

    Example:
        >>> client = DatalayerClient()
        >>> user = client.login_password("user@example.com", "mypassword")
        >>> print(f"Logged in as {user['displayName']}")
    """
    token, user = self.auth.login_with_credentials(handle, password)
    self._token = token
    return user


def login_token(self, token: str) -> dict:
    """Login using an API token.

    Validates token with whoami endpoint. Token is automatically stored
    in system keyring if available.

    Args:
        token: API authentication token

    Returns:
        dict: User information from whoami endpoint

    Raises:
        AuthenticationError: If token is invalid

    Example:
        >>> client = DatalayerClient()
        >>> user = client.login_token("dla_abc123...")
        >>> print(f"Logged in as {user['displayName']}")
    """
    user = self.auth.login_with_token(token)
    self._token = token
    return user


def logout(self) -> None:
    """Logout and clear authentication.

    Clears token from client and removes from system keyring if stored there.
    Also clears environment variables DATALAYER_API_KEY and DATALAYER_EXTERNAL_TOKEN.

    Example:
        >>> client = DatalayerClient()
        >>> client.logout()
        >>> print("Logged out successfully")
    """
    self.auth.logout()
    self._token = None
```

### 1.4 Update `whoami` Method (Optional Enhancement)

You may want to update the `whoami` method to provide better error messages when not authenticated:

```python
def whoami(self) -> dict:
    """Get current user information.

    Returns:
        dict: User information

    Raises:
        AuthenticationError: If not authenticated or token is invalid
    """
    if not self._token:
        raise AuthenticationError(
            "Not authenticated. Please login using client.login_browser(), "
            "client.login_password(), or client.login_token()"
        )

    # ... existing whoami implementation ...
```

## Step 2: Update Python CLI (`datalayer_core/cli/commands/authn.py`)

### 2.1 Refactor Login Command

Update the `login` command to use client methods:

```python
@authn.command()
@click.option(
    "--method",
    type=click.Choice(["browser", "password", "token"], case_sensitive=False),
    default="browser",
    help="Authentication method to use",
)
@click.pass_context
def login(ctx, method: str):
    """Login to Datalayer platform.

    Supports three authentication methods:
    - browser: OAuth via GitHub (default)
    - password: Username/email and password
    - token: Direct API token entry

    Token is stored in system keyring for reuse across CLI and VS Code.
    """
    from datalayer_core.client import DatalayerClient

    try:
        # Create client without auto-discovery (we're logging in)
        client = DatalayerClient(auto_discover=False)

        if method == "browser":
            click.echo("Opening browser for authentication...")
            user = client.login_browser()
            click.echo(f"✓ Successfully logged in as {user['displayName']}")

        elif method == "password":
            handle = click.prompt("Username or email")
            password = click.prompt("Password", hide_input=True)
            user = client.login_password(handle, password)
            click.echo(f"✓ Successfully logged in as {user['displayName']}")

        elif method == "token":
            token = click.prompt("API Token", hide_input=True)
            user = client.login_token(token)
            click.echo(f"✓ Successfully logged in as {user['displayName']}")

    except Exception as e:
        click.echo(f"✗ Login failed: {str(e)}", err=True)
        sys.exit(1)
```

### 2.2 Refactor Logout Command

Update the `logout` command:

```python
@authn.command()
@click.pass_context
def logout(ctx):
    """Logout from Datalayer platform.

    Clears authentication token from system keyring and environment variables.
    """
    from datalayer_core.client import DatalayerClient

    try:
        # Create client (it will auto-discover token if exists)
        client = DatalayerClient()

        # Logout (clears keyring and env vars)
        client.logout()

        click.echo("✓ Successfully logged out")

    except Exception as e:
        click.echo(f"✗ Logout failed: {str(e)}", err=True)
        sys.exit(1)
```

### 2.3 Update Whoami Command

The `whoami` command can stay mostly the same, but now benefits from auto-discovery:

```python
@authn.command()
@click.pass_context
def whoami(ctx):
    """Display current user information.

    Shows information about the currently authenticated user.
    Automatically discovers token from keyring or environment variables.
    """
    from datalayer_core.client import DatalayerClient

    try:
        # Create client with auto-discovery
        client = DatalayerClient()

        # Get user info
        user = client.whoami()

        click.echo(f"Display Name: {user['displayName']}")
        click.echo(f"Email: {user.get('email', 'N/A')}")
        click.echo(f"UID: {user['uid']}")

    except Exception as e:
        click.echo(f"✗ Not authenticated: {str(e)}", err=True)
        click.echo("Run 'datalayer authn login' to authenticate")
        sys.exit(1)
```

## Step 3: Testing the Integration

### 3.1 Test CLI Login

```bash
# Test browser OAuth login
datalayer authn login --method browser

# Test password login
datalayer authn login --method password

# Test token login
datalayer authn login --method token

# Verify authentication
datalayer authn whoami
```

### 3.2 Test Python SDK

```python
from datalayer_core.client import DatalayerClient

# Test auto-discovery (should find CLI token)
client = DatalayerClient()
user = client.whoami()
print(f"Auto-discovered token, logged in as: {user['displayName']}")

# Test browser login
client2 = DatalayerClient(auto_discover=False)
user2 = client2.login_browser()
print(f"Browser login successful: {user2['displayName']}")

# Test logout
client2.logout()
print("Logged out successfully")
```

### 3.3 Test CLI → VS Code Integration

1. Login via CLI:

   ```bash
   datalayer authn login --method browser
   ```

2. Open VS Code extension

3. Verify extension discovers CLI token automatically:
   - Check status bar shows authenticated user
   - Check spaces tree view loads
   - Check runtimes tree view loads

4. Logout from VS Code

5. Verify CLI still has token:
   ```bash
   datalayer authn whoami  # Should still work
   ```

### 3.4 Test VS Code → CLI Integration

1. Login via VS Code extension (Command Palette: "Datalayer: Login")

2. Try CLI:

   ```bash
   datalayer authn whoami  # Will NOT find VS Code token (by design)
   ```

3. This is expected - VS Code stores in SecretStorage, not keyring

## Step 4: Update Documentation

### 4.1 Update README.md

Add section on authentication:

````markdown
## Authentication

Datalayer provides multiple authentication methods:

### CLI Authentication

```bash
# Browser OAuth (recommended)
datalayer authn login

# Username/password
datalayer authn login --method password

# API token
datalayer authn login --method token
```
````

Tokens are stored in your system keyring and shared with VS Code extension.

### Python SDK Authentication

```python
from datalayer_core.client import DatalayerClient

# Auto-discover token from keyring or environment
client = DatalayerClient()

# Or login explicitly
client = DatalayerClient(auto_discover=False)
client.login_browser()  # OAuth via browser
# OR
client.login_password("user@example.com", "password")
# OR
client.login_token("dla_abc123...")
```

### VS Code Extension Authentication

Use Command Palette:

- "Datalayer: Login" - Choose authentication method
- "Datalayer: Logout" - Clear authentication

The extension can discover tokens stored by the CLI.

### Token Storage

- **CLI & Python SDK**: System keyring (macOS Keychain, Linux Secret Service, Windows Credential Manager)
- **VS Code Extension**: VS Code SecretStorage (encrypted, cross-platform)
- **Discovery**: VS Code can read CLI tokens, but not vice versa (by design)

```

## Implementation Checklist

- [ ] Update `DatalayerClient.__init__` with `auto_discover` parameter
- [ ] Add `AuthManager` initialization in `DatalayerClient.__init__`
- [ ] Add `login_browser()` method to `DatalayerClient`
- [ ] Add `login_password()` method to `DatalayerClient`
- [ ] Add `login_token()` method to `DatalayerClient`
- [ ] Add `logout()` method to `DatalayerClient`
- [ ] Refactor CLI `login` command to use client methods
- [ ] Refactor CLI `logout` command to use client methods
- [ ] Update CLI `whoami` command
- [ ] Test CLI authentication (browser, password, token)
- [ ] Test Python SDK authentication
- [ ] Test CLI → VS Code token discovery
- [ ] Test VS Code → CLI isolation
- [ ] Update README.md with authentication guide
- [ ] Update API documentation

## Notes

- Token discovery is one-way: VS Code can discover CLI tokens, but CLI cannot discover VS Code tokens
- This is by design for security and isolation
- Users can login via either tool and the other will discover it (CLI → VS Code direction only)
- Environment variables (`DATALAYER_API_KEY`, `DATALAYER_EXTERNAL_TOKEN`) work with both tools
```
