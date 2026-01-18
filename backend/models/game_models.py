from pydantic import BaseModel

class GameServerCreate(BaseModel):
    user_id: str
    game: str = "minecraft"
    memory: str = "2G"

class GameServerResponse(BaseModel):
    namespace: str
    hostname: str
    port: int
    status: str

