from datetime import timedelta
from django.db import models
from django.utils import timezone


class MCPCredential(models.Model):
    provider = models.CharField(max_length=20, unique=True)
    credentials = models.JSONField(default=dict)
    access_token = models.TextField(blank=True)
    token_expiry = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "mcp_credentials"

    def is_token_valid(self) -> bool:
        if not self.access_token or not self.token_expiry:
            return False
        return self.token_expiry > timezone.now() + timedelta(minutes=5)

    def __str__(self):
        return f"MCPCredential({self.provider})"
