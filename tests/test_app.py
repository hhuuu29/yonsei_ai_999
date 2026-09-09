import pytest

from app import app as flask_app


@pytest.fixture()
def client():
    flask_app.config.update(TESTING=True)
    with flask_app.test_client() as c:
        yield c


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.get_json()["status"] == "ok"


def test_index_serves_html(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"Yonsei AI 999" in res.data


def test_chat_reverse(client):
    res = client.post("/api/chat", json={"message": "reverse abc"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["reply"] == "cba"
    assert body["intent"] == "reverse"


def test_chat_requires_message(client):
    res = client.post("/api/chat", json={"message": "   "})
    assert res.status_code == 400
    assert "error" in res.get_json()
