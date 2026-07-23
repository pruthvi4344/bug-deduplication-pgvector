from datetime import datetime
from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base
class BugReport(Base):
    __tablename__='bug_reports'
    id: Mapped[int]=mapped_column(BigInteger,primary_key=True); external_id: Mapped[str|None]=mapped_column(String(128),unique=True)
    summary: Mapped[str]=mapped_column(Text); description: Mapped[str]=mapped_column(Text,default=''); cleaned_text: Mapped[str]=mapped_column(Text)
    product: Mapped[str|None]=mapped_column(String(120)); component: Mapped[str|None]=mapped_column(String(120)); resolution_status: Mapped[str]=mapped_column(String(32),default='UNRESOLVED')
    operating_system: Mapped[str|None]=mapped_column(String(80)); architecture: Mapped[str|None]=mapped_column(String(80)); reported_at: Mapped[datetime|None]=mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now()); embedding: Mapped[list[float]]=mapped_column(Vector(384))
class BenchmarkRun(Base):
    __tablename__='benchmark_runs'
    id: Mapped[int]=mapped_column(BigInteger,primary_key=True); index_type: Mapped[str]=mapped_column(String(16)); k: Mapped[int]=mapped_column(Integer); queries_evaluated: Mapped[int]=mapped_column(Integer)
    recall_at_1: Mapped[float]=mapped_column(Float); recall_at_5: Mapped[float]=mapped_column(Float); recall_at_10: Mapped[float]=mapped_column(Float); average_latency_ms: Mapped[float]=mapped_column(Float); p95_latency_ms: Mapped[float]=mapped_column(Float); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True),server_default=func.now())
