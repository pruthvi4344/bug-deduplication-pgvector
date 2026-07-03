import logging
from contextlib import contextmanager
from psycopg_pool import ConnectionPool
from src.utils import config

# Set up logging for tracking connection states
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DB_Connection")

# Initialize a global connection pool connection string
conn_info = f"host={config.DB_HOST} port={config.DB_PORT} dbname={config.DB_NAME} user={config.DB_USER} password={config.DB_PASSWORD}"

try:
    # Open a thread-safe connection pool for real-time concurrent updates
    pool = ConnectionPool(conninfo=conn_info, open=True, min_size=2, max_size=10)
    logger.info("PostgreSQL Connection Pool initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize the PostgreSQL Connection Pool: {e}")
    pool = None

@contextmanager
def get_db_connection():
    """
    Context manager to safely borrow a database connection from the pool 
    and automatically return it when finished.
    """
    if pool is None:
        raise RuntimeError("Database connection pool is not available.")
    
    with pool.connection() as conn:
        yield conn