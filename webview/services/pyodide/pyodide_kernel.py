#
# Copyright (c) 2021-2025 Datalayer, Inc.
#
# MIT License
#
"""Pyodide Kernel - IPython shell initialization for VSCode Datalayer extension.

Based on JupyterLite's pyodide-kernel implementation.
Uses callback pattern to avoid serialization issues with PyProxy objects.
"""

from __future__ import annotations

from binascii import b2a_base64
import math
import numbers
import sys
import types
from typing import Any

from IPython.core.displayhook import DisplayHook
from IPython.core.displaypub import DisplayPublisher
from IPython.core.interactiveshell import InteractiveShell


def json_clean(obj: Any) -> Any:  # noqa: PLR0911
    """Clean an object to ensure it's safe to encode in JSON.

    Based on jupyterlite-pyodide-kernel's jsonutil.py
    """
    # types that are 'atomic' and ok in json as-is
    atomic_ok = (str, type(None))

    # containers that we need to convert into lists
    container_to_list = (tuple, set, types.GeneratorType)

    if isinstance(obj, bool):
        return obj

    if isinstance(obj, numbers.Integral):
        return int(obj)

    if isinstance(obj, numbers.Real):
        # cast out-of-range floats to their reprs
        if math.isnan(obj) or math.isinf(obj):
            return repr(obj)
        return float(obj)

    if isinstance(obj, atomic_ok):
        return obj

    if isinstance(obj, bytes):
        # binary data is base64-encoded
        return b2a_base64(obj).decode("ascii")

    if isinstance(obj, container_to_list) or (
        hasattr(obj, "__iter__") and hasattr(obj, "__next__")
    ):
        obj = list(obj)

    if isinstance(obj, list):
        return [json_clean(x) for x in obj]

    if isinstance(obj, dict):
        # Validate that the dict won't lose data due to key collisions
        nkeys = len(obj)
        nkeys_collapsed = len(set(map(str, obj)))
        if nkeys != nkeys_collapsed:
            raise ValueError(
                "dict cannot be safely converted to JSON: "
                "key collision would lead to dropped values"
            )
        # Make a json-safe dict
        out = {}
        for k, v in obj.items():
            out[str(k)] = json_clean(v)
        return out

    # we don't understand it, return string representation
    return str(obj)


def encode_images(format_dict: dict[str, Any]) -> dict[str, Any]:
    """Encode images in base64 for display.

    In Python 3 / Pyodide, bytes are already handled, so this is mostly a pass-through.
    Based on jupyterlite-pyodide-kernel's jsonutil.py
    """
    return format_dict


class LiteStream:
    """Stream that calls a callback instead of directly posting messages."""

    encoding = "utf-8"

    def __init__(self, name: str) -> None:
        self.name = name
        self.publish_stream_callback = None
        # Store reference to original stream for debugging (before we replace sys.stdout/stderr)
        import sys
        self._original_stream = sys.stdout if name == "stdout" else sys.stderr

    def write(self, text: str) -> int:
        if self.publish_stream_callback:
            # Get current message ID from global variable
            import builtins

            msg_id = getattr(builtins, "_current_msg_id", None)
            if msg_id is not None:
                self.publish_stream_callback(msg_id, self.name, text)
        else:
            # Fall back to original Pyodide stream for debugging
            # This allows print() statements to work during initialization
            if hasattr(self._original_stream, 'write'):
                self._original_stream.write(text)
        return len(text) if text else 0

    def flush(self) -> None:
        pass

    def isatty(self) -> bool:
        return False


class LiteDisplayPublisher(DisplayPublisher):
    """DisplayPublisher that calls callbacks instead of directly posting messages."""

    def __init__(
        self,
        shell: InteractiveShell | None = None,
        *args: Any,
        **kwargs: Any,
    ) -> None:
        super().__init__(shell, *args, **kwargs)
        self.clear_output_callback = None
        self.update_display_data_callback = None
        self.display_data_callback = None

    def publish(
        self,
        data: dict[str, Any],
        metadata: dict[str, Any] | None = None,
        source: str | None = None,
        *,
        transient: dict[str, Any] | None = None,
        update: bool = False,
        **kwargs: Any,
    ) -> None:
        # Get current message ID from global variable
        import builtins

        msg_id = getattr(builtins, "_current_msg_id", None)
        if msg_id is None:
            return

        if update and self.update_display_data_callback:
            self.update_display_data_callback(msg_id, data, metadata, transient)
        elif self.display_data_callback:
            self.display_data_callback(msg_id, data, metadata, transient)

    def clear_output(self, wait: bool = False) -> None:
        if self.clear_output_callback:
            # Get current message ID from global variable
            import builtins

            msg_id = getattr(builtins, "_current_msg_id", None)
            if msg_id is not None:
                self.clear_output_callback(msg_id, wait)


class LiteInteractiveShell(InteractiveShell):
    """Custom InteractiveShell that captures execution errors via callback."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.publish_error_callback = None

    def _showtraceback(self, etype: type, evalue: BaseException, stb: list[str]) -> None:
        """Override _showtraceback to capture formatted traceback.

        This is called by IPython's showtraceback() after it has formatted the traceback.
        The stb parameter contains the already-formatted traceback as a list of strings.
        """
        # Send error via callback - stb is already formatted by IPython
        if self.publish_error_callback:
            import builtins

            msg_id = getattr(builtins, "_current_msg_id", None)
            if msg_id is not None and etype is not None:
                # stb is already a formatted traceback list from IPython
                self.publish_error_callback(
                    msg_id,
                    etype.__name__ if etype else "Error",
                    str(evalue) if evalue else "",
                    stb,  # Use the pre-formatted traceback from IPython
                )


class LiteDisplayHook(DisplayHook):
    """DisplayHook that calls a callback instead of directly posting messages."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.publish_execution_result = None
        self.data: dict[str, Any] = {}
        self.metadata: dict[str, Any] = {}

    def start_displayhook(self) -> None:
        self.data = {}
        self.metadata = {}

    def write_output_prompt(self) -> None:
        pass

    def write_format_data(
        self,
        format_dict: dict[str, Any],
        md_dict: dict[str, Any] | None = None,
    ) -> None:
        # Clean and encode the data like JupyterLite does
        self.data = json_clean(encode_images(format_dict))
        self.metadata = md_dict or {}

    def finish_displayhook(self) -> None:
        sys.stdout.flush()
        sys.stderr.flush()

        if self.publish_execution_result:
            # Get current message ID from global variable
            import builtins

            msg_id = getattr(builtins, "_current_msg_id", None)
            if msg_id is not None:
                self.publish_execution_result(msg_id, self.prompt_count, self.data, self.metadata)

        self.data = {}
        self.metadata = {}


# Module-level exports (JupyterLite pattern)
stdout_stream = LiteStream("stdout")
stderr_stream = LiteStream("stderr")

ipython_shell = LiteInteractiveShell.instance(
    displayhook_class=LiteDisplayHook, display_pub_class=LiteDisplayPublisher
)

# Set streams
sys.stdout = stdout_stream
sys.stderr = stderr_stream
