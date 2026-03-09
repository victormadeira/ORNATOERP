"""Exportador SVG visual do layout de nesting.

Gera SVG com:
- Contorno da chapa
- Pecas posicionadas com cores
- Labels (ID, dimensoes)
- Retalhos destacados
- Direcao de veio indicada
- Zones de vacuo (opcional)
"""

from __future__ import annotations

from typing import Optional

from app.core.domain.models import (
    Placement, SheetLayout, LayoutResult,
)


# ---------------------------------------------------------------------------
# Cores
# ---------------------------------------------------------------------------

PIECE_COLORS = [
    "#4FC3F7", "#81C784", "#FFB74D", "#E57373",
    "#BA68C8", "#4DB6AC", "#FFD54F", "#90A4AE",
    "#F06292", "#AED581", "#7986CB", "#FF8A65",
    "#A1887F", "#9575CD", "#4DD0E1", "#DCE775",
]

SHEET_COLOR = "#F5F5F5"
TRIM_COLOR = "#E0E0E0"
REMNANT_COLOR = "#C8E6C9"
GRID_COLOR = "#EEEEEE"
LABEL_COLOR = "#333333"
BORDER_COLOR = "#9E9E9E"


# ---------------------------------------------------------------------------
# Gerador SVG
# ---------------------------------------------------------------------------

def export_sheet_svg(
    sheet_layout: SheetLayout,
    scale: float = 0.2,
    show_labels: bool = True,
    show_dimensions: bool = True,
    show_grid: bool = False,
    show_trim: bool = True,
    remnants: list[dict] | None = None,
) -> str:
    """Gerar SVG de uma chapa com pecas posicionadas.

    Args:
        sheet_layout: Layout da chapa
        scale: Fator de escala (0.2 = 20%)
        show_labels: Mostrar IDs das pecas
        show_dimensions: Mostrar dimensoes
        show_grid: Mostrar grid de fundo
        show_trim: Mostrar area de refilo
        remnants: Retalhos detectados [{x, y, length, width}]

    Returns:
        String SVG
    """
    sheet = sheet_layout.sheet
    if not sheet:
        return "<svg></svg>"

    # Dimensoes do SVG
    margin = 40
    w = sheet.length * scale + margin * 2
    h = sheet.width * scale + margin * 2

    parts = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{w:.0f}" height="{h:.0f}" '
        f'viewBox="0 0 {w:.0f} {h:.0f}">'
    )

    # Estilo
    parts.append("""<style>
        .piece { stroke: #666; stroke-width: 0.5; }
        .sheet { stroke: #333; stroke-width: 1.5; fill: """ + SHEET_COLOR + """; }
        .trim { stroke: none; fill: """ + TRIM_COLOR + """; opacity: 0.5; }
        .label { font-family: Arial, sans-serif; font-size: 10px; fill: """ + LABEL_COLOR + """; }
        .dim { font-family: Arial, sans-serif; font-size: 8px; fill: #666; }
        .remnant { stroke: #4CAF50; stroke-width: 1; stroke-dasharray: 4,2; fill: """ + REMNANT_COLOR + """; opacity: 0.5; }
        .title { font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; fill: #333; }
    </style>""")

    ox, oy = margin, margin  # Offset

    # Fundo da chapa
    parts.append(
        f'<rect x="{ox}" y="{oy}" '
        f'width="{sheet.length * scale:.1f}" height="{sheet.width * scale:.1f}" '
        f'class="sheet"/>'
    )

    # Refilo
    if show_trim and sheet.trim > 0:
        trim = sheet.trim * scale
        # Top
        parts.append(
            f'<rect x="{ox}" y="{oy}" '
            f'width="{sheet.length * scale:.1f}" height="{trim:.1f}" '
            f'class="trim"/>'
        )
        # Bottom
        parts.append(
            f'<rect x="{ox}" y="{oy + sheet.width * scale - trim:.1f}" '
            f'width="{sheet.length * scale:.1f}" height="{trim:.1f}" '
            f'class="trim"/>'
        )
        # Left
        parts.append(
            f'<rect x="{ox}" y="{oy}" '
            f'width="{trim:.1f}" height="{sheet.width * scale:.1f}" '
            f'class="trim"/>'
        )
        # Right
        parts.append(
            f'<rect x="{ox + sheet.length * scale - trim:.1f}" y="{oy}" '
            f'width="{trim:.1f}" height="{sheet.width * scale:.1f}" '
            f'class="trim"/>'
        )

    # Grid
    if show_grid:
        grid_step = 100  # mm
        for gx in range(0, int(sheet.length), grid_step):
            x = ox + gx * scale
            parts.append(
                f'<line x1="{x:.1f}" y1="{oy}" '
                f'x2="{x:.1f}" y2="{oy + sheet.width * scale:.1f}" '
                f'stroke="{GRID_COLOR}" stroke-width="0.5"/>'
            )
        for gy in range(0, int(sheet.width), grid_step):
            y = oy + gy * scale
            parts.append(
                f'<line x1="{ox}" y1="{y:.1f}" '
                f'x2="{ox + sheet.length * scale:.1f}" y2="{y:.1f}" '
                f'stroke="{GRID_COLOR}" stroke-width="0.5"/>'
            )

    # Pecas
    for idx, p in enumerate(sheet_layout.placements):
        color = PIECE_COLORS[idx % len(PIECE_COLORS)]
        px = ox + p.x * scale
        py = oy + p.y * scale
        pw = p.effective_length * scale
        ph = p.effective_width * scale

        parts.append(
            f'<rect x="{px:.1f}" y="{py:.1f}" '
            f'width="{pw:.1f}" height="{ph:.1f}" '
            f'fill="{color}" class="piece"/>'
        )

        # Centro para labels e dimensoes
        lx = px + pw / 2
        ly = py + ph / 2

        # Label
        if show_labels:
            pid = p.piece_persistent_id or str(p.piece_id)
            parts.append(
                f'<text x="{lx:.1f}" y="{ly:.1f}" '
                f'text-anchor="middle" dominant-baseline="central" '
                f'class="label">{pid}</text>'
            )

        # Dimensoes
        if show_dimensions and pw > 40 and ph > 20:
            dim_text = f"{p.effective_length:.0f}x{p.effective_width:.0f}"
            parts.append(
                f'<text x="{lx:.1f}" y="{ly + 12:.1f}" '
                f'text-anchor="middle" class="dim">{dim_text}</text>'
            )

    # Retalhos
    if remnants:
        for r in remnants:
            rx = ox + r.get("x", 0) * scale
            ry = oy + r.get("y", 0) * scale
            rw = r.get("length", 0) * scale
            rh = r.get("width", 0) * scale
            parts.append(
                f'<rect x="{rx:.1f}" y="{ry:.1f}" '
                f'width="{rw:.1f}" height="{rh:.1f}" '
                f'class="remnant"/>'
            )

    # Titulo
    if show_labels:
        title = (
            f"Chapa {sheet_layout.index + 1} — "
            f"{sheet.material_code} "
            f"({sheet.length}x{sheet.width}mm) — "
            f"Ocupacao: {sheet_layout.occupancy:.1f}%"
        )
        parts.append(
            f'<text x="{ox}" y="{oy - 10}" class="title">{title}</text>'
        )

    # Dimensoes da chapa
    if show_dimensions:
        # Comprimento (embaixo)
        parts.append(
            f'<text x="{ox + sheet.length * scale / 2:.1f}" '
            f'y="{oy + sheet.width * scale + 20:.1f}" '
            f'text-anchor="middle" class="dim">{sheet.length:.0f}mm</text>'
        )
        # Largura (direita)
        parts.append(
            f'<text x="{ox + sheet.length * scale + 15:.1f}" '
            f'y="{oy + sheet.width * scale / 2:.1f}" '
            f'text-anchor="middle" class="dim" '
            f'transform="rotate(90, {ox + sheet.length * scale + 15:.1f}, '
            f'{oy + sheet.width * scale / 2:.1f})">{sheet.width:.0f}mm</text>'
        )

    parts.append("</svg>")
    return "\n".join(parts)


def export_layout_svg(
    layout: LayoutResult,
    scale: float = 0.2,
    show_labels: bool = True,
) -> list[str]:
    """Gerar SVGs para todas as chapas de um layout.

    Args:
        layout: Resultado completo
        scale: Fator de escala

    Returns:
        Lista de strings SVG (uma por chapa)
    """
    return [
        export_sheet_svg(sl, scale=scale, show_labels=show_labels)
        for sl in layout.sheets
    ]
