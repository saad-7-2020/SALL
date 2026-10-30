from langchain_groq import ChatGroq
from dotenv import load_dotenv
import os
from langchain_community.utilities import SQLDatabase
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
import asyncio
load_dotenv()


async def executer_llm_securise(chain, inputs: dict = None):
    return await chain.ainvoke(inputs or {})

bd_uri = os.getenv("DB_URI")
os.environ["GROQ_API_KEY"] = os.getenv("GROK_2_1", "")
db = SQLDatabase.from_uri(bd_uri)
table_info = db.get_table_info(["openproject_projets", "openproject_taches"])

model = "openai/gpt-oss-120b"

llm = ChatGroq(model=model, temperature=0.3, max_retries=3)

class SALLBriefReturn(BaseModel):
    required_informations: list = Field(description="Liste des informations nécessaires")

ROLE_BRIEF = """Tu es SALL-Brief, expert Senior en Business Intelligence et Data Storytelling.
Tu recoie la demande de l'utilisateur et tu dois identifier toutes les informations nécessaires pour y répondre.
Votre role est de generer toutes les informations necessaire pour une repense riche et decisionnelle

Tu suivres les 4 axes suivantes de la méthodologie BI pendant la generation des ces informations.

### MÉTHODOLOGIE BI (4 AXES) :
1. Volume & Périmètre — nombre total, répartitions par axes clés
2. Performance & Santé — taux d'avancement, statuts, échéances critiques
3. Finances & Ressources — budget alloué vs consommé, charge RH
4. Alertes & Risques — dérives, tops/flops, bloqueurs critiques

Ton retoure dois etre comme suit:
["information 1", "information 2", "information 3"]

### SCHÉMA DE LA BASE :
Voici le shéma de la base de données :
{table_info}

### RÈGLES :
- JAMAIS de texte explicatif — JSON uniquement
- Intitulés clairs et professionnels
- Tu ne génères PAS de SQL.
"""

brief_llm            = ChatGroq(model=model, temperature=0.3, max_retries=3)
brief_llm_structured = brief_llm.with_structured_output(SALLBriefReturn)

async def run_brief(question: str, table_info: str) -> list[str]:
    prompt = ChatPromptTemplate.from_messages([
        ("system", ROLE_BRIEF), ("human", "{question}"),
    ]).partial(table_info=table_info)
    response = await executer_llm_securise(
        prompt | brief_llm_structured, {"question": question}
    )
    return response.required_informations


result = asyncio.run(run_brief("faites une analyse complete des projets en cours.", table_info))
print(result)