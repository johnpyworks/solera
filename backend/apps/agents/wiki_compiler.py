"""Wiki Compiler Agent — builds and maintains a per-client knowledge wiki from uploaded documents.

Flow:
  1. Extract full text from the uploaded file
  2. Classify document type + year
  3. Write or update the relevant ClientWikiArticle
  4. Rebuild the ClientWikiIndex (compact one-liner per article)
"""
import json
import os

from django.conf import settings

from apps.agents.models import AgentLog
from apps.agents.provider import AIProvider
from apps.agents.prompt_store import get_prompt
from apps.clients.models import ClientWikiArticle, ClientWikiIndex


def _extract_full_text(file_path: str, file_type: str) -> str:
    """Extract all text from a file. Returns empty string on failure."""
    abs_path = os.path.join(settings.MEDIA_ROOT, file_path)
    try:
        if file_type in ("pdf", "pdf_image"):
            import pdfplumber
            pages = []
            with pdfplumber.open(abs_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text() or ""
                    pages.append(text)
            return "\n\n".join(pages)

        elif file_type == "docx":
            from docx import Document
            doc = Document(abs_path)
            return "\n".join(p.text for p in doc.paragraphs)

        elif file_type == "xlsx":
            import openpyxl
            wb = openpyxl.load_workbook(abs_path, read_only=True)
            lines = []
            for sheet in wb.worksheets:
                lines.append(f"=== Sheet: {sheet.title} ===")
                for row in sheet.iter_rows(values_only=True):
                    lines.append("\t".join(str(c) if c is not None else "" for c in row))
            return "\n".join(lines)

        elif file_type in ("txt", "transcript"):
            with open(abs_path, encoding="utf-8", errors="ignore") as f:
                return f.read()

        else:
            with open(abs_path, encoding="utf-8", errors="ignore") as f:
                return f.read()

    except Exception as e:
        return f"[Text extraction failed: {e}]"


def _strip_code_fence(text: str) -> str:
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def _rebuild_index(client) -> None:
    """Regenerate the compact ClientWikiIndex from all current articles."""
    articles = ClientWikiArticle.objects.filter(client=client).order_by("article_type", "-document_year")
    if not articles.exists():
        return

    article_summaries = "\n\n".join(
        f"Title: {a.title}\nType: {a.get_article_type_display()}"
        f"{' (latest)' if a.is_latest else ' (older)'}\n\n{a.body[:800]}"
        for a in articles
    )

    ai = AIProvider()
    index_text = ai.complete(
        system_prompt=get_prompt("wiki_index_system"),
        user_prompt=get_prompt("wiki_index_user").format(
            client_name=client.name,
            articles=article_summaries[:6000],
        ),
    )["text"]

    ClientWikiIndex.objects.update_or_create(
        client=client,
        defaults={"body": index_text},
    )


def run(file_id: str) -> dict:
    """Main entry point called after a ClientFile is uploaded."""
    from apps.documents.models import ClientFile

    try:
        cf = ClientFile.objects.select_related("client").get(pk=file_id)
    except ClientFile.DoesNotExist:
        return {"error": f"ClientFile {file_id} not found"}

    client = cf.client
    ai = AIProvider()

    # 1. Extract text
    text = _extract_full_text(cf.file_path, cf.file_type)
    if not text.strip() or text.startswith("[Text extraction failed"):
        AgentLog.objects.create(
            agent_name="WikiCompiler",
            action=f"Text extraction failed for {cf.name}",
            client=client,
            client_name=client.name,
            status="failed",
        )
        return {"error": "Could not extract text from file"}

    # 2. Classify document
    classify_result = ai.complete(
        system_prompt=get_prompt("wiki_classifier_system"),
        user_prompt=get_prompt("wiki_classifier_user").format(
            client_name=client.name,
            text=text[:3000],
        ),
    )
    try:
        classification = json.loads(_strip_code_fence(classify_result["text"]))
        article_type = classification.get("article_type", "other")
        document_year = classification.get("document_year")
        doc_title = classification.get("title", cf.name)
    except (json.JSONDecodeError, ValueError):
        article_type = "other"
        document_year = None
        doc_title = cf.name

    # Validate article_type against allowed choices
    valid_types = {t for t, _ in ClientWikiArticle.ARTICLE_TYPE_CHOICES}
    if article_type not in valid_types:
        article_type = "other"

    # 3. Check for existing article of this type+year to update
    existing_article = ClientWikiArticle.objects.filter(
        client=client,
        article_type=article_type,
        document_year=document_year,
    ).first()

    existing_section = ""
    if existing_article:
        existing_section = f"Existing article to update:\n{existing_article.body[:1000]}\n\nUpdate it with new information from the document below."
    else:
        existing_section = "No existing article — write a fresh one."

    # 4. Write the wiki article
    article_result = ai.complete(
        system_prompt=get_prompt("wiki_article_system"),
        user_prompt=get_prompt("wiki_article_user").format(
            client_name=client.name,
            article_type=article_type,
            doc_title=doc_title,
            existing_section=existing_section,
            text=text[:5000],
        ),
    )
    article_body = article_result["text"].strip()

    # 5. Save or update the article (is_latest logic handled in model.save())
    if existing_article:
        existing_article.title = doc_title
        existing_article.body = article_body
        existing_article.source_files = list(set(existing_article.source_files + [str(cf.id)]))
        existing_article.is_latest = True
        existing_article.save()
        article = existing_article
    else:
        article = ClientWikiArticle.objects.create(
            client=client,
            article_type=article_type,
            title=doc_title,
            body=article_body,
            source_files=[str(cf.id)],
            document_year=document_year,
            is_latest=True,
        )

    # 6. Rebuild the compact index
    _rebuild_index(client)

    AgentLog.objects.create(
        agent_name="WikiCompiler",
        action=f"Compiled wiki article '{doc_title}' ({article_type}) for {client.name}",
        client=client,
        client_name=client.name,
        status="complete",
        output_data={"article_id": str(article.id), "article_type": article_type},
    )

    return {
        "article_id": str(article.id),
        "article_type": article_type,
        "title": doc_title,
        "document_year": document_year,
    }


def run_from_note(note_id: str) -> dict:
    """Called after an advisor note is saved. Notes fold into meeting_history or client_background."""
    from apps.clients.models import Note

    try:
        note = Note.objects.select_related("client").get(pk=note_id)
    except Note.DoesNotExist:
        return {"error": f"Note {note_id} not found"}

    if not note.client:
        return {"error": "Note has no associated client"}

    client = note.client
    text = note.text.strip()
    if len(text) < 20:
        return {"skipped": "Note too short to index"}

    # Short notes fold into meeting_history; notes > 200 chars may be background context
    article_type = "meeting_history" if len(text) < 400 else "client_background"
    doc_title = f"Advisor Note — {note.created_at.strftime('%b %d, %Y')}"

    ai = AIProvider()

    existing_article = ClientWikiArticle.objects.filter(
        client=client,
        article_type=article_type,
        document_year=None,
    ).order_by("-last_updated").first()

    existing_section = (
        f"Existing article to update:\n{existing_article.body[:1000]}\n\nAppend new information from the note below."
        if existing_article
        else "No existing article — write a fresh one."
    )

    article_result = ai.complete(
        system_prompt=get_prompt("wiki_article_system"),
        user_prompt=get_prompt("wiki_article_user").format(
            client_name=client.name,
            article_type=article_type,
            doc_title=doc_title,
            existing_section=existing_section,
            text=text,
        ),
    )
    article_body = article_result["text"].strip()

    if existing_article:
        existing_article.body = article_body
        existing_article.is_latest = True
        existing_article.save()
        article = existing_article
    else:
        article = ClientWikiArticle.objects.create(
            client=client,
            article_type=article_type,
            title=doc_title,
            body=article_body,
            source_files=[],
            document_year=None,
            is_latest=True,
        )

    _rebuild_index(client)

    return {"article_id": str(article.id), "article_type": article_type, "title": doc_title}
