"""Posicionamento de tabs para retencao de pecas.

Tabs sao pequenos pontos onde a fresa nao corta completamente,
mantendo a peca presa a chapa ate o final do corte.

Regras:
- Espacados uniformemente no perimetro
- Evitar cantos (concentracao de tensao)
- Pular tabs em pecas com onion skin
- Quantidade e tamanho baseados na classificacao da peca
"""

from __future__ import annotations

import math
from dataclasses import dataclass


# ---------------------------------------------------------------------------
# Modelo de Tab
# ---------------------------------------------------------------------------

@dataclass
class Tab:
    """Um tab de retencao no contorno."""
    x: float = 0                 # Posicao X absoluta
    y: float = 0                 # Posicao Y absoluta
    width: float = 4.0           # Largura do tab (mm)
    height: float = 2.0          # Altura do tab (mm acima do Z final)
    contour_pct: float = 0.0     # Posicao relativa no perimetro (0-1)
    edge: str = ""               # Lado: top, bottom, left, right


# ---------------------------------------------------------------------------
# Configuracao de tabs
# ---------------------------------------------------------------------------

@dataclass
class TabConfig:
    """Configuracao de tabs."""
    enabled: bool = True
    default_width: float = 4.0   # Largura padrao (mm)
    default_height: float = 2.0  # Altura padrao (mm)
    corner_margin: float = 30.0  # Distancia minima de cantos (mm)
    min_tabs: int = 2            # Minimo de tabs por peca
    max_tabs: int = 8            # Maximo de tabs


# ---------------------------------------------------------------------------
# Regras de quantidade de tabs
# ---------------------------------------------------------------------------

def get_tab_params(
    piece_class: str,
    perimeter: float,
    config: TabConfig | None = None,
) -> tuple[int, float, float]:
    """Determinar quantidade e tamanho dos tabs.

    Args:
        piece_class: 'super_pequena', 'pequena', 'normal'
        perimeter: Perimetro da peca (mm)
        config: Configuracao de tabs

    Returns:
        (quantidade, largura_mm, altura_mm)
    """
    config = config or TabConfig()

    if piece_class == "super_pequena":
        count = max(4, min(config.max_tabs, int(perimeter / 200)))
        width = 3.0
        height = 3.0
    elif piece_class == "pequena":
        count = max(2, min(6, int(perimeter / 400)))
        width = config.default_width
        height = config.default_height
    else:
        # Normal: tabs opcionais (so se requisitado)
        count = max(2, min(4, int(perimeter / 600)))
        width = config.default_width
        height = config.default_height

    count = max(config.min_tabs, min(config.max_tabs, count))

    return count, width, height


# ---------------------------------------------------------------------------
# Posicionar tabs no retangulo
# ---------------------------------------------------------------------------

def place_tabs_rectangular(
    x: float, y: float,
    length: float, width: float,
    count: int = 4,
    tab_width: float = 4.0,
    tab_height: float = 2.0,
    corner_margin: float = 30.0,
) -> list[Tab]:
    """Posicionar tabs uniformemente no perimetro de peca retangular.

    Evita cantos (corner_margin mm de distancia).

    Args:
        x, y: Posicao do canto inferior-esquerdo
        length: Comprimento da peca
        width: Largura da peca
        count: Numero de tabs
        tab_width: Largura do tab
        tab_height: Altura do tab
        corner_margin: Distancia minima de cantos

    Returns:
        Lista de Tabs posicionados
    """
    perimeter = 2 * (length + width)
    tabs: list[Tab] = []

    # Distribuir tabs uniformemente no perimetro
    spacing = perimeter / count

    for i in range(count):
        # Posicao no perimetro
        pos = (i + 0.5) * spacing  # Offset de 0.5 para nao ficar no canto

        # Converter posicao linear em (x, y, edge)
        tab_x, tab_y, edge = _perimeter_to_xy(
            x, y, length, width, pos, perimeter
        )

        # Verificar distancia de cantos
        if _is_near_corner(tab_x, tab_y, x, y, length, width, corner_margin):
            # Mover para longe do canto
            tab_x, tab_y, edge = _adjust_away_from_corner(
                tab_x, tab_y, x, y, length, width, corner_margin, edge
            )

        tabs.append(Tab(
            x=tab_x,
            y=tab_y,
            width=tab_width,
            height=tab_height,
            contour_pct=pos / perimeter,
            edge=edge,
        ))

    return tabs


def _perimeter_to_xy(
    x: float, y: float,
    length: float, width: float,
    pos: float, perimeter: float,
) -> tuple[float, float, str]:
    """Converter posicao no perimetro em coordenadas (x, y).

    Percurso: bottom → right → top → left (sentido anti-horario).
    """
    pos = pos % perimeter

    # Bottom edge (0 → length)
    if pos < length:
        return x + pos, y, "bottom"

    # Right edge (length → length + width)
    pos -= length
    if pos < width:
        return x + length, y + pos, "right"

    # Top edge (length + width → 2*length + width)
    pos -= width
    if pos < length:
        return x + length - pos, y + width, "top"

    # Left edge (2*length + width → perimeter)
    pos -= length
    return x, y + width - pos, "left"


def _is_near_corner(
    tx: float, ty: float,
    x: float, y: float,
    length: float, width: float,
    margin: float,
) -> bool:
    """Verificar se posicao esta perto de um canto."""
    corners = [
        (x, y),
        (x + length, y),
        (x + length, y + width),
        (x, y + width),
    ]
    for cx, cy in corners:
        dist = math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2)
        if dist < margin:
            return True
    return False


def _adjust_away_from_corner(
    tx: float, ty: float,
    x: float, y: float,
    length: float, width: float,
    margin: float,
    edge: str,
) -> tuple[float, float, str]:
    """Ajustar posicao do tab para longe do canto."""
    # Mover ao longo do edge atual
    if edge == "bottom":
        tx = max(x + margin, min(x + length - margin, tx))
    elif edge == "right":
        ty = max(y + margin, min(y + width - margin, ty))
    elif edge == "top":
        tx = max(x + margin, min(x + length - margin, tx))
    elif edge == "left":
        ty = max(y + margin, min(y + width - margin, ty))
    return tx, ty, edge


# ---------------------------------------------------------------------------
# Verificar necessidade de tabs
# ---------------------------------------------------------------------------

def needs_tabs(
    piece_class: str,
    has_onion_skin: bool = False,
    force_tabs: bool = False,
) -> bool:
    """Determinar se a peca precisa de tabs.

    Args:
        piece_class: Classificacao CNC
        has_onion_skin: Se ja tem onion skin
        force_tabs: Forcar tabs

    Returns:
        True se precisa de tabs
    """
    if force_tabs:
        return True

    if has_onion_skin:
        return False  # Onion skin substitui tabs

    if piece_class == "super_pequena":
        return True  # Sempre tab

    if piece_class == "pequena":
        return True  # Geralmente tab

    return False  # Normal: sem tabs por padrao
