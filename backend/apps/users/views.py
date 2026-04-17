from rest_framework import generics, permissions
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import AdvisorUser
from .serializers import AdvisorUserSerializer, MeSerializer


class LoginView(TokenObtainPairView):
    """POST /api/v1/auth/login/ — returns access + refresh tokens."""
    pass


class RefreshView(TokenRefreshView):
    """POST /api/v1/auth/refresh/ — rotate refresh token."""
    pass


class MeView(APIView):
    """GET /api/v1/auth/me/ — current user info."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(MeSerializer(request.user).data)


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — blacklist refresh token."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            pass
        return Response({"detail": "Logged out."})


class UserListView(generics.ListCreateAPIView):
    """GET/POST /api/v1/auth/users/ — super_admin only."""
    serializer_class = AdvisorUserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_super_admin:
            return AdvisorUser.objects.all()
        return AdvisorUser.objects.none()


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /api/v1/auth/users/{id}/ — super_admin only."""
    serializer_class = AdvisorUserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_super_admin:
            return AdvisorUser.objects.all()
        return AdvisorUser.objects.none()
