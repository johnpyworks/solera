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
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    language_tag = models.CharField(max_length=10, blank=True, null=True)
    meeting_stage = models.CharField(max_length=50, choices=STAGE_CHOICES, default="Discovery")
    wealthbox_id = models.CharField(max_length=50, blank=True)
    household = models.ForeignKey(
        Household, null=True, blank=True, on_delete=models.SET_NULL, related_name="clients"
    )
    is_primary = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["last_name", "first_name"]

    @property
    def name(self):
        """Full name — backwards-compat property for code that reads client.name."""
        return f"{self.first_name} {self.last_name}".strip()

    def __str__(self):
        return self.name


class ClientAddress(models.Model):
    ADDRESS_TYPES = [
        ("home", "Home"),
        ("mailing", "Mailing"),
        ("business", "Business"),
    ]
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="addresses")
    address_type = models.CharField(max_length=20, choices=ADDRESS_TYPES, default="home")
    address_line1 = models.CharField(max_length=200)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=50)
    zip_code = models.CharField(max_length=20)
    country = models.CharField(max_length=50, default="USA")
    is_primary = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.address_line1}, {self.city}, {self.state} — {self.client.name}"


class ClientKeyDate(models.Model):
    DATE_TYPES = [
        ("anniversary", "Client Anniversary"),
        ("last_contact", "Last Contact"),
        ("date_of_birth", "Date of Birth"),
        ("review", "Annual Review"),
        ("other", "Other"),
    ]
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="key_dates")
    date_type = models.CharField(max_length=30, choices=DATE_TYPES)
    date = models.DateField(null=True, blank=True)
    label = models.CharField(max_length=100, blank=True)  # used when date_type='other'

    def __str__(self):
        return f"{self.get_date_type_display()} — {self.client.name}: {self.date}"


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


class ClientTask(models.Model):
    OWNER_CHOICES  = [("advisor", "Advisor"), ("client", "Client")]
    STATUS_CHOICES = [("open", "Open"), ("done", "Done")]

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client         = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="tasks")
    title          = models.CharField(max_length=500)
    owner_type     = models.CharField(max_length=20, choices=OWNER_CHOICES)
    due_date       = models.DateField(null=True, blank=True)
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    source_meeting = models.ForeignKey(
        "meetings.Meeting", null=True, blank=True, on_delete=models.SET_NULL, related_name="tasks"
    )
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["due_date", "created_at"]


class ClientMemory(models.Model):
    client    = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="memories")
    key       = models.CharField(max_length=100)
    value     = models.TextField()
    source    = models.CharField(max_length=50, blank=True)   # "scribe", "advisor", "system"
    source_id = models.CharField(max_length=100, blank=True)  # meeting UUID or note UUID
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("client", "key")]
        ordering = ["key"]
