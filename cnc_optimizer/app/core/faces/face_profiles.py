"""Perfis de usinagem por face (A e B).

Analisa os workers de uma peca para construir o perfil
de usinagem de cada face, determinando complexidade,
profundidade e necessidade de setup.
"""

from __future__ import annotations

from app.core.domain.models import Piece, Worker, FaceMachiningProfile
from app.core.domain.enums import FaceSide


# ---------------------------------------------------------------------------
# Faces e workers
# ---------------------------------------------------------------------------

# Faces que pertencem ao lado A (superior / frontal)
SIDE_A_FACES = {
    "top", "top_edge", "left_edge", "right_edge",
}

# Faces que pertencem ao lado B (inferior / traseiro)
SIDE_B_FACES = {
    "bottom", "back", "bottom_edge",
}

# Faces laterais (acessiveis de ambos os lados)
LATERAL_FACES = {
    "left", "right", "front",
}


def classify_worker_side(worker: Worker) -> FaceSide:
    """Classificar um worker como face A ou B.

    Args:
        worker: Worker com face definida

    Returns:
        FaceSide.A ou FaceSide.B
    """
    if worker.face in SIDE_B_FACES:
        return FaceSide.B
    if worker.side == "side_b":
        return FaceSide.B
    return FaceSide.A


def split_workers_by_face(
    workers: list[Worker],
) -> tuple[list[Worker], list[Worker]]:
    """Separar workers por face A e B.

    Args:
        workers: Lista de todos os workers da peca

    Returns:
        (workers_face_a, workers_face_b)
    """
    face_a = []
    face_b = []

    for w in workers:
        side = classify_worker_side(w)
        if side == FaceSide.B:
            face_b.append(w)
        else:
            face_a.append(w)

    return face_a, face_b


# ---------------------------------------------------------------------------
# Construcao de perfis
# ---------------------------------------------------------------------------

def build_face_profile(
    workers: list[Worker],
    face: FaceSide,
    piece_area: float = 0,
) -> FaceMachiningProfile:
    """Construir perfil de usinagem para uma face.

    Args:
        workers: Workers desta face
        face: FaceSide.A ou FaceSide.B
        piece_area: Area da peca (para calcular removed_area_ratio)

    Returns:
        FaceMachiningProfile com metricas calculadas
    """
    if not workers:
        return FaceMachiningProfile(face=face)

    # Contagem
    worker_count = len(workers)

    # Profundidade total
    total_depth = sum(w.depth for w in workers)

    # Profundidade maxima
    max_depth = max(w.depth for w in workers)

    # Tool changes (ferramentas distintas)
    unique_tools = {w.tool_code for w in workers if w.tool_code}
    tool_changes = max(0, len(unique_tools) - 1)

    # Furos passantes (depth proximo da espessura)
    has_through = any(w.depth >= 15 for w in workers)

    # Area removida estimada
    removed_area = _estimate_removed_area(workers)
    removed_ratio = removed_area / piece_area if piece_area > 0 else 0

    # Complexidade (0-1)
    complexity = _compute_complexity(workers, tool_changes)

    # Sensibilidade de acabamento
    finish_sensitive = _is_finish_sensitive(workers)

    # Dificuldade de setup (0-1)
    setup_difficulty = _compute_setup_difficulty(workers, tool_changes, has_through)

    return FaceMachiningProfile(
        face=face,
        worker_count=worker_count,
        total_machining_depth=total_depth,
        contour_complexity=complexity,
        removed_area_ratio=removed_ratio,
        tool_changes=tool_changes,
        has_through_holes=has_through,
        finish_sensitive=finish_sensitive,
        setup_difficulty=setup_difficulty,
    )


def build_both_profiles(
    piece: Piece,
) -> tuple[FaceMachiningProfile, FaceMachiningProfile]:
    """Construir perfis para ambas as faces de uma peca.

    Args:
        piece: Peca com machining data

    Returns:
        (profile_a, profile_b)
    """
    workers_a, workers_b = split_workers_by_face(piece.machining.workers)
    piece_area = piece.length * piece.width

    profile_a = build_face_profile(workers_a, FaceSide.A, piece_area)
    profile_b = build_face_profile(workers_b, FaceSide.B, piece_area)

    return profile_a, profile_b


# ---------------------------------------------------------------------------
# Metricas internas
# ---------------------------------------------------------------------------

def _estimate_removed_area(workers: list[Worker]) -> float:
    """Estimar area total removida pelos workers (mm²).

    Aproximacao simples:
    - Furos: pi * (d/2)²
    - Rasgos: length * width
    - Pockets: length * width
    """
    import math

    total = 0.0
    for w in workers:
        if w.diameter is not None and w.diameter > 0:
            # Furo circular
            total += math.pi * (w.diameter / 2) ** 2
        elif w.length is not None and w.width is not None:
            # Rasgo ou pocket
            total += w.length * w.width
        else:
            # Furo por tool_code (estimar pelo diametro da ferramenta)
            diam = _tool_diameter_estimate(w.tool_code)
            total += math.pi * (diam / 2) ** 2

    return total


def _tool_diameter_estimate(tool_code: str) -> float:
    """Estimar diametro da ferramenta pelo tool_code."""
    estimates = {
        "f_3mm": 3,
        "f_5mm_twister243": 5,
        "f_8mm_cavilha": 8,
        "f_8mm_eixo_tambor_min": 8,
        "f_15mm_tambor_min": 15,
        "f_35mm_dob": 35,
        "r_f": 6,
        "p_3mm": 3,
        "p_8mm_cavilha": 8,
    }
    return estimates.get(tool_code, 6)


def _compute_complexity(workers: list[Worker], tool_changes: int) -> float:
    """Calcular complexidade de usinagem (0-1).

    Mais workers + mais trocas de ferramenta = mais complexo.
    """
    count_score = min(len(workers) / 10.0, 1.0)  # 10+ workers = max
    tool_score = min(tool_changes / 4.0, 1.0)   # 4+ trocas = max

    return 0.6 * count_score + 0.4 * tool_score


def _is_finish_sensitive(workers: list[Worker]) -> bool:
    """Verificar se a face e sensivel ao acabamento.

    Furos de dobradica (35mm, face back) indicam face visivel.
    Rasgos grandes indicam face funcional.
    """
    for w in workers:
        # Dobradica na face B = porta visivel na face A
        if w.tool_code == "f_35mm_dob":
            return True
        # Rasgo grande = face funcional
        if w.length and w.length > 100:
            return True
    return False


def _compute_setup_difficulty(
    workers: list[Worker],
    tool_changes: int,
    has_through: bool,
) -> float:
    """Calcular dificuldade de setup (0-1).

    Furos passantes, muitas trocas de ferramenta e workers
    em bordas aumentam a dificuldade.
    """
    difficulty = 0.0

    # Base: trocas de ferramenta
    difficulty += min(tool_changes * 0.15, 0.4)

    # Furos passantes
    if has_through:
        difficulty += 0.2

    # Workers em bordas (precisam de fixacao especial)
    edge_workers = sum(1 for w in workers if "edge" in w.face)
    difficulty += min(edge_workers * 0.1, 0.3)

    return min(difficulty, 1.0)
