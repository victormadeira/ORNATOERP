"""Politica de rotacao de pecas.

Determina quais rotacoes sao permitidas para cada peca
com base no veio do material, simetria e tipo de peca.
"""

from __future__ import annotations

from app.core.domain.models import Piece, Sheet
from app.core.domain.enums import GrainDirection, RotationPolicy


# ---------------------------------------------------------------------------
# Rotacoes permitidas
# ---------------------------------------------------------------------------

def get_allowed_rotations(
    piece: Piece,
    sheet: Sheet | None = None,
) -> list[float]:
    """Obter lista de rotacoes permitidas para uma peca.

    Regras:
    1. Sem veio (Branco, Cru, Preto) → [0, 90, 180, 270]
    2. Com veio (Carvalho, Nogueira) → [0, 180] (preserva direcao do veio)
    3. Rotacao fixa → [0]
    4. Deduplicacao: quadrado sem veio → [0, 90] (180/270 sao equivalentes)
    5. Simetria 180: retangulo → [0, 90] (180 = 0 girado, 270 = 90 girado)

    Se a chapa tambem tem veio, verificar compatibilidade.

    Args:
        piece: Peca com info de veio e dimensoes
        sheet: Chapa (opcional, para verificar compatibilidade de veio)

    Returns:
        Lista de angulos permitidos em graus
    """
    # 1. Determinar rotacoes base pela politica
    if piece.rotation_policy == RotationPolicy.FIXED:
        return [0.0]

    if piece.rotation_policy == RotationPolicy.GRAIN_LOCKED:
        return _grain_locked_rotations(piece, sheet)

    # FREE: todas as rotacoes
    rotations = [0.0, 90.0, 180.0, 270.0]

    # 2. Deduplicar por simetria
    rotations = _deduplicate_rotations(piece, rotations)

    return rotations


def _grain_locked_rotations(
    piece: Piece,
    sheet: Sheet | None,
) -> list[float]:
    """Rotacoes para pecas com veio travado.

    Com veio, so pode girar 0 ou 180 (mantendo a direcao do veio).
    Se a chapa tem veio perpendicular ao da peca, nao ha rotacao valida
    (deveria ser cortada em outra chapa).

    Args:
        piece: Peca com veio
        sheet: Chapa

    Returns:
        [0, 180] ou [0] se simetrica
    """
    # Se a chapa tem veio, verificar compatibilidade
    if sheet and sheet.grain != GrainDirection.NONE:
        if piece.grain != sheet.grain:
            # Veios incompativeis — teoricamente nao deveria estar nesta chapa
            # Mas retorna [0] para nao impedir completamente
            return [0.0]

    # Peca com veio: 0 e 180
    rotations = [0.0, 180.0]

    # Deduplicar: se retangulo (simetrico sob 180), so [0]
    if piece.is_rectangular:
        # Retangulo e simetrico sob 180 graus
        rotations = [0.0]

    return rotations


def _deduplicate_rotations(
    piece: Piece,
    rotations: list[float],
) -> list[float]:
    """Remover rotacoes redundantes por simetria.

    - Retangulo: 0 == 180, 90 == 270 → [0, 90]
    - Quadrado: 0 == 90 == 180 == 270 → [0]
    - Peca irregular simetrica 180: eliminar 180 e 270

    Args:
        piece: Peca
        rotations: Rotacoes candidatas

    Returns:
        Rotacoes sem redundancias
    """
    if not piece.is_rectangular:
        # Para pecas irregulares, manter todas
        # (exceto se soubermos que e simetrica — a ser verificado com geometria)
        return rotations

    # Quadrado: so precisa de uma rotacao
    if _is_square(piece):
        return [0.0]

    # Retangulo: 0 == 180 e 90 == 270 (simetria bilateral)
    return [0.0, 90.0]


def _is_square(piece: Piece, tolerance: float = 1.0) -> bool:
    """Verificar se peca e quadrada."""
    return abs(piece.length - piece.width) < tolerance


# ---------------------------------------------------------------------------
# Verificacao de compatibilidade
# ---------------------------------------------------------------------------

def rotation_is_allowed(
    piece: Piece,
    rotation: float,
    sheet: Sheet | None = None,
) -> bool:
    """Verificar se uma rotacao especifica e permitida.

    Args:
        piece: Peca
        rotation: Angulo em graus
        sheet: Chapa (opcional)

    Returns:
        True se a rotacao e permitida
    """
    allowed = get_allowed_rotations(piece, sheet)
    # Normalizar para [0, 360)
    rotation_norm = rotation % 360
    return any(abs(rotation_norm - a) < 0.1 for a in allowed)


def piece_needs_rotation(piece: Piece) -> bool:
    """Verificar se faz sentido testar rotacoes para esta peca.

    Retorna False se a peca so tem uma rotacao possivel
    (quadrado, ou grain_locked com retangulo).

    Args:
        piece: Peca

    Returns:
        True se vale a pena testar mais de 1 rotacao
    """
    return len(get_allowed_rotations(piece)) > 1


def get_effective_dimensions(
    piece: Piece,
    rotation: float,
) -> tuple[float, float]:
    """Obter dimensoes efetivas apos rotacao.

    Rotacao 0/180: (length, width)
    Rotacao 90/270: (width, length) — troca dimensoes

    Args:
        piece: Peca
        rotation: Angulo em graus

    Returns:
        (comprimento_efetivo, largura_efetiva)
    """
    rotation_norm = rotation % 360

    if abs(rotation_norm - 90) < 0.1 or abs(rotation_norm - 270) < 0.1:
        return (piece.width, piece.length)

    return (piece.length, piece.width)


def piece_fits_rotated(
    piece: Piece,
    rotation: float,
    max_length: float,
    max_width: float,
) -> bool:
    """Verificar se peca cabe no espaco apos rotacao.

    Args:
        piece: Peca
        rotation: Angulo em graus
        max_length: Comprimento disponivel
        max_width: Largura disponivel

    Returns:
        True se cabe
    """
    eff_l, eff_w = get_effective_dimensions(piece, rotation)
    return eff_l <= max_length and eff_w <= max_width
