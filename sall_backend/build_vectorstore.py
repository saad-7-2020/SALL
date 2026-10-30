"""
=============================================================
 SALL — Agent RAG : Construction de la base vectorielle
=============================================================
 Ce script :
   1. Charge les métadonnées des tables depuis tables_metadata.yaml
   2. Construit un document sémantique riche pour chaque table
   3. Génère les embeddings via sentence-transformers
   4. Stocke tout dans ChromaDB (persistant sur disque)

 Nouveau flux SALL :
   Question → [RAG] → tables pertinentes → [SALL-Brief] → ...

 Usage :
   python build_vectorstore.py

 Dépendances :
   pip install chromadb pyyaml sentence-transformers
=============================================================
"""

import os
import yaml
import chromadb
from chromadb.utils import embedding_functions

# ── Configuration ─────────────────────────────────────────

BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
YAML_PATH      = os.path.join(BASE_DIR, "tables_metadata.yaml")
CHROMA_PATH    = os.path.join(BASE_DIR, "chroma_sall_db")   # dossier persistant ChromaDB
COLLECTION_NAME = "sall_tables"
MODEL_NAME     = "paraphrase-multilingual-MiniLM-L12-v2"  # modèle multilingue (français)

# ── Chargement du YAML ────────────────────────────────────

def load_yaml(path: str) -> list[dict]:
    """Charge et retourne la liste des tables depuis le fichier YAML."""
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    tables = data.get("tables", [])
    print(f"✅ {len(tables)} tables chargées depuis {path}")
    return tables


# ── Construction du document sémantique ──────────────────

def build_semantic_document(table: dict) -> str:
    """
    Construit un texte sémantique riche pour chaque table.
    Ce texte sera encodé en vecteur et servira à la recherche.

    Structure :
      - Nom + système source
      - Description complète
      - Mots-clés
      - Liste des colonnes avec leurs descriptions
    """
    lines = []

    # En-tête
    lines.append(f"Table : {table['name']}")
    lines.append(f"Système : {table['source_system']}")
    lines.append("")

    # Description
    lines.append("Description :")
    lines.append(table["description"].strip())
    lines.append("")

    # Mots-clés
    keywords = table.get("keywords", [])
    if keywords:
        lines.append("Mots-clés : " + ", ".join(keywords))
        lines.append("")

    # Colonnes
    lines.append("Colonnes :")
    for col_name, col_info in table.get("columns", {}).items():
        desc = col_info.get("description", "")
        col_type = col_info.get("type", "")
        lines.append(f"  - {col_name} ({col_type}) : {desc}")

    return "\n".join(lines)


# ── Construction des métadonnées ChromaDB ─────────────────

def build_metadata(table: dict) -> dict:
    """
    Construit le dictionnaire de métadonnées associé à chaque document
    dans ChromaDB. Utilisé pour filtrer ou afficher les résultats.
    """
    return {
        "table_name":    table["name"],
        "source_system": table["source_system"],
        "keywords":      ", ".join(table.get("keywords", [])),
        "columns":       ", ".join(table.get("columns", {}).keys()),
    }


# ── Construction de la base vectorielle ──────────────────

def build_vectorstore(tables: list[dict]) -> chromadb.Collection:
    """
    Crée ou recharge la collection ChromaDB,
    puis y insère les documents sémantiques de toutes les tables.
    """
    # Initialisation ChromaDB persistant
    client = chromadb.PersistentClient(path=CHROMA_PATH)

    # Fonction d'embedding multilingue (français supporté)
    embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=MODEL_NAME
    )

    # Suppression de la collection si elle existe déjà (rebuild propre)
    existing = [c.name for c in client.list_collections()]
    if COLLECTION_NAME in existing:
        client.delete_collection(COLLECTION_NAME)
        print(f"🗑️  Ancienne collection '{COLLECTION_NAME}' supprimée.")

    # Création de la collection
    collection = client.create_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_fn,
        metadata={"hnsw:space": "cosine"}
    )
    print(f"📦 Collection '{COLLECTION_NAME}' créée.")

    # Préparation des données
    ids        = []
    documents  = []
    metadatas  = []

    for table in tables:
        table_id  = table["id"]
        doc_text  = build_semantic_document(table)
        meta      = build_metadata(table)

        ids.append(table_id)
        documents.append(doc_text)
        metadatas.append(meta)

        print(f"   📄 Document préparé : {table_id} ({table['source_system']})")

    # Insertion dans ChromaDB (les embeddings sont générés automatiquement)
    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas
    )

    print(f"\n✅ {len(ids)} tables indexées dans ChromaDB.")
    print(f"📁 Base vectorielle sauvegardée dans : {os.path.abspath(CHROMA_PATH)}")
    return collection


# ── Fonction de recherche RAG ─────────────────────────────

def search_relevant_tables(
    collection: chromadb.Collection,
    question: str,
    n_results: int = 4
) -> list[dict]:
    """
    Recherche les tables les plus pertinentes pour une question donnée.
    Retourne une liste de dictionnaires avec le nom de la table,
    le système source et le score de similarité.

    Args:
        collection : la collection ChromaDB chargée
        question   : la question en langage naturel de l'utilisateur
        n_results  : nombre de tables à retourner (défaut : 4)

    Returns:
        Liste de tables pertinentes avec leur score de similarité
    """
    results = collection.query(
        query_texts=[question],
        n_results=n_results,
        include=["documents", "metadatas", "distances"]
    )

    tables_found = []
    for i in range(len(results["ids"][0])):
        table_id = results["ids"][0][i]
        meta     = results["metadatas"][0][i]
        distance = results["distances"][0][i]
        similarity = round(1 - distance, 4)   # cosine : distance → similarité

        tables_found.append({
            "table_id":      table_id,
            "table_name":    meta["table_name"],
            "source_system": meta["source_system"],
            "columns":       meta["columns"],
            "similarity":    similarity,
        })

    return tables_found


# ── Chargement depuis la base existante ──────────────────

def load_vectorstore() -> chromadb.Collection:
    """
    Charge la collection ChromaDB existante (sans rebuild).
    À utiliser dans l'agent RAG de SALL en production.
    """
    client = chromadb.PersistentClient(path=CHROMA_PATH)

    embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=MODEL_NAME
    )

    collection = client.get_collection(
        name=COLLECTION_NAME,
        embedding_function=embedding_fn
    )
    print(f"✅ Collection '{COLLECTION_NAME}' chargée ({collection.count()} tables).")
    return collection


# ── Tests de validation ───────────────────────────────────

def run_tests(collection: chromadb.Collection):
    """
    Teste la qualité de la recherche sémantique avec des
    questions représentatives du cas d'usage SALL.
    """
    test_questions = [
        "Quel est le taux d'absentéisme par département ?",
        "Quels employés ont le plus d'incidents informatiques ?",
        "Donne-moi la répartition des salaires par niveau d'études",
        "Quels projets sont en retard ou annulés ?",
        "Combien d'employés sont actuellement en mission terrain ?",
        "Analyse complète des ressources humaines",
        "Quelles demandes IT sont en attente de traitement ?",
        "Répartition des agents par sexe et par région",
    ]

    print("\n" + "="*60)
    print("  TESTS DE RECHERCHE SÉMANTIQUE RAG")
    print("="*60)

    for question in test_questions:
        print(f"\n❓ Question : {question}")
        results = search_relevant_tables(collection, question, n_results=3)
        for r in results:
            bar = "█" * int(r["similarity"] * 20)
            print(f"   [{bar:<20}] {r['similarity']:.3f}  {r['table_name']} ({r['source_system']})")


# ── Point d'entrée ────────────────────────────────────────

if __name__ == "__main__":
    print("="*60)
    print("  SALL — Construction de la base vectorielle RAG")
    print("="*60 + "\n")

    # 1. Charger le YAML
    tables = load_yaml(YAML_PATH)

    # 2. Construire et indexer la base
    collection = build_vectorstore(tables)

    # 3. Valider avec des tests
    run_tests(collection)

    print("\n" + "="*60)
    print("  Construction terminée avec succès ✅")
    print("="*60)