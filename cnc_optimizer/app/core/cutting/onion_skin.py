"""Estrategia onion skin para retencao de pecas pequenas.

Onion skin: o contorno nao e cortado completamente na primeira passada.
Resta uma camada fina (~0.5mm) que mantem a peca presa.
Um passe final (breakthrough) a velocidade reduzida corta completamente.

Criterios:
- area_cm2 < onion_max_area (padrao: 600 cm2 = 60000 mm2)
- Profundidade parcial: thickness - onion_depth
- Breakthrough: velocidade reduzida (60% do feed normal)
"""

from __future__ import annotations

from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Configuracao
# ---------------------------------------------------------------------------

@dataclass
class OnionSkinConfig:
    """Configuracao de onion skin."""
    enabled: bool = True
    max_area_mm2: float = 60000     # Area maxima para usar onion skin (600 cm2)
    min_dim_mm: float = 200         # Dimensao minima para considerar
    skin_depth: float = 0.5         # Espessura da camada restante (mm)
    breakthrough_speed_factor: float = 0.6  # Fator de velocidade no breakthrough
    prefer_over_tabs: bool = True   # Preferir onion skin sobre tabs


# ---------------------------------------------------------------------------
# Resultado onion skin
# ---------------------------------------------------------------------------

@dataclass
class OnionSkinResult:
    """Resultado da analise de onion skin para uma peca."""
    use_onion_skin: bool = False
    partial_depth: float = 0.0      # Profundidade do primeiro passe
    breakthrough_depth: float = 0.0  # Profundidade total (breakthrough)
    skin_remaining: float = 0.0     # Camada restante apos passe parcial
    breakthrough_feed: float = 0.0  # Feed rate do breakthrough
    reason: str = ""


# ---------------------------------------------------------------------------
# Decisao e calculo
# ---------------------------------------------------------------------------

def should_use_onion_skin(
    length: float,
    width: float,
    thickness: float,
    piece_class: str = "normal",
    config: OnionSkinConfig | None = None,
) -> OnionSkinResult:
    """Determinar se a peca deve usar onion skin.

    Args:
        length: Comprimento da peca (mm)
        width: Largura da peca (mm)
        thickness: Espessura da peca (mm)
        piece_class: Classificacao CNC
        config: Configuracao

    Returns:
        OnionSkinResult com decisao e parametros
    """
    config = config or OnionSkinConfig()

    if not config.enabled:
        return OnionSkinResult(reason="Onion skin desativado")

    area = length * width
    min_dim = min(length, width)

    # Verificar criterios
    if area > config.max_area_mm2:
        return OnionSkinResult(reason=f"Area {area:.0f}mm2 > max {config.max_area_mm2:.0f}mm2")

    if min_dim > config.min_dim_mm and piece_class == "normal":
        return OnionSkinResult(reason=f"Dimensao minima {min_dim:.0f}mm > {config.min_dim_mm:.0f}mm (peca normal)")

    # Calcular parametros
    partial_depth = thickness - config.skin_depth
    breakthrough_depth = thickness + 0.2  # Extra para garantir corte completo

    if partial_depth <= 0:
        return OnionSkinResult(reason="Espessura insuficiente para onion skin")

    return OnionSkinResult(
        use_onion_skin=True,
        partial_depth=partial_depth,
        breakthrough_depth=breakthrough_depth,
        skin_remaining=config.skin_depth,
        breakthrough_feed=0,  # Sera calculado com base no feed da ferramenta
        reason="Peca pequena — onion skin recomendado",
    )


def calculate_breakthrough_feed(
    normal_feed: float,
    config: OnionSkinConfig | None = None,
) -> float:
    """Calcular feed rate do breakthrough.

    Args:
        normal_feed: Feed rate normal (mm/min)
        config: Configuracao

    Returns:
        Feed rate reduzido para breakthrough
    """
    config = config or OnionSkinConfig()
    return normal_feed * config.breakthrough_speed_factor


# ---------------------------------------------------------------------------
# Estrategia de retencao
# ---------------------------------------------------------------------------

@dataclass
class RetentionStrategy:
    """Estrategia de retencao para uma peca."""
    method: str = "none"         # none, tabs, onion_skin, combined
    tabs_count: int = 0
    tab_width: float = 0
    tab_height: float = 0
    onion_partial_depth: float = 0
    onion_breakthrough_depth: float = 0
    onion_breakthrough_feed_factor: float = 0.6


def select_retention_strategy(
    length: float,
    width: float,
    thickness: float,
    piece_class: str = "normal",
    onion_config: OnionSkinConfig | None = None,
) -> RetentionStrategy:
    """Selecionar melhor estrategia de retencao.

    Hierarquia:
    1. Normal: sem retencao
    2. Pequena: tabs OU onion skin
    3. Super pequena: tabs + onion skin (combined)

    Args:
        length, width, thickness: Dimensoes da peca
        piece_class: Classificacao CNC
        onion_config: Configuracao de onion skin

    Returns:
        RetentionStrategy
    """
    onion_config = onion_config or OnionSkinConfig()

    if piece_class == "normal":
        return RetentionStrategy(method="none")

    # Verificar onion skin
    onion = should_use_onion_skin(
        length, width, thickness, piece_class, onion_config
    )

    if piece_class == "super_pequena":
        if onion.use_onion_skin:
            return RetentionStrategy(
                method="combined",
                tabs_count=2,
                tab_width=3.0,
                tab_height=3.0,
                onion_partial_depth=onion.partial_depth,
                onion_breakthrough_depth=onion.breakthrough_depth,
                onion_breakthrough_feed_factor=onion_config.breakthrough_speed_factor,
            )
        else:
            return RetentionStrategy(
                method="tabs",
                tabs_count=4,
                tab_width=3.0,
                tab_height=3.0,
            )

    # Pequena
    if onion.use_onion_skin and onion_config.prefer_over_tabs:
        return RetentionStrategy(
            method="onion_skin",
            onion_partial_depth=onion.partial_depth,
            onion_breakthrough_depth=onion.breakthrough_depth,
            onion_breakthrough_feed_factor=onion_config.breakthrough_speed_factor,
        )
    else:
        return RetentionStrategy(
            method="tabs",
            tabs_count=2,
            tab_width=4.0,
            tab_height=2.0,
        )
