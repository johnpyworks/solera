import uuid
from django.db import models


class ClientFile(models.Model):
    FILE_TYPE_CHOICES = [
        ("pdf", "PDF"),
        ("pdf_image", "PDF (Image/Scanned)"),
        ("docx", "Word Document"),
        ("xlsx", "Excel Spreadsheet"),
        ("txt", "Plain Text"),
        ("transcript", "Meeting Transcript"),
        ("other", "Other"),
    ]
    BUILD_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("complete", "Complete"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client = models.ForeignKey(
        "clients.Client", on_delete=models.CASCADE, related_name="files"
    )
    meeting = models.ForeignKey(
        "meetings.Meeting", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="files"
    )
    name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)  # relative to MEDIA_ROOT
    file_type = models.CharField(max_length=20, choices=FILE_TYPE_CHOICES, default="other")
    size_kb = models.IntegerField(null=True, blank=True)
    uploaded_by = models.CharField(max_length=100, default="vlad")
    ai_summary = models.TextField(blank=True)
    ai_processed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class DocumentTree(models.Model):
    """Stores the PageIndex hierarchical tree for a document."""
    BUILD_STATUS_CHOICES = [
        ("pending", "Pending"),
        ("complete", "Complete"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.OneToOneField(ClientFile, on_delete=models.CASCADE, related_name="tree")
    client = models.ForeignKey(
        "clients.Client", on_delete=models.CASCADE, related_name="document_trees"
    )
    tree_json = models.JSONField(null=True, blank=True)  # Full PageIndex tree
    build_status = models.CharField(max_length=20, choices=BUILD_STATUS_CHOICES, default="pending")
    built_at = models.DateTimeField(null=True, blank=True)
    error_msg = models.TextField(blank=True)

    def __str__(self):
        return f"Tree for {self.file.name} [{self.build_status}]"
