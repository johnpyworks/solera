from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import QuestionnaireToken, QuestionnaireSubmission
from .serializers import QuestionnaireTokenSerializer, QuestionnaireSubmissionSerializer
from apps.clients.views import get_client_queryset


class TokenCreateView(generics.CreateAPIView):
    """POST /api/v1/questionnaires/tokens/ — create token + queue approval"""
    serializer_class = QuestionnaireTokenSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        token_obj = serializer.save()
        # Queue approval item for the questionnaire link
        try:
            from apps.approvals.models import ApprovalItem
            form_url = f"{token_obj.token}"
            ApprovalItem.objects.create(
                owner=self.request.user,
                item_type="questionnaire_link",
                client=token_obj.client,
                client_name=token_obj.client.name,
                agent="System",
                draft_content={
                    "to": token_obj.client_email,
                    "subject": f"Your Solera Client Questionnaire — {token_obj.client.name}",
                    "token": token_obj.token,
                    "link": form_url,
                },
            )
        except Exception:
            pass


class TokenValidateView(APIView):
    """GET /api/v1/questionnaires/tokens/{token}/ — public; validates token"""
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        try:
            tok = QuestionnaireToken.objects.get(token=token)
        except QuestionnaireToken.DoesNotExist:
            return Response({"valid": False, "detail": "Token not found."}, status=status.HTTP_404_NOT_FOUND)

        if tok.status == "submitted":
            return Response({"valid": False, "detail": "Already submitted."})
        if tok.expires_at and tok.expires_at < timezone.now():
            tok.status = "expired"
            tok.save()
            return Response({"valid": False, "detail": "Token has expired."})

        return Response({
            "valid": True,
            "client_name": tok.client.name,
            "client_email": tok.client_email,
        })


class TokenSubmitView(APIView):
    """POST /api/v1/questionnaires/tokens/{token}/submit/ — public; submit form data"""
    permission_classes = [permissions.AllowAny]

    def post(self, request, token):
        try:
            tok = QuestionnaireToken.objects.get(token=token)
        except QuestionnaireToken.DoesNotExist:
            return Response({"detail": "Token not found."}, status=status.HTTP_404_NOT_FOUND)

        if tok.status != "pending":
            return Response({"detail": "Token is not valid for submission."}, status=status.HTTP_400_BAD_REQUEST)

        if tok.expires_at and tok.expires_at < timezone.now():
            tok.status = "expired"
            tok.save()
            return Response({"detail": "Token has expired."}, status=status.HTTP_400_BAD_REQUEST)

        form_data = request.data.get("form_data", request.data)

        sub = QuestionnaireSubmission.objects.create(
            token=tok,
            client=tok.client,
            form_data=form_data,
        )
        tok.status = "submitted"
        tok.save()

        return Response(QuestionnaireSubmissionSerializer(sub).data, status=status.HTTP_201_CREATED)


class TokenListView(generics.ListAPIView):
    """GET /api/v1/questionnaires/tokens/ — list tokens (authenticated)"""
    serializer_class = QuestionnaireTokenSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = get_client_queryset(self.request.user)
        return QuestionnaireToken.objects.filter(client__in=qs)
