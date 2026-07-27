from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from src.db import get_db
from src.models import TodoCreate, TodoUpdate

bp = Blueprint("todos", __name__, url_prefix="/api/todos")


def _todo_row_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "priority": row["priority"],
        "completed": bool(row["completed"]),
    }


def _error(message, status=400):
    return jsonify({"error": message}), status


@bp.route("", methods=["GET"])
def list_todos():
    db = get_db()
    rows = db.execute("SELECT * FROM todos ORDER BY id DESC").fetchall()
    return jsonify([_todo_row_to_dict(r) for r in rows])


@bp.route("", methods=["POST"])
def create_todo():
    try:
        body = TodoCreate(**request.get_json(force=True))
    except (ValidationError, TypeError) as exc:
        return _error(str(exc))

    db = get_db()
    cur = db.execute(
        "INSERT INTO todos (title, description, priority) VALUES (?, ?, ?)",
        (body.title, body.description, body.priority.value),
    )
    db.commit()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(_todo_row_to_dict(row)), 201


@bp.route("/<int:todo_id>", methods=["GET"])
def get_todo(todo_id):
    db = get_db()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if row is None:
        return _error("Not found", 404)
    return jsonify(_todo_row_to_dict(row))


@bp.route("/<int:todo_id>", methods=["PATCH"])
def update_todo(todo_id):
    db = get_db()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if row is None:
        return _error("Not found", 404)

    try:
        body = TodoUpdate(**request.get_json(force=True))
    except (ValidationError, TypeError) as exc:
        return _error(str(exc))

    updates = body.model_dump(exclude_none=True)
    if not updates:
        return jsonify(_todo_row_to_dict(row))

    if "priority" in updates:
        updates["priority"] = updates["priority"].value
    if "completed" in updates:
        updates["completed"] = int(updates["completed"])

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    db.execute(
        f"UPDATE todos SET {set_clause} WHERE id = ?",
        [*updates.values(), todo_id],
    )
    db.commit()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    return jsonify(_todo_row_to_dict(row))


@bp.route("/<int:todo_id>", methods=["DELETE"])
def delete_todo(todo_id):
    db = get_db()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    if row is None:
        return _error("Not found", 404)
    db.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    db.commit()
    return "", 204


def register_routes(app):
    app.register_blueprint(bp)
