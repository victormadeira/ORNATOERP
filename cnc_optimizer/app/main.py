"""CNC Optimizer — FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import settings
from app.api.routes_health import router as health_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_optimize import router as optimize_router
from app.api.routes_export import router as export_router
from app.api.routes_bridge import router as bridge_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup e shutdown do servico."""
    # Startup
    print(f"CNC Optimizer v{__version__} starting on port {settings.port}")
    print(f"ERP URL: {settings.erp_url}")
    print(f"Debug: {settings.debug}")
    yield
    # Shutdown
    print("CNC Optimizer shutting down")


app = FastAPI(
    title="CNC Optimizer — Ornato",
    description="Sistema de otimizacao de corte para CNC router",
    version=__version__,
    lifespan=lifespan,
)

# CORS — permitir chamadas do frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rotas
app.include_router(health_router, prefix="/api/v1")
app.include_router(jobs_router, prefix="/api/v1")

app.include_router(optimize_router)
app.include_router(export_router)
app.include_router(bridge_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=settings.debug)
