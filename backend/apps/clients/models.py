import uuid
from django.db import models
from django.conf import settings


class Household(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    primary_client = models.ForeignKey(
        "Client", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="primary_for_household"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Client(models.Model):
    STAGE_CHOICES = [
        ("Discovery", "Discovery"),
        ("LEAP Process", "LEAP Process"),
        ("Implementation", "Implementation"),
        ("Solera Heartbeat", "Solera Heartbeat"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="clients"
    )
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    language_tag = models.CharField(max_length=10, blank=True, null=True)
    meeting_stage = models.CharField(max_length=50, choices=STAGE_CHOICES, default="Discovery")
    wealthbox_id = models.CharField(max_length=50, blank=True)
    assigned_advisor = models.CharField(max_length=100, blank=True, default="vlad")
    anniversary_date = models.DateField(null=True, blank=True)
    last_contact_date = models.DateField(null=True, blank=True)
    household = models.ForeignKey(
        Household, null=True, blank=True, on_delete=models.SET_NULL, related_name="clients"
    )
    is_primary = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class HouseholdMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name="members")
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    relationship = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.relationship})"


class Note(models.Model):
    NOTE_TYPE_CHOICES = [
        ("advisor_note", "Advisor Note"),
        ("ai_summary", "AI Summary"),
        ("system", "System"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client = models.ForeignKey(
        Client, null=True, blank=True, on_delete=models.CASCADE, related_name="notes"
    )
    member = models.ForeignKey(
        HouseholdMember, null=True, blank=True, on_delete=models.CASCADE, related_name="notes"
    )
    text = models.TextField()
    author = models.CharField(max_length=100)
    note_type = models.CharField(max_length=30, choices=NOTE_TYPE_CHOICES, default="advisor_note")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        target = self.client or self.member
        return f"Note for {target} by {self.author}"
