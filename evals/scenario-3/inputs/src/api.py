"""
API entry point for the service.
"""
# @decision(DL-001)
# @decision(DL-099)

from fastapi import FastAPI, Depends

app = FastAPI(title="Service API")


# @decision(DL-001)
async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Validate the bearer token and return the current user."""
    return verify_token(token)


# @decision(DL-001)
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/users")
async def list_users(user=Depends(get_current_user)):
    return {"users": []}
