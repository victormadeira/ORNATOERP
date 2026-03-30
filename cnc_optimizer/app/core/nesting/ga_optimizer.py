"""Otimizador global baseado em BRKGA (Biased Random-Key Genetic Algorithm).

Port e extensao do BRKGA + Ruin & Recreate do JS nesting-engine.js.

Cromossomo (3n + 3 floats):
  keys[0..n-1]     — Ordem das pecas (random keys)
  keys[n..2n-1]    — Rotacao por peca (>0.5 = rotacionar 90)
  keys[2n]         — Seletor de heuristica (0-5)
  keys[2n+1]       — Seletor de bin type (0-3)
  keys[2n+2]       — Fill-first vs normal (>0.4 = fill-first)

Parametros:
  Populacao: min(200, max(50, n_pecas * 4))
  Elite: 20%, Mutantes: 15%
  Crossover: bias elite 0.70
  Geracoes: 100-500, early stop 50 gens sem melhora
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Optional, Callable

from app.core.domain.models import (
    Piece, Sheet, Placement, SheetLayout, LayoutResult,
)
from app.core.domain.enums import (
    NestingHeuristic, RotationPolicy,
)
from app.core.nesting.part_ordering import (
    sort_pieces, expand_pieces_by_quantity,
    STRATEGIES,
)
from app.core.nesting.placement import (
    run_nesting_pass, run_fill_first,
    score_nesting_result, verify_no_overlaps,
    compact_bin,
    BinResult, NestingPassResult,
)


# ---------------------------------------------------------------------------
# Configuracao do GA
# ---------------------------------------------------------------------------

@dataclass
class GAConfig:
    """Configuracao do algoritmo genetico."""
    # Populacao
    pop_size: int = 0                # 0 = auto (baseado em n_pecas)
    elite_frac: float = 0.20        # Fracao de elite
    mutant_frac: float = 0.15       # Fracao de mutantes
    inherit_prob: float = 0.70      # Probabilidade de herdar do elite

    # Geracoes
    max_generations: int = 100
    early_stop_gens: int = 50       # Parar se sem melhora por N gens

    # Nesting
    spacing: float = 7.0
    allow_rotation: bool = True
    vacuum_aware: bool = True

    # Seed
    seed: int | None = None

    # Heuristicas e bin types disponiveis
    heuristics: list[NestingHeuristic] = field(
        default_factory=lambda: list(NestingHeuristic)
    )
    bin_types: list[str] = field(
        default_factory=lambda: ["maxrects", "guillotine", "shelf"]
    )

    def effective_pop_size(self, n_pieces: int) -> int:
        """Tamanho efetivo da populacao."""
        if self.pop_size > 0:
            return self.pop_size
        return min(200, max(50, n_pieces * 4))


# ---------------------------------------------------------------------------
# Cromossomo
# ---------------------------------------------------------------------------

@dataclass
class Chromosome:
    """Cromossomo BRKGA."""
    keys: list[float] = field(default_factory=list)
    fitness: float = float("inf")  # Menor = melhor
    n_pieces: int = 0

    @classmethod
    def random(cls, n_pieces: int, rng: random.Random) -> "Chromosome":
        """Criar cromossomo aleatorio."""
        n_keys = 3 * n_pieces + 3
        keys = [rng.random() for _ in range(n_keys)]
        return cls(keys=keys, n_pieces=n_pieces)

    @classmethod
    def from_order(cls, order: list[int], n_pieces: int, rng: random.Random) -> "Chromosome":
        """Criar cromossomo a partir de uma ordem especifica."""
        n_keys = 3 * n_pieces + 3
        keys = [0.0] * n_keys

        # Ordem: mapear indices de posicao para keys ordenáveis
        for pos, piece_idx in enumerate(order):
            if piece_idx < n_pieces:
                keys[piece_idx] = pos / n_pieces

        # Rotacoes: aleatorias
        for i in range(n_pieces, 2 * n_pieces):
            keys[i] = rng.random()

        # Heuristica, bin type, fill-first: aleatorios
        keys[2 * n_pieces] = rng.random()
        keys[2 * n_pieces + 1] = rng.random()
        keys[2 * n_pieces + 2] = rng.random()

        return cls(keys=keys, n_pieces=n_pieces)

    def decode_order(self) -> list[int]:
        """Decodificar ordem das pecas dos random keys."""
        n = self.n_pieces
        indexed = [(self.keys[i], i) for i in range(n)]
        indexed.sort()
        return [idx for _, idx in indexed]

    def decode_rotations(self) -> list[bool]:
        """Decodificar rotacoes (True = rotacionar 90)."""
        n = self.n_pieces
        return [self.keys[n + i] > 0.5 for i in range(n)]

    def decode_heuristic_idx(self) -> int:
        """Decodificar indice da heuristica."""
        n = self.n_pieces
        return int(self.keys[2 * n] * 5) % 5

    def decode_bin_type_idx(self) -> int:
        """Decodificar indice do bin type."""
        n = self.n_pieces
        return int(self.keys[2 * n + 1] * 4) % 4

    def decode_use_fill_first(self) -> bool:
        """Decodificar se usa fill-first."""
        n = self.n_pieces
        return self.keys[2 * n + 2] > 0.4


# ---------------------------------------------------------------------------
# Decode e evaluate
# ---------------------------------------------------------------------------

def decode_and_evaluate(
    chromosome: Chromosome,
    pieces: list[Piece],
    sheet: Sheet,
    config: GAConfig,
) -> float:
    """Decodificar cromossomo e avaliar fitness.

    Args:
        chromosome: Cromossomo a avaliar
        pieces: Pecas originais
        sheet: Chapa modelo
        config: Configuracao

    Returns:
        Fitness (menor = melhor)
    """
    n = chromosome.n_pieces

    # Decodificar ordem
    order = chromosome.decode_order()
    ordered_pieces = [pieces[i] for i in order if i < len(pieces)]

    # Decodificar rotacoes
    rotations = chromosome.decode_rotations()

    # Aplicar rotacoes (criar copias modificadas)
    modified_pieces = []
    for i, piece in enumerate(ordered_pieces):
        original_idx = order[i] if i < len(order) else i
        p = piece.model_copy()
        if (original_idx < len(rotations) and rotations[original_idx] and
            p.rotation_policy == RotationPolicy.FREE and
            abs(p.length - p.width) > 0.1):
            # Trocar dimensoes
            p.length, p.width = p.width, p.length
        modified_pieces.append(p)

    # Decodificar heuristica
    h_idx = chromosome.decode_heuristic_idx()
    heuristics = config.heuristics
    heuristic = heuristics[h_idx % len(heuristics)]

    # Decodificar bin type
    bt_idx = chromosome.decode_bin_type_idx()
    bin_types = config.bin_types
    bin_type = bin_types[bt_idx % len(bin_types)]

    # Decodificar fill-first
    use_fill_first = chromosome.decode_use_fill_first()

    # Executar nesting
    if use_fill_first:
        result = run_fill_first(
            modified_pieces, sheet,
            bin_type=bin_type,
            spacing=config.spacing,
            allow_rotation=False,  # Ja aplicamos rotacao no decode
            vacuum_aware=config.vacuum_aware,
            split_direction=config.split_direction,
        )
    else:
        result = run_nesting_pass(
            modified_pieces, sheet,
            bin_type=bin_type,
            heuristic=heuristic,
            spacing=config.spacing,
            allow_rotation=False,
            vacuum_aware=config.vacuum_aware,
            split_direction=config.split_direction,
        )

    # Post-nesting compaction (gravity settle)
    if result.bins:
        compacted_bins = [compact_bin(b, sheet, passes=5, split_direction=config.split_direction, spacing=config.spacing) for b in result.bins]
        compacted_result = NestingPassResult(
            bins=compacted_bins,
            total_pieces_placed=result.total_pieces_placed,
            unplaced_pieces=result.unplaced_pieces,
        )
        # Re-score with compacted layout
        compacted_result.score = score_nesting_result(
            compacted_bins,
            sheet_w=sheet.usable_length,
            sheet_h=sheet.usable_width,
        )
        result = compacted_result

    # Penalidade por pecas nao colocadas
    penalty = len(result.unplaced_pieces) * 100000

    fitness = result.score + penalty
    chromosome.fitness = fitness

    return fitness


# ---------------------------------------------------------------------------
# Operadores geneticos
# ---------------------------------------------------------------------------

def crossover_brkga(
    elite: Chromosome,
    non_elite: Chromosome,
    inherit_prob: float,
    rng: random.Random,
) -> Chromosome:
    """Crossover BRKGA: offspring herda genes do elite com probabilidade inherit_prob."""
    n_keys = len(elite.keys)
    child_keys = []

    for i in range(n_keys):
        if rng.random() < inherit_prob:
            child_keys.append(elite.keys[i])
        else:
            child_keys.append(non_elite.keys[i])

    return Chromosome(keys=child_keys, n_pieces=elite.n_pieces)


def mutate(
    chromosome: Chromosome,
    mutation_rate: float = 0.1,
    rng: random.Random | None = None,
) -> Chromosome:
    """Mutar cromossomo com pequenas perturbacoes."""
    rng = rng or random.Random()
    keys = list(chromosome.keys)

    for i in range(len(keys)):
        if rng.random() < mutation_rate:
            keys[i] = rng.random()

    return Chromosome(keys=keys, n_pieces=chromosome.n_pieces)


# ---------------------------------------------------------------------------
# Ruin & Recreate perturbation
# ---------------------------------------------------------------------------

def ruin_and_recreate(
    chromosome: Chromosome,
    rng: random.Random,
    ruin_fraction: float = 0.25,
) -> Chromosome:
    """Remove uma fracao das pecas (ruin) e reinsere aleatoriamente (recreate).

    Opera diretamente nos random keys do cromossomo:
    - Ruin: seleciona ~ruin_fraction das pecas e randomiza suas order keys
    - Recreate: as pecas removidas ganham novas posicoes aleatorias na ordem

    Preserva genes de rotacao, heuristica, bin type e fill-first.
    """
    n = chromosome.n_pieces
    keys = list(chromosome.keys)

    # Selecionar pecas para destruir
    n_ruin = max(2, int(n * ruin_fraction))
    ruin_indices = rng.sample(range(n), min(n_ruin, n))

    # Randomizar order keys das pecas destruidas
    for idx in ruin_indices:
        keys[idx] = rng.random()

    # Opcionalmente perturbar rotacoes das pecas destruidas
    for idx in ruin_indices:
        if rng.random() < 0.3:  # 30% chance de mudar rotacao
            keys[n + idx] = rng.random()

    return Chromosome(keys=keys, n_pieces=n)


def adaptive_mutation_rate(
    no_improve_count: int,
    max_stagnation: int,
    base_rate: float = 0.15,
    max_rate: float = 0.40,
) -> float:
    """Taxa de mutacao adaptativa: aumenta com estagnacao.

    Comeca em base_rate e cresce linearmente ate max_rate quando
    a estagnacao atinge max_stagnation.
    """
    progress = min(1.0, no_improve_count / max(1, max_stagnation))
    return base_rate + (max_rate - base_rate) * progress


# ---------------------------------------------------------------------------
# BRKGA principal
# ---------------------------------------------------------------------------

def run_brkga(
    pieces: list[Piece],
    sheet: Sheet,
    config: GAConfig | None = None,
    progress_callback: Callable[[int, float], None] | None = None,
) -> tuple[NestingPassResult, dict]:
    """Executar BRKGA para otimizar o layout.

    Args:
        pieces: Pecas a posicionar (ja expandidas)
        sheet: Chapa modelo
        config: Configuracao do GA
        progress_callback: Callback(generation, best_fitness)

    Returns:
        (Melhor NestingPassResult, info dict com estatisticas)
    """
    config = config or GAConfig()
    rng = random.Random(config.seed)
    n = len(pieces)

    if n == 0:
        return NestingPassResult(), {"generations": 0}

    pop_size = config.effective_pop_size(n)
    n_elite = max(2, int(pop_size * config.elite_frac))
    n_mutant = max(1, int(pop_size * config.mutant_frac))
    n_crossover = pop_size - n_elite - n_mutant

    # Inicializar populacao
    population: list[Chromosome] = []

    # Seeds deterministicas (3 estrategias)
    for strategy in ["area_desc", "maxside_desc", "h_w_desc"]:
        sorted_pieces = sort_pieces(pieces, strategy)
        order = [pieces.index(p) for p in sorted_pieces]
        chrom = Chromosome.from_order(order, n, rng)
        population.append(chrom)

    # Preencher restante com aleatorios
    while len(population) < pop_size:
        population.append(Chromosome.random(n, rng))

    # Avaliar populacao inicial
    for chrom in population:
        decode_and_evaluate(chrom, pieces, sheet, config)

    # Ordenar por fitness
    population.sort(key=lambda c: c.fitness)

    best_fitness = population[0].fitness
    best_chromosome = population[0]
    no_improve_count = 0

    info = {
        "generations": 0,
        "pop_size": pop_size,
        "best_fitness_history": [best_fitness],
        "early_stopped": False,
    }

    # Evolucao
    for gen in range(config.max_generations):
        # Separar populacao
        elite = population[:n_elite]
        non_elite = population[n_elite:]

        new_population: list[Chromosome] = []

        # Manter elite
        new_population.extend(elite)

        # Adaptive mutation rate — increases with stagnation
        mut_rate = adaptive_mutation_rate(
            no_improve_count, config.early_stop_gens,
            base_rate=config.mutant_frac,
            max_rate=min(0.40, config.mutant_frac * 2.5),
        )
        n_mutant_adaptive = max(1, int(pop_size * mut_rate))
        n_crossover_adaptive = pop_size - n_elite - n_mutant_adaptive

        # Crossover
        for _ in range(min(n_crossover_adaptive, pop_size - n_elite - n_mutant_adaptive)):
            p1 = rng.choice(elite)
            p2 = rng.choice(non_elite) if non_elite else rng.choice(elite)
            child = crossover_brkga(p1, p2, config.inherit_prob, rng)
            decode_and_evaluate(child, pieces, sheet, config)
            new_population.append(child)

        # Ruin & Recreate — apply to some elite chromosomes for perturbation
        n_rr = max(1, int(n_mutant_adaptive * 0.3))
        for _ in range(n_rr):
            # Pick from top half of population
            donor = rng.choice(population[:max(2, pop_size // 2)])
            ruin_frac = 0.15 + rng.random() * 0.25  # 15-40% ruin
            perturbed = ruin_and_recreate(donor, rng, ruin_fraction=ruin_frac)
            decode_and_evaluate(perturbed, pieces, sheet, config)
            new_population.append(perturbed)

        # Mutantes (remaining slots)
        remaining_mutants = max(0, n_mutant_adaptive - n_rr)
        for _ in range(min(remaining_mutants, pop_size - len(new_population))):
            mutant = Chromosome.random(n, rng)
            decode_and_evaluate(mutant, pieces, sheet, config)
            new_population.append(mutant)

        # Completar se necessario
        while len(new_population) < pop_size:
            extra = Chromosome.random(n, rng)
            decode_and_evaluate(extra, pieces, sheet, config)
            new_population.append(extra)

        # Ordenar
        new_population.sort(key=lambda c: c.fitness)
        population = new_population[:pop_size]

        # Verificar melhora
        current_best = population[0].fitness
        if current_best < best_fitness:
            best_fitness = current_best
            best_chromosome = population[0]
            no_improve_count = 0
        else:
            no_improve_count += 1

        info["best_fitness_history"].append(best_fitness)
        info["generations"] = gen + 1

        if progress_callback:
            progress_callback(gen + 1, best_fitness)

        # Early stop
        if no_improve_count >= config.early_stop_gens:
            info["early_stopped"] = True
            break

    # Decodificar melhor resultado com compaction final (mais passes)
    best_result = _decode_to_result(best_chromosome, pieces, sheet, config)
    if best_result.bins:
        best_result.bins = [compact_bin(b, sheet, passes=15, split_direction=config.split_direction, spacing=config.spacing) for b in best_result.bins]
        best_result.score = score_nesting_result(
            best_result.bins,
            sheet_w=sheet.usable_length,
            sheet_h=sheet.usable_width,
        )

    info["best_fitness"] = best_fitness
    info["total_evaluations"] = pop_size * (info["generations"] + 1)
    info["final_mutation_rate"] = mut_rate if 'mut_rate' in dir() else config.mutant_frac

    return best_result, info


def _decode_to_result(
    chromosome: Chromosome,
    pieces: list[Piece],
    sheet: Sheet,
    config: GAConfig,
) -> NestingPassResult:
    """Decodificar cromossomo em resultado de nesting."""
    order = chromosome.decode_order()
    rotations = chromosome.decode_rotations()

    ordered_pieces = [pieces[i] for i in order if i < len(pieces)]

    modified_pieces = []
    for i, piece in enumerate(ordered_pieces):
        original_idx = order[i] if i < len(order) else i
        p = piece.model_copy()
        if (original_idx < len(rotations) and rotations[original_idx] and
            p.rotation_policy == RotationPolicy.FREE and
            abs(p.length - p.width) > 0.1):
            p.length, p.width = p.width, p.length
        modified_pieces.append(p)

    h_idx = chromosome.decode_heuristic_idx()
    heuristic = config.heuristics[h_idx % len(config.heuristics)]

    bt_idx = chromosome.decode_bin_type_idx()
    bin_type = config.bin_types[bt_idx % len(config.bin_types)]

    use_fill_first = chromosome.decode_use_fill_first()

    if use_fill_first:
        return run_fill_first(
            modified_pieces, sheet,
            bin_type=bin_type,
            spacing=config.spacing,
            allow_rotation=False,
            vacuum_aware=config.vacuum_aware,
        )
    else:
        return run_nesting_pass(
            modified_pieces, sheet,
            bin_type=bin_type,
            heuristic=heuristic,
            spacing=config.spacing,
            allow_rotation=False,
            vacuum_aware=config.vacuum_aware,
        )


# ---------------------------------------------------------------------------
# Funcao de conveniencia
# ---------------------------------------------------------------------------

def optimize_with_ga(
    pieces: list[Piece],
    sheets: list[Sheet],
    config: GAConfig | None = None,
) -> tuple[LayoutResult, dict]:
    """Otimizar layout usando GA.

    Funcao de alto nivel que agrupa por material e roda GA por grupo.

    Args:
        pieces: Pecas originais
        sheets: Chapas disponiveis
        config: Configuracao do GA

    Returns:
        (LayoutResult, info dict)
    """
    config = config or GAConfig()

    from app.core.domain.materials import group_pieces_by_material
    from app.core.nesting.part_ordering import expand_pieces_by_quantity

    expanded = expand_pieces_by_quantity(pieces)
    groups = group_pieces_by_material(expanded)

    all_sheet_layouts: list[SheetLayout] = []
    total_pieces = 0
    sheet_offset = 0
    all_info: dict = {"groups": {}}

    for material_code, group_pieces in groups.items():
        # Encontrar chapa para este material
        sheet = None
        for s in sheets:
            if s.material_code == material_code:
                sheet = s
                break
        if sheet is None and sheets:
            sheet = sheets[0]
        if sheet is None:
            continue

        # Rodar GA
        best_result, group_info = run_brkga(group_pieces, sheet, config)
        all_info["groups"][material_code] = group_info

        # Converter para SheetLayouts
        if best_result.bins:
            for b in best_result.bins:
                for p in b.placements:
                    p.sheet_index = sheet_offset + b.index
                sl = SheetLayout(
                    index=sheet_offset + b.index,
                    sheet=sheet,
                    placements=b.placements,
                    occupancy=b.occupancy,
                    piece_count=len(b.placements),
                    cuts=getattr(b, 'cuts', []),
                )
                all_sheet_layouts.append(sl)
            sheet_offset += len(best_result.bins)
            total_pieces += best_result.total_pieces_placed

    occupancies = [sl.occupancy for sl in all_sheet_layouts]

    layout = LayoutResult(
        sheets=all_sheet_layouts,
        total_sheets=len(all_sheet_layouts),
        total_pieces=total_pieces,
        avg_occupancy=sum(occupancies) / len(occupancies) if occupancies else 0,
        min_occupancy=min(occupancies) if occupancies else 0,
        max_occupancy=max(occupancies) if occupancies else 0,
    )

    return layout, all_info
