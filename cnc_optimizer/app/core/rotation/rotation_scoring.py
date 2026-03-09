"""Scoring multi-criterio de rotacao.

Avalia cada rotacao candidata com base em multiplos criterios
para escolher a melhor orientacao de uma peca num dado contexto.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from shapely.geometry import Polygon

from app.core.domain.models import Piece, Sheet, Placement
from app.core.rotation.rotation_policy import (
    get_allowed_rotations,
    get_effective_dimensions,
)


# ---------------------------------------------------------------------------
# Pesos configuraveis
# ---------------------------------------------------------------------------

@dataclass
class RotationWeights:
    """Pesos para cada componente do score de rotacao.

    Todos devem somar 1.0. Ajustar conforme prioridade.
    """
    fit_gain: float = 0.30        # Melhora encaixe na area disponivel?
    compactness: float = 0.20     # Espaco restante compacto?
    vacuum_support: float = 0.15  # Area sobre zonas de vacuo
    cut_stability: float = 0.15   # Estabilidade durante corte
    travel_reduction: float = 0.10  # Reduz deslocamento vazio?
    machining_access: float = 0.10  # Acesso para usinagem

    def validate(self) -> bool:
        """Verificar que pesos somam ~1.0."""
        total = (
            self.fit_gain + self.compactness + self.vacuum_support
            + self.cut_stability + self.travel_reduction + self.machining_access
        )
        return abs(total - 1.0) < 0.01


DEFAULT_WEIGHTS = RotationWeights()


# ---------------------------------------------------------------------------
# Resultado do scoring
# ---------------------------------------------------------------------------

@dataclass
class RotationScore:
    """Score detalhado de uma rotacao candidata."""
    rotation: float = 0.0
    total: float = 0.0

    # Componentes individuais (0.0 a 1.0)
    fit_gain: float = 0.0
    compactness: float = 0.0
    vacuum_support: float = 0.0
    cut_stability: float = 0.0
    travel_reduction: float = 0.0
    machining_access: float = 0.0

    # Dimensoes efetivas nesta rotacao
    effective_length: float = 0.0
    effective_width: float = 0.0

    # Se cabe no espaco disponivel
    fits: bool = True


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------

def score_rotation(
    piece: Piece,
    rotation: float,
    available_length: float,
    available_width: float,
    placed_pieces: list[Placement] | None = None,
    sheet: Sheet | None = None,
    weights: RotationWeights | None = None,
) -> RotationScore:
    """Calcular score de uma rotacao para uma peca num contexto.

    Args:
        piece: Peca a rotacionar
        rotation: Angulo em graus
        available_length: Comprimento disponivel no espaco
        available_width: Largura disponivel no espaco
        placed_pieces: Pecas ja colocadas (para compactacao)
        sheet: Chapa (para vacuum support)
        weights: Pesos dos componentes

    Returns:
        RotationScore com score total e componentes
    """
    w = weights or DEFAULT_WEIGHTS
    eff_l, eff_w = get_effective_dimensions(piece, rotation)

    score = RotationScore(
        rotation=rotation,
        effective_length=eff_l,
        effective_width=eff_w,
    )

    # Verificar se cabe
    if eff_l > available_length or eff_w > available_width:
        score.fits = False
        score.total = -1.0
        return score

    # 1. Fit gain — quanto melhor a peca preenche o espaco disponivel
    score.fit_gain = _score_fit_gain(eff_l, eff_w, available_length, available_width)

    # 2. Compactness — espaco restante compacto (retangular)
    score.compactness = _score_compactness(eff_l, eff_w, available_length, available_width)

    # 3. Vacuum support — area sobre zonas de vacuo (estimativa)
    score.vacuum_support = _score_vacuum_support(piece, rotation, sheet)

    # 4. Cut stability — estabilidade durante corte
    score.cut_stability = _score_cut_stability(piece, rotation)

    # 5. Travel reduction — reduzir deslocamento vazio (estimativa)
    score.travel_reduction = _score_travel_reduction(piece, rotation, placed_pieces)

    # 6. Machining access — acesso para usinagem
    score.machining_access = _score_machining_access(piece, rotation)

    # Score total ponderado
    score.total = (
        w.fit_gain * score.fit_gain
        + w.compactness * score.compactness
        + w.vacuum_support * score.vacuum_support
        + w.cut_stability * score.cut_stability
        + w.travel_reduction * score.travel_reduction
        + w.machining_access * score.machining_access
    )

    return score


def find_best_rotation(
    piece: Piece,
    available_length: float,
    available_width: float,
    sheet: Sheet | None = None,
    placed_pieces: list[Placement] | None = None,
    weights: RotationWeights | None = None,
) -> RotationScore:
    """Encontrar a melhor rotacao para uma peca.

    Testa todas as rotacoes permitidas e retorna a melhor.

    Args:
        piece: Peca
        available_length: Comprimento disponivel
        available_width: Largura disponivel
        sheet: Chapa
        placed_pieces: Pecas ja colocadas
        weights: Pesos

    Returns:
        Melhor RotationScore
    """
    allowed = get_allowed_rotations(piece, sheet)

    best: Optional[RotationScore] = None

    for rotation in allowed:
        score = score_rotation(
            piece, rotation,
            available_length, available_width,
            placed_pieces, sheet, weights,
        )

        if not score.fits:
            continue

        if best is None or score.total > best.total:
            best = score

    # Se nenhuma rotacao cabe, retornar a primeira (vai marcar fits=False)
    if best is None:
        return score_rotation(
            piece, allowed[0],
            available_length, available_width,
            placed_pieces, sheet, weights,
        )

    return best


def rank_rotations(
    piece: Piece,
    available_length: float,
    available_width: float,
    sheet: Sheet | None = None,
    placed_pieces: list[Placement] | None = None,
    weights: RotationWeights | None = None,
) -> list[RotationScore]:
    """Rankear todas as rotacoes por score.

    Args:
        piece: Peca
        available_length: Comprimento disponivel
        available_width: Largura disponivel
        sheet: Chapa
        placed_pieces: Pecas colocadas
        weights: Pesos

    Returns:
        Lista de RotationScore ordenada por total (melhor primeiro)
    """
    allowed = get_allowed_rotations(piece, sheet)

    scores = []
    for rotation in allowed:
        score = score_rotation(
            piece, rotation,
            available_length, available_width,
            placed_pieces, sheet, weights,
        )
        scores.append(score)

    # Ordenar: que cabem primeiro, depois por score desc
    scores.sort(key=lambda s: (s.fits, s.total), reverse=True)
    return scores


# ---------------------------------------------------------------------------
# Componentes individuais do score
# ---------------------------------------------------------------------------

def _score_fit_gain(
    piece_l: float, piece_w: float,
    avail_l: float, avail_w: float,
) -> float:
    """Score de encaixe: quao bem a peca preenche o espaco.

    1.0 = preenche perfeitamente, 0.0 = muito espaco desperdicado.
    """
    if avail_l <= 0 or avail_w <= 0:
        return 0.0

    piece_area = piece_l * piece_w
    avail_area = avail_l * avail_w
    ratio = piece_area / avail_area

    return min(ratio, 1.0)


def _score_compactness(
    piece_l: float, piece_w: float,
    avail_l: float, avail_w: float,
) -> float:
    """Score de compactacao: espaco restante e aproveitavel?

    Preferir rotacoes que deixam espaco retangular grande
    em vez de tiras finas inutilizaveis.
    """
    rest_l = avail_l - piece_l
    rest_w = avail_w - piece_w

    if rest_l <= 0 and rest_w <= 0:
        return 1.0  # Encaixe perfeito

    # Avaliar os dois retalhos gerados (direita e acima)
    # Retalho direita: rest_l x piece_w
    # Retalho acima: avail_l x rest_w

    scores = []
    if rest_l > 0 and piece_w > 0:
        # Retalho a direita
        aspect = min(rest_l, piece_w) / max(rest_l, piece_w) if max(rest_l, piece_w) > 0 else 0
        scores.append(aspect)

    if rest_w > 0 and avail_l > 0:
        # Retalho acima
        aspect = min(avail_l, rest_w) / max(avail_l, rest_w) if max(avail_l, rest_w) > 0 else 0
        scores.append(aspect)

    if not scores:
        return 1.0

    return sum(scores) / len(scores)


def _score_vacuum_support(
    piece: Piece,
    rotation: float,
    sheet: Sheet | None,
) -> float:
    """Score de suporte de vacuo.

    Pecas maiores tem mais suporte. Pecas com lados longos paralelos
    as bordas da chapa tem melhor suporte.

    Placeholder: sera refinado na FASE 8 com simulacao real.
    """
    eff_l, eff_w = get_effective_dimensions(piece, rotation)
    area = eff_l * eff_w

    # Peca maior = mais suporte
    # Normalizar por area tipica (500x500 = 250000)
    area_score = min(area / 250000, 1.0)

    # Aspect ratio proximo de 1 = melhor suporte
    if min(eff_l, eff_w) > 0:
        aspect = min(eff_l, eff_w) / max(eff_l, eff_w)
    else:
        aspect = 0

    return 0.6 * area_score + 0.4 * aspect


def _score_cut_stability(
    piece: Piece,
    rotation: float,
) -> float:
    """Score de estabilidade durante corte.

    Pecas com lado maior horizontal (paralelo ao X)
    sao mais estaveis porque a fresa se move ao longo do lado mais longo.

    Para pecas com usinagem, considerar a direcao dos rasgos.
    """
    eff_l, eff_w = get_effective_dimensions(piece, rotation)

    # Preferir lado mais longo no eixo X (horizontal)
    if eff_l >= eff_w:
        return 0.8  # Lado longo horizontal — bom
    else:
        return 0.5  # Lado longo vertical — menos estavel

    # TODO FASE 7: considerar rasgos e contornos


def _score_travel_reduction(
    piece: Piece,
    rotation: float,
    placed_pieces: list[Placement] | None,
) -> float:
    """Score de reducao de deslocamento vazio.

    Se nao ha pecas colocadas, nao tem como avaliar.
    Placeholder: sera refinado na FASE 7 com roteamento.
    """
    if not placed_pieces:
        return 0.5  # Neutro

    # Estimativa simples: pecas alinhadas horizontalmente
    # reduzem deslocamento em Y
    eff_l, eff_w = get_effective_dimensions(piece, rotation)

    # Se a peca e mais larga que alta, tende a se alinhar melhor
    # em layouts horizontais
    if eff_l >= eff_w:
        return 0.7
    return 0.4


def _score_machining_access(
    piece: Piece,
    rotation: float,
) -> float:
    """Score de acesso para usinagem.

    Pecas com usinagem complexa (muitos workers) precisam de
    orientacao que facilite o acesso da ferramenta.

    Workers na face "top" sao sempre acessiveis.
    Workers na face "left"/"back" dependem da orientacao.
    """
    workers = piece.machining.workers
    if not workers:
        return 0.8  # Sem usinagem = facil

    total = len(workers)
    accessible = 0

    for w in workers:
        # Workers no topo sao sempre acessiveis
        if w.face in ("top", "top_edge"):
            accessible += 1
        # Workers nas bordas dependem menos da rotacao
        elif w.face in ("left_edge", "right_edge", "bottom_edge"):
            accessible += 0.8
        # Workers laterais/traseiros sao mais complexos
        else:
            accessible += 0.5

    return accessible / total if total > 0 else 0.8
