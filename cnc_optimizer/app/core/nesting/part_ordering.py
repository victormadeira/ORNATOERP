"""Estrategias de ordenacao de pecas para nesting.

Port das 15+ estrategias do JS nesting-engine.js.
Cada estrategia ordena pecas de forma diferente para
testar qual producao de layout produz melhor resultado.
"""

from __future__ import annotations

import math
import random
from typing import Callable

from app.core.domain.models import Piece


# ---------------------------------------------------------------------------
# Tipo de funcao de ordenacao
# ---------------------------------------------------------------------------

SortKeyFn = Callable[[Piece], tuple]


# ---------------------------------------------------------------------------
# Funcoes auxiliares
# ---------------------------------------------------------------------------

def _area(p: Piece) -> float:
    """Area da peca."""
    return p.length * p.width


def _perimeter(p: Piece) -> float:
    """Perimetro da peca."""
    return 2 * (p.length + p.width)


def _max_side(p: Piece) -> float:
    """Maior dimensao da peca."""
    return max(p.length, p.width)


def _min_side(p: Piece) -> float:
    """Menor dimensao da peca."""
    return min(p.length, p.width)


def _diagonal(p: Piece) -> float:
    """Diagonal da peca."""
    return math.sqrt(p.length ** 2 + p.width ** 2)


def _aspect_ratio(p: Piece) -> float:
    """Razao de aspecto (min/max). 1.0 = quadrado."""
    if _max_side(p) == 0:
        return 0
    return _min_side(p) / _max_side(p)


def _diff_metric(p: Piece) -> float:
    """Metrica combinada area + razao aspecto."""
    return _area(p) + (_max_side(p) - _min_side(p)) * 100


# ---------------------------------------------------------------------------
# Estrategias de ordenacao (15+)
# ---------------------------------------------------------------------------

STRATEGIES: dict[str, SortKeyFn] = {}


def _register(name: str, key_fn: SortKeyFn):
    """Registrar estrategia de ordenacao."""
    STRATEGIES[name] = key_fn


# --- Ordenacao por area ---
_register("area_desc", lambda p: (-_area(p), -_max_side(p)))
_register("area_asc", lambda p: (_area(p), _max_side(p)))

# --- Ordenacao por perimetro ---
_register("perim_desc", lambda p: (-_perimeter(p), -_area(p)))
_register("perim_asc", lambda p: (_perimeter(p), _area(p)))

# --- Ordenacao por maior lado ---
_register("maxside_desc", lambda p: (-_max_side(p), -_area(p)))
_register("maxside_asc", lambda p: (_max_side(p), _area(p)))

# --- Ordenacao por menor lado ---
_register("minside_desc", lambda p: (-_min_side(p), -_area(p)))

# --- Ordenacao por largura/altura ---
_register("w_h_desc", lambda p: (-p.width, -p.length))
_register("h_w_desc", lambda p: (-p.length, -p.width))
_register("w_asc_h_desc", lambda p: (p.width, -p.length))

# --- Ordenacao por razao aspecto ---
_register("ratio_sq", lambda p: (-_aspect_ratio(p), -_area(p)))  # quadrado primeiro
_register("ratio_thin", lambda p: (_aspect_ratio(p), -_area(p)))  # fino primeiro

# --- Ordenacao por diagonal ---
_register("diagonal_desc", lambda p: (-_diagonal(p), -_area(p)))

# --- Ordenacao por diferenca (area + aspecto) ---
_register("diff_desc", lambda p: (-_diff_metric(p),))

# --- Ordenacao por direcao horizontal (faixas) ---
_register("dir_h_group", lambda p: (-p.length, -p.width))

# --- Ordenacao por direcao vertical (colunas) ---
_register("dir_v_group", lambda p: (-p.width, -p.length))

# --- Ordenacao por altura arredondada (strip grouping) ---
_register("dir_h_strip", lambda p: (-(p.length // 20) * 20, -p.width))
_register("dir_v_col", lambda p: (-(p.width // 20) * 20, -p.length))

# --- Ordenacao edge-first: pecas longas primeiro para bordas, depois area ---
# Prioriza pecas com maior dimensao (encostam melhor nas bordas da chapa),
# gerando sobras em retangulos grandes e reutilizaveis
_register("edge_long_first", lambda p: (-_max_side(p), -_area(p), -_min_side(p)))
_register("edge_area_long", lambda p: (-_area(p), -_max_side(p), -_min_side(p)))


# ---------------------------------------------------------------------------
# Estrategias compostas (tiered)
# ---------------------------------------------------------------------------

def _classify_by_area(pieces: list[Piece]) -> tuple[list[Piece], list[Piece], list[Piece]]:
    """Classificar pecas em 3 faixas: small, medium, large."""
    if not pieces:
        return [], [], []

    areas = [_area(p) for p in pieces]
    max_area = max(areas) if areas else 1
    if max_area == 0:
        max_area = 1

    small = []
    medium = []
    large = []

    for p in pieces:
        ratio = _area(p) / max_area
        if ratio < 0.25:
            small.append(p)
        elif ratio < 0.60:
            medium.append(p)
        else:
            large.append(p)

    return small, medium, large


def sort_tiered_smg(pieces: list[Piece]) -> list[Piece]:
    """Small-Medium-Grande: pecas pequenas primeiro."""
    small, medium, large = _classify_by_area(pieces)
    small.sort(key=lambda p: _area(p))
    medium.sort(key=lambda p: _area(p))
    large.sort(key=lambda p: _area(p))
    return small + medium + large


def sort_tiered_gms(pieces: list[Piece]) -> list[Piece]:
    """Grande-Medium-Small: pecas grandes primeiro."""
    small, medium, large = _classify_by_area(pieces)
    large.sort(key=lambda p: -_area(p))
    medium.sort(key=lambda p: -_area(p))
    small.sort(key=lambda p: -_area(p))
    return large + medium + small


def sort_tiered_mix(pieces: list[Piece]) -> list[Piece]:
    """Intercalado: grande, pequena, media, grande, pequena..."""
    small, medium, large = _classify_by_area(pieces)
    large.sort(key=lambda p: -_area(p))
    medium.sort(key=lambda p: -_area(p))
    small.sort(key=lambda p: -_area(p))

    result = []
    iterators = [iter(large), iter(small), iter(medium)]
    idx = 0
    exhausted = [False, False, False]

    while not all(exhausted):
        try:
            p = next(iterators[idx % 3])
            result.append(p)
        except StopIteration:
            exhausted[idx % 3] = True
        idx += 1
        # Cycle to next non-exhausted iterator
        attempts = 0
        while exhausted[idx % 3] and attempts < 3:
            idx += 1
            attempts += 1
        if attempts >= 3:
            break

    return result


TIERED_STRATEGIES: dict[str, Callable[[list[Piece]], list[Piece]]] = {
    "tiered_smg": sort_tiered_smg,
    "tiered_gms": sort_tiered_gms,
    "tiered_mix": sort_tiered_mix,
}


# ---------------------------------------------------------------------------
# Funcoes publicas
# ---------------------------------------------------------------------------

def get_strategy_names() -> list[str]:
    """Obter nomes de todas as estrategias disponiveis."""
    return list(STRATEGIES.keys()) + list(TIERED_STRATEGIES.keys())


def sort_pieces(pieces: list[Piece], strategy: str) -> list[Piece]:
    """Ordenar pecas usando uma estrategia nomeada.

    Args:
        pieces: Lista de pecas a ordenar
        strategy: Nome da estrategia (ver STRATEGIES)

    Returns:
        Nova lista ordenada (nao altera a original)

    Raises:
        ValueError: Se a estrategia nao existe
    """
    # Tiered strategies
    if strategy in TIERED_STRATEGIES:
        return TIERED_STRATEGIES[strategy](list(pieces))

    # Simple strategies
    if strategy not in STRATEGIES:
        raise ValueError(f"Estrategia desconhecida: {strategy}. "
                         f"Disponiveis: {get_strategy_names()}")

    return sorted(pieces, key=STRATEGIES[strategy])


def sort_pieces_random(pieces: list[Piece], seed: int | None = None) -> list[Piece]:
    """Ordenar pecas aleatoriamente (para populacao GA).

    Args:
        pieces: Lista de pecas
        seed: Seed aleatoria (None = random)

    Returns:
        Nova lista com ordem aleatoria
    """
    result = list(pieces)
    rng = random.Random(seed)
    rng.shuffle(result)
    return result


def expand_pieces_by_quantity(pieces: list[Piece]) -> list[Piece]:
    """Expandir pecas pela quantidade.

    Uma peca com quantidade=3 vira 3 instancias separadas.
    Cada instancia recebe um instance_index para rastreamento.

    Args:
        pieces: Lista de pecas (podem ter quantity > 1)

    Returns:
        Lista expandida com instance_index no id
    """
    expanded = []
    for p in pieces:
        qty = max(1, p.quantity)
        for i in range(qty):
            # Criar copia com instance tracking
            instance = p.model_copy()
            instance.quantity = 1
            # Manter o id original mas marcar a instancia
            # O sistema de placement vai usar piece_id + instance
            expanded.append(instance)
    return expanded


def classify_piece_size(piece: Piece,
                        threshold_small: float = 400,
                        threshold_super_small: float = 200) -> str:
    """Classificar peca por tamanho para estrategia CNC.

    Args:
        piece: Peca a classificar
        threshold_small: Limite para 'pequena' (mm)
        threshold_super_small: Limite para 'super_pequena' (mm)

    Returns:
        'super_pequena', 'pequena', ou 'normal'
    """
    min_dim = min(piece.length, piece.width)

    if min_dim < threshold_super_small:
        return "super_pequena"
    elif min_dim < threshold_small:
        return "pequena"
    else:
        return "normal"


# ---------------------------------------------------------------------------
# Perturbacoes (para Ruin & Recreate / GA)
# ---------------------------------------------------------------------------

def perturb_ruin_recreate(
    pieces: list[Piece],
    perturbation_type: int = 0,
    ruin_ratio: float = 0.25,
    seed: int | None = None,
) -> list[Piece]:
    """Perturbar ordem de pecas para Ruin & Recreate.

    Port das 8 perturbacoes do JS nesting-engine.js:1063-1413.

    Args:
        pieces: Lista atual de pecas
        perturbation_type: Tipo de perturbacao (0-7, modular)
        ruin_ratio: Fracao de pecas a "destruir" e reordenar
        seed: Seed aleatoria

    Returns:
        Nova lista com ordem perturbada
    """
    rng = random.Random(seed)
    n = len(pieces)
    result = list(pieces)

    pt = perturbation_type % 8

    if pt == 0:
        # Random shuffle de ruin_ratio das pecas + area sort
        k = max(1, int(n * ruin_ratio))
        indices = rng.sample(range(n), k)
        ruined = [result[i] for i in indices]
        kept_indices = set(range(n)) - set(indices)
        kept = [result[i] for i in sorted(kept_indices)]
        ruined.sort(key=lambda p: -_area(p))
        result = kept + ruined

    elif pt == 1:
        # Separar pecas pequenas
        small = [p for p in result if _area(p) < _area(result[0]) * 0.25]
        large = [p for p in result if p not in small]
        large.sort(key=lambda p: -_area(p))
        rng.shuffle(small)
        result = large + small

    elif pt == 2:
        # Random swaps (2-5)
        num_swaps = rng.randint(2, min(5, n // 2))
        for _ in range(num_swaps):
            i, j = rng.sample(range(n), 2)
            result[i], result[j] = result[j], result[i]

    elif pt == 3:
        # Separar por altura
        k = max(1, int(n * ruin_ratio))
        by_height = sorted(result, key=lambda p: -p.length)
        result = by_height[:k] + [p for p in result if p not in by_height[:k]]

    elif pt == 4:
        # Intercalar grande/pequeno
        by_area = sorted(result, key=lambda p: -_area(p))
        new = []
        left, right = 0, len(by_area) - 1
        while left <= right:
            new.append(by_area[left])
            if left != right:
                new.append(by_area[right])
            left += 1
            right -= 1
        result = new

    elif pt == 5:
        # Diagonal sort
        result.sort(key=lambda p: -_diagonal(p))
        k = max(1, int(n * 0.15))
        for _ in range(k):
            i, j = rng.sample(range(n), 2)
            result[i], result[j] = result[j], result[i]

    elif pt == 6:
        # Perimetro desc com swaps
        result.sort(key=lambda p: -_perimeter(p))
        k = max(1, int(n * 0.10))
        for _ in range(k):
            i, j = rng.sample(range(n), 2)
            result[i], result[j] = result[j], result[i]

    elif pt == 7:
        # Ratio + area desc
        result.sort(key=lambda p: (-_aspect_ratio(p), -_area(p)))

    return result
