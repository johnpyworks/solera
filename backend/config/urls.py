from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("apps.users.urls")),
    path("api/v1/clients/", include("apps.clients.urls")),
    path("api/v1/households/", include("apps.clients.household_urls")),
    path("api/v1/meetings/", include("apps.meetings.urls")),
    path("api/v1/approvals/", include("apps.approvals.urls")),
    path("api/v1/agent-logs/", include("apps.agents.urls")),
    path("api/v1/documents/", include("apps.documents.urls")),
    path("api/v1/questionnaires/", include("apps.questionnaires.urls")),
    path("api/v1/chat/", include("apps.chat.urls")),
    path("api/v1/settings/", include("apps.settings_app.urls")),
    path("api/v1/mcp/", include("apps.mcp_bridge.urls")),
    path("api/v1/db/", include("apps.db_explorer.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
