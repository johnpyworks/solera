from rest_framework import serializers
from .models import QuestionnaireToken, QuestionnaireSubmission


class QuestionnaireSubmissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuestionnaireSubmission
        fields = ["id", "token", "client", "form_data", "submitted_at"]
        read_only_fields = ["id", "submitted_at"]


class QuestionnaireTokenSerializer(serializers.ModelSerializer):
    submission = QuestionnaireSubmissionSerializer(read_only=True)

    class Meta:
        model = QuestionnaireToken
        fields = ["token", "client", "client_email", "created_at", "expires_at", "status", "submission"]
        read_only_fields = ["created_at", "status"]
