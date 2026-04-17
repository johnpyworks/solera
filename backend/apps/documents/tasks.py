from celery import shared_task


@shared_task(name="documents.build_page_index")
def build_page_index(file_id: str):
    from apps.documents.page_index import build_tree
    try:
        tree = build_tree(file_id)
        return {"status": "complete", "file_id": file_id, "nodes": len(tree.get("nodes", []))}
    except Exception as e:
        return {"status": "failed", "file_id": file_id, "error": str(e)}
