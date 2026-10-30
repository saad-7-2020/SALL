import asyncio, json
from typing import AsyncGenerator, Optional
import groq as groq_module
from tenacity import retry, retry_if_exception_type, wait_random_exponential, stop_after_attempt
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, START, END
from langchain_community.utilities import SQLDatabase
from sqlalchemy import create_engine, text
from pandas import read_sql_query
from dotenv import load_dotenv
import os, pandas as pd, plotly.io as pio

load_dotenv()

# MODEL1          = "openai/gpt-oss-120b"
# MODEL           = "openai/gpt-oss-120b"
MODEL1          = "openai/gpt-oss-120b"   # llama-3.3-70b-versatile n'existe plus sur Groq (404)
MODEL           = "openai/gpt-oss-120b"
DEFAULT_DB_URI  = os.getenv("DB_URI", "")
os.environ["GROQ_API_KEY"] = os.getenv("GROK_2_1", "")

# ════════════════════════════════════════════════════════════════
#  TENACITY — backoff jusqu'à 600s (réinitialisation tokens Groq)
# ════════════════════════════════════════════════════════════════

@retry(
    retry   = retry_if_exception_type((groq_module.RateLimitError, groq_module.APIStatusError)),
    wait    = wait_random_exponential(min=4, max=600),
    stop    = stop_after_attempt(4),
    reraise = True,
)
async def executer_llm_securise(chain, inputs: dict = None):
    return await chain.ainvoke(inputs or {})

# ════════════════════════════════════════════════════════════════
#  CONNEXION DB DYNAMIQUE
# ════════════════════════════════════════════════════════════════

def build_db_uri(host, port, name, user, password):
    return f"postgresql://{user}:{password}@{host}:{port}/{name}"

def get_db_and_info(db_uri: str):
    db = SQLDatabase.from_uri(db_uri)
    return db, db.get_table_info(), db.dialect

# ════════════════════════════════════════════════════════════════
#  RAG — sélection sémantique des tables (ChromaDB + similarité cosinus)
# ════════════════════════════════════════════════════════════════

_collection = None

def _get_collection():
    """Charge la base vectorielle une seule fois (le modèle d'embedding est lourd)."""
    global _collection
    if _collection is None:
        from build_vectorstore import load_vectorstore
        _collection = load_vectorstore()
    return _collection

def _select_schema(query: str, db_uris: list[str], n_results: int = 6):
    """Retourne (schéma restreint aux tables pertinentes, tables trouvées avec score)."""
    from build_vectorstore import search_relevant_tables
    trouvees = search_relevant_tables(_get_collection(), query, n_results=n_results)
    noms     = [t["table_name"] for t in trouvees]
    schema   = ""
    for uri in db_uris:
        db        = SQLDatabase.from_uri(uri)
        existantes = [n for n in noms if n in db.get_usable_table_names()]
        if existantes:
            schema += db.get_table_info(table_names=existantes) + "\n"
    return schema, trouvees

# ════════════════════════════════════════════════════════════════
#  SALL-BRIEF
# ════════════════════════════════════════════════════════════════

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

brief_llm            = ChatGroq(model=MODEL1, temperature=0.3, max_retries=3)
brief_llm_structured = brief_llm.with_structured_output(SALLBriefReturn)

async def run_brief(question: str, table_info: str) -> list[str]:
    prompt = ChatPromptTemplate.from_messages([
        ("system", ROLE_BRIEF), ("human", "{question}"),
    ]).partial(table_info=table_info)
    response = await executer_llm_securise(
        prompt | brief_llm_structured, {"question": question}
    )
    # Le modèle renvoie parfois des objets {titre, détail} au lieu de chaînes : on normalise.
    infos = []
    for item in response.required_informations:
        if isinstance(item, dict):
            item = " — ".join(str(v) for v in item.values() if v)
        infos.append(str(item).strip())
    return [i for i in infos if i]

# ════════════════════════════════════════════════════════════════
#  SALL-LOGIC
# ════════════════════════════════════════════════════════════════

PROMPT_GEN = """Tu es un expert SQL senior pour {dialect}.
L'utilisateur a demandé : {demande}
Génère une requête SQL SELECT pour : {information}
Schéma : {table_info}
RÈGLES : SELECT uniquement · Jamais SELECT * · GROUP BY si agrégation · JOINs cohérents
Réponds UNIQUEMENT avec le SQL brut, sans markdown."""

PROMPT_COR = """Tu es un expert SQL senior pour {dialect}.
Demande : {demande} | Erreur : {error_message}
Requête fautive : {sql_query}
Objectif : {information} | Schéma : {table_info}
Corrige. Réponds UNIQUEMENT avec le SQL brut corrigé."""

logic_llm    = ChatGroq(model=MODEL1, temperature=0.1, max_retries=3)
MAX_ATTEMPTS = 5

def _clean_sql(raw: str) -> str:
    return raw.strip().replace("```sql","").replace("```","").strip()

async def _generateur(state: dict) -> dict:
    if state.get("error_message"):
        prompt = ChatPromptTemplate.from_messages([("system", PROMPT_COR)]).partial(
            error_message=state["error_message"], sql_query=state["sql_query"],
            information=state["information"], table_info=state["table_info"],
            dialect=state["dialect"], demande=state["demande"],
        )
    else:
        prompt = ChatPromptTemplate.from_messages([("system", PROMPT_GEN)]).partial(
            information=state["information"], table_info=state["table_info"],
            dialect=state["dialect"], demande=state["demande"],
        )
    sql = _clean_sql(await executer_llm_securise(prompt | logic_llm | StrOutputParser(), {}))
    return {**state, "sql_query": sql, "error_message": None,
            "attempts": state.get("attempts", 0) + 1}

def _validateur(state: dict) -> dict:
    try:
        SQLDatabase.from_uri(state["db_uri"]).run(f"EXPLAIN {state['sql_query']}")
        return {**state, "error_message": None}
    except Exception as e:
        return {**state, "error_message": str(e)}

def _router(state: dict) -> str:
    if state["error_message"] is None: return "valide"
    if state.get("attempts", 0) >= MAX_ATTEMPTS: return "abandon"
    return "reessaie"

def _build_graph():
    wf = StateGraph(dict)
    wf.add_node("generateur", _generateur)
    wf.add_node("validateur", _validateur)
    wf.add_edge(START, "generateur")
    wf.add_edge("generateur", "validateur")
    wf.add_conditional_edges("validateur", _router,
        {"valide": END, "reessaie": "generateur", "abandon": END})
    return wf.compile()

_sql_graph = _build_graph()

async def _executer_sql(demande, info, db_uri, table_info, dialect) -> dict:
    etat = await _sql_graph.ainvoke({
        "demande": demande, "information": info,
        "sql_query": None, "error_message": None, "attempts": 0,
        "db_uri": db_uri, "table_info": table_info, "dialect": dialect,
    })
    if etat.get("error_message"):
        return {"description": info, "sql": etat.get("sql_query",""),
                "donnees": [], "erreur": etat["error_message"]}
    engine = create_engine(db_uri)
    try:
        df = await asyncio.to_thread(read_sql_query, text(etat["sql_query"]), engine)
        return {"description": info, "sql": etat["sql_query"],
                "donnees": df.to_dict(orient="records"),
                "columns": list(df.columns), "rows": len(df), "erreur": None}
    except Exception as e:
        return {"description": info, "sql": etat["sql_query"],
                "donnees": [], "erreur": str(e)}

# ════════════════════════════════════════════════════════════════
#  SALL-ANALYZER (Version Apache ECharts)
# ════════════════════════════════════════════════════════════════

class Visualization(BaseModel):
    need_graph:     bool           = Field(description="True si un graphe ajoute de la valeur")
    graph_type:     Optional[str]  = Field(description="bar, line, pie, scatter")
    graph_name:     Optional[str]  = Field(description="Titre du graphe")
    echarts_option: Optional[dict] = Field(description="Le dictionnaire JSON complet de configuration pour Apache ECharts (xAxis, yAxis, series, tooltip, etc.) formaté avec les vraies données.")

class SALLAnalyzerReturn(BaseModel):
    visualizations: list[Visualization]

ROLE_ANALYZER = """Tu es SALL-Analyzer, expert BI et Data Visualization.
Génère une configuration JSON pour Apache ECharts adaptée aux données fournies.
RÈGLES : 
- Injecte directement les valeurs des données dans la configuration JSON (dans `series.data` et `xAxis.data`).
- Ajoute toujours un tooltip et une légende pour la lisibilité.
- Seulement des graphes qui ajoutent de la valeur.
GUIDE : catégories→bar · temporel→line · répartition→pie
Données : {input_data}"""

analyzer_llm            = ChatGroq(model=MODEL1, temperature=0.1, max_retries=3) # Température baissée pour du JSON strict
analyzer_llm_structured = analyzer_llm.with_structured_output(SALLAnalyzerReturn)

async def run_analyzer(description_donnees: dict) -> list[dict]:
    all_figures_json = []
    
    for description, donnees in description_donnees.items():
        if not donnees: continue
        
        # On limite aux 50 premières lignes pour ne pas exploser le token limit
        donnee_brute = description + "\nDonnées : " + json.dumps(donnees[:50], ensure_ascii=False)
        prompt = ChatPromptTemplate.from_messages([("system", ROLE_ANALYZER)]).partial(input_data=donnee_brute)
        
        try:
            # Appel sécurisé avec Tenacity
            response = await executer_llm_securise(prompt | analyzer_llm_structured, {})
        except Exception as e:
            print(f"Erreur LLM Analyzer: {e}")
            continue
            
        for viz in response.visualizations:
            if not viz.need_graph or not viz.echarts_option: continue
            
            # Plus besoin d'exec() ! On renvoie directement la configuration ECharts
            all_figures_json.append({
                "title":          viz.graph_name or "Graphique",
                "type":           viz.graph_type or "chart",
                "echarts_option": viz.echarts_option
            })
            
    return all_figures_json

# ════════════════════════════════════════════════════════════════
#  SALL-EXPERT
# ════════════════════════════════════════════════════════════════

ROLE_EXPERT = """Tu es SALL-Expert, analyste Senior BI.
Produis une analyse professionnelle orientée décision.
RÈGLES : ne jamais décrire ligne par ligne · raisonner comme consultant BI · factuel
FORMAT : ## Résumé exécutif\\n## Principaux constats\\n## Tendances\\n## Risques\\n## Recommandations
Demande : {demande}\\nDonnées : {input_data}"""

expert_llm = ChatGroq(model=MODEL, temperature=0.7, max_retries=3, streaming=True)

# ════════════════════════════════════════════════════════════════
#  PIPELINE PRINCIPAL
# ════════════════════════════════════════════════════════════════

async def run_pipeline(
    question:   str,
    databases:  list[str],
    msg_id:     str,
    db_configs: list[dict] = None,
) -> AsyncGenerator[dict, None]:
    """
    db_configs : configs DB depuis l'icône utilisateur (navbar).
    Chaque dict : {id, name, host, port, user, password}
    Fallback vers DEFAULT_DB_URI si vide.
    """
    stats      = {"sql_success": 0, "sql_fail": 0, "total_rows": 0}
    db_configs = db_configs or []

    active = [c for c in db_configs if not databases or c.get("id") in databases]
    if not active:
        active = [{"id": "default", "name": "default", "uri": DEFAULT_DB_URI}]

    db_uris             = []
    table_info_combined = ""
    dialect_used        = "postgresql"

    for cfg in active:
        uri = cfg.get("uri") or build_db_uri(
            cfg.get("host","localhost"), str(cfg.get("port","5432")),
            cfg.get("name",""), cfg.get("user",""), cfg.get("password",""),
        )
        db_uris.append(uri)
        try:
            _, t_info, dialect_used = get_db_and_info(uri)
            table_info_combined += f"\n-- Base : {cfg.get('name','?')} --\n{t_info}\n"
        except Exception as e:
            yield {"type": "error", "message": f"Connexion à {cfg.get('name','?')} échouée : {e}"}
            return

    primary_uri = db_uris[0]

    # ── RAG (1/2) : tables proches de la question → schéma du Brief ─
    yield {"type":"step","step":"rag","status":"running","label":"Sélection du schéma pertinent..."}
    schema_brief = table_info_combined
    try:
        s, _ = await asyncio.to_thread(_select_schema, question, db_uris)
        if s.strip():
            schema_brief = s
    except Exception:
        pass   # repli : schéma complet

    # ── Brief ────────────────────────────────────────────────────
    yield {"type":"step","step":"brief","status":"running","label":"SALL-Brief analyse la demande..."}
    try:
        informations = await run_brief(question, schema_brief)
    except Exception as e:
        yield {"type":"error","message":f"SALL-Brief : {e}"}
        return
    yield {"type":"step","step":"brief","status":"done","label":"SALL-Brief",
           "detail":f"{len(informations)} informations identifiées","informations":informations}

    # ── RAG ──────────────────────────────────────────────────────
    schema_for_sql = table_info_combined
    rag_detail     = "Schéma complet injecté (retrieval indisponible)"
    try:
        schema, trouvees = await asyncio.to_thread(
            _select_schema, question + " " + " ".join(informations), db_uris)
        if schema.strip():
            schema_for_sql = schema
            rag_detail = f"{len(trouvees)} tables retenues : " + ", ".join(
                f"{t['table_name']} ({t['similarity']:.2f})" for t in trouvees)
    except Exception as e:
        rag_detail = f"Schéma complet injecté (retrieval en échec : {e})"
    yield {"type":"step","step":"rag","status":"done","label":"RAG","detail":rag_detail}

    # ── Logic ────────────────────────────────────────────────────
    yield {"type":"step","step":"logic","status":"running","label":"SALL-Logic génère les requêtes SQL..."}
    resultats = await asyncio.gather(*[
        _executer_sql(question, info, primary_uri, schema_for_sql, dialect_used)
        for info in informations
    ])
    description_donnees = {}
    for i, r in enumerate(resultats):
        if r["erreur"]:
            stats["sql_fail"] += 1
            yield {"type":"sql_error","index":i+1,"description":r["description"],"error":r["erreur"]}
        else:
            stats["sql_success"] += 1
            stats["total_rows"]  += r.get("rows",0)
            yield {"type":"sql","index":i+1,"description":r["description"],
                   "query":r["sql"],"rows":r.get("rows",0),"columns":r.get("columns",[])}
            description_donnees[r["description"]] = r["donnees"]
    yield {"type":"step","step":"logic","status":"done","label":"SALL-Logic",
           "detail":f"{stats['sql_success']}/{len(informations)} requêtes · {stats['total_rows']} lignes"}

    # ── Analyzer ─────────────────────────────────────────────────
    yield {"type":"step","step":"analyzer","status":"running","label":"SALL-Analyzer génère les visualisations..."}
    all_figures_json = []
    try:
        all_figures_json = await run_analyzer(description_donnees)
    except Exception as e:
        yield {"type":"step","step":"analyzer","status":"error","label":"SALL-Analyzer","detail":str(e)}
    nb = len(all_figures_json)
    yield {"type":"step","step":"analyzer","status":"done","label":"SALL-Analyzer",
           "detail":f"{nb} visualisation{'s' if nb>1 else ''} générée{'s' if nb>1 else ''}"}
    yield {"type":"figures","figures":all_figures_json}

    # ── Expert ───────────────────────────────────────────────────
    yield {"type":"step","step":"expert","status":"running","label":"SALL-Expert rédige l'analyse..."}
    input_data = "\n\n".join(
        f"### {d}\n{json.dumps(r[:5], ensure_ascii=False)}"
        for d, r in description_donnees.items()
    )
    chain = ChatPromptTemplate.from_messages([("system", ROLE_EXPERT)]) | expert_llm | StrOutputParser()
    try:
        async for chunk in chain.astream({"demande": question, "input_data": input_data}):
            yield {"type":"token","content":chunk}
    except Exception as e:
        yield {"type":"error","message":f"SALL-Expert : {e}"}
        return
    yield {"type":"step","step":"expert","status":"done","label":"SALL-Expert","detail":"Analyse terminée"}
    yield {"type":"done","stats":stats}