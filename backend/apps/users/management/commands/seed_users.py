from django.core.management.base import BaseCommand
from django.conf import settings
from apps.users.models import AdvisorUser


class Command(BaseCommand):
    help = "Seed initial advisor users (vlad, slava, sevara, admin)"

    def handle(self, *args, **options):
        users = [
            {
                "username": "vlad",
                "email": "vlad@solerafinancial.com",
                "display_name": "Vlad Donets",
                "role": "advisor",
                "password": settings.SEED_VLAD_PASSWORD,
            },
            {
                "username": "slava",
                "email": "slava@solerafinancial.com",
                "display_name": "Slava",
                "role": "advisor",
                "password": settings.SEED_SLAVA_PASSWORD,
            },
            {
                "username": "sevara",
                "email": "sevara@solerafinancial.com",
                "display_name": "Sevara",
                "role": "assistant",
                "password": settings.SEED_SEVARA_PASSWORD,
            },
            {
                "username": "admin",
                "email": "admin@solerafinancial.com",
                "display_name": "Admin",
                "role": "super_admin",
                "password": settings.SEED_ADMIN_PASSWORD,
                "is_staff": True,
                "is_superuser": True,
            },
        ]

        created = []
        for u in users:
            password = u.pop("password")
            obj, new = AdvisorUser.objects.get_or_create(
                username=u["username"],
                defaults=u,
            )
            if new:
                obj.set_password(password)
                obj.save()
                created.append(obj.username)

        # Assign Sevara to Vlad and Slava
        sevara = AdvisorUser.objects.filter(username="sevara").first()
        vlad = AdvisorUser.objects.filter(username="vlad").first()
        slava = AdvisorUser.objects.filter(username="slava").first()
        if sevara and vlad and slava:
            sevara.assigned_advisors.set([vlad, slava])

        if created:
            self.stdout.write(self.style.SUCCESS(f"Created users: {', '.join(created)}"))
        else:
            self.stdout.write("All users already exist — skipped.")
