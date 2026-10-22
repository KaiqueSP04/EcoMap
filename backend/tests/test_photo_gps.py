"""Isolated HTTP tests: SQLite in RAM, temporary photos, no .env or PostgreSQL."""
import asyncio
import json
import sys
import tempfile
import types
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
database = types.ModuleType("database")
database.Base = declarative_base()
database.engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
database.SessionLocal = sessionmaker(bind=database.engine, autoflush=False)
# Prevent importing the real database module, even if DATABASE_URL is set.
sys.modules["database"] = database

import main
import uploads


async def request(method, path, body=b"", content_type=None, omit_length=False):
    if isinstance(body, dict):
        body = json.dumps(body).encode()
        content_type = "application/json"
    headers = [(b"content-length", str(len(body)).encode())]
    if omit_length:
        headers = []
    if content_type:
        headers.append((b"content-type", content_type.encode()))
    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1", "method": method, "scheme": "http",
        "path": path, "raw_path": path.encode(), "query_string": b"",
        "headers": headers, "client": ("testclient", 1), "server": ("test", 80),
    }
    messages = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": body, "more_body": False}
        await asyncio.Event().wait()

    async def send(message):
        messages.append(message)

    await main.app(scope, receive, send)
    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    content = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, content


def image_bytes(fmt="PNG"):
    data = BytesIO()
    Image.new("RGB", (16, 12), "green").save(data, format=fmt)
    return data.getvalue()


def multipart(content, mime="image/png", filename="../../untrusted.png"):
    boundary = "ecomap-test-boundary"
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    return body, f"multipart/form-data; boundary={boundary}"


class PhotoGpsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ecomap-test-")
        self.storage_patch = patch.object(uploads, "UPLOAD_DIR", Path(self.temp.name))
        self.storage_patch.start()
        # Only this disposable in-memory database is modified.
        with database.engine.begin() as connection:
            connection.execute(text("""CREATE TABLE occurrences (
                id INTEGER PRIMARY KEY, category VARCHAR NOT NULL,
                description VARCHAR NOT NULL, status VARCHAR NOT NULL,
                latitude DOUBLE NULL, longitude DOUBLE NULL, photo_path VARCHAR NULL
            )"""))
            connection.execute(text("""INSERT INTO occurrences (id, category, description, status)
                VALUES (1, 'Legacy', 'Preserved record', 'Registrada')"""))

    def tearDown(self):
        database.engine.dispose()  # Discards the entire in-memory database.
        self.storage_patch.stop()
        self.temp.cleanup()

    def call(self, method, path, body=b"", content_type=None):
        status, content = asyncio.run(request(method, path, body, content_type))
        return status, json.loads(content) if content else None

    def upload(self, content=None, mime="image/png"):
        body, content_type = multipart(image_bytes() if content is None else content, mime)
        return self.call("POST", "/uploads", body, content_type)

    def test_root_and_legacy_record(self):
        self.assertEqual(self.call("GET", "/"), (200, {"message": "EcoMap API funcionando"}))
        status, rows = self.call("GET", "/occurrences")
        self.assertEqual(status, 200)
        self.assertEqual(rows[0], {
            "id": 1, "category": "Legacy", "description": "Preserved record",
            "status": "Registrada", "latitude": None, "longitude": None, "photo_path": None,
        })

    def test_original_post_contract(self):
        status, row = self.call("POST", "/occurrences", {"category": "Tree", "description": "Test"})
        self.assertEqual(status, 200)
        self.assertEqual(row["status"], "Registrada")
        self.assertIsNone(row["photo_path"])
        self.assertEqual(len(self.call("GET", "/occurrences")[1]), 2)

    def test_upload_gps_persistence_and_download(self):
        status, uploaded = self.upload()
        self.assertEqual(status, 201)
        path = uploaded["photo_path"]
        self.assertRegex(path, r"^/uploads/[0-9a-f]{32}\.jpg$")
        status, row = self.call("POST", "/occurrences", {
            "category": "Tree", "description": "With evidence",
            "latitude": 0, "longitude": -46.5, "photo_path": path,
        })
        self.assertEqual(status, 200)
        self.assertEqual(row["latitude"], 0)
        self.assertEqual(row["photo_path"], path)
        status, content = asyncio.run(request("GET", path))
        self.assertEqual(status, 200)
        with Image.open(BytesIO(content)) as image:
            self.assertEqual(image.format, "JPEG")
            self.assertFalse(image.getexif())
        rows = self.call("GET", "/occurrences")[1]
        self.assertEqual(rows[-1], row)
        self.assertEqual(rows[0]["description"], "Preserved record")

    def test_reject_invalid_images(self):
        for content, mime in [
            (b"<svg></svg>", "image/svg+xml"),
            (b"not a picture", "image/jpeg"),
            (image_bytes(), "text/plain"),
        ]:
            with self.subTest(mime=mime):
                self.assertEqual(self.upload(content, mime)[0], 415)
        self.assertEqual(list(Path(self.temp.name).iterdir()), [])

    def test_size_and_pixel_limits(self):
        self.assertEqual(self.upload(b"x" * (uploads.MAX_IMAGE_BYTES + 1))[0], 413)
        with patch.object(uploads, "MAX_IMAGE_PIXELS", 10):
            self.assertEqual(self.upload()[0], 413)
        self.assertEqual(list(Path(self.temp.name).iterdir()), [])

    def test_request_size_limit_without_content_length(self):
        body, content_type = multipart(b"x" * (uploads.MAX_IMAGE_BYTES + 128 * 1024))
        status, _ = asyncio.run(request("POST", "/uploads", body, content_type, omit_length=True))
        self.assertEqual(status, 413)
        self.assertEqual(list(Path(self.temp.name).iterdir()), [])

    def test_request_size_limit_with_content_length(self):
        self.assertEqual(self.upload(b"x" * (uploads.MAX_IMAGE_BYTES + 128 * 1024))[0], 413)
        self.assertEqual(list(Path(self.temp.name).iterdir()), [])

    def test_optional_field_validation(self):
        base = {"category": "Tree", "description": "Test"}
        for extra in [
            {"latitude": 10}, {"latitude": 91, "longitude": 0},
            {"latitude": 0, "longitude": -181},
            {"photo_path": "file:///private/photo.jpg"},
            {"photo_path": "/uploads/../../secret"},
            {"category": " "}, {"description": ""},
        ]:
            with self.subTest(extra=extra):
                self.assertEqual(self.call("POST", "/occurrences", {**base, **extra})[0], 422)
        self.assertEqual(len(self.call("GET", "/occurrences")[1]), 1)

    def test_missing_photo_reference(self):
        path = "/uploads/" + "a" * 32 + ".jpg"
        self.assertEqual(self.call("GET", path)[0], 404)
        self.assertEqual(self.call("POST", "/occurrences", {
            "category": "Tree", "description": "Test", "photo_path": path,
        })[0], 404)

    def test_declared_endpoints_and_codes(self):
        paths = main.app.openapi()["paths"]
        for path, method, code in [
            ("/", "get", "200"), ("/occurrences", "get", "200"),
            ("/occurrences", "post", "200"), ("/uploads", "post", "201"),
            ("/uploads/{filename}", "get", "200"),
        ]:
            self.assertIn(code, paths[path][method]["responses"])


if __name__ == "__main__":
    unittest.main()
