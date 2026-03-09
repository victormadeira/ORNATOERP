"""Testes do endpoint de saude."""


def test_health(client):
    """GET /health retorna status ok."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "cnc-optimizer"


def test_version(client):
    """GET /version retorna versao e modulos."""
    response = client.get("/api/v1/version")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert "python_modules" in data
    assert "shapely" in data["python_modules"]
