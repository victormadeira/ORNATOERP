"""Endpoints de saude e versao."""

from fastapi import APIRouter

from app import __version__

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    """Verificar se o servico esta rodando."""
    return {"status": "ok", "service": "cnc-optimizer"}


@router.get("/version")
async def version():
    """Retornar versao do servico."""
    return {
        "version": __version__,
        "service": "cnc-optimizer",
        "python_modules": {
            "shapely": _get_version("shapely"),
            "pyclipper": _get_version("pyclipper"),
            "numpy": _get_version("numpy"),
            "networkx": _get_version("networkx"),
            "fastapi": _get_version("fastapi"),
        },
    }


def _get_version(module_name: str) -> str:
    """Tentar obter versao de um modulo."""
    try:
        import importlib.metadata
        return importlib.metadata.version(module_name)
    except Exception:
        return "not installed"
