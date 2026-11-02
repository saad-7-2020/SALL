# SALL — Smart Analytical LLM for Leadership

Assistant conversationnel **NL2SQL + Business Intelligence** (projet de fin d'études, SNRT Rabat).
Un décideur pose une question en français ; SALL sélectionne les tables pertinentes, génère et corrige le SQL
PostgreSQL, puis produit des graphiques et une analyse rédigée.

## Architecture

```
Question ──► RAG (ChromaDB + similarité cosinus) ──► SALL-Brief ──► RAG (affinage)
          ──► SALL-Logic (LangGraph : génération → EXPLAIN → correction, 5 essais max, requêtes en parallèle)
          ──► SALL-Analyzer (figures Plotly / ECharts) ──► SALL-Expert (analyse en streaming, SSE)
```

| Étage | Rôle |
|---|---|
| RAG | Embeddings multilingues `paraphrase-multilingual-MiniLM-L12-v2`, métadonnées dans `tables_metadata.yaml`, top-6 tables par similarité cosinus. Repli sur le schéma complet si le retrieval échoue. |
| SALL-Brief | Transforme la demande en liste d'informations analytiques (sans SQL). |
| SALL-Logic | Boucle LangGraph : génère le SQL, le valide avec `EXPLAIN`, réinjecte l'erreur PostgreSQL dans le prompt de correction. |
| SALL-Analyzer | Choisit et génère les visualisations. |
| SALL-Expert | Rédige l'analyse pour le décideur, token par token. |

Données : entrepôt synthétique PostgreSQL (Faker) reproduisant AGIRH, iTop, MPlanner et OpenProject
(~200 employés, 500 projets, 1 000 tâches, 300 incidents, 513 missions).

Évaluation (41 questions, comparaison des **résultats** SQL et non du texte) :
81 % de succès à la première génération, 96 % après correction automatique.

Stack : Python, FastAPI, LangChain/LangGraph, Groq (Llama 3.3 70B), ChromaDB, SQLAlchemy, React + Vite, Plotly, ECharts.

## Lancer le projet

```bash
# Backend
cd sall_backend
cp .env.example .env            
pip install -r requirements.txt
python build_vectorstore.py
uvicorn main:app --reload

# Frontend
cd sall_frontend
cp .env.example .env
npm install && npm run dev
```

## Limites connues

- Le retrieval s'appuie sur `tables_metadata.yaml`, écrit pour l'entrepôt synthétique ; une autre base se rabat sur le schéma complet.
- Analyses Pareto, BCG, RFM, EAC et détection d'anomalies : prévues, pas encore implémentées en tant que modules dédiés.
- Qualité dépendante du modèle : la justesse du SQL, du choix des graphiques et de l'analyse dépend de l'intelligence du LLM utilisé (actuellement `openai/gpt-oss-120b` sur Groq). Un modèle plus petit produit plus d'erreurs.
