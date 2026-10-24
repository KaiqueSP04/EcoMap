"""Gemini HTTP tests with a mocked provider; no real API, .env or PostgreSQL."""
import asyncio
import base64
import json
import os
import unittest
from io import BytesIO
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError
from PIL import Image

# Bootstraps FastAPI with an isolated database module and suppressed dotenv load.
import test_photo_gps as isolated
import gemini_service
from config import DEFAULT_GEMINI_MODEL, GeminiSettings, get_gemini_settings


def envelope(category):
    return {
        "candidates": [{
            "finishReason": "STOP",
            "content": {"parts": [{"text": json.dumps({"category": category})}]},
        }]
    }


def description_envelope(value):
    result = envelope(None)
    result["candidates"][0]["content"]["parts"][0]["text"] = json.dumps({"description": value})
    return result


class GeminiTests(unittest.TestCase):
    def setUp(self):
        self.settings_patch = patch.object(gemini_service, "get_gemini_settings", return_value=GeminiSettings("unit-test-only"))
        self.settings_patch.start()
        self.network_patch = patch.object(gemini_service, "urlopen")
        self.network = self.network_patch.start()
        self.provider = MagicMock()
        self.network.return_value.__enter__.return_value = self.provider
        self.provider.read.return_value = json.dumps(envelope("Árvore")).encode()
        self.database_patch = patch.object(isolated.services, "SessionLocal", side_effect=AssertionError("AI must not access DB"))
        self.database_patch.start()

    def tearDown(self):
        self.database_patch.stop()
        self.network_patch.stop()
        self.settings_patch.stop()

    def call(self, body=None):
        status, content = asyncio.run(isolated.request(
            "POST", "/occurrences/suggest-category",
            {"description": "Árvore com galho quebrado"} if body is None else body,
        ))
        return status, json.loads(content)

    def test_success_normalizes_only_valid_categories_and_sends_text_only(self):
        for value, expected in [(" calcada ", "Calçada"), ("ÁRVORE", "Árvore"), ("  area   verde ", "Área verde")]:
            with self.subTest(value=value):
                self.provider.read.return_value = json.dumps(envelope(value)).encode()
                code, data = self.call({"description": "  Uma árvore com galho quebrado  "})
                self.assertEqual(code, 200)
                self.assertEqual(data["category"], expected)
                self.assertEqual(data["reason"], "suggested")
        args, kwargs = self.network.call_args
        request = args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["contents"], [{"role": "user", "parts": [{"text": "Uma árvore com galho quebrado"}]}])
        self.assertNotIn("key=", request.full_url)
        self.assertEqual(request.get_header("X-goog-api-key"), "unit-test-only")
        self.assertEqual(kwargs["timeout"], 12)
        self.assertNotIn("inlineData", json.dumps(payload))
        self.assertNotIn("latitude", json.dumps(payload))
        self.provider.read.assert_called_with(gemini_service.MAX_RESPONSE_BYTES + 1)

    def test_no_classification_and_safety_block(self):
        for value in [envelope(None), {"promptFeedback": {"blockReason": "SAFETY"}}, {"candidates": [{"finishReason": "SAFETY"}]}]:
            self.provider.read.return_value = json.dumps(value).encode()
            code, data = self.call()
            self.assertEqual(code, 200)
            self.assertIsNone(data["category"])
            self.assertEqual(data["reason"], "not_classified")

    def test_invalid_provider_output_never_returns_an_arbitrary_category(self):
        for value in [envelope("Lixo"), envelope(123), {}, [], {"candidates": [None]},
                      {"candidates": [{"finishReason": "MAX_TOKENS"}]}]:
            with self.subTest(value=value):
                self.provider.read.return_value = json.dumps(value).encode()
                self.assertEqual(self.call()[1]["reason"], "invalid_response")
                self.assertIsNone(self.call()[1]["category"])
        self.provider.read.return_value = b"not JSON"
        self.assertEqual(self.call()[1]["reason"], "invalid_response")
        self.provider.read.return_value = b"x" * (gemini_service.MAX_RESPONSE_BYTES + 1)
        self.assertEqual(self.call()[1]["reason"], "invalid_response")

    def test_missing_key_and_invalid_model_do_not_call_provider(self):
        for settings in [GeminiSettings(""), GeminiSettings("unit-test-only", "../invalid")]:
            gemini_service.get_gemini_settings.return_value = settings
            code, data = self.call()
            self.assertEqual(code, 200)
            self.assertEqual(data["reason"], "unavailable")
            self.assertIsNone(data["category"])
        self.network.assert_not_called()

    def test_timeout_and_connection_failure_use_manual_fallback(self):
        for error, reason in [(TimeoutError(), "timeout"), (URLError(TimeoutError()), "timeout"), (URLError("offline"), "unavailable")]:
            self.network.side_effect = error
            code, data = self.call()
            self.assertEqual(code, 200)
            self.assertEqual(data["reason"], reason)
            self.assertIsNone(data["category"])

    def test_provider_errors_and_quota_are_sanitized(self):
        for code in [400, 401, 403, 404, 429, 500, 503]:
            self.network.side_effect = HTTPError("https://example.invalid", code, "private-provider-message", {}, BytesIO())
            status, data = self.call()
            self.assertEqual(status, 200)
            self.assertEqual(data["reason"], "rate_limited" if code == 429 else "unavailable")
            self.assertIsNone(data["category"])
            self.assertNotIn("private-provider-message", json.dumps(data))
            self.assertNotIn("unit-test-only", json.dumps(data))

    def test_input_validation_prevents_empty_long_and_non_text_requests(self):
        for body in [{}, {"description": " "}, {"description": "x" * 2001},
                     {"description": 123}, {"description": "Praça", "latitude": 1},
                     {"description": "Praça", "photo_path": "/uploads/test.jpg"}]:
            with self.subTest(body=body):
                self.assertEqual(self.call(body)[0], 422)
        self.network.assert_not_called()

    def test_configuration_is_centralized_and_key_is_not_in_repr(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "", "GEMINI_MODEL": DEFAULT_GEMINI_MODEL, "GEMINI_TIMEOUT_SECONDS": "invalid"}):
            settings = get_gemini_settings()
            self.assertEqual(settings.model, DEFAULT_GEMINI_MODEL)
            self.assertEqual(settings.timeout_seconds, 12)
        self.assertNotIn("unit-test-only", repr(GeminiSettings("unit-test-only")))

    def description_call(self, image=False, text="Tem um galho caido na calçada."):
        if image:
            body, mime = isolated.multipart(isolated.image_bytes())
            code, raw = asyncio.run(isolated.request("POST", "/occurrences/describe-image", body, mime))
        else:
            code, raw = asyncio.run(isolated.request("POST", "/occurrences/improve-description", {"description": text}))
        return code, json.loads(raw)

    def test_image_is_normalized_without_metadata_and_never_stored(self):
        photo = BytesIO()
        exif = Image.Exif()
        exif[270] = "private-metadata-marker"
        exif[34853] = {1: "N", 2: (1.0, 2.0, 3.0), 3: "W", 4: (4.0, 5.0, 6.0)}
        Image.new("RGB", (16, 12), "green").save(photo, format="JPEG", exif=exif)
        body, mime = isolated.multipart(photo.getvalue(), "image/jpeg")
        self.provider.read.return_value = json.dumps(description_envelope("Galho sobre a calçada.")).encode()
        with patch.object(isolated.uploads, "write_photo", side_effect=AssertionError("must not store suggestion images")):
            code, raw = asyncio.run(isolated.request("POST", "/occurrences/describe-image", body, mime))
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(raw)["description"], "Galho sobre a calçada.")
        payload = json.loads(self.network.call_args.args[0].data)
        parts = payload["contents"][0]["parts"]
        self.assertEqual(len(parts), 2)
        self.assertEqual(parts[1]["inlineData"]["mimeType"], "image/jpeg")
        normalized = base64.b64decode(parts[1]["inlineData"]["data"])
        with Image.open(BytesIO(normalized)) as image:
            self.assertFalse(image.getexif())
            self.assertEqual(image.format, "JPEG")
        self.assertNotIn(b"private-metadata-marker", normalized)
        self.assertNotIn("latitude", json.dumps(payload))
        self.assertNotIn("photo_path", json.dumps(payload))
        self.assertIn("visualmente observável", payload["systemInstruction"]["parts"][0]["text"])

    def test_invalid_and_oversized_images_never_reach_gemini(self):
        for content, mime, expected in [(b"broken", "image/png", 415),
                                        (isolated.image_bytes(), "text/plain", 415),
                                        (b"x" * (isolated.uploads.MAX_IMAGE_BYTES + 1), "image/jpeg", 413)]:
            body, content_type = isolated.multipart(content, mime)
            for omit_length in [False, True]:
                code, _ = asyncio.run(isolated.request("POST", "/occurrences/describe-image", body, content_type, omit_length))
                self.assertEqual(code, expected)
        self.network.assert_not_called()

    def test_image_prompt_omits_uncertain_details_without_changing_other_prompts(self):
        self.provider.read.return_value = json.dumps(description_envelope("Árvore caída.")).encode()
        self.description_call(image=True)
        instruction = json.loads(self.network.call_args.args[0].data)["systemInstruction"]["parts"][0]["text"]
        for phrase in ["identificável com razoável confiança", "omita-o em vez de afirmá-lo",
                       "obstrução de vias, raízes expostas", "sem evidência visual clara",
                       "incluindo os detalhes claramente visíveis, sem generalizar em excesso"]:
            self.assertIn(phrase, instruction)
        for call in [self.description_call, self.call]:
            call()
            other = json.loads(self.network.call_args.args[0].data)["systemInstruction"]["parts"][0]["text"]
            self.assertNotIn("omita-o em vez de afirmá-lo", other)
            self.assertNotIn("obstrução de vias, raízes expostas", other)

    def test_image_without_identifiable_occurrence_returns_no_suggestion(self):
        self.provider.read.return_value = json.dumps(description_envelope(None)).encode()
        code, data = self.description_call(image=True)
        self.assertEqual(code, 200)
        self.assertEqual(data["reason"], "not_identified")
        self.assertIsNone(data["description"])

    def test_text_improvement_sends_original_meaning_without_other_fields(self):
        original = "Parece que tem um galho caido na calçada."
        improved = "Parece haver um galho caído na calçada."
        self.provider.read.return_value = json.dumps(description_envelope(improved)).encode()
        code, data = self.description_call(text=original)
        self.assertEqual(code, 200)
        self.assertEqual(data["description"], improved)
        payload = json.loads(self.network.call_args.args[0].data)
        self.assertEqual(payload["contents"], [{"role": "user", "parts": [{"text": original}]}])
        instruction = payload["systemInstruction"]["parts"][0]["text"]
        self.assertIn("Preserve seu significado", instruction)
        self.assertIn("incertezas", instruction)
        self.assertIn("não acrescente fatos", instruction)
        for text in [" ", "x" * 2001]:
            self.assertEqual(self.description_call(text=text)[0], 422)

    def test_description_invalid_output_timeout_missing_key_and_provider_failure(self):
        for image in [False, True]:
            for value in [description_envelope(""), description_envelope("x" * 601),
                          description_envelope(1), envelope("Árvore"), {}, description_envelope("x\u0000")]:
                self.provider.read.return_value = json.dumps(value).encode()
                self.assertEqual(self.description_call(image)[1]["reason"], "invalid_response")
            for error, reason in [(TimeoutError(), "timeout"), (URLError("offline"), "unavailable"),
                                  (HTTPError("https://example.invalid", 429, "private", {}, BytesIO()), "rate_limited"),
                                  (HTTPError("https://example.invalid", 503, "private", {}, BytesIO()), "unavailable")]:
                self.network.side_effect = error
                code, data = self.description_call(image)
                self.assertEqual(code, 200)
                self.assertEqual(data["reason"], reason)
                self.assertIsNone(data["description"])
                self.assertNotIn("private", data["message"])
            self.network.side_effect = None
            with patch.object(gemini_service, "get_gemini_settings", return_value=GeminiSettings("")):
                self.network.reset_mock()
                self.assertEqual(self.description_call(image)[1]["reason"], "unavailable")
                self.network.assert_not_called()
