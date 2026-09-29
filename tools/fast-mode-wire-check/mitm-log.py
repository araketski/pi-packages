"""mitmproxy addon that writes one JSON record per completed HTTP flow.

Set MITM_LOG_JSONL to the output file. Headers carrying credentials are redacted.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from mitmproxy import http

OUT = Path(os.environ.get("MITM_LOG_JSONL", "flows.jsonl"))
BODY_LIMIT = int(os.environ.get("MITM_BODY_LIMIT", "2000000"))
SENSITIVE_HEADERS = {
    "authorization",
    "proxy-authorization",
    "x-api-key",
    "api-key",
    "openai-organization",
    "cookie",
    "set-cookie",
}


def _headers(headers: http.Headers) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in headers.items(multi=True):
        result[key] = "<redacted>" if key.lower() in SENSITIVE_HEADERS else value
    return result


def _text(message: http.Message | None) -> tuple[str | None, bool, str | None]:
    if message is None:
        return None, False, None
    try:
        message.decode()
    except Exception as exc:  # noqa: BLE001 - diagnostic logger
        decode_error = repr(exc)
    else:
        decode_error = None
    try:
        text = message.get_text(strict=False)
    except Exception as exc:  # noqa: BLE001 - diagnostic logger
        return None, False, repr(exc)
    truncated = len(text) > BODY_LIMIT
    if truncated:
        text = text[:BODY_LIMIT]
    return text, truncated, decode_error


def _json(text: str | None) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001 - best-effort capture
        return None


def _base_record(flow: http.HTTPFlow) -> dict[str, Any]:
    request_text, request_truncated, request_decode_error = _text(flow.request)
    response_text, response_truncated, response_decode_error = _text(flow.response)
    return {
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "request": {
            "method": flow.request.method,
            "scheme": flow.request.scheme,
            "host": flow.request.host,
            "port": flow.request.port,
            "path": flow.request.path,
            "url": flow.request.pretty_url,
            "http_version": flow.request.http_version,
            "headers": _headers(flow.request.headers),
            "body_text": request_text,
            "body_truncated": request_truncated,
            "decode_error": request_decode_error,
            "json": _json(request_text),
        },
        "response": {
            "status_code": flow.response.status_code if flow.response else None,
            "reason": flow.response.reason if flow.response else None,
            "headers": _headers(flow.response.headers) if flow.response else {},
            "body_text": response_text,
            "body_truncated": response_truncated,
            "decode_error": response_decode_error,
            "json": _json(response_text),
        },
    }


def _write(record: dict[str, Any]) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False) + "\n")


def response(flow: http.HTTPFlow) -> None:
    if flow.websocket is not None:
        return
    record = _base_record(flow)
    record["kind"] = "http"
    _write(record)


def websocket_end(flow: http.HTTPFlow) -> None:
    record = _base_record(flow)
    record["kind"] = "websocket"
    messages = []
    for message in flow.websocket.messages if flow.websocket else []:
        raw = message.content
        if isinstance(raw, bytes):
            text = raw.decode("utf-8", errors="replace")
        else:
            text = str(raw)
        truncated = len(text) > BODY_LIMIT
        if truncated:
            text = text[:BODY_LIMIT]
        messages.append(
            {
                "from_client": message.from_client,
                "type": getattr(message, "type", None),
                "text": text,
                "json": _json(text),
                "truncated": truncated,
            }
        )
    record["websocket"] = {"message_count": len(messages), "messages": messages}
    _write(record)
