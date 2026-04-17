"""
Loads the mockData.js values into PostgreSQL as the initial seed.
Run: python manage.py seed_data
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime, date
import pytz

from apps.users.models import AdvisorUser
from apps.clients.models import Client, Household, HouseholdMember, Note
from apps.meetings.models import Meeting
from apps.approvals.models import ApprovalItem
from apps.agents.models import AgentLog
from apps.settings_app.models import AdvisorSettings


def parse_dt(s):
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt)
        return dt
    except Exception:
        return None


def parse_date(s):
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


class Command(BaseCommand):
    help = "Seed mock client data into PostgreSQL"

    def handle(self, *args, **options):
        vlad = AdvisorUser.objects.filter(username="vlad").first()

        # ── Households ────────────────────────────────────────
        h1, _ = Household.objects.get_or_create(id="00000000-0000-0000-0000-000000000001", defaults={"name": "Webb Household"})
        h2, _ = Household.objects.get_or_create(id="00000000-0000-0000-0000-000000000002", defaults={"name": "Thornton Household"})

        # ── Clients ───────────────────────────────────────────
        CLIENTS = [
            dict(
                id="00000000-0000-0000-0001-000000000001",
                name="Sarah Chen", email="sarah.chen@email.com", phone="(415) 555-0192",
                meeting_stage="LEAP Process", wealthbox_id="WB-10041", assigned_advisor="vlad",
                anniversary_date=parse_date("2025-03-15"), last_contact_date=parse_date("2026-03-23"),
                household=None, is_primary=True,
            ),
            dict(
                id="00000000-0000-0000-0001-000000000002",
                name="Dmitri Volkov", email="d.volkov@email.com", phone="(503) 555-0234",
                language_tag="ru", meeting_stage="Implementation", wealthbox_id="WB-10055",
                assigned_advisor="vlad", anniversary_date=parse_date("2023-11-01"),
                last_contact_date=parse_date("2026-04-06"), household=None, is_primary=True,
            ),
            dict(
                id="00000000-0000-0000-0001-000000000003",
                name="Marcus Webb", email="marcus.webb@email.com", phone="(206) 555-0122",
                meeting_stage="Solera Heartbeat", wealthbox_id="WB-10032", assigned_advisor="vlad",
                anniversary_date=parse_date("2021-06-10"), last_contact_date=parse_date("2026-04-02"),
                household=h1, is_primary=True,
            ),
            dict(
                id="00000000-0000-0000-0001-000000000004",
                name="Priya Nair", email="priya.nair@email.com", phone="(408) 555-0387",
                meeting_stage="Discovery", wealthbox_id="WB-10067", assigned_advisor="vlad",
                anniversary_date=None, last_contact_date=parse_date("2026-03-28"),
                household=None, is_primary=True,
            ),
            dict(
                id="00000000-0000-0000-0001-000000000005",
                name="James Thornton", email="j.thornton@email.com", phone="(425) 555-0211",
                meeting_stage="Implementation", wealthbox_id="WB-10048", assigned_advisor="slava",
                anniversary_date=parse_date("2022-09-20"), last_contact_date=parse_date("2026-03-15"),
                household=h2, is_primary=True,
            ),
        ]

        client_map = {}  # short id → Client object
        short_ids = ["c1", "c2", "c3", "c4", "c5"]

        for i, data in enumerate(CLIENTS):
            obj, created = Client.objects.get_or_create(
                id=data["id"],
                defaults={**data, "owner": vlad},
            )
            client_map[short_ids[i]] = obj

        # Fix Thornton owner to slava
        slava = AdvisorUser.objects.filter(username="slava").first()
        if slava:
            Client.objects.filter(id="00000000-0000-0000-0001-000000000005").update(owner=slava)

        # Update household primary_client after clients exist
        h1.primary_client = client_map["c3"]
        h1.save()
        h2.primary_client = client_map["c5"]
        h2.save()

        # ── Household Members ─────────────────────────────────
        hm1, _ = HouseholdMember.objects.get_or_create(
            id="00000000-0000-0000-0002-000000000001",
            defaults=dict(household=h1, name="Linda Webb", email="lwebb@email.com",
                          phone="(206) 555-0179", relationship="Spouse")
        )
        hm2, _ = HouseholdMember.objects.get_or_create(
            id="00000000-0000-0000-0002-000000000002",
            defaults=dict(household=h2, name="Carol Thornton", email="cthornton@email.com",
                          phone="(425) 555-0457", relationship="Spouse")
        )

        # ── Client Notes ──────────────────────────────────────
        note_seeds = [
            dict(client=client_map["c1"], text="Self-employed, tech industry. Strong savings, no life insurance. Very engaged.", author="vlad", note_type="advisor_note", created_at="2026-03-15T09:00:00"),
            dict(client=client_map["c1"], text="LEAP session completed March 25. Agreed on term life $1M + DI + Roth.", author="system", note_type="ai_summary", created_at="2026-03-25T11:30:00"),
            dict(client=client_map["c2"], text="Prefers Russian. Referred by business partner. Has existing whole life from Russia.", author="vlad", note_type="advisor_note", created_at="2026-02-10T14:00:00"),
            dict(client=client_map["c4"], text="Single, age 38. Wants to retire at 55. Parents are her priority for life insurance.", author="vlad", note_type="advisor_note", created_at="2026-03-28T09:00:00"),
        ]
        for n in note_seeds:
            created_at = parse_dt(n.pop("created_at"))
            note, new = Note.objects.get_or_create(**n)
            if new and created_at:
                Note.objects.filter(pk=note.pk).update(created_at=created_at)

        # Member notes
        Note.objects.get_or_create(
            member=hm1,
            text="Linda is the more financially engaged. Prefers email over calls.",
            author="vlad",
            defaults={"note_type": "advisor_note"},
        )
        Note.objects.get_or_create(
            member=hm2,
            text="Carol handles all paperwork. James is the primary decision-maker.",
            author="vlad",
            defaults={"note_type": "advisor_note"},
        )

        # ── Meetings ──────────────────────────────────────────
        MEETINGS = [
            dict(id="00000000-0000-0000-0003-000000000001", client=client_map["c4"], meeting_type="Discovery", scheduled_at=parse_dt("2026-03-28T14:00:00"), duration_min=75, location="Zoom", is_past=True, processed=False),
            dict(id="00000000-0000-0000-0003-000000000002", client=client_map["c1"], meeting_type="LEAP Process", scheduled_at=parse_dt("2026-03-25T10:00:00"), duration_min=90, location="Zoom", is_past=True, processed=True),
            dict(id="00000000-0000-0000-0003-000000000003", client=client_map["c3"], meeting_type="Solera Heartbeat", scheduled_at=parse_dt("2026-04-02T11:00:00"), duration_min=60, location="In Person", is_past=True, processed=False),
            dict(id="00000000-0000-0000-0003-000000000004", client=client_map["c4"], meeting_type="LEAP Process", scheduled_at=parse_dt("2026-04-07T10:00:00"), duration_min=90, location="Zoom", is_past=False, processed=False),
            dict(id="00000000-0000-0000-0003-000000000005", client=client_map["c2"], meeting_type="LEAP Process", scheduled_at=parse_dt("2026-04-08T15:00:00"), duration_min=60, location="Zoom", is_past=False, processed=False),
            dict(id="00000000-0000-0000-0003-000000000006", client=client_map["c1"], meeting_type="Implementation", scheduled_at=parse_dt("2026-04-14T09:00:00"), duration_min=60, location="Zoom", is_past=False, processed=False),
        ]
        for m in MEETINGS:
            Meeting.objects.get_or_create(id=m["id"], defaults={**m, "owner": vlad})

        # ── Approval Items ────────────────────────────────────
        APPROVALS = [
            dict(
                id="00000000-0000-0000-0004-000000000001",
                item_type="email_followup", client=client_map["c4"], client_name="Priya Nair",
                agent="Scribe", urgency="normal", status="pending",
                created_at=parse_dt("2026-03-28T16:31:00"),
                draft_content={"subject": "Following Up on Our Discovery Meeting", "body": "Dear Priya,\n\nThank you for meeting with us today...\n\nWarm regards,\nVlad Donets\nSolera Financial Advisory"},
            ),
            dict(
                id="00000000-0000-0000-0004-000000000002",
                item_type="email_summary", client=client_map["c4"], client_name="Priya Nair",
                agent="Scribe", urgency="normal", status="pending",
                created_at=parse_dt("2026-03-28T16:31:00"),
                draft_content={"subject": "[Internal] Discovery Notes — Priya Nair — Mar 28", "body": "ADVISOR NOTES — DISCOVERY MEETING\nClient: Priya Nair | Date: March 28, 2026\n\nPROFILE:\n- Age 38, software engineer, single\n- Goals: retire at 55, home purchase in 3 yrs"},
            ),
            dict(
                id="00000000-0000-0000-0004-000000000003",
                item_type="reminder_48hr", client=client_map["c3"], client_name="Marcus Webb",
                agent="Scheduler", urgency="normal", status="pending",
                created_at=parse_dt("2026-03-31T08:00:00"),
                draft_content={"subject": "Reminder: Your Solera Annual Review — April 2 at 11:00 AM", "body": "Hi Marcus and Linda,\n\nJust a friendly reminder that your Solera Annual Review is coming up...\n\nVlad Donets\nSolera Financial Advisory"},
            ),
            dict(
                id="00000000-0000-0000-0004-000000000004",
                item_type="wealthbox_task", client=client_map["c1"], client_name="Sarah Chen",
                agent="Service Agent", urgency="normal", status="pending",
                created_at=parse_dt("2026-03-25T12:00:00"),
                draft_content={"tasks": [
                    {"title": "Submit Penn Mutual Term Life Application — $1M / 20yr", "due": "2026-04-03", "priority": "high"},
                    {"title": "Order DI quote — own occupation 60% — Ameritas or Principal", "due": "2026-04-03", "priority": "high"},
                    {"title": "Schedule medical exam", "due": "2026-04-07", "priority": "medium"},
                ]},
            ),
            dict(
                id="00000000-0000-0000-0004-000000000005",
                item_type="reminder_48hr", client=client_map["c2"], client_name="Dmitri Volkov",
                agent="Scheduler", urgency="normal", status="pending",
                created_at=parse_dt("2026-04-06T08:00:00"),
                draft_content={"subject": "Reminder: Your Solera Meeting — April 8 at 3:00 PM", "body": "Здравствуйте, Дмитрий,\n\nНапоминаем...\n\nVlad Donets", "flag": "RUSSIAN-SPEAKING CLIENT — Review before sending."},
            ),
        ]
        for a in APPROVALS:
            created_at = a.pop("created_at")
            obj, new = ApprovalItem.objects.get_or_create(id=a["id"], defaults={**a, "owner": vlad})
            if new and created_at:
                ApprovalItem.objects.filter(pk=obj.pk).update(created_at=created_at)

        # ── Agent Logs ────────────────────────────────────────
        LOGS = [
            dict(agent_name="Scribe", action="Generated 2 email drafts from Discovery meeting notes", client=client_map["c4"], client_name="Priya Nair", status="complete"),
            dict(agent_name="Service Agent", action="Extracted 5 Wealthbox tasks from LEAP session notes", client=client_map["c1"], client_name="Sarah Chen", status="complete"),
            dict(agent_name="Scheduler", action="Generated 48hr reminder for Annual Review", client=client_map["c3"], client_name="Marcus Webb", status="complete"),
            dict(agent_name="Orchestrator", action='Routed "Priya Discovery done" to Scribe agent', client=client_map["c4"], client_name="Priya Nair", status="complete"),
            dict(agent_name="Scheduler", action="Generated 48hr reminder — Russian-speaking client flag applied", client=client_map["c2"], client_name="Dmitri Volkov", status="complete"),
        ]
        for log in LOGS:
            AgentLog.objects.get_or_create(**log)

        # ── Advisor Settings singleton ─────────────────────────
        AdvisorSettings.get()

        self.stdout.write(self.style.SUCCESS("Seed data loaded successfully."))
