"""Pipeline de construcao de layout completo.

Orquestra:
1. Agrupar pecas por material
2. Tentar retalhos primeiro
3. Testar multiplas estrategias de ordenacao
4. Ruin & Recreate com LAHC (refinamento iterativo)
5. Last-Bin Optimization (eliminar chapas fracas)
6. Compactar resultados
7. Selecionar melhor solucao
8. Detectar retalhos aproveitaveis na sobra
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Optional

from app.core.domain.models import (
    Piece, Sheet, Placement, Remnant, SheetLayout, LayoutResult,
)
from app.core.domain.enums import (
    NestingHeuristic, RotationPolicy,
)
from app.core.domain.materials import group_pieces_by_material
from app.core.nesting.part_ordering import (
    sort_pieces, get_strategy_names, expand_pieces_by_quantity,
    STRATEGIES, TIERED_STRATEGIES,
)
from app.core.nesting.placement import (
    run_nesting_pass, run_fill_first,
    score_nesting_result, verify_no_overlaps,
    compact_bin, minimum_theoretical_sheets,
    maximum_theoretical_occupancy,
    BinResult, NestingPassResult,
)


# ---------------------------------------------------------------------------
# Configuracao do builder
# ---------------------------------------------------------------------------

@dataclass
class NestingConfig:
    """Configuracao para o nesting."""
    spacing: float = 7.0             # Espacamento entre pecas (mm)
    kerf: float = 4.0                # Largura do disco (mm)
    allow_rotation: bool = True      # Permitir rotacao
    vacuum_aware: bool = True        # Considerar vacuo
    try_remnants: bool = True        # Tentar retalhos primeiro
    min_remnant_width: float = 300   # Largura minima de retalho util (mm)
    min_remnant_length: float = 600  # Comprimento minimo de retalho util (mm)
    max_combinations: int = 300      # Limite de combinacoes a testar
    compact_passes: int = 15         # Passes de compactacao
    rr_iterations: int = 800         # Iteracoes Ruin & Recreate
    rr_window_size: int = 80         # Tamanho da janela LAHC
    bin_types: list[str] = field(default_factory=lambda: ["maxrects", "guillotine", "shelf"])
    split_direction: str = "auto"  # auto, horizontal, vertical (para guillotine)
    heuristics: list[NestingHeuristic] = field(
        default_factory=lambda: list(NestingHeuristic)
    )
    strategies: list[str] = field(default_factory=list)  # vazio = todas

    # Classificacao de pecas (thresholds em mm, menor dimensao)
    small_piece_threshold: float = 400       # < 400mm = pequena
    very_small_piece_threshold: float = 200  # < 200mm = super_pequena

    # Pesos do score industrial
    remnant_weight: float = 1.0   # Peso do bonus de sobra reutilizavel (0=off)
    vacuum_weight: float = 0.5    # Peso da penalidade de vacuo (0=off)


# ---------------------------------------------------------------------------
# Resultado intermediario por grupo de material
# ---------------------------------------------------------------------------

@dataclass
class MaterialGroupResult:
    """Resultado de nesting para um grupo de material."""
    material_code: str = ""
    pieces: list[Piece] = field(default_factory=list)
    sheet: Sheet | None = None
    best_result: NestingPassResult | None = None
    combinations_tested: int = 0
    min_theoretical: int = 0
    max_theoretical_occ: float = 0
    remnants_used: list[Remnant] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Layout Builder
# ---------------------------------------------------------------------------

class LayoutBuilder:
    """Construtor de layout que testa multiplas combinacoes.

    Fluxo:
    1. Expandir pecas por quantidade
    2. Agrupar por material_code
    3. Para cada grupo: tentar retalhos → testar estrategias
    4. Selecionar melhor resultado global
    """

    def __init__(self, config: NestingConfig | None = None):
        """Inicializar com configuracao.

        Args:
            config: Configuracao de nesting. None = padrao.
        """
        self.config = config or NestingConfig()
        self.decisions_log: list[dict] = []  # Log de decisoes do engine

    def build_layout(
        self,
        pieces: list[Piece],
        sheets: list[Sheet],
        remnants: list[Remnant] | None = None,
    ) -> LayoutResult:
        """Construir layout completo para todas as pecas.

        Args:
            pieces: Pecas a posicionar (podem ter quantity > 1)
            sheets: Chapas disponiveis (por material)
            remnants: Retalhos disponiveis

        Returns:
            LayoutResult com melhor layout encontrado
        """
        remnants = remnants or []

        # 1. Expandir pecas por quantidade
        expanded = expand_pieces_by_quantity(pieces)

        # 2. Agrupar por material
        groups = group_pieces_by_material(expanded)

        # 3. Processar cada grupo
        all_sheet_layouts: list[SheetLayout] = []
        total_pieces = 0
        sheet_index_offset = 0

        for material_code, group_pieces in groups.items():
            # Encontrar chapa para este material
            sheet = self._find_sheet_for_material(material_code, sheets)
            if sheet is None:
                continue

            # Encontrar retalhos para este material
            group_remnants = [
                r for r in remnants
                if r.material_code == material_code and r.available
            ]

            # Processar grupo
            group_result = self._process_material_group(
                group_pieces, sheet, group_remnants
            )

            # Converter para SheetLayouts
            if group_result.best_result:
                for b in group_result.best_result.bins:
                    # Ajustar sheet_index global
                    adjusted_placements = []
                    for p in b.placements:
                        p_copy = p.model_copy()
                        p_copy.sheet_index = sheet_index_offset + b.index
                        adjusted_placements.append(p_copy)

                    sl = SheetLayout(
                        index=sheet_index_offset + b.index,
                        sheet=sheet,
                        placements=adjusted_placements,
                        occupancy=b.occupancy,
                        piece_count=len(adjusted_placements),
                        kerf=self.config.kerf,
                        trim=sheet.trim,
                        cuts=getattr(b, 'cuts', []),
                    )
                    all_sheet_layouts.append(sl)

                n_bins = len(group_result.best_result.bins)
                sheet_index_offset += n_bins
                total_pieces += group_result.best_result.total_pieces_placed

        # 4. Calcular estatisticas globais
        occupancies = [sl.occupancy for sl in all_sheet_layouts]
        avg_occ = sum(occupancies) / len(occupancies) if occupancies else 0
        min_occ = min(occupancies) if occupancies else 0
        max_occ = max(occupancies) if occupancies else 0

        return LayoutResult(
            sheets=all_sheet_layouts,
            total_sheets=len(all_sheet_layouts),
            total_pieces=total_pieces,
            avg_occupancy=avg_occ,
            min_occupancy=min_occ,
            max_occupancy=max_occ,
            score=sum(
                score_nesting_result(
                    [BinResult(occupancy=sl.occupancy)]
                )
                for sl in all_sheet_layouts
            ) if all_sheet_layouts else float("inf"),
            score_details={
                "decisions_log": self.decisions_log,
                "config": {
                    "remnant_weight": self.config.remnant_weight,
                    "vacuum_weight": self.config.vacuum_weight,
                    "small_piece_threshold": self.config.small_piece_threshold,
                    "very_small_piece_threshold": self.config.very_small_piece_threshold,
                },
            },
        )

    def _adapt_config_for_profile(self, n_pieces: int, gap: int) -> None:
        """Adaptar configuracao baseado no perfil do lote e gap teorico.

        Estrategia adaptativa:
        - Poucos pecas (<=15): busca profunda (mais iteracoes)
        - Medio (16-50): padrao
        - Muitas (>50): heuristica rapida + refinamento nas chapas ruins
        - Gap alto (>2): investir mais iteracoes
        - Gap baixo (<=1): resultado ja proximo do otimo, economizar

        Args:
            n_pieces: Numero de pecas no grupo
            gap: Diferenca entre chapas atuais e minimo teorico
        """
        # Perfil por tamanho do lote
        if n_pieces <= 15:
            # Busca profunda para lotes pequenos
            self.config.rr_iterations = max(self.config.rr_iterations, 1500)
            self.config.max_combinations = max(self.config.max_combinations, 500)
        elif n_pieces > 50:
            # Heuristica rapida para lotes grandes
            self.config.rr_iterations = min(self.config.rr_iterations, 500)
            self.config.max_combinations = min(self.config.max_combinations, 200)

        # Ajuste por gap teorico
        if gap >= 3:
            # Gap grande: investir muito mais
            self.config.rr_iterations = int(self.config.rr_iterations * 1.5)
        elif gap <= 1:
            # Gap pequeno: resultado ja bom, economizar
            self.config.rr_iterations = max(200, int(self.config.rr_iterations * 0.6))

    def _process_material_group(
        self,
        pieces: list[Piece],
        sheet: Sheet,
        remnants: list[Remnant],
    ) -> MaterialGroupResult:
        """Processar um grupo de material.

        Pipeline completo:
        A. Tentar retalhos
        B. Adaptar config pelo perfil do lote
        C. Busca inicial (estrategias x bin_types x heuristicas)
        D. Ruin & Recreate com LAHC (refinamento iterativo)
        E. Last-Bin Optimization (eliminar chapas fracas)
        F. Global repacking das 2-3 chapas mais fracas
        G. Compactacao final

        Args:
            pieces: Pecas do grupo (ja expandidas)
            sheet: Chapa para este material
            remnants: Retalhos disponiveis

        Returns:
            MaterialGroupResult com melhor resultado
        """
        result = MaterialGroupResult(
            material_code=pieces[0].material_code if pieces else "",
            pieces=pieces,
            sheet=sheet,
            min_theoretical=minimum_theoretical_sheets(pieces, sheet),
        )
        result.max_theoretical_occ = maximum_theoretical_occupancy(
            pieces, sheet, result.min_theoretical
        )

        remaining_pieces = list(pieces)
        remnants_used: list[Remnant] = []

        # A. Tentar retalhos primeiro
        if self.config.try_remnants and remnants:
            remaining_pieces, remnants_used = self._try_remnants(
                remaining_pieces, remnants, sheet
            )
            result.remnants_used = remnants_used

        if not remaining_pieces:
            result.best_result = NestingPassResult(
                bins=[], total_pieces_placed=len(pieces),
                avg_occupancy=100, score=0,
            )
            return result

        sw = sheet.usable_length
        sh = sheet.usable_width

        # B. Busca inicial — testar combinacoes de estrategia+heuristica+bin
        best = self._initial_search(remaining_pieces, sheet)
        combinations = getattr(best, '_combinations', 0) if best else 0

        if best:
            self.decisions_log.append({
                "phase": "initial_search",
                "material": result.material_code,
                "strategy": best.strategy,
                "bins": len(best.bins),
                "score": round(best.score, 2),
                "avg_occ": round(best.avg_occupancy, 1),
            })

        # B2. Adaptar config baseado no perfil do lote e gap
        current_bins = len(best.bins) if best and best.bins else len(remaining_pieces)
        gap = current_bins - result.min_theoretical
        self._adapt_config_for_profile(len(remaining_pieces), gap)

        self.decisions_log.append({
            "phase": "adaptive_config",
            "n_pieces": len(remaining_pieces),
            "min_theoretical": result.min_theoretical,
            "current_bins": current_bins,
            "gap": gap,
            "rr_iterations": self.config.rr_iterations,
            "max_combinations": self.config.max_combinations,
        })

        # C. Ruin & Recreate com LAHC — refinamento iterativo
        if len(remaining_pieces) > 3:
            rr_result = self._ruin_and_recreate(remaining_pieces, sheet)
            if rr_result:
                rr_chose = False
                if best is None or rr_result.score < best.score:
                    rr_chose = True
                    best = rr_result
                self.decisions_log.append({
                    "phase": "ruin_recreate",
                    "strategy": rr_result.strategy,
                    "bins": len(rr_result.bins),
                    "score": round(rr_result.score, 2),
                    "avg_occ": round(rr_result.avg_occupancy, 1),
                    "chosen": rr_chose,
                })

        # D. Last-Bin Optimization — eliminar chapas fracas
        if best and best.bins and len(best.bins) > 1:
            optimized_bins = self._optimize_last_bin(best.bins, sheet)
            if optimized_bins is not None:
                opt_score = score_nesting_result(
                    optimized_bins, sw, sh,
                    self.config.remnant_weight, self.config.vacuum_weight,
                    self.config.min_remnant_width, self.config.min_remnant_length,
                )
                if opt_score < best.score:
                    total_placed = sum(len(b.placements) for b in optimized_bins)
                    avg_occ = (
                        sum(b.occupancy for b in optimized_bins) / len(optimized_bins)
                        if optimized_bins else 0
                    )
                    best = NestingPassResult(
                        bins=optimized_bins,
                        total_pieces_placed=total_placed,
                        avg_occupancy=avg_occ,
                        score=opt_score,
                        strategy="last_bin_opt",
                    )
                    self.decisions_log.append({
                        "phase": "last_bin_opt",
                        "bins_before": len(best.bins) + 1,
                        "bins_after": len(optimized_bins),
                        "score": round(opt_score, 2),
                    })

        # E. Global repacking das 2-3 chapas mais fracas
        if best and best.bins and len(best.bins) >= 3:
            repacked = self._repack_weakest_bins(best.bins, sheet)
            if repacked is not None:
                rep_score = score_nesting_result(
                    repacked, sw, sh,
                    self.config.remnant_weight, self.config.vacuum_weight,
                    self.config.min_remnant_width, self.config.min_remnant_length,
                )
                if rep_score < best.score:
                    total_placed = sum(len(b.placements) for b in repacked)
                    avg_occ = (
                        sum(b.occupancy for b in repacked) / len(repacked)
                        if repacked else 0
                    )
                    self.decisions_log.append({
                        "phase": "global_repack",
                        "bins_before": len(best.bins),
                        "bins_after": len(repacked),
                        "score": round(rep_score, 2),
                    })
                    best = NestingPassResult(
                        bins=repacked,
                        total_pieces_placed=total_placed,
                        avg_occupancy=avg_occ,
                        score=rep_score,
                        strategy="global_repack",
                    )

        # F. Compactar melhor resultado
        # Pular compactacao para guillotine — strip layout ja e otimo
        # e compactacao quebraria alinhamento de faixas (cortes invalidos)
        is_guillotine_only = self.config.bin_types == ["guillotine"]
        if best and best.bins and not is_guillotine_only:
            compacted_bins = []
            for b in best.bins:
                compacted = compact_bin(b, sheet, self.config.compact_passes)
                compacted_bins.append(compacted)
            best.bins = compacted_bins
            # Recalcular score apos compactacao
            best.score = score_nesting_result(
                best.bins, sw, sh,
                self.config.remnant_weight, self.config.vacuum_weight,
                self.config.min_remnant_width, self.config.min_remnant_length,
            )

        if best:
            self.decisions_log.append({
                "phase": "final_choice",
                "material": result.material_code,
                "strategy": best.strategy,
                "bins": len(best.bins),
                "score": round(best.score, 2),
                "avg_occ": round(best.avg_occupancy, 1),
                "pieces": best.total_pieces_placed,
                "min_theoretical": result.min_theoretical,
                "gap": len(best.bins) - result.min_theoretical,
            })

        result.best_result = best
        result.combinations_tested = combinations

        return result

    # ------------------------------------------------------------------
    # B. Busca inicial
    # ------------------------------------------------------------------

    def _score_kwargs(self) -> dict:
        """Retornar kwargs de score para run_nesting_pass/run_fill_first."""
        return {
            "remnant_weight": self.config.remnant_weight,
            "vacuum_weight": self.config.vacuum_weight,
            "min_remnant_w": self.config.min_remnant_width,
            "min_remnant_l": self.config.min_remnant_length,
            "split_direction": self.config.split_direction,
        }

    def _initial_search(
        self, pieces: list[Piece], sheet: Sheet
    ) -> Optional[NestingPassResult]:
        """Testar combinacoes de estrategia + heuristica + bin_type."""
        best: Optional[NestingPassResult] = None
        combinations = 0
        sk = self._score_kwargs()

        strategy_names = self.config.strategies or list(STRATEGIES.keys())
        tiered_names = list(TIERED_STRATEGIES.keys())

        for strategy in strategy_names:
            if combinations >= self.config.max_combinations:
                break

            sorted_pieces = sort_pieces(pieces, strategy)

            for bin_type in self.config.bin_types:
                if combinations >= self.config.max_combinations:
                    break

                for heuristic in self.config.heuristics:
                    if combinations >= self.config.max_combinations:
                        break

                    nesting_result = run_nesting_pass(
                        sorted_pieces, sheet,
                        bin_type=bin_type,
                        heuristic=heuristic,
                        spacing=self.config.spacing,
                        allow_rotation=self.config.allow_rotation,
                        vacuum_aware=self.config.vacuum_aware,
                        **sk,
                    )
                    nesting_result.strategy = strategy
                    combinations += 1

                    if best is None or nesting_result.score < best.score:
                        if verify_no_overlaps(nesting_result.bins):
                            best = nesting_result

                    # Fill-first
                    if combinations < self.config.max_combinations:
                        ff_result = run_fill_first(
                            sorted_pieces, sheet,
                            bin_type=bin_type,
                            spacing=self.config.spacing,
                            allow_rotation=self.config.allow_rotation,
                            vacuum_aware=self.config.vacuum_aware,
                            **sk,
                        )
                        ff_result.strategy = f"{strategy}_fill_first"
                        combinations += 1

                        if best is None or ff_result.score < best.score:
                            if verify_no_overlaps(ff_result.bins):
                                best = ff_result

        # Tiered strategies
        for tiered in tiered_names:
            if combinations >= self.config.max_combinations:
                break

            sorted_pieces = sort_pieces(pieces, tiered)

            for bin_type in self.config.bin_types[:2]:
                for heuristic in self.config.heuristics[:3]:
                    if combinations >= self.config.max_combinations:
                        break

                    nesting_result = run_nesting_pass(
                        sorted_pieces, sheet,
                        bin_type=bin_type,
                        heuristic=heuristic,
                        spacing=self.config.spacing,
                        allow_rotation=self.config.allow_rotation,
                        vacuum_aware=self.config.vacuum_aware,
                        **sk,
                    )
                    nesting_result.strategy = tiered
                    combinations += 1

                    if best is None or nesting_result.score < best.score:
                        if verify_no_overlaps(nesting_result.bins):
                            best = nesting_result

        return best

    # ------------------------------------------------------------------
    # C. Ruin & Recreate com LAHC
    # ------------------------------------------------------------------

    def _ruin_and_recreate(
        self, pieces: list[Piece], sheet: Sheet
    ) -> Optional[NestingPassResult]:
        """Ruin & Recreate com Late Acceptance Hill Climbing.

        Port do JS ruinAndRecreate() — 8 estrategias de perturbacao,
        LAHC com simulated annealing hibrido.

        Args:
            pieces: Pecas a otimizar
            sheet: Chapa modelo

        Returns:
            Melhor NestingPassResult encontrado ou None
        """
        heuristics = list(NestingHeuristic)
        max_iter = self.config.rr_iterations
        window_size = self.config.rr_window_size
        sk = self._score_kwargs()

        # --- Seed: testar todas as ordenacoes x heuristicas para seed inicial ---
        sort_fns = [
            ("area_desc", lambda p: -(p.length * p.width)),
            ("area_asc", lambda p: p.length * p.width),
            ("perim_desc", lambda p: -(2 * (p.length + p.width))),
            ("max_side_desc", lambda p: -max(p.length, p.width)),
            ("max_side_asc", lambda p: max(p.length, p.width)),
            ("diff_desc", lambda p: -abs(p.length - p.width)),
            ("height_desc", lambda p: (-p.width, -p.length)),
            ("width_desc", lambda p: (-p.length, -p.width)),
            ("aspect_ratio", lambda p: -(min(p.length, p.width) / max(p.length, p.width)) if max(p.length, p.width) > 0 else 0),
            ("diagonal_desc", lambda p: -math.sqrt(p.length**2 + p.width**2)),
            ("min_side_desc", lambda p: -min(p.length, p.width)),
        ]

        best_result: Optional[NestingPassResult] = None
        best_score = float("inf")

        # Usar bin_types configurados (respeitar modo guilhotina)
        seed_bin_types = self.config.bin_types

        for sort_name, sort_key in sort_fns:
            sorted_p = sorted(pieces, key=sort_key)
            for bt in seed_bin_types:
                for h in heuristics:
                    # Nesting pass normal
                    r = run_nesting_pass(
                        sorted_p, sheet, bin_type=bt,
                        heuristic=h, spacing=self.config.spacing,
                        allow_rotation=self.config.allow_rotation,
                        vacuum_aware=self.config.vacuum_aware,
                        **sk,
                    )
                    if r.score < best_score and verify_no_overlaps(r.bins):
                        best_score = r.score
                        best_result = r
                        best_result.strategy = f"rr_seed_{sort_name}_{bt}"

                    # Fill-first
                    ff = run_fill_first(
                        sorted_p, sheet, bin_type=bt,
                        spacing=self.config.spacing,
                        allow_rotation=self.config.allow_rotation,
                        vacuum_aware=self.config.vacuum_aware,
                        **sk,
                    )
                    if ff.score < best_score and verify_no_overlaps(ff.bins):
                        best_score = ff.score
                        best_result = ff
                        best_result.strategy = f"rr_seed_{sort_name}_{bt}_ff"

        if best_result is None:
            return None

        # --- Pool de solucoes elite (top 5) ---
        elite_pool: list[tuple[float, NestingPassResult]] = [
            (best_score, best_result)
        ]
        ELITE_SIZE = 5

        def _add_to_elite(score: float, result: NestingPassResult):
            """Adicionar solucao ao pool elite se for boa o suficiente."""
            nonlocal elite_pool
            # Evitar duplicatas exatas (mesmo score)
            for es, _ in elite_pool:
                if abs(es - score) < 0.01:
                    return
            elite_pool.append((score, result))
            elite_pool.sort(key=lambda x: x[0])
            if len(elite_pool) > ELITE_SIZE:
                elite_pool = elite_pool[:ELITE_SIZE]

        # --- LAHC loop ---
        lahc_window = [best_score] * window_size
        no_improve_count = 0
        max_no_improve = min(int(max_iter * 0.75), 400)
        temperature = best_score * 0.12
        cooling_rate = 0.996

        bin_types_cycle = self.config.bin_types  # ["maxrects", "guillotine", "shelf"]
        top_heuristics = [
            NestingHeuristic.BSSF, NestingHeuristic.BAF,
            NestingHeuristic.BLSF,
        ]

        # Peso para perturbacoes mais direcionadas (LNS)
        # worst_bin_remove e random_redistribute tem peso maior
        directed_perturbations = [0, 1, 1, 2, 3, 4, 6, 7]  # indice de _perturb_pieces

        for iteration in range(max_iter):
            temperature *= cooling_rate

            # LNS direcionado: quando sem melhora, focar em chapas fracas
            if no_improve_count > max_no_improve * 0.3:
                # Usar perturbacao mais agressiva (worst_bin/redistribute)
                pert_override = directed_perturbations[iteration % len(directed_perturbations)]
                reconstructed = self._perturb_pieces_directed(
                    pieces, iteration, no_improve_count, max_no_improve, sheet,
                    force_type=pert_override
                )
            else:
                reconstructed = self._perturb_pieces(
                    pieces, iteration, no_improve_count, max_no_improve, sheet
                )

            # Ciclar bin_type a cada iteracao para diversidade
            bt = bin_types_cycle[iteration % len(bin_types_cycle)]

            iter_best_score = float("inf")
            iter_best: Optional[NestingPassResult] = None

            for h in top_heuristics:
                r = run_nesting_pass(
                    reconstructed, sheet,
                    bin_type=bt,
                    heuristic=h,
                    spacing=self.config.spacing,
                    allow_rotation=self.config.allow_rotation,
                    vacuum_aware=self.config.vacuum_aware,
                    **sk,
                )
                if r.score < iter_best_score:
                    iter_best_score = r.score
                    iter_best = r

            # Fill-first (testa todas internamente)
            ff = run_fill_first(
                reconstructed, sheet,
                bin_type=bt,
                spacing=self.config.spacing,
                allow_rotation=self.config.allow_rotation,
                vacuum_aware=self.config.vacuum_aware,
                **sk,
            )
            if ff.score < iter_best_score:
                iter_best_score = ff.score
                iter_best = ff

            if iter_best is None:
                no_improve_count += 1
                continue

            r = iter_best

            # LAHC acceptance
            lahc_idx = iteration % window_size
            delta = r.score - lahc_window[lahc_idx]
            accepted = delta <= 0 or (
                temperature > 0.1 and
                random.random() < math.exp(-delta / max(temperature, 0.1))
            )

            if accepted:
                lahc_window[lahc_idx] = r.score
                if r.score < best_score and verify_no_overlaps(r.bins):
                    best_score = r.score
                    best_result = r
                    best_result.strategy = f"rr_iter_{iteration}_{bt}"
                    no_improve_count = 0
                    _add_to_elite(r.score, r)
                else:
                    no_improve_count += 1
                    # Adicionar ao pool elite mesmo que nao seja o melhor global
                    if verify_no_overlaps(r.bins):
                        _add_to_elite(r.score, r)
            else:
                no_improve_count += 1

            # Recombinacao de elite pool a cada 50 iteracoes sem melhora
            if no_improve_count > 0 and no_improve_count % 50 == 0 and len(elite_pool) >= 2:
                recomb = self._recombine_elite(elite_pool, pieces, sheet, sk)
                if recomb and recomb.score < best_score and verify_no_overlaps(recomb.bins):
                    best_score = recomb.score
                    best_result = recomb
                    best_result.strategy = f"rr_recomb_{iteration}"
                    no_improve_count = 0
                    _add_to_elite(recomb.score, recomb)

            if no_improve_count >= max_no_improve:
                break

        return best_result

    def _perturb_pieces_directed(
        self,
        pieces: list[Piece],
        iteration: int,
        no_improve: int,
        max_no_improve: int,
        sheet: Sheet,
        force_type: int = 0,
    ) -> list[Piece]:
        """Perturbacao direcionada com tipo forcado.

        Igual a _perturb_pieces mas permite forcar o tipo de perturbacao
        para direcionar a busca quando sem melhora.
        """
        # Salvar iteration original e forcar o tipo
        fake_iteration = force_type  # _perturb_pieces usa iteration % 8
        return self._perturb_pieces(
            pieces, fake_iteration, no_improve, max_no_improve, sheet
        )

    def _recombine_elite(
        self,
        elite_pool: list[tuple[float, NestingPassResult]],
        pieces: list[Piece],
        sheet: Sheet,
        sk: dict,
    ) -> Optional[NestingPassResult]:
        """Recombinar solucoes do pool elite.

        Pega a ordenacao de pecas de uma solucao elite e tenta
        reempacotar com diferentes bin_types/heuristicas.
        Inspirado em path relinking de GRASP.

        Returns:
            Melhor resultado encontrado ou None
        """
        best: Optional[NestingPassResult] = None
        best_score = float("inf")

        for _, elite_result in elite_pool[:3]:
            if not elite_result.bins:
                continue

            # Extrair ordenacao das pecas da solucao elite
            elite_order: list[Piece] = []
            for b in elite_result.bins:
                elite_order.extend(self._extract_pieces_from_bin(b))

            if len(elite_order) != len(pieces):
                continue  # Skip se contagem nao bate

            # Tentar com bin types configurados
            for bt in self.config.bin_types:
                ff = run_fill_first(
                    elite_order, sheet,
                    bin_type=bt,
                    spacing=self.config.spacing,
                    allow_rotation=self.config.allow_rotation,
                    vacuum_aware=self.config.vacuum_aware,
                    **sk,
                )
                if ff.score < best_score:
                    best_score = ff.score
                    best = ff

            # Perturbar levemente a ordem elite e tentar
            shuffled = list(elite_order)
            swaps = max(1, len(shuffled) // 10)
            for _ in range(swaps):
                i = random.randint(0, len(shuffled) - 1)
                j = random.randint(0, len(shuffled) - 1)
                shuffled[i], shuffled[j] = shuffled[j], shuffled[i]

            for bt in self.config.bin_types:
                ff = run_fill_first(
                    shuffled, sheet,
                    bin_type=bt,
                    spacing=self.config.spacing,
                    allow_rotation=self.config.allow_rotation,
                    vacuum_aware=self.config.vacuum_aware,
                    **sk,
                )
                if ff.score < best_score:
                    best_score = ff.score
                    best = ff

        return best

    def _perturb_pieces(
        self,
        pieces: list[Piece],
        iteration: int,
        no_improve: int,
        max_no_improve: int,
        sheet: Sheet,
    ) -> list[Piece]:
        """Gerar perturbacao das pecas (8 estrategias).

        Port das 8 perturbacoes do JS ruinAndRecreate().

        Args:
            pieces: Pecas originais
            iteration: Numero da iteracao
            no_improve: Contador de iteracoes sem melhora
            max_no_improve: Maximo sem melhora
            sheet: Chapa (para width-matching)

        Returns:
            Lista de pecas reordenada
        """
        pert_type = iteration % 8
        n = len(pieces)

        if pert_type == 0:
            # Random ruin — remover % aleatoria e re-inserir
            base_pct = 0.35 if no_improve > max_no_improve * 0.5 else 0.15
            ruin_pct = base_pct + random.random() * 0.25
            num_r = max(1, int(n * ruin_pct))
            shuffled = list(pieces)
            random.shuffle(shuffled)
            kept = sorted(shuffled[num_r:], key=lambda p: p.length * p.width, reverse=True)
            ruined = sorted(shuffled[:num_r], key=lambda p: p.length * p.width, reverse=True)
            return kept + ruined

        elif pert_type == 1:
            # Small-piece separation — separar menores
            by_area = sorted(pieces, key=lambda p: p.length * p.width)
            num_r = max(1, int(n * 0.25))
            large = sorted(by_area[num_r:], key=lambda p: p.length * p.width, reverse=True)
            small = sorted(by_area[:num_r], key=lambda p: p.length * p.width, reverse=True)
            return large + small

        elif pert_type == 2:
            # Random swaps sobre area desc
            result = sorted(pieces, key=lambda p: p.length * p.width, reverse=True)
            swaps = max(1, int(random.random() * min(5, n // 2)))
            result = list(result)
            for _ in range(swaps):
                i = random.randint(0, n - 1)
                j = random.randint(0, n - 1)
                result[i], result[j] = result[j], result[i]
            return result

        elif pert_type == 3:
            # Height separation
            shuffled = list(pieces)
            random.shuffle(shuffled)
            num_r = max(1, int(n * 0.2))
            kept = sorted(shuffled[num_r:], key=lambda p: p.width, reverse=True)
            ruined = sorted(shuffled[:num_r], key=lambda p: p.width, reverse=True)
            return kept + ruined

        elif pert_type == 4:
            # Interleaving: alternar grande e pequeno
            by_area = sorted(pieces, key=lambda p: p.length * p.width, reverse=True)
            result = []
            lo, hi = 0, len(by_area) - 1
            while lo <= hi:
                result.append(by_area[lo])
                lo += 1
                if lo <= hi:
                    result.append(by_area[hi])
                    hi -= 1
            return result

        elif pert_type == 5:
            # Width separation
            shuffled = list(pieces)
            random.shuffle(shuffled)
            num_r = max(1, int(n * 0.2))
            kept = sorted(shuffled[num_r:], key=lambda p: p.length, reverse=True)
            ruined = sorted(shuffled[:num_r], key=lambda p: p.length, reverse=True)
            return kept + ruined

        elif pert_type == 6:
            # Width-matching: emparejar pecas que somam ~largura da chapa
            by_width = sorted(pieces, key=lambda p: p.length, reverse=True)
            used = set()
            result = []
            bin_w = sheet.usable_length
            for i in range(len(by_width)):
                if i in used:
                    continue
                result.append(by_width[i])
                used.add(i)
                remaining = bin_w - by_width[i].length
                best_j = -1
                best_diff = float("inf")
                for j in range(i + 1, len(by_width)):
                    if j in used:
                        continue
                    d = abs(by_width[j].length - remaining)
                    if d < best_diff:
                        best_diff = d
                        best_j = j
                if best_j >= 0 and best_diff < bin_w * 0.3:
                    result.append(by_width[best_j])
                    used.add(best_j)
            return result

        else:
            # Block extraction: extrair bloco aleatorio e reposicionar
            sort_fns = [
                lambda p: -(p.length * p.width),
                lambda p: -max(p.length, p.width),
                lambda p: -p.width,
                lambda p: -p.length,
                lambda p: -(2 * (p.length + p.width)),
            ]
            sort_key = sort_fns[iteration % len(sort_fns)]
            by_sort = sorted(pieces, key=sort_key)
            start = random.randint(0, n - 1)
            block_size = max(2, int(n * 0.15 + random.random() * n * 0.20))
            block = []
            rest = list(by_sort)
            for _ in range(min(block_size, len(rest))):
                idx = start % len(rest)
                block.append(rest.pop(idx))
            random.shuffle(block)
            return rest + block

    # ------------------------------------------------------------------
    # D. Last-Bin Optimization
    # ------------------------------------------------------------------

    def _optimize_last_bin(
        self, bins: list[BinResult], sheet: Sheet
    ) -> Optional[list[BinResult]]:
        """Tentar eliminar a chapa mais fraca redistribuindo pecas.

        Quatro abordagens:
        1. Redistribuir pecas da chapa fraca nas demais (rebuild)
        2. Juntar TODAS as pecas e tentar N-1 chapas (sorting + greedy)
        3. Mini R&R com perturbacoes focando N-1 chapas
        4. Consolidacao de pares de bins

        Args:
            bins: Lista de bins atuais
            sheet: Chapa modelo

        Returns:
            Lista de bins otimizada ou None se nao melhorou
        """
        if len(bins) <= 1:
            return None

        # Multiplas rodadas
        current = list(bins)
        for _round in range(3):
            improved = self._try_eliminate_weak_bin(current, sheet)
            if improved and len(improved) < len(current):
                current = improved
            else:
                break

        return current if len(current) < len(bins) else None

    def _try_eliminate_weak_bin(
        self, bins: list[BinResult], sheet: Sheet
    ) -> Optional[list[BinResult]]:
        """Tentar eliminar a chapa com menor aproveitamento.

        Quatro abordagens:
        1. Rebuild: reconstruir bin forte + pecas fracas em 1 bin
        2. Global sort: juntar TODAS as pecas, sorting + greedy em N-1
        3. Mini R&R: perturbacoes aleatorias focando N-1 bins
        4. Pairwise merge: tentar fundir cada par de bins em 1

        Args:
            bins: Lista de bins
            sheet: Chapa modelo

        Returns:
            Lista de bins sem a chapa fraca, ou None
        """
        if len(bins) <= 1:
            return None

        # Encontrar chapa mais fraca
        min_occ = float("inf")
        min_idx = -1
        for i, b in enumerate(bins):
            if b.occupancy < min_occ:
                min_occ = b.occupancy
                min_idx = i

        if min_occ >= 70 or min_idx < 0:
            return None

        weak_pieces = self._extract_pieces_from_bin(bins[min_idx])
        if not weak_pieces:
            return None

        sw = sheet.usable_length
        sh = sheet.usable_width
        original_score = score_nesting_result(
            bins, sw, sh,
            self.config.remnant_weight, self.config.vacuum_weight,
            self.config.min_remnant_width, self.config.min_remnant_length,
        )
        best_result: Optional[list[BinResult]] = None
        best_score = original_score

        sk = self._score_kwargs()

        # --- Abordagem 1: Rebuild cada bin + inserir pecas fracas ---
        other_bins = [b for i, b in enumerate(bins) if i != min_idx]

        for bt in self.config.bin_types:
            rebuilt_all_pieces = []
            for ob in other_bins:
                rebuilt_all_pieces.append(
                    self._extract_pieces_from_bin(ob)
                )

            for target_idx in range(len(rebuilt_all_pieces)):
                combined = (
                    sorted(rebuilt_all_pieces[target_idx],
                           key=lambda p: p.length * p.width, reverse=True)
                    + sorted(weak_pieces,
                             key=lambda p: p.length * p.width, reverse=True)
                )
                test = run_fill_first(
                    combined, sheet,
                    bin_type=bt,
                    spacing=self.config.spacing,
                    allow_rotation=self.config.allow_rotation,
                    vacuum_aware=self.config.vacuum_aware,
                    **sk,
                )
                if len(test.bins) == 1 and verify_no_overlaps(test.bins):
                    new_bins = []
                    for j, ob in enumerate(other_bins):
                        if j == target_idx:
                            new_bins.append(test.bins[0])
                        else:
                            new_bins.append(ob)
                    sc = score_nesting_result(
                        new_bins, sw, sh,
                        self.config.remnant_weight, self.config.vacuum_weight,
                        self.config.min_remnant_width, self.config.min_remnant_length,
                    )
                    if sc < best_score:
                        best_score = sc
                        best_result = new_bins

        # --- Abordagem 2: Juntar TODAS as pecas e tentar N-1 bins ---
        all_pieces: list[Piece] = []
        for b in bins:
            all_pieces.extend(self._extract_pieces_from_bin(b))

        target_count = len(bins) - 1
        total_area = sum(p.length * p.width for p in all_pieces)
        bin_area = sheet.usable_length * sheet.usable_width

        # Relaxar threshold: apenas verificar se area cabe (>100% eh impossivel)
        if total_area <= target_count * bin_area:
            sort_keys = [
                lambda p: -(p.length * p.width),
                lambda p: -max(p.length, p.width),
                lambda p: (-p.width, -p.length),
                lambda p: (-p.length, -p.width),
                lambda p: -(2 * (p.length + p.width)),
                lambda p: -min(p.length, p.width),
                lambda p: -(p.length * p.width) + random.random(),
                # Novas estrategias para emparejar pecas por largura
                lambda p: -min(p.length, p.width),
                lambda p: -(max(p.length, p.width) / max(min(p.length, p.width), 1)),
            ]

            for sort_key in sort_keys:
                sorted_all = sorted(all_pieces, key=sort_key)

                for bt in self.config.bin_types:
                    ff = run_fill_first(
                        sorted_all, sheet,
                        bin_type=bt,
                        spacing=self.config.spacing,
                        allow_rotation=self.config.allow_rotation,
                        vacuum_aware=self.config.vacuum_aware,
                        **sk,
                    )
                    if (len(ff.bins) <= target_count and
                            verify_no_overlaps(ff.bins)):
                        sc = score_nesting_result(
                            ff.bins, sw, sh,
                            self.config.remnant_weight, self.config.vacuum_weight,
                            self.config.min_remnant_width, self.config.min_remnant_length,
                        )
                        if sc < best_score:
                            best_score = sc
                            best_result = ff.bins

                    for h in list(NestingHeuristic)[:5]:
                        np_r = run_nesting_pass(
                            sorted_all, sheet,
                            bin_type=bt,
                            heuristic=h,
                            spacing=self.config.spacing,
                            allow_rotation=self.config.allow_rotation,
                            vacuum_aware=self.config.vacuum_aware,
                            **sk,
                        )
                        if (len(np_r.bins) <= target_count and
                                verify_no_overlaps(np_r.bins)):
                            sc = score_nesting_result(
                                np_r.bins, sw, sh,
                                self.config.remnant_weight, self.config.vacuum_weight,
                                self.config.min_remnant_width, self.config.min_remnant_length,
                            )
                            if sc < best_score:
                                best_score = sc
                                best_result = np_r.bins

            # --- Abordagem 3: Mini R&R com perturbacoes ---
            # Usa as mesmas 8 estrategias do R&R principal mas foca em N-1 bins
            mini_iters = min(500, self.config.rr_iterations)

            for iteration in range(mini_iters):
                perturbed = self._perturb_pieces(
                    all_pieces, iteration, 0, mini_iters, sheet
                )

                bt = self.config.bin_types[iteration % len(self.config.bin_types)]

                ff = run_fill_first(
                    perturbed, sheet,
                    bin_type=bt,
                    spacing=self.config.spacing,
                    allow_rotation=self.config.allow_rotation,
                    vacuum_aware=self.config.vacuum_aware,
                    **sk,
                )
                if (len(ff.bins) <= target_count and
                        verify_no_overlaps(ff.bins)):
                    sc = score_nesting_result(
                        ff.bins, sw, sh,
                        self.config.remnant_weight, self.config.vacuum_weight,
                        self.config.min_remnant_width, self.config.min_remnant_length,
                    )
                    if sc < best_score:
                        best_score = sc
                        best_result = ff.bins

                for h in [NestingHeuristic.BSSF, NestingHeuristic.BAF,
                          NestingHeuristic.BLSF]:
                    np_r = run_nesting_pass(
                        perturbed, sheet,
                        bin_type=bt,
                        heuristic=h,
                        spacing=self.config.spacing,
                        allow_rotation=self.config.allow_rotation,
                        vacuum_aware=self.config.vacuum_aware,
                        **sk,
                    )
                    if (len(np_r.bins) <= target_count and
                            verify_no_overlaps(np_r.bins)):
                        sc = score_nesting_result(
                            np_r.bins, sw, sh,
                            self.config.remnant_weight, self.config.vacuum_weight,
                            self.config.min_remnant_width, self.config.min_remnant_length,
                        )
                        if sc < best_score:
                            best_score = sc
                            best_result = np_r.bins

                # Early exit se ja encontrou solucao com N-1 bins
                if best_result is not None:
                    break

        # --- Abordagem 4: Consolidacao pairwise de bins ---
        # Sempre executar (nao depende de best_result)
        if len(bins) >= 3:
            for i in range(len(bins)):
                for j in range(i + 1, len(bins)):
                    pair_pieces = (
                        self._extract_pieces_from_bin(bins[i])
                        + self._extract_pieces_from_bin(bins[j])
                    )
                    pair_area = sum(p.length * p.width for p in pair_pieces)
                    if pair_area > bin_area:
                        continue

                    merged = False
                    # Sorting + fill-first + nesting_pass
                    sort_fns = [
                        lambda p: -(p.length * p.width),
                        lambda p: -max(p.length, p.width),
                        lambda p: (-p.width, -p.length),
                        lambda p: (-p.length, -p.width),
                        lambda p: -(2 * (p.length + p.width)),
                        lambda p: -min(p.length, p.width),
                        lambda p: -(max(p.length, p.width) / max(min(p.length, p.width), 1)),
                    ]
                    for sort_fn in sort_fns:
                        sorted_pair = sorted(pair_pieces, key=sort_fn)
                        for bt in self.config.bin_types:
                            ff = run_fill_first(
                                sorted_pair, sheet,
                                bin_type=bt,
                                spacing=self.config.spacing,
                                allow_rotation=self.config.allow_rotation,
                                vacuum_aware=self.config.vacuum_aware,
                                **sk,
                            )
                            if (len(ff.bins) == 1 and
                                    verify_no_overlaps(ff.bins)):
                                new_bins = [
                                    b for k, b in enumerate(bins)
                                    if k != i and k != j
                                ]
                                new_bins.append(ff.bins[0])
                                sc = score_nesting_result(
                                    new_bins, sw, sh,
                                    self.config.remnant_weight,
                                    self.config.vacuum_weight,
                                    self.config.min_remnant_width,
                                    self.config.min_remnant_length,
                                )
                                if sc < best_score:
                                    best_score = sc
                                    best_result = new_bins
                                    merged = True

                            for h in list(NestingHeuristic)[:4]:
                                np_r = run_nesting_pass(
                                    sorted_pair, sheet,
                                    bin_type=bt,
                                    heuristic=h,
                                    spacing=self.config.spacing,
                                    allow_rotation=self.config.allow_rotation,
                                    vacuum_aware=self.config.vacuum_aware,
                                    **sk,
                                )
                                if (len(np_r.bins) == 1 and
                                        verify_no_overlaps(np_r.bins)):
                                    new_bins = [
                                        b for k, b in enumerate(bins)
                                        if k != i and k != j
                                    ]
                                    new_bins.append(np_r.bins[0])
                                    sc = score_nesting_result(
                                        new_bins, sw, sh,
                                        self.config.remnant_weight,
                                        self.config.vacuum_weight,
                                        self.config.min_remnant_width,
                                        self.config.min_remnant_length,
                                    )
                                    if sc < best_score:
                                        best_score = sc
                                        best_result = new_bins
                                        merged = True

                    # Mini R&R para pares dificeis (fill > 85%)
                    if not merged and pair_area > bin_area * 0.85:
                        pair_rr_iters = 200
                        for it in range(pair_rr_iters):
                            perturbed = self._perturb_pieces(
                                pair_pieces, it, 0, pair_rr_iters, sheet
                            )
                            bt = self.config.bin_types[it % len(self.config.bin_types)]
                            ff = run_fill_first(
                                perturbed, sheet,
                                bin_type=bt,
                                spacing=self.config.spacing,
                                allow_rotation=self.config.allow_rotation,
                                vacuum_aware=self.config.vacuum_aware,
                                **sk,
                            )
                            if (len(ff.bins) == 1 and
                                    verify_no_overlaps(ff.bins)):
                                new_bins = [
                                    b for k, b in enumerate(bins)
                                    if k != i and k != j
                                ]
                                new_bins.append(ff.bins[0])
                                sc = score_nesting_result(
                                    new_bins, sw, sh,
                                    self.config.remnant_weight,
                                    self.config.vacuum_weight,
                                    self.config.min_remnant_width,
                                    self.config.min_remnant_length,
                                )
                                if sc < best_score:
                                    best_score = sc
                                    best_result = new_bins
                                    merged = True
                                    break

        # --- Abordagem 5: Bipartition — dividir pecas em 2 grupos ---
        # Para cada grupo, tentar empacotar em 1 bin
        if best_result is None and target_count == 2:
            best_result = self._try_bipartition(all_pieces, sheet, sk)
            if best_result is not None:
                sc = score_nesting_result(
                    best_result, sw, sh,
                    self.config.remnant_weight, self.config.vacuum_weight,
                    self.config.min_remnant_width, self.config.min_remnant_length,
                )
                best_score = sc

        return best_result

    # ------------------------------------------------------------------
    # E. Global repacking das chapas mais fracas
    # ------------------------------------------------------------------

    def _repack_weakest_bins(
        self, bins: list[BinResult], sheet: Sheet
    ) -> Optional[list[BinResult]]:
        """Reempacotar as 2-3 chapas com menor ocupacao juntas.

        Pega as chapas mais fracas, extrai todas as pecas, e tenta
        redistribuir em menos bins. Isso frequentemente elimina 1 chapa
        em casos medios.

        Args:
            bins: Lista de bins atuais
            sheet: Chapa modelo

        Returns:
            Lista de bins melhorada ou None
        """
        if len(bins) < 3:
            return None

        sw = sheet.usable_length
        sh = sheet.usable_width
        bin_area = sw * sh
        sk = self._score_kwargs()

        original_score = score_nesting_result(
            bins, sw, sh,
            self.config.remnant_weight, self.config.vacuum_weight,
            self.config.min_remnant_width, self.config.min_remnant_length,
        )
        best_result: Optional[list[BinResult]] = None
        best_score = original_score

        # Ordenar bins por ocupacao (menores primeiro)
        indexed = sorted(enumerate(bins), key=lambda x: x[1].occupancy)

        # Tentar reempacotar os 2 e 3 bins mais fracos
        for n_weak in [2, 3]:
            if n_weak > len(bins) - 1:
                continue  # Precisa sobrar ao menos 1 bin forte

            weak_indices = set(idx for idx, _ in indexed[:n_weak])
            weak_pieces: list[Piece] = []
            for idx in weak_indices:
                weak_pieces.extend(self._extract_pieces_from_bin(bins[idx]))

            if not weak_pieces:
                continue

            total_weak_area = sum(p.length * p.width for p in weak_pieces)
            # Tentar empacotar em (n_weak - 1) bins
            target = n_weak - 1
            if total_weak_area > target * bin_area:
                continue  # Impossivel por area

            strong_bins = [b for i, b in enumerate(bins) if i not in weak_indices]

            # Tentar diferentes ordenacoes
            sort_keys = [
                lambda p: -(p.length * p.width),
                lambda p: -max(p.length, p.width),
                lambda p: (-p.width, -p.length),
                lambda p: (-p.length, -p.width),
                lambda p: -(2 * (p.length + p.width)),
            ]

            for sort_key in sort_keys:
                sorted_weak = sorted(weak_pieces, key=sort_key)

                for bt in self.config.bin_types:
                    ff = run_fill_first(
                        sorted_weak, sheet,
                        bin_type=bt,
                        spacing=self.config.spacing,
                        allow_rotation=self.config.allow_rotation,
                        vacuum_aware=self.config.vacuum_aware,
                        **sk,
                    )
                    if (len(ff.bins) <= target and
                            verify_no_overlaps(ff.bins)):
                        new_bins = strong_bins + ff.bins
                        sc = score_nesting_result(
                            new_bins, sw, sh,
                            self.config.remnant_weight, self.config.vacuum_weight,
                            self.config.min_remnant_width, self.config.min_remnant_length,
                        )
                        if sc < best_score:
                            best_score = sc
                            best_result = new_bins

            # Mini R&R para repacking dificil
            mini_iters = 300
            for it in range(mini_iters):
                perturbed = self._perturb_pieces(
                    weak_pieces, it, 0, mini_iters, sheet
                )
                bt = self.config.bin_types[it % len(self.config.bin_types)]
                ff = run_fill_first(
                    perturbed, sheet,
                    bin_type=bt,
                    spacing=self.config.spacing,
                    allow_rotation=self.config.allow_rotation,
                    vacuum_aware=self.config.vacuum_aware,
                    **sk,
                )
                if (len(ff.bins) <= target and
                        verify_no_overlaps(ff.bins)):
                    new_bins = strong_bins + ff.bins
                    sc = score_nesting_result(
                        new_bins, sw, sh,
                        self.config.remnant_weight, self.config.vacuum_weight,
                        self.config.min_remnant_width, self.config.min_remnant_length,
                    )
                    if sc < best_score:
                        best_score = sc
                        best_result = new_bins
                        break  # Encontrou, sair do mini R&R

        return best_result

    def _try_bipartition(
        self, pieces: list[Piece], sheet: Sheet, sk: dict,
    ) -> Optional[list[BinResult]]:
        """Tentar dividir pecas em 2 grupos que cabem em 1 bin cada.

        Usa busca heuristica de biparticao:
        1. Greedy balanceada (alternando pecas por area)
        2. Perturbacoes aleatorias da particao
        3. Para cada particao, tenta empacotar cada grupo

        Args:
            pieces: Todas as pecas
            sheet: Chapa modelo
            sk: Score kwargs

        Returns:
            Lista de 2 BinResult ou None
        """
        bin_area = sheet.usable_length * sheet.usable_width
        total_area = sum(p.length * p.width for p in pieces)

        if total_area > 2 * bin_area:
            return None  # impossivel

        n = len(pieces)
        if n < 2:
            return None

        best_pair: Optional[list[BinResult]] = None
        best_sc = float("inf")

        def _try_partition(group_a: list[Piece], group_b: list[Piece]):
            """Tenta empacotar cada grupo em 1 bin."""
            nonlocal best_pair, best_sc

            area_a = sum(p.length * p.width for p in group_a)
            area_b = sum(p.length * p.width for p in group_b)
            if area_a > bin_area or area_b > bin_area:
                return
            if not group_a or not group_b:
                return

            for bt in self.config.bin_types:
                sorted_a = sorted(
                    group_a, key=lambda p: p.length * p.width, reverse=True
                )
                sorted_b = sorted(
                    group_b, key=lambda p: p.length * p.width, reverse=True
                )
                r_a = run_fill_first(
                    sorted_a, sheet, bin_type=bt,
                    spacing=self.config.spacing,
                    allow_rotation=self.config.allow_rotation,
                    vacuum_aware=self.config.vacuum_aware,
                    **sk,
                )
                if len(r_a.bins) != 1:
                    continue
                r_b = run_fill_first(
                    sorted_b, sheet, bin_type=bt,
                    spacing=self.config.spacing,
                    allow_rotation=self.config.allow_rotation,
                    vacuum_aware=self.config.vacuum_aware,
                    **sk,
                )
                if len(r_b.bins) != 1:
                    continue
                if (verify_no_overlaps(r_a.bins) and
                        verify_no_overlaps(r_b.bins)):
                    sc = score_nesting_result(
                        r_a.bins + r_b.bins,
                        sheet.usable_length, sheet.usable_width,
                        self.config.remnant_weight, self.config.vacuum_weight,
                        self.config.min_remnant_width, self.config.min_remnant_length,
                    )
                    if sc < best_sc:
                        best_sc = sc
                        best_pair = r_a.bins + r_b.bins

        # Ordenar por area
        sorted_by_area = sorted(
            pieces, key=lambda p: p.length * p.width, reverse=True
        )

        # Estrategia 1: Greedy balanceada — alternar maior/menor
        for start_bin in [0, 1]:
            group_a: list[Piece] = []
            group_b: list[Piece] = []
            area_a = 0.0
            area_b = 0.0
            for i, p in enumerate(sorted_by_area):
                pa = p.length * p.width
                # Colocar no grupo com menor area
                if (start_bin == 0 and area_a <= area_b) or \
                   (start_bin == 1 and area_a > area_b):
                    group_a.append(p)
                    area_a += pa
                else:
                    group_b.append(p)
                    area_b += pa
            _try_partition(group_a, group_b)

        # Estrategia 2: Anchor grandes pecas — cada peca grande ancora um grupo
        large_pieces = [p for p in sorted_by_area if max(p.length, p.width) > 1500]
        if len(large_pieces) >= 2:
            # Distribuir grandes pecas igualmente, preencher com pequenas
            for anchor_count in range(1, len(large_pieces)):
                group_a = list(sorted_by_area[:anchor_count])
                group_b = list(sorted_by_area[anchor_count:anchor_count * 2])
                remaining = list(sorted_by_area[anchor_count * 2:])
                area_a = sum(p.length * p.width for p in group_a)
                area_b = sum(p.length * p.width for p in group_b)
                for p in remaining:
                    pa = p.length * p.width
                    if area_a <= area_b:
                        group_a.append(p)
                        area_a += pa
                    else:
                        group_b.append(p)
                        area_b += pa
                _try_partition(group_a, group_b)

        # Estrategia 3: Perturbacoes aleatorias da particao
        for attempt in range(500):
            group_a = []
            group_b = []
            area_a = 0.0
            area_b = 0.0

            # Embaralhar com viés (grandes primeiro)
            perm = list(sorted_by_area)
            if attempt > 0:
                # Perturbar: trocar 1-3 pecas entre os dois lados
                perm = list(perm)
                swaps = random.randint(1, min(3, n // 2))
                for _ in range(swaps):
                    i = random.randint(0, n - 1)
                    j = random.randint(0, n - 1)
                    perm[i], perm[j] = perm[j], perm[i]

            for p in perm:
                pa = p.length * p.width
                # Adicionar ao grupo com menor area (greedy balance)
                if area_a <= area_b:
                    group_a.append(p)
                    area_a += pa
                else:
                    group_b.append(p)
                    area_b += pa

            _try_partition(group_a, group_b)

            if best_pair is not None:
                break  # ja encontrou

        return best_pair

    def _extract_pieces_from_bin(self, bin_result: BinResult) -> list[Piece]:
        """Extrair pecas de um bin como objetos Piece para re-nesting.

        Args:
            bin_result: Bin com placements

        Returns:
            Lista de Piece recriados a partir dos placements
        """
        pieces = []
        for p in bin_result.placements:
            # Usar dimensoes originais (antes da rotacao)
            if p.rotated:
                length = p.effective_width
                width = p.effective_length
            else:
                length = p.effective_length
                width = p.effective_width

            piece = Piece(
                id=p.piece_id,
                persistent_id=p.piece_persistent_id,
                length=length,
                width=width,
                quantity=1,
                material_code=p.material_code if hasattr(p, 'material_code') and p.material_code else "",
            )
            pieces.append(piece)
        return pieces

    def _try_remnants(
        self,
        pieces: list[Piece],
        remnants: list[Remnant],
        sheet: Sheet,
    ) -> tuple[list[Piece], list[Remnant]]:
        """Tentar colocar pecas em retalhos primeiro.

        Args:
            pieces: Pecas a colocar
            remnants: Retalhos disponiveis (ordenados por area desc)
            sheet: Chapa modelo (para kerf, spacing)

        Returns:
            (pecas_restantes, retalhos_usados)
        """
        remaining = list(pieces)
        used_remnants: list[Remnant] = []

        # Ordenar retalhos por area (maior primeiro)
        sorted_remnants = sorted(remnants, key=lambda r: r.area, reverse=True)

        for remnant in sorted_remnants:
            if not remaining:
                break

            # Criar uma "chapa" virtual a partir do retalho
            remnant_sheet = Sheet(
                id=remnant.id,
                name=f"Retalho {remnant.id}",
                material_code=remnant.material_code,
                thickness_real=remnant.thickness_real,
                length=remnant.length,
                width=remnant.width,
                trim=0,  # Retalhos nao tem refilo
                kerf=sheet.kerf,
                grain=sheet.grain,
            )

            # Ordenar por area desc para retalhos
            sorted_remaining = sorted(
                remaining, key=lambda p: p.length * p.width, reverse=True
            )

            # Tentar nesting no retalho
            result = run_nesting_pass(
                sorted_remaining, remnant_sheet,
                bin_type=self.config.bin_types[0],
                heuristic=NestingHeuristic.BSSF,
                spacing=self.config.spacing,
                allow_rotation=self.config.allow_rotation,
                vacuum_aware=self.config.vacuum_aware,
            )

            # So aceitar se TODAS as pecas cabem num unico bin
            if (result.bins and len(result.bins) == 1 and
                not result.unplaced_pieces and
                result.total_pieces_placed == len(sorted_remaining)):
                # Todas cabem no retalho!
                remaining = []
                used_remnants.append(remnant)
                break

            # Se nao todas, tentar colocar o maximo possivel
            if result.bins and result.bins[0].placements:
                placed_ids = {
                    p.piece_persistent_id
                    for p in result.bins[0].placements
                }
                if len(placed_ids) > 0 and len(placed_ids) == len(sorted_remaining):
                    remaining = []
                    used_remnants.append(remnant)
                    break

        return remaining, used_remnants

    def _find_sheet_for_material(
        self, material_code: str, sheets: list[Sheet]
    ) -> Optional[Sheet]:
        """Encontrar chapa correspondente ao material.

        Cascata de matching:
        1. Material code exato
        2. Espessura exata
        3. Espessura fuzzy (±1mm)
        4. Primeira chapa ativa

        Args:
            material_code: Codigo do material
            sheets: Chapas disponiveis

        Returns:
            Sheet ou None
        """
        if not sheets:
            return None

        # 1. Match exato
        for s in sheets:
            if s.material_code == material_code:
                return s

        # 2. Extrair espessura do material_code
        parts = material_code.split("_")
        thickness = None
        for p in parts:
            try:
                thickness = float(p)
                break
            except ValueError:
                continue

        if thickness is not None:
            # Match por espessura exata
            for s in sheets:
                if abs(s.thickness_real - thickness) < 0.01:
                    return s

            # Match fuzzy (±1mm)
            for s in sheets:
                if abs(s.thickness_real - thickness) < 1.0:
                    return s

        # 4. Fallback: primeira chapa ativa
        active = [s for s in sheets if s.active]
        return active[0] if active else sheets[0]


# ---------------------------------------------------------------------------
# Funcao de conveniencia
# ---------------------------------------------------------------------------

def build_optimal_layout(
    pieces: list[Piece],
    sheets: list[Sheet],
    remnants: list[Remnant] | None = None,
    config: NestingConfig | None = None,
) -> LayoutResult:
    """Construir layout otimizado para as pecas.

    Funcao de conveniencia que cria o LayoutBuilder
    e executa o pipeline completo.

    Args:
        pieces: Pecas a posicionar
        sheets: Chapas disponiveis
        remnants: Retalhos opcionais
        config: Configuracao opcional

    Returns:
        LayoutResult com melhor layout
    """
    builder = LayoutBuilder(config)
    return builder.build_layout(pieces, sheets, remnants)


# ---------------------------------------------------------------------------
# Deteccao de retalhos no resultado
# ---------------------------------------------------------------------------

def detect_remnants(
    sheet_layout: SheetLayout,
    min_width: float = 300,
    min_length: float = 600,
) -> list[dict]:
    """Detectar retalhos aproveitaveis no espaco livre de um layout.

    Analisa as areas livres apos placement e identifica
    retangulos grandes o suficiente para reuso.

    Args:
        sheet_layout: Layout da chapa com pecas posicionadas
        min_width: Largura minima do retalho (mm)
        min_length: Comprimento minimo do retalho (mm)

    Returns:
        Lista de dicts com {x, y, w, h, area}
    """
    if not sheet_layout.placements:
        # Chapa inteira e retalho
        w = sheet_layout.sheet.usable_length
        h = sheet_layout.sheet.usable_width
        if w >= min_length and h >= min_width:
            return [{"x": 0, "y": 0, "w": w, "h": h, "area": w * h}]
        return []

    sheet = sheet_layout.sheet
    usable_w = sheet.usable_length
    usable_h = sheet.usable_width

    # Encontrar bounding box das pecas colocadas
    max_x = 0
    max_y = 0
    for p in sheet_layout.placements:
        px = (p.x - sheet.trim) + p.effective_length
        py = (p.y - sheet.trim) + p.effective_width
        max_x = max(max_x, px)
        max_y = max(max_y, py)

    remnants = []

    # Retalho a direita (faixa vertical)
    right_w = usable_w - max_x
    if right_w >= min_width and usable_h >= min_length:
        remnants.append({
            "x": max_x, "y": 0,
            "w": right_w, "h": usable_h,
            "area": right_w * usable_h,
        })

    # Retalho acima (faixa horizontal)
    top_h = usable_h - max_y
    if top_h >= min_width and max_x >= min_length:
        remnants.append({
            "x": 0, "y": max_y,
            "w": max_x, "h": top_h,
            "area": max_x * top_h,
        })

    return remnants
