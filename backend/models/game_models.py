from pydantic import BaseModel

class GameServerCreate(BaseModel):
    user_id: str
    game: str = "minecraft"
    memory: str = "2G"

class GameServerResponse(BaseModel):
    namespace: str
    ip: str | None
    port: int
    status: str

