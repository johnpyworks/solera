import time
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status


def _super_admin_only(request):
    """Return a 403 Response if the user is not super_admin, else None."""
    if not hasattr(request.user, "role") or request.user.role != "super_admin":
        return Response({"error": "Super admin access only."}, status=status.HTTP_403_FORBIDDEN)
    return None


class TableListView(APIView):
    """
    GET /api/v1/db/tables/
    Returns all tables with their column metadata.
    Super admin only.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        denied = _super_admin_only(request)
        if denied:
            return denied

        tables = []
        with connection.cursor() as cursor:
            table_names = connection.introspection.table_names(cursor)
            for table_name in sorted(table_names):
                try:
                    cols = connection.introspection.get_table_description(cursor, table_name)
                    columns = [
                        {
                            "name": col.name,
                            "type": col.type_code,
                            "null": col.null_ok,
                        }
                        for col in cols
                    ]
                except Exception:
                    columns = []
                tables.append({"name": table_name, "columns": columns})

        return Response(tables)


class ExecuteQueryView(APIView):
    """
    POST /api/v1/db/execute/
    Body: { "sql": "SELECT ..." }
    Runs the SQL with a 10-second timeout and a 500-row cap.
    Always returns HTTP 200; errors are returned in { "error": "..." }.
    Super admin only.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        denied = _super_admin_only(request)
        if denied:
            return denied

        sql = (request.data.get("sql") or "").strip()
        if not sql:
            return Response({"error": "No SQL provided."})

        try:
            with connection.cursor() as cursor:
                # Hard timeout: 10 seconds (PostgreSQL-specific)
                cursor.execute("SET LOCAL statement_timeout = 10000;")
                start = time.time()
                cursor.execute(sql)
                elapsed_ms = int((time.time() - start) * 1000)

                if cursor.description is None:
                    # Non-SELECT statement (UPDATE, INSERT, DELETE, etc.)
                    return Response({
                        "columns": [],
                        "rows": [],
                        "row_count": cursor.rowcount,
                        "execution_time_ms": elapsed_ms,
                        "message": f"{cursor.rowcount} row(s) affected.",
                    })

                columns = [desc[0] for desc in cursor.description]
                raw_rows = cursor.fetchmany(500)
                rows = [list(row) for row in raw_rows]

                return Response({
                    "columns": columns,
                    "rows": rows,
                    "row_count": len(rows),
                    "execution_time_ms": elapsed_ms,
                })

        except Exception as exc:
            return Response({"error": str(exc)})
