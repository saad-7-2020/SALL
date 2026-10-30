from sqlalchemy import create_engine
import os
from dotenv import load_dotenv
from langchain_community.utilities import SQLDatabase


load_dotenv()

db_uri = os.getenv("DB_URI")

db = SQLDatabase.from_uri(db_uri)

print("Schema:", db.get_table_names())