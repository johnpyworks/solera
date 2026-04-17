import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models


class AdvisorUser(AbstractUser):
    ROLE_CHOICES = [
        ("super_admin", "Super Admin"),
        ("advisor", "Advisor"),
        ("assistant", "Assistant"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="advisor")
    display_name = models.CharField(max_length=200, blank=True)
    # For assistants: which advisors they support
    assigned_advisors = models.ManyToManyField(
        "self",
        symmetrical=False,
        blank=True,
        related_name="assistants",
    )

    class Meta:
        verbose_name = "Advisor User"
        verbose_name_plural = "Advisor Users"

    def __str__(self):
        return self.display_name or self.username

    @property
    def is_super_admin(self):
        return self.role == "super_admin"

    @property
    def is_advisor(self):
        return self.role == "advisor"

    @property
    def is_assistant(self):
        return self.role == "assistant"
