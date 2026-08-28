from __future__ import annotations


def slugify(name: str) -> str:
    """``"ISS (ZARYA)"`` -> ``"iss_zarya"``"""
    cleaned = "".join(char.lower() if char.isalnum() else "_" for char in name)
    return "_".join(part for part in cleaned.split("_") if part)


__all__ = ["slugify"]
