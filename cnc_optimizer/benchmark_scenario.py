#!/usr/bin/env python3
"""Benchmark: Cenario hipotetico de marcenaria — cozinha completa.

Simula uma cozinha completa com:
- Armario inferior (balcao): 3 modulos
- Armario superior: 3 modulos
- Armario torre (despensa): 1 modulo

Material: MDF Branco TX 18mm (2750x1850, refilo 10mm)
Total: ~48 pecas

Resultado perfeito calculado manualmente para comparacao.
"""

import sys
import time
import json
sys.path.insert(0, ".")

from app.core.domain.models import Piece, Sheet, Placement, Remnant
from app.core.nesting.layout_builder import LayoutBuilder, NestingConfig, build_optimal_layout
from app.core.nesting.placement import (
    score_nesting_result, minimum_theoretical_sheets, maximum_theoretical_occupancy,
)
from app.core.nesting.part_ordering import expand_pieces_by_quantity


def create_kitchen_scenario():
    """Criar cenario realista: cozinha completa em MDF 18mm.

    Modulos:
    1. Balcao inferior 1 (800x550x870mm) — pia
    2. Balcao inferior 2 (600x550x870mm) — gavetas
    3. Balcao inferior 3 (400x550x870mm) — porta
    4. Armario superior 1 (800x350x700mm)
    5. Armario superior 2 (600x350x700mm)
    6. Armario superior 3 (400x350x700mm)
    7. Torre despensa (600x550x2100mm)
    """

    pieces = []
    pid = 1

    def add(nome, comp, larg, qty=1):
        nonlocal pid
        for _ in range(qty):
            pieces.append(Piece(
                id=pid,
                persistent_id=f"PID_{pid:03d}",
                length=comp,
                width=larg,
                quantity=1,
                material_code="MDF_18.5_BRANCO_TX",
            ))
            pid += 1

    # ========================================
    # BALCAO INFERIOR 1 — PIA (800x550x870)
    # ========================================
    # Laterais: 2x (550 x 852)  [870 - 18 base]
    add("BI1_Lateral", 550, 852, qty=2)
    # Base: 1x (764 x 550)  [800 - 2*18]
    add("BI1_Base", 764, 550, qty=1)
    # Prateleira: 1x (764 x 530)
    add("BI1_Prateleira", 764, 530, qty=1)
    # Fundo: 1x (764 x 852)  [3mm compensado, mas usamos MDF neste cenario]
    # Travessa superior: 1x (764 x 80)
    add("BI1_Travessa", 764, 80, qty=1)

    # ========================================
    # BALCAO INFERIOR 2 — GAVETAS (600x550x870)
    # ========================================
    # Laterais: 2x (550 x 852)
    add("BI2_Lateral", 550, 852, qty=2)
    # Base: 1x (564 x 550)
    add("BI2_Base", 564, 550, qty=1)
    # Frentes gavetas: 3x (564 x 260)
    add("BI2_Frente_Gaveta", 564, 260, qty=3)
    # Travessa superior: 1x (564 x 80)
    add("BI2_Travessa", 564, 80, qty=1)

    # ========================================
    # BALCAO INFERIOR 3 — PORTA (400x550x870)
    # ========================================
    # Laterais: 2x (550 x 852)
    add("BI3_Lateral", 550, 852, qty=2)
    # Base: 1x (364 x 550)
    add("BI3_Base", 364, 550, qty=1)
    # Prateleira: 1x (364 x 530)
    add("BI3_Prateleira", 364, 530, qty=1)
    # Porta: 1x (396 x 868)
    add("BI3_Porta", 396, 868, qty=1)
    # Travessa: 1x (364 x 80)
    add("BI3_Travessa", 364, 80, qty=1)

    # ========================================
    # ARMARIO SUPERIOR 1 (800x350x700)
    # ========================================
    # Laterais: 2x (350 x 700)
    add("AS1_Lateral", 350, 700, qty=2)
    # Topo/Base: 2x (764 x 350)
    add("AS1_Topo", 764, 350, qty=2)
    # Prateleira: 1x (764 x 330)
    add("AS1_Prateleira", 764, 330, qty=1)
    # Porta: 1x (796 x 696)
    add("AS1_Porta", 796, 696, qty=1)

    # ========================================
    # ARMARIO SUPERIOR 2 (600x350x700)
    # ========================================
    # Laterais: 2x (350 x 700)
    add("AS2_Lateral", 350, 700, qty=2)
    # Topo/Base: 2x (564 x 350)
    add("AS2_Topo", 564, 350, qty=2)
    # Prateleira: 1x (564 x 330)
    add("AS2_Prateleira", 564, 330, qty=1)
    # Porta: 1x (596 x 696)
    add("AS2_Porta", 596, 696, qty=1)

    # ========================================
    # ARMARIO SUPERIOR 3 (400x350x700)
    # ========================================
    # Laterais: 2x (350 x 700)
    add("AS3_Lateral", 350, 700, qty=2)
    # Topo/Base: 2x (364 x 350)
    add("AS3_Topo", 364, 350, qty=2)
    # Prateleira: 1x (364 x 330)
    add("AS3_Prateleira", 364, 330, qty=1)
    # Porta: 1x (396 x 696)
    add("AS3_Porta", 396, 696, qty=1)

    # ========================================
    # TORRE DESPENSA (600x550x2100)
    # ========================================
    # Laterais: 2x (550 x 2100)
    add("TD_Lateral", 550, 2100, qty=2)
    # Topo/Base: 2x (564 x 550)
    add("TD_Topo", 564, 550, qty=2)
    # Prateleiras: 4x (564 x 530)
    add("TD_Prateleira", 564, 530, qty=4)
    # Porta superior: 1x (596 x 1046)
    add("TD_Porta_Sup", 596, 1046, qty=1)
    # Porta inferior: 1x (596 x 1036)
    add("TD_Porta_Inf", 596, 1036, qty=1)

    # Chapa padrao MDF 18mm
    sheet = Sheet(
        id=1,
        name="MDF Branco TX 18mm",
        material_code="MDF_18.5_BRANCO_TX",
        thickness_real=18.5,
        length=2750,
        width=1850,
        trim=10,
        kerf=4.0,
        grain="sem_veio",
        price=195.0,
    )

    return pieces, sheet


def calculate_perfect_result(pieces, sheet):
    """Calcular resultado perfeito (teorico por area)."""
    expanded = expand_pieces_by_quantity(pieces)
    total_area = sum(p.length * p.width for p in expanded)
    usable_area = sheet.usable_length * sheet.usable_width  # (2750-20) * (1850-20) = 2730*1830

    min_sheets = minimum_theoretical_sheets(expanded, sheet)
    max_occ = maximum_theoretical_occupancy(expanded, sheet, min_sheets)

    print("=" * 70)
    print("CENARIO: COZINHA COMPLETA — MDF 18mm Branco TX")
    print("=" * 70)
    print(f"\nPecas: {len(expanded)} unidades")
    print(f"Area total pecas: {total_area:,.0f} mm² ({total_area/1_000_000:.2f} m²)")
    print(f"Chapa: {sheet.length}x{sheet.width}mm (util: {sheet.usable_length}x{sheet.usable_width}mm)")
    print(f"Area util chapa: {usable_area:,.0f} mm² ({usable_area/1_000_000:.2f} m²)")
    print(f"\n--- RESULTADO PERFEITO (TEORICO) ---")
    print(f"Minimo de chapas: {min_sheets}")
    print(f"Maximo aproveitamento com {min_sheets} chapas: {max_occ:.1f}%")
    print(f"Area ratio: {total_area / (min_sheets * usable_area) * 100:.1f}%")

    # Listar pecas por tamanho
    by_area = sorted(expanded, key=lambda p: p.length * p.width, reverse=True)
    print(f"\nTop 10 maiores pecas:")
    for i, p in enumerate(by_area[:10]):
        print(f"  {i+1}. {p.length}x{p.width}mm = {p.length*p.width:,.0f} mm²")

    print(f"\nMenores pecas:")
    for p in by_area[-5:]:
        print(f"  - {p.length}x{p.width}mm = {p.length*p.width:,.0f} mm²")

    return min_sheets, max_occ, expanded


def run_optimization(pieces, sheet):
    """Rodar otimizacao e retornar resultado."""
    config = NestingConfig()
    builder = LayoutBuilder(config)

    start = time.time()
    result = builder.build_layout(pieces, [sheet])
    elapsed = time.time() - start

    return result, elapsed, builder.decisions_log


def print_results(result, elapsed, decisions_log, min_sheets, max_occ, expanded, sheet):
    """Imprimir resultados detalhados e comparacao."""
    print(f"\n{'=' * 70}")
    print(f"RESULTADO DA OTIMIZACAO")
    print(f"{'=' * 70}")
    print(f"Tempo: {elapsed:.2f}s")
    print(f"Chapas usadas: {result.total_sheets}")
    print(f"Pecas posicionadas: {result.total_pieces}")
    print(f"Aproveitamento medio: {result.avg_occupancy:.1f}%")
    print(f"Score: {result.score:.0f}")

    print(f"\nDetalhes por chapa:")
    for sl in result.sheets:
        print(f"  Chapa {sl.index}: {sl.occupancy:.1f}% ({sl.piece_count} pecas)")

    # Comparacao com perfeito
    print(f"\n{'=' * 70}")
    print(f"COMPARACAO COM RESULTADO PERFEITO")
    print(f"{'=' * 70}")

    gap = result.total_sheets - min_sheets
    if gap == 0:
        print(f"  CHAPAS: {result.total_sheets} = {min_sheets} (PERFEITO!)")
    else:
        print(f"  CHAPAS: {result.total_sheets} vs {min_sheets} teorico (gap: +{gap})")

    # Aproveitamento real vs teorico
    total_piece_area = sum(p.length * p.width for p in expanded)
    usable_area = sheet.usable_length * sheet.usable_width
    real_occ = total_piece_area / (result.total_sheets * usable_area) * 100
    print(f"  APROVEITAMENTO REAL: {real_occ:.1f}%")
    print(f"  MAXIMO TEORICO ({min_sheets} chapas): {max_occ:.1f}%")
    if result.total_sheets == min_sheets:
        print(f"  EFICIENCIA: {real_occ / max_occ * 100:.1f}% do maximo")
    else:
        real_max = total_piece_area / (result.total_sheets * usable_area) * 100
        print(f"  COM {result.total_sheets} CHAPAS: aproveitamento efetivo = {real_max:.1f}%")

    # Custo
    price = sheet.price or 195
    cost_real = result.total_sheets * price
    cost_perfect = min_sheets * price
    print(f"\n  CUSTO MATERIAL:")
    print(f"    Otimizado: {result.total_sheets} chapas × R${price:.0f} = R${cost_real:.0f}")
    print(f"    Perfeito:  {min_sheets} chapas × R${price:.0f} = R${cost_perfect:.0f}")
    if gap > 0:
        print(f"    Excesso:   R${cost_real - cost_perfect:.0f} ({gap} chapas a mais)")

    # Decisoes do engine
    print(f"\n{'=' * 70}")
    print(f"LOG DE DECISOES DO ENGINE")
    print(f"{'=' * 70}")
    for d in decisions_log:
        phase = d.get("phase", "?")
        if phase == "adaptive_config":
            print(f"  [{phase}] {d.get('n_pieces')} pecas, gap={d.get('gap')}, "
                  f"rr_iter={d.get('rr_iterations')}, max_comb={d.get('max_combinations')}")
        elif phase == "final_choice":
            print(f"  [{phase}] {d.get('material')}: {d.get('bins')} chapas, "
                  f"{d.get('avg_occ'):.1f}%, gap={d.get('gap', '?')}")
        elif phase in ("initial_search", "ruin_recreate"):
            print(f"  [{phase}] {d.get('bins')} chapas, {d.get('avg_occ'):.1f}%, "
                  f"strategy={d.get('strategy')}")
        elif phase in ("last_bin_opt", "global_repack"):
            print(f"  [{phase}] {d.get('bins_before')}→{d.get('bins_after')} chapas")
        else:
            print(f"  [{phase}] {d}")

    return gap


if __name__ == "__main__":
    pieces, sheet = create_kitchen_scenario()
    min_sheets, max_occ, expanded = calculate_perfect_result(pieces, sheet)
    result, elapsed, decisions_log = run_optimization(pieces, sheet)
    gap = print_results(result, elapsed, decisions_log, min_sheets, max_occ, expanded, sheet)

    print(f"\n{'=' * 70}")
    if gap == 0:
        print("RESULTADO: PERFEITO! Atingimos o minimo teorico de chapas!")
    elif gap == 1:
        print(f"RESULTADO: BOM — {gap} chapa acima do teorico. Pode ser impossibilidade geometrica.")
    else:
        print(f"RESULTADO: PODE MELHORAR — {gap} chapas acima do teorico.")
    print(f"{'=' * 70}")
