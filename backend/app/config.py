"""Application configuration."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@db:5432/bugdedup"
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    cors_origins: str = "http://localhost:5173"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    @property
    def origins(self) -> list[str]: return [x.strip() for x in self.cors_origins.split(',')]
@lru_cache
def get_settings() -> Settings: return Settings()
