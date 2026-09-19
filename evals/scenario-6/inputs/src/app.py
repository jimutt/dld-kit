from flask import Flask
from src.routes import register_routes
from src.db import init_db

app = Flask(__name__)
app.config["DATABASE"] = "todos.db"

init_db(app)
register_routes(app)

if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)
