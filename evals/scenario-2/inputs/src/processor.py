# @decision(DL-000)
def process_data(data: dict) -> dict:
    """Transform a raw input record into a normalized output record."""
    name = data["name"]
    value = data["value"]
    category = data.get("category", "default")

    result = {
        "name": name.strip().lower(),
        "value": float(value),
        "category": category,
        "processed": True,
    }
    return result
