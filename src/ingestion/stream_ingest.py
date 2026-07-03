import logging
from psycopg.types.string import text
from src.utils.db_connection import get_db_connection

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IngestionPipeline")

def execute_sql_file(file_path: str):
    """
    Utility function to run SQL DDL definitions directly from files.
    """
    try:
        with open(file_path, 'r') as f:
            sql_script = f.read()
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(text(sql_script))
                conn.commit()
        logger.info(f"Successfully executed SQL script: {file_path}")
    except Exception as e:
        logger.error(f"Error executing script {file_path}: {e}")

def insert_bug_report(summary: str, os_name: str, architecture: str, component: str, vector_embedding: list):
    """
    Inserts a singular bug report with its text attributes and dense vector profile
    directly into the database in a transactional execution loop.
    """
    insert_query = """
        INSERT INTO bug_reports (summary, operating_system, architecture, component_type, description_embedding)
        VALUES (%s, %s, %s, %s, %s) RETURNING id;
    """
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Execute the single-stage insertion loop
                cur.execute(insert_query, (summary, os_name, architecture, component, vector_embedding))
                generated_id = cur.fetchone()[0]
                conn.commit()
                logger.info(f"Successfully ingested bug report ID {generated_id} directly into relational storage.")
                return generated_id
    except Exception as e:
        logger.error(f"Failed to ingest bug record: {e}")
        return None

if __name__ == "__main__":
    logger.info("Starting database initialization...")
    # Initialize the extension and tables first
    execute_sql_file("database/schema.sql")
    execute_sql_file("database/create_tables.sql")
    logger.info("Database foundation complete and ready for vector injection steps.")