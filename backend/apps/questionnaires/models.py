import uuid
from django.db import models


class QuestionnaireToken(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("submitted", "Submitted"),
        ("expired", "Expired"),
    ]

    token = models.CharField(max_length=200, primary_key=True)
    client = models.ForeignKey(
        "clients.Client", on_delete=models.CASCADE, related_name="questionnaire_tokens"
    )
    client_email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    def __str__(self):
        return f"Token for {self.client.name} [{self.status}]"


class QuestionnaireSubmission(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token = models.OneToOneField(
        QuestionnaireToken, on_delete=models.CASCADE, related_name="submission"
    )
    client = models.ForeignKey(
        "clients.Client", on_delete=models.CASCADE, related_name="questionnaire_submissions"
    )
    form_data = models.JSONField(default=dict)
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Submission for {self.client.name} at {self.submitted_at:%Y-%m-%d}"
