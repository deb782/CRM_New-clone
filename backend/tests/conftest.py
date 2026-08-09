import pytest
import requests
import uuid

BASE = "http://127.0.0.1:8000"
API = f"{BASE}/api/v1"


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=10)
    r.raise_for_status()
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_token():
    return _login({"email": "admin@crm.local", "password": "Admin@12345"})


@pytest.fixture(scope="session")
def mgr_token():
    return _login({"email": "priya@crm.local", "password": "Demo@12345"})


@pytest.fixture(scope="session")
def exec_token():
    return _login({"email": "rahul@crm.local", "password": "Demo@12345"})


@pytest.fixture(scope="session")
def seed_lead(admin_token):
    """Create a fresh lead once and share across tests."""
    uniq = uuid.uuid4().hex[:8]
    payload = {
        "name": f"TEST_{uniq}",
        "email": f"test_{uniq}@example.com",
        "phone": f"90000{uniq[:5]}",
        "source": "Website Form",
        "city": "Mumbai",
    }
    r = requests.post(f"{API}/leads", json=payload,
                      headers={"Authorization": f"Bearer {admin_token}", "Accept": "application/json"})
    r.raise_for_status()
    lead = r.json().get("lead", r.json())
    return {"id": lead["id"], "email": payload["email"], "phone": payload["phone"]}
