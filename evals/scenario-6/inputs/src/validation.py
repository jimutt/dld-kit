"""Input validation helpers shared across routes."""
from pydantic import ValidationError
from flask import jsonify


def parse_body(model_cls, raw):
    """Parse and validate a request body against a Pydantic model.

    Returns (instance, None) on success or (None, error_response) on failure.
    The caller should return the error_response tuple directly if it is not None.
    """
    try:
        return model_cls(**raw), None
    except (ValidationError, TypeError) as exc:
        return None, (jsonify({"error": str(exc)}), 400)
