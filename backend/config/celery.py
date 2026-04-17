import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("solera")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "sync-outlook-calendar": {
        "task": "apps.meetings.tasks.sync_outlook_calendar",
        "schedule": crontab(minute="*/15"),
    },
    "check-reminders-hourly": {
        "task": "apps.agents.tasks.check_and_queue_reminders",
        "schedule": crontab(minute=0),
    },
    "generate-weekly-summary": {
        "task": "apps.meetings.tasks.generate_weekly_summary",
        "schedule": crontab(day_of_week="monday", hour=8, minute=0),
    },
}
