"""Explicit, manual runner for migration 001. Never imported by the application."""
import argparse
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Apply EcoMap migration 001 after review and backup.")
    parser.add_argument("--apply", action="store_true", help="Explicitly authorize this schema change.")
    args = parser.parse_args()
    if not args.apply:
        parser.error("Review migrations/001_add_photo_location.sql, then pass --apply explicitly.")

    from database import engine

    sql = (Path(__file__).parent / "migrations/001_add_photo_location.sql").read_text(encoding="utf-8")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(sql)
    except Exception:
        # Driver exceptions may contain connection information. Do not print them.
        raise SystemExit("Migration failed and transaction was rolled back. Check connectivity, permissions and existing columns locally.") from None
    finally:
        engine.dispose()
    print("Migration 001 applied. Existing records were preserved.")


if __name__ == "__main__":
    main()
