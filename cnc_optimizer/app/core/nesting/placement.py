"""Modulo de placement de pecas em chapas.

Responsavel por:
- Colocar pecas usando bins (MaxRects, Guillotine, Shelf)
- Validar overlap
- Gerar Placement objects
- Calcular estatisticas do bin
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from app.core.domain.models import (
    Piece, Sheet, Placement, Remnant,
)
from app.core.domain.enums import (
    NestingHeuristic, RotationPolicy, FaceSide,
)
from app.core.nesting.candidate_points import (
    MaxRectsBin, GuillotineBin, ShelfBin,
    CandidatePoint, create_bin,
)
from app.core.nesting.part_ordering import classify_piece_size
from app.core.rotation.rotation_policy import (
    get_allowed_rotations, get_effective_dimensions,
)


# ---------------------------------------------------------------------------
# Resultado de um passe de nesting
# ---------------------------------------------------------------------------

@dataclass
class BinResult:
    """Resultado de um bin (chapa) no nesting."""
    index: int = 0
    sheet: Sheet | None = None
    placements: list[Placement] = field(default_factory=list)
    occupancy: float = 0.0
    piece_area: float = 0.0
    total_area: float = 0.0
    remaining_pieces: list[Piece] = field(default_factory=list)
    bin_type: str = "maxrects"
    heuristic: str = "BSSF"
    cuts: list[dict] = field(default_factory=list)

    @property
    def piece_count(self) -> int:
        return len(self.placements)


@dataclass
class NestingPassResult:
    """Resultado de um passe completo de nesting."""
    bins: list[BinResult] = field(default_factory=list)
    total_pieces_placed: int = 0
    unplaced_pieces: list[Piece] = field(default_factory=list)
    avg_occupancy: float = 0.0
    strategy: str = ""
    heuristic: str = ""
    bin_type: str = ""
    score: float = float("inf")


# ---------------------------------------------------------------------------
# Funcao de scoring do resultado (port do JS)
# ---------------------------------------------------------------------------

def score_nesting_result(
    bins: list[BinResult],
    sheet_w: float = 0,
    sheet_h: float = 0,
    remnant_weight: float = 1.0,
    vacuum_weight: float = 0.5,
    min_remnant_w: float = 300,
    min_remnant_l: float = 600,
) -> float:
    """Calcular score HIERARQUICO LEXICOGRAFICO de um resultado de nesting.

    Score MENOR = MELHOR resultado.

    HIERARQUIA ESTRITA (lexicografica):
    Nivel 1: Numero de chapas (peso 1_000_000 por chapa — domina TUDO)
    Nivel 2: Aproveitamento medio (0-100 invertido, peso 1_000)
    Nivel 3: Qualidade das sobras e fragmentacao (peso 1-100)
    Nivel 4: Vacuo e uniformidade (peso 0.1-10)

    Garantia: N chapas a qualquer % SEMPRE vence N+1 chapas a qualquer %.

    Args:
        bins: Lista de resultados de bins
        sheet_w: Largura util da chapa (mm), 0 = desabilita remnant/vacuum
        sheet_h: Altura util da chapa (mm)
        remnant_weight: Peso do bonus de sobra (0-2, default 1.0)
        vacuum_weight: Peso da penalidade de vacuo (0-2, default 0.5)
        min_remnant_w: Largura minima de sobra util (mm)
        min_remnant_l: Comprimento minimo de sobra util (mm)

    Returns:
        Score (menor = melhor)
    """
    if not bins:
        return float("inf")

    n = len(bins)
    occupancies = sorted([b.occupancy for b in bins])
    avg_occ = sum(occupancies) / n if n > 0 else 0

    # =====================================================================
    # NIVEL 1: Numero de chapas (domina tudo)
    # 1_000_000 por chapa garante que reduzir 1 chapa SEMPRE vence
    # qualquer melhoria nos niveis inferiores.
    # =====================================================================
    score = n * 1_000_000

    # =====================================================================
    # NIVEL 2: Aproveitamento (invertido, max 100_000)
    # Maior aproveitamento = menor score.
    # Escala: 0% → +100_000, 100% → 0
    # =====================================================================
    score += (100 - avg_occ) * 1_000

    # Bonus extra quadratico por alta ocupacao (reforcar > 80%)
    for occ in occupancies:
        score -= (occ ** 2) * 0.05  # max ~500 por chapa

    # =====================================================================
    # NIVEL 3: Qualidade das sobras e fragmentacao (max ~2000)
    # =====================================================================
    # Penalidade por chapas subutilizadas
    for occ in occupancies:
        if occ < 25:
            score += 800
        elif occ < 40:
            score += (40 - occ) * 20

    # Bonus por qualidade das sobras (remnant quality)
    if sheet_w > 0 and sheet_h > 0 and remnant_weight > 0:
        score -= _compute_remnant_bonus(
            bins, sheet_w, sheet_h,
            min_remnant_w, min_remnant_l, remnant_weight
        )

    # Penalidade por fragmentacao de sobras
    if sheet_w > 0 and sheet_h > 0:
        score += _compute_fragmentation_penalty(
            bins, sheet_w, sheet_h,
            min_remnant_w, min_remnant_l
        )

    # =====================================================================
    # NIVEL 4: Uniformidade e vacuo (max ~500)
    # =====================================================================
    if n > 1:
        variance = sum((o - avg_occ) ** 2 for o in occupancies) / n
        score += variance * 0.1  # Pequena penalidade por variancia

    # Penalidade por risco de vacuo
    if sheet_w > 0 and sheet_h > 0 and vacuum_weight > 0:
        score += _compute_vacuum_penalty(
            bins, sheet_w, sheet_h, vacuum_weight
        )

    return score


def _compute_remnant_bonus(
    bins: list[BinResult],
    sheet_w: float, sheet_h: float,
    min_w: float, min_l: float,
    weight: float,
) -> float:
    """Calcular bonus por sobras reutilizaveis.

    Analisa o bounding box das pecas em cada bin e estima
    o tamanho das sobras retangulares (direita e acima).
    Sobras maiores que o minimo geram bonus no score.

    Retorna valor positivo (sera subtraido do score = melhora).
    """
    total_bonus = 0.0

    for b in bins:
        if not b.placements:
            continue

        # Calcular bounding box das pecas (sem trim, coords relativas)
        max_x = 0.0
        max_y = 0.0
        for p in b.placements:
            px_end = p.x + p.effective_length
            py_end = p.y + p.effective_width
            max_x = max(max_x, px_end)
            max_y = max(max_y, py_end)

        # Sobra a direita (faixa vertical completa)
        right_w = sheet_w - max_x
        if right_w >= min_w and sheet_h >= min_l:
            area = right_w * sheet_h
            total_bonus += area / (sheet_w * sheet_h) * 200

        # Sobra acima (faixa horizontal ate max_x)
        top_h = sheet_h - max_y
        if top_h >= min_w and max_x >= min_l:
            area = max_x * top_h
            total_bonus += area / (sheet_w * sheet_h) * 200

        # Penalidade extra por sobra inutilizavel (tira estreita)
        # Se tem sobra significativa mas nao e reaproveitavel
        free_area = sheet_w * sheet_h - sum(
            p.effective_length * p.effective_width for p in b.placements
        )
        if free_area > 0:
            usable_area = 0.0
            if right_w >= min_w and sheet_h >= min_l:
                usable_area += right_w * sheet_h
            if top_h >= min_w and max_x >= min_l:
                usable_area += max_x * top_h
            waste_ratio = 1.0 - min(1.0, usable_area / free_area) if free_area > 0 else 0
            # Pequena penalidade por sobra desperdicada (tiras estreitas)
            if waste_ratio > 0.5:
                total_bonus -= waste_ratio * 30

    return total_bonus * weight


def _compute_fragmentation_penalty(
    bins: list[BinResult],
    sheet_w: float, sheet_h: float,
    min_w: float, min_l: float,
) -> float:
    """Penalizar sobras fragmentadas e inutilizaveis.

    Conta as sobras que sao menores que o minimo util e aplica
    penalidade proporcional. Premiar layouts com sobras grandes
    e continuas; punir layouts com muitas tiras estreitas.

    Retorna valor positivo (sera somado ao score = piora).
    """
    total_penalty = 0.0

    for b in bins:
        if not b.placements:
            continue

        # Calcular area livre total
        total_piece_area = sum(
            p.effective_length * p.effective_width for p in b.placements
        )
        free_area = sheet_w * sheet_h - total_piece_area
        if free_area <= 0:
            continue

        # Estimar sobras usando bounding box
        max_x = max(
            (p.x - b.sheet.trim + p.effective_length if b.sheet else p.x + p.effective_length)
            for p in b.placements
        ) if b.placements else 0
        max_y = max(
            (p.y - b.sheet.trim + p.effective_width if b.sheet else p.y + p.effective_width)
            for p in b.placements
        ) if b.placements else 0

        # Sobras reutilizaveis (direita + topo)
        right_w = sheet_w - max_x
        top_h = sheet_h - max_y
        usable_area = 0.0
        n_usable = 0

        if right_w >= min_w and sheet_h >= min_l:
            usable_area += right_w * sheet_h
            n_usable += 1
        if top_h >= min_w and max_x >= min_l:
            usable_area += max_x * top_h
            n_usable += 1

        # Fragmentacao = % de area livre que NAO e reutilizavel
        if free_area > sheet_w * sheet_h * 0.05:  # So penalizar se > 5% livre
            waste_ratio = max(0, 1.0 - usable_area / free_area) if free_area > 0 else 0

            # Penalidade cresce com a quantidade de area desperdicada
            if waste_ratio > 0.6:
                penalty = waste_ratio * (free_area / (sheet_w * sheet_h)) * 150
                total_penalty += penalty
            elif waste_ratio > 0.3:
                penalty = waste_ratio * (free_area / (sheet_w * sheet_h)) * 50
                total_penalty += penalty

    return total_penalty


def _compute_vacuum_penalty(
    bins: list[BinResult],
    sheet_w: float, sheet_h: float,
    weight: float,
) -> float:
    """Calcular penalidade por risco de vacuo (estimativa leve).

    Pecas pequenas no centro da chapa sao penalizadas.
    Pecas pequenas na periferia sao OK.

    Retorna valor positivo (sera somado ao score = piora).
    """
    import math

    total_penalty = 0.0
    cx = sheet_w / 2
    cy = sheet_h / 2
    max_dist = math.sqrt(cx ** 2 + cy ** 2) if cx > 0 and cy > 0 else 1.0

    for b in bins:
        for p in b.placements:
            pw = p.effective_length
            ph = p.effective_width
            min_dim = min(pw, ph)

            # So penalizar pecas pequenas (< 400mm menor lado)
            if min_dim >= 400:
                continue

            # Posicao do centro da peca
            pcx = p.x + pw / 2
            pcy = p.y + ph / 2
            dist = math.sqrt((pcx - cx) ** 2 + (pcy - cy) ** 2)
            proximity = 1.0 - (dist / max_dist)  # 1.0 = centro, 0.0 = borda

            # Fator de tamanho: quanto menor, mais risco
            if min_dim < 200:
                size_factor = 1.5  # super_pequena
            else:
                size_factor = 0.8  # pequena

            # Penalidade: peca pequena + no centro = alto risco
            if proximity > 0.3:
                total_penalty += proximity * size_factor * 15

    return total_penalty * weight


# ---------------------------------------------------------------------------
# Nesting pass: colocar todas as pecas em bins
# ---------------------------------------------------------------------------

def run_nesting_pass(
    pieces: list[Piece],
    sheet: Sheet,
    bin_type: str = "maxrects",
    heuristic: NestingHeuristic = NestingHeuristic.BSSF,
    spacing: float = 7.0,
    allow_rotation: bool = True,
    multi_heuristic: bool = False,
    vacuum_aware: bool = True,
    remnant_weight: float = 1.0,
    vacuum_weight: float = 0.5,
    min_remnant_w: float = 300,
    min_remnant_l: float = 600,
    split_direction: str = "auto",
) -> NestingPassResult:
    """Executar um passe de nesting (colocar pecas em bins).

    Args:
        pieces: Pecas a colocar (ja expandidas por quantidade)
        sheet: Chapa modelo
        bin_type: Tipo de bin (maxrects, guillotine, shelf)
        heuristic: Heuristica de placement
        spacing: Espacamento entre pecas
        allow_rotation: Permitir rotacao
        multi_heuristic: Usar todas heuristicas por peca
        vacuum_aware: Ajustar placement por risco de vacuo

    Returns:
        NestingPassResult com bins e estatisticas
    """
    usable_w = sheet.usable_length
    usable_h = sheet.usable_width

    # Expandir bin por 1 spacing em cada direcao para que a ultima peca
    # de cada faixa nao precise de trailing spacing (que cairia no refilo).
    # O spacing e necessario ENTRE pecas, mas nao entre a ultima peca e a borda.
    bin_w = usable_w + spacing
    bin_h = usable_h + spacing

    bins: list[BinResult] = []
    unplaced: list[Piece] = []

    # Criar primeiro bin
    current_bin = create_bin(bin_type, bin_w, bin_h, spacing, sheet.kerf, split_dir=split_direction)
    current_bin_result = BinResult(
        index=0, sheet=sheet,
        total_area=usable_w * usable_h,
        bin_type=bin_type,
        heuristic=heuristic.value,
    )

    for piece in pieces:
        # Determinar dimensoes efetivas e rotacao permitida
        pw, ph = piece.length, piece.width
        can_rotate = allow_rotation and piece.rotation_policy != RotationPolicy.FIXED

        # Se grain_locked, so permitir 0 e 180 (que nao troca dimensoes)
        if piece.rotation_policy == RotationPolicy.GRAIN_LOCKED:
            can_rotate = False  # 0 e 180 nao trocam dimensoes

        # Classificacao CNC
        piece_class = classify_piece_size(piece) if vacuum_aware else "normal"

        # Encontrar posicao
        if multi_heuristic:
            candidate = current_bin.find_best_multi_heuristic(
                pw, ph, can_rotate, piece_class
            )
        else:
            candidate = current_bin.find_best(
                pw, ph, can_rotate, heuristic, piece_class
            )

        if candidate is None:
            # Nao cabe neste bin → criar novo bin
            # Finalizar bin atual — usar area util real para ocupacao
            mid_used = sum(r["real_w"] * r["real_h"] for r in current_bin.used_rects)
            real_area = usable_w * usable_h
            current_bin_result.occupancy = (mid_used / real_area * 100) if real_area > 0 else 0
            current_bin_result.cuts = getattr(current_bin, 'cuts', [])
            if current_bin_result.placements:
                bins.append(current_bin_result)

            # Novo bin
            current_bin = create_bin(bin_type, bin_w, bin_h, spacing, sheet.kerf, split_dir=split_direction)
            current_bin_result = BinResult(
                index=len(bins), sheet=sheet,
                total_area=usable_w * usable_h,
                bin_type=bin_type,
                heuristic=heuristic.value,
            )

            # Tentar novamente no novo bin
            if multi_heuristic:
                candidate = current_bin.find_best_multi_heuristic(
                    pw, ph, can_rotate, piece_class
                )
            else:
                candidate = current_bin.find_best(
                    pw, ph, can_rotate, heuristic, piece_class
                )

        if candidate is None:
            # Peca nao cabe em nenhum bin (maior que a chapa?)
            unplaced.append(piece)
            continue

        # Determinar dimensoes apos rotacao
        if candidate.rotation == 90:
            eff_l, eff_w = ph, pw
        else:
            eff_l, eff_w = pw, ph

        # Colocar no bin
        current_bin.place_rect(
            candidate.x, candidate.y, eff_l, eff_w,
            piece_ref={"piece_id": piece.id, "persistent_id": piece.persistent_id},
        )

        # Criar Placement
        placement = Placement(
            piece_id=piece.id,
            piece_persistent_id=piece.persistent_id,
            instance=0,  # Sera ajustado pelo layout_builder
            sheet_index=current_bin_result.index,
            x=candidate.x + sheet.trim,  # Offset do refilo
            y=candidate.y + sheet.trim,
            rotation=candidate.rotation,
            rotated=candidate.rotation != 0,
            effective_length=eff_l,
            effective_width=eff_w,
            rotation_score=0,
        )

        current_bin_result.placements.append(placement)
        current_bin_result.piece_area += eff_l * eff_w

    # Finalizar ultimo bin — usar area util real para ocupacao (sem expansao)
    real_area = usable_w * usable_h
    used_area = sum(r["real_w"] * r["real_h"] for r in current_bin.used_rects)
    current_bin_result.occupancy = (used_area / real_area * 100) if real_area > 0 else 0
    current_bin_result.cuts = getattr(current_bin, 'cuts', [])
    if current_bin_result.placements:
        bins.append(current_bin_result)

    # Calcular estatisticas
    total_placed = sum(b.piece_count for b in bins)
    avg_occ = sum(b.occupancy for b in bins) / len(bins) if bins else 0

    return NestingPassResult(
        bins=bins,
        total_pieces_placed=total_placed,
        unplaced_pieces=unplaced,
        avg_occupancy=avg_occ,
        strategy="",
        heuristic=heuristic.value,
        bin_type=bin_type,
        score=score_nesting_result(
            bins, usable_w, usable_h,
            remnant_weight, vacuum_weight,
            min_remnant_w, min_remnant_l,
        ),
    )


# ---------------------------------------------------------------------------
# Fill-first: preencher cada bin ao maximo antes de abrir novo
# ---------------------------------------------------------------------------

def run_fill_first(
    pieces: list[Piece],
    sheet: Sheet,
    bin_type: str = "maxrects",
    spacing: float = 7.0,
    allow_rotation: bool = True,
    vacuum_aware: bool = True,
    remnant_weight: float = 1.0,
    vacuum_weight: float = 0.5,
    min_remnant_w: float = 300,
    min_remnant_l: float = 600,
    split_direction: str = "auto",
) -> NestingPassResult:
    """Nesting fill-first com multi-heuristic por peca.

    Port da logica fill-first do JS (linhas 766-843).
    Para cada peca, testa TODAS as heuristicas e escolhe a melhor.

    Args:
        pieces: Pecas a colocar
        sheet: Chapa modelo
        bin_type: Tipo de bin
        spacing: Espacamento
        allow_rotation: Permitir rotacao
        vacuum_aware: Vacuum-aware placement

    Returns:
        NestingPassResult
    """
    return run_nesting_pass(
        pieces, sheet,
        bin_type=bin_type,
        heuristic=NestingHeuristic.BSSF,  # Default, sera ignorado
        spacing=spacing,
        allow_rotation=allow_rotation,
        multi_heuristic=True,
        vacuum_aware=vacuum_aware,
        remnant_weight=remnant_weight,
        vacuum_weight=vacuum_weight,
        min_remnant_w=min_remnant_w,
        min_remnant_l=min_remnant_l,
        split_direction=split_direction,
    )


# ---------------------------------------------------------------------------
# Verificacao de overlaps
# ---------------------------------------------------------------------------

def verify_no_overlaps(bins: list[BinResult], tolerance: float = 0.5) -> bool:
    """Verificar que nenhum par de pecas tem overlap.

    Args:
        bins: Lista de bins com placements
        tolerance: Tolerancia em mm para overlap

    Returns:
        True se nao ha overlaps
    """
    for b in bins:
        placements = b.placements
        for i in range(len(placements)):
            for j in range(i + 1, len(placements)):
                pi = placements[i]
                pj = placements[j]

                # Verificar overlap de retangulos
                pi_x2 = pi.x + pi.effective_length
                pi_y2 = pi.y + pi.effective_width
                pj_x2 = pj.x + pj.effective_length
                pj_y2 = pj.y + pj.effective_width

                # Overlap se os retangulos se intersectam
                overlap_x = min(pi_x2, pj_x2) - max(pi.x, pj.x)
                overlap_y = min(pi_y2, pj_y2) - max(pi.y, pj.y)

                if overlap_x > tolerance and overlap_y > tolerance:
                    return False

    return True


# ---------------------------------------------------------------------------
# Compactacao (gravity settle)
# ---------------------------------------------------------------------------

def compact_bin(bin_result: BinResult, sheet: Sheet, passes: int = 10) -> BinResult:
    """Compactar pecas no bin (gravity settle + rotation swap).

    Tenta mover cada peca para baixo e para esquerda.
    Tambem testa se trocar a rotacao de uma peca permite
    melhor encaixe (menor bounding box).

    Args:
        bin_result: Bin a compactar
        sheet: Chapa
        passes: Numero de passadas

    Returns:
        Bin com placements compactados
    """
    if not bin_result.placements:
        return bin_result

    placements = [p.model_copy() for p in bin_result.placements]
    trim = sheet.trim
    usable_w = sheet.usable_length
    usable_h = sheet.usable_width

    for pass_num in range(passes):
        moved = False

        # Fase 1: Gravity settle (Y depois X)
        for i, p in enumerate(placements):
            others = [placements[j] for j in range(len(placements)) if j != i]

            # Tentar mover para baixo (Y = 0)
            new_y = trim
            for o in others:
                if _rects_overlap_x(p, o):
                    candidate_y = o.y + o.effective_width
                    if candidate_y <= p.y + 0.01:
                        new_y = max(new_y, candidate_y)

            if new_y < p.y - 0.5:
                p.y = new_y
                moved = True

            # Tentar mover para esquerda (X = 0)
            new_x = trim
            for o in others:
                if _rects_overlap_y(p, o):
                    candidate_x = o.x + o.effective_length
                    if candidate_x <= p.x + 0.01:
                        new_x = max(new_x, candidate_x)

            if new_x < p.x - 0.5:
                p.x = new_x
                moved = True

        # Fase 2: Rotation swap (a cada 3 passes)
        if pass_num % 3 == 1:
            for i, p in enumerate(placements):
                # So trocar rotacao se a peca nao e quadrada
                if abs(p.effective_length - p.effective_width) < 1.0:
                    continue
                # Verificar se rotacao cabe
                new_l = p.effective_width
                new_w = p.effective_length
                if (p.x + new_l <= trim + usable_w + 0.5 and
                        p.y + new_w <= trim + usable_h + 0.5):
                    # Verificar se rotacao nao causa overlap
                    old_l, old_w = p.effective_length, p.effective_width
                    p.effective_length = new_l
                    p.effective_width = new_w
                    others = [placements[j] for j in range(len(placements)) if j != i]
                    has_overlap = False
                    for o in others:
                        ox = min(p.x + p.effective_length, o.x + o.effective_length) - max(p.x, o.x)
                        oy = min(p.y + p.effective_width, o.y + o.effective_width) - max(p.y, o.y)
                        if ox > 0.5 and oy > 0.5:
                            has_overlap = True
                            break
                    if has_overlap:
                        p.effective_length = old_l
                        p.effective_width = old_w
                    else:
                        p.rotated = not p.rotated
                        p.rotation = 90 if p.rotated else 0
                        moved = True

        if not moved:
            break

    result = BinResult(
        index=bin_result.index,
        sheet=bin_result.sheet,
        placements=placements,
        occupancy=bin_result.occupancy,
        piece_area=bin_result.piece_area,
        total_area=bin_result.total_area,
        bin_type=bin_result.bin_type,
        heuristic=bin_result.heuristic,
        cuts=getattr(bin_result, 'cuts', []),
    )

    return result


def _rects_overlap_x(a: Placement, b: Placement) -> bool:
    """Verificar se dois placements se sobrepoem no eixo X."""
    return not (a.x + a.effective_length <= b.x or b.x + b.effective_length <= a.x)


def _rects_overlap_y(a: Placement, b: Placement) -> bool:
    """Verificar se dois placements se sobrepoem no eixo Y."""
    return not (a.y + a.effective_width <= b.y or b.y + b.effective_width <= a.y)


# ---------------------------------------------------------------------------
# Minimo teorico de chapas
# ---------------------------------------------------------------------------

def minimum_theoretical_sheets(pieces: list[Piece], sheet: Sheet) -> int:
    """Calcular minimo teorico de chapas necessarias.

    Baseado na area total das pecas vs area util da chapa.

    Args:
        pieces: Lista de pecas (ja expandidas por quantidade)
        sheet: Chapa modelo

    Returns:
        Numero minimo de chapas (arredondado para cima)
    """
    total_piece_area = sum(p.length * p.width for p in pieces)
    sheet_area = sheet.usable_length * sheet.usable_width

    if sheet_area <= 0:
        return len(pieces)

    import math
    return max(1, math.ceil(total_piece_area / sheet_area))


def maximum_theoretical_occupancy(
    pieces: list[Piece], sheet: Sheet, n_sheets: int
) -> float:
    """Calcular maximo teorico de aproveitamento com N chapas.

    Args:
        pieces: Lista de pecas
        sheet: Chapa modelo
        n_sheets: Numero de chapas

    Returns:
        Percentual maximo de aproveitamento (0-100)
    """
    total_piece_area = sum(p.length * p.width for p in pieces)
    total_sheet_area = n_sheets * sheet.usable_length * sheet.usable_width

    if total_sheet_area <= 0:
        return 0

    return min(100, (total_piece_area / total_sheet_area) * 100)
