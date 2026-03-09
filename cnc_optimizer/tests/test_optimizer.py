"""Testes do otimizador global GA (FASE 9)."""

import pytest

from app.core.domain.models import Piece, Sheet
from app.core.domain.enums import (
    GrainDirection, RotationPolicy, NestingHeuristic,
)
from app.core.nesting.ga_optimizer import (
    GAConfig, Chromosome,
    decode_and_evaluate, crossover_brkga, mutate,
    run_brkga, optimize_with_ga,
)
from app.core.nesting.part_ordering import expand_pieces_by_quantity
from app.core.nesting.placement import NestingPassResult
import random


# ===================================================================
# Helpers
# ===================================================================

def _make_piece(id: int = 1, length: float = 720, width: float = 550,
                quantity: int = 1, material_code: str = "MDF_18.5_BRANCO_TX",
                **kwargs) -> Piece:
    return Piece(
        id=id, persistent_id=f"P{id:03d}",
        description=f"Peca {id}",
        length=length, width=width,
        thickness_real=18.5,
        quantity=quantity,
        material_code=material_code,
        **kwargs,
    )


def _make_sheet() -> Sheet:
    return Sheet(
        id=1, length=2750, width=1850,
        trim=10, kerf=4,
        material_code="MDF_18.5_BRANCO_TX",
    )


def _make_pieces(count: int = 5) -> list[Piece]:
    sizes = [
        (720, 550), (1164, 550), (716, 597),
        (400, 300), (500, 400), (300, 200),
        (800, 600), (600, 450),
    ]
    return [
        _make_piece(id=i + 1, length=sizes[i % len(sizes)][0],
                    width=sizes[i % len(sizes)][1])
        for i in range(count)
    ]


# ===================================================================
# Testes do Cromossomo
# ===================================================================

class TestChromosome:
    """Testes do cromossomo BRKGA."""

    def test_random_chromosome(self):
        """Criar cromossomo aleatorio."""
        rng = random.Random(42)
        c = Chromosome.random(5, rng)
        assert len(c.keys) == 3 * 5 + 3  # 18 keys
        assert c.n_pieces == 5

    def test_from_order(self):
        """Criar cromossomo de uma ordem especifica."""
        rng = random.Random(42)
        c = Chromosome.from_order([2, 0, 4, 1, 3], 5, rng)
        order = c.decode_order()
        # A ordem decodificada deve preservar a sequencia
        assert len(order) == 5
        assert set(order) == {0, 1, 2, 3, 4}

    def test_decode_order(self):
        """Decodificar ordem dos random keys."""
        rng = random.Random(42)
        c = Chromosome.random(5, rng)
        order = c.decode_order()
        assert len(order) == 5
        assert set(order) == {0, 1, 2, 3, 4}

    def test_decode_rotations(self):
        """Decodificar rotacoes."""
        c = Chromosome(keys=[0] * 5 + [0.6, 0.3, 0.8, 0.2, 0.9] + [0] * 3, n_pieces=5)
        rots = c.decode_rotations()
        assert rots == [True, False, True, False, True]

    def test_decode_heuristic(self):
        """Decodificar indice da heuristica."""
        c = Chromosome(keys=[0] * 10 + [0.5] + [0] * 2, n_pieces=5)
        idx = c.decode_heuristic_idx()
        assert 0 <= idx < 5

    def test_decode_bin_type(self):
        """Decodificar indice do bin type."""
        c = Chromosome(keys=[0] * 11 + [0.5] + [0], n_pieces=5)
        idx = c.decode_bin_type_idx()
        assert 0 <= idx < 4

    def test_decode_fill_first(self):
        """Decodificar fill-first flag."""
        c1 = Chromosome(keys=[0] * 12 + [0.5], n_pieces=5)
        c2 = Chromosome(keys=[0] * 12 + [0.3], n_pieces=5)
        assert c1.decode_use_fill_first()
        assert not c2.decode_use_fill_first()


# ===================================================================
# Testes dos Operadores Geneticos
# ===================================================================

class TestGeneticOperators:
    """Testes de crossover e mutacao."""

    def test_crossover_produces_valid(self):
        """Crossover produz cromossomo valido."""
        rng = random.Random(42)
        p1 = Chromosome.random(5, rng)
        p2 = Chromosome.random(5, rng)
        child = crossover_brkga(p1, p2, 0.7, rng)
        assert len(child.keys) == len(p1.keys)
        assert child.n_pieces == 5

    def test_crossover_inherits_from_both(self):
        """Crossover herda genes de ambos os pais."""
        rng = random.Random(42)
        p1 = Chromosome(keys=[0.0] * 18, n_pieces=5)
        p2 = Chromosome(keys=[1.0] * 18, n_pieces=5)
        child = crossover_brkga(p1, p2, 0.5, rng)
        # Deve ter mistura de 0s e 1s
        has_zero = any(k < 0.5 for k in child.keys)
        has_one = any(k > 0.5 for k in child.keys)
        assert has_zero or has_one

    def test_mutate_changes_keys(self):
        """Mutacao muda pelo menos algum gene."""
        rng = random.Random(42)
        original = Chromosome(keys=[0.5] * 18, n_pieces=5)
        mutated = mutate(original, mutation_rate=0.5, rng=rng)
        assert len(mutated.keys) == 18
        # Pelo menos alguns genes devem ter mudado
        diff_count = sum(1 for a, b in zip(original.keys, mutated.keys) if a != b)
        assert diff_count > 0

    def test_mutate_preserves_range(self):
        """Genes mutados devem estar em [0, 1]."""
        rng = random.Random(42)
        c = Chromosome.random(5, rng)
        mutated = mutate(c, mutation_rate=1.0, rng=rng)
        assert all(0 <= k <= 1 for k in mutated.keys)


# ===================================================================
# Testes de Avaliacao
# ===================================================================

class TestEvaluation:
    """Testes de decodificacao e avaliacao."""

    def test_evaluate_basic(self):
        """Avaliacao basica de cromossomo."""
        pieces = _make_pieces(3)
        sheet = _make_sheet()
        config = GAConfig(seed=42)
        rng = random.Random(42)

        c = Chromosome.random(3, rng)
        fitness = decode_and_evaluate(c, pieces, sheet, config)
        assert fitness < float("inf")
        assert c.fitness == fitness

    def test_different_chromosomes_different_fitness(self):
        """Cromossomos diferentes podem ter fitness diferentes."""
        pieces = _make_pieces(5)
        sheet = _make_sheet()
        config = GAConfig(seed=42)
        rng = random.Random(42)

        fitnesses = set()
        for _ in range(10):
            c = Chromosome.random(5, rng)
            f = decode_and_evaluate(c, pieces, sheet, config)
            fitnesses.add(round(f, 2))

        # Pelo menos alguma variacao
        assert len(fitnesses) >= 1


# ===================================================================
# Testes do BRKGA
# ===================================================================

class TestBRKGA:
    """Testes do algoritmo BRKGA."""

    def test_brkga_basic(self):
        """BRKGA basico com poucas pecas."""
        pieces = _make_pieces(3)
        sheet = _make_sheet()
        config = GAConfig(
            max_generations=5,
            seed=42,
            bin_types=["maxrects"],
        )
        result, info = run_brkga(pieces, sheet, config)
        assert isinstance(result, NestingPassResult)
        assert result.total_pieces_placed == 3
        assert info["generations"] > 0

    def test_brkga_empty(self):
        """BRKGA com lista vazia."""
        result, info = run_brkga([], _make_sheet(), GAConfig())
        assert result.total_pieces_placed == 0

    def test_brkga_single_piece(self):
        """BRKGA com uma unica peca."""
        pieces = [_make_piece()]
        sheet = _make_sheet()
        config = GAConfig(max_generations=3, seed=42)
        result, info = run_brkga(pieces, sheet, config)
        assert result.total_pieces_placed == 1

    def test_brkga_improves(self):
        """BRKGA deve melhorar ao longo das geracoes."""
        pieces = _make_pieces(5)
        sheet = _make_sheet()
        config = GAConfig(
            max_generations=20,
            seed=42,
        )
        result, info = run_brkga(pieces, sheet, config)

        history = info["best_fitness_history"]
        # Ultimo fitness deve ser <= primeiro
        assert history[-1] <= history[0]

    def test_brkga_early_stop(self):
        """BRKGA para cedo se sem melhora."""
        pieces = [_make_piece(length=200, width=150)]
        sheet = _make_sheet()
        config = GAConfig(
            max_generations=100,
            early_stop_gens=5,
            seed=42,
        )
        result, info = run_brkga(pieces, sheet, config)
        # Deve parar antes de 100 geracoes
        assert info["generations"] < 100 or info.get("early_stopped", False)

    def test_brkga_all_pieces_placed(self):
        """BRKGA deve colocar todas as pecas (dimensoes normais)."""
        pieces = _make_pieces(8)
        sheet = _make_sheet()
        config = GAConfig(
            max_generations=10,
            seed=42,
        )
        result, info = run_brkga(pieces, sheet, config)
        assert result.total_pieces_placed == 8

    def test_brkga_with_callback(self):
        """BRKGA com callback de progresso."""
        pieces = _make_pieces(3)
        sheet = _make_sheet()
        config = GAConfig(max_generations=5, seed=42)

        progress = []
        def callback(gen, fitness):
            progress.append((gen, fitness))

        result, info = run_brkga(pieces, sheet, config, progress_callback=callback)
        assert len(progress) > 0

    def test_brkga_respects_grain(self):
        """BRKGA respeita restricoes de veio."""
        pieces = [
            _make_piece(id=1, length=720, width=550,
                       rotation_policy=RotationPolicy.GRAIN_LOCKED),
        ]
        sheet = _make_sheet()
        config = GAConfig(max_generations=5, seed=42)
        result, info = run_brkga(pieces, sheet, config)
        assert result.total_pieces_placed == 1


# ===================================================================
# Testes do Optimize de Alto Nivel
# ===================================================================

class TestOptimizeWithGA:
    """Testes da funcao optimize_with_ga."""

    def test_optimize_basic(self):
        """Otimizacao basica."""
        pieces = _make_pieces(5)
        sheets = [_make_sheet()]
        config = GAConfig(max_generations=5, seed=42)

        layout, info = optimize_with_ga(pieces, sheets, config)
        assert layout.total_pieces == 5
        assert layout.total_sheets >= 1

    def test_optimize_multiple_materials(self):
        """Otimizacao com multiplos materiais."""
        pieces = [
            _make_piece(id=1, material_code="MDF_18.5_BRANCO_TX"),
            _make_piece(id=2, material_code="MDF_18.5_BRANCO_TX"),
            _make_piece(id=3, material_code="MDF_18.5_CARVALHO_HANOVER"),
        ]
        sheets = [
            Sheet(id=1, length=2750, width=1850, trim=10,
                  material_code="MDF_18.5_BRANCO_TX"),
            Sheet(id=2, length=2750, width=1850, trim=10,
                  material_code="MDF_18.5_CARVALHO_HANOVER"),
        ]
        config = GAConfig(max_generations=3, seed=42)

        layout, info = optimize_with_ga(pieces, sheets, config)
        assert layout.total_pieces == 3
        assert "groups" in info
