import pytest


@pytest.fixture(autouse=True)
def fresh_database(tmp_path, monkeypatch):
    """Give every test its own freshly seeded database."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "undercover.db"))
