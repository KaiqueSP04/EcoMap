"""Reject oversized multipart requests before they fill the upload spool."""
from fastapi import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from uploads import MAX_IMAGE_BYTES


class UploadSizeLimit:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] != "/uploads":
            await self.app(scope, receive, send)
            return

        # Allow multipart headers in addition to the file's 8 MiB limit.
        limit = MAX_IMAGE_BYTES + 64 * 1024
        headers = dict(scope["headers"])
        try:
            declared_size = int(headers.get(b"content-length", b"0"))
        except ValueError:
            await JSONResponse({"detail": "Content-Length inválido."}, status_code=400)(scope, receive, send)
            return
        if declared_size > limit:
            await JSONResponse({"detail": "A foto deve ter no máximo 8 MB."}, status_code=413)(scope, receive, send)
            return

        received_size = 0

        async def limited_receive() -> Message:
            nonlocal received_size
            message = await receive()
            if message["type"] == "http.request":
                received_size += len(message.get("body", b""))
                if received_size > limit:
                    raise HTTPException(status_code=413, detail="A foto deve ter no máximo 8 MB.")
            return message

        await self.app(scope, limited_receive, send)
