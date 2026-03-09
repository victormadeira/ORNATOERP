"""Configuracao do CNC Optimizer via variaveis de ambiente."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuracoes da aplicacao."""

    # API
    port: int = 8000
    debug: bool = True
    log_level: str = "info"

    # Integracao com ERP Ornato
    erp_url: str = "http://localhost:3001"

    # Espessuras reais (nominal -> real em mm)
    thickness_map: dict[int, float] = {
        3: 3.0,
        6: 6.0,
        9: 9.0,
        12: 12.0,
        15: 15.5,
        18: 18.5,
        20: 20.5,
        25: 25.5,
    }
    thickness_engrossado: float = 31.0

    # Chapa padrao
    default_sheet_length: float = 2750
    default_sheet_width: float = 1850
    default_trim: float = 10
    default_kerf: float = 4
    default_spacing: float = 7

    # Classificacao de pecas
    small_threshold: float = 400     # mm - abaixo disso = peca pequena
    very_small_threshold: float = 200  # mm - abaixo disso = super pequena

    # Retalhos
    min_remnant_width: float = 300   # mm
    min_remnant_length: float = 600  # mm

    # Geometria
    arc_resolution: int = 32         # segmentos por circulo completo
    polygon_simplify_tolerance: float = 0.1  # mm

    # Otimizacao
    max_iterations: int = 300
    ga_default_population: int = 60
    ga_default_generations: int = 100
    ga_early_stop_generations: int = 50

    model_config = {"env_prefix": "", "env_file": ".env", "extra": "ignore"}


settings = Settings()
