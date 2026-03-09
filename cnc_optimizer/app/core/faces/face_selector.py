"""Selecao de face principal (A ou B) para usinagem.

Determina qual face da peca deve ficar voltada para cima
durante a usinagem CNC, baseado nos perfis de usinagem.
"""

from __future__ import annotations

from app.core.domain.models import Piece, FaceMachiningProfile
from app.core.domain.enums import FaceSide
from app.core.faces.face_profiles import build_both_profiles


# ---------------------------------------------------------------------------
# Selecao de face
# ---------------------------------------------------------------------------

def select_primary_face(piece: Piece) -> FaceSide:
    """Selecionar a face principal para usinagem.

    Regra principal: face com MAIS usinagem vira face principal.

    Criterios (em ordem de prioridade):
    1. Face com mais workers
    2. Face com mais profundidade total
    3. Face com mais complexidade
    4. Face A (default se empate total)

    Args:
        piece: Peca com machining data

    Returns:
        FaceSide.A ou FaceSide.B
    """
    profile_a, profile_b = build_both_profiles(piece)

    # Se nao tem usinagem em nenhuma face → A (default)
    if profile_a.worker_count == 0 and profile_b.worker_count == 0:
        return FaceSide.A

    # Se so tem usinagem numa face → essa face
    if profile_a.worker_count > 0 and profile_b.worker_count == 0:
        return FaceSide.A
    if profile_b.worker_count > 0 and profile_a.worker_count == 0:
        return FaceSide.B

    # Ambas faces tem usinagem — comparar
    score_a = _face_priority_score(profile_a)
    score_b = _face_priority_score(profile_b)

    if score_a >= score_b:
        return FaceSide.A
    return FaceSide.B


def analyze_piece_faces(piece: Piece) -> dict:
    """Analise completa das faces de uma peca.

    Retorna um relatorio com perfis de ambas as faces,
    face selecionada e se precisa de flip.

    Args:
        piece: Peca

    Returns:
        Dict com analise completa
    """
    profile_a, profile_b = build_both_profiles(piece)
    primary = select_primary_face(piece)
    needs_flip = requires_flip(piece)

    return {
        "piece_id": piece.id,
        "piece_description": piece.description,
        "face_a": {
            "worker_count": profile_a.worker_count,
            "total_depth": profile_a.total_machining_depth,
            "complexity": round(profile_a.contour_complexity, 3),
            "tool_changes": profile_a.tool_changes,
            "has_through_holes": profile_a.has_through_holes,
            "finish_sensitive": profile_a.finish_sensitive,
            "setup_difficulty": round(profile_a.setup_difficulty, 3),
        },
        "face_b": {
            "worker_count": profile_b.worker_count,
            "total_depth": profile_b.total_machining_depth,
            "complexity": round(profile_b.contour_complexity, 3),
            "tool_changes": profile_b.tool_changes,
            "has_through_holes": profile_b.has_through_holes,
            "finish_sensitive": profile_b.finish_sensitive,
            "setup_difficulty": round(profile_b.setup_difficulty, 3),
        },
        "primary_face": primary.value,
        "requires_flip": needs_flip,
        "flip_reason": _flip_reason(profile_a, profile_b) if needs_flip else None,
    }


def requires_flip(piece: Piece) -> bool:
    """Verificar se a peca precisa de flip (virar a chapa).

    Flip e necessario quando ambas as faces tem usinagem
    significativa e nao podem ser feitas com a peca numa so posicao.

    Args:
        piece: Peca

    Returns:
        True se precisa de 2 setups (flip)
    """
    profile_a, profile_b = build_both_profiles(piece)

    # Precisa de flip se ambas faces tem workers
    return profile_a.worker_count > 0 and profile_b.worker_count > 0


def count_flips(pieces: list[Piece]) -> int:
    """Contar quantas pecas de uma lista precisam de flip.

    Util para scoring: menos flips = melhor.

    Args:
        pieces: Lista de pecas

    Returns:
        Numero de pecas que precisam de flip
    """
    return sum(1 for p in pieces if requires_flip(p))


# ---------------------------------------------------------------------------
# Aplicar selecao
# ---------------------------------------------------------------------------

def apply_face_selection(piece: Piece) -> Piece:
    """Aplicar selecao de face a uma peca.

    Atualiza os campos face_a_profile, face_b_profile,
    preferred_face e requires_flip.

    Args:
        piece: Peca (modificada in-place)

    Returns:
        Peca atualizada
    """
    profile_a, profile_b = build_both_profiles(piece)

    piece.face_a_profile = profile_a
    piece.face_b_profile = profile_b
    piece.preferred_face = select_primary_face(piece)
    piece.requires_flip = requires_flip(piece)

    return piece


def apply_face_selection_batch(pieces: list[Piece]) -> list[Piece]:
    """Aplicar selecao de face a um lote de pecas.

    Args:
        pieces: Lista de pecas

    Returns:
        Pecas atualizadas
    """
    for piece in pieces:
        apply_face_selection(piece)
    return pieces


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _face_priority_score(profile: FaceMachiningProfile) -> float:
    """Calcular score de prioridade de uma face.

    Score mais alto = mais usinagem = mais importante como face principal.
    """
    score = 0.0

    # Workers (peso alto)
    score += profile.worker_count * 10.0

    # Profundidade total
    score += profile.total_machining_depth * 0.5

    # Complexidade
    score += profile.contour_complexity * 20.0

    # Trocas de ferramenta
    score += profile.tool_changes * 5.0

    # Furos passantes (indicam face funcional)
    if profile.has_through_holes:
        score += 15.0

    # Acabamento sensivel (indicam face visivel)
    if profile.finish_sensitive:
        score += 10.0

    return score


def _flip_reason(
    profile_a: FaceMachiningProfile,
    profile_b: FaceMachiningProfile,
) -> str:
    """Gerar explicacao de por que o flip e necessario."""
    parts = []

    if profile_a.worker_count > 0:
        parts.append(f"Face A: {profile_a.worker_count} operacoes")
    if profile_b.worker_count > 0:
        parts.append(f"Face B: {profile_b.worker_count} operacoes")

    return " + ".join(parts)
