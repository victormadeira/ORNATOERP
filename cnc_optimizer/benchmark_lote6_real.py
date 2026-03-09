#!/usr/bin/env python3
"""Benchmark com dados REAIS do lote 6.

Testa o motor Python diretamente com as peças do lote 6,
simulando agrupamento CORRETO (por chapa) vs INCORRETO (por material_code).
"""

import sys
import time
sys.path.insert(0, ".")

from app.core.domain.models import Piece, Sheet
from app.core.nesting.layout_builder import LayoutBuilder, NestingConfig
from app.core.nesting.placement import minimum_theoretical_sheets, maximum_theoretical_occupancy
from app.core.nesting.part_ordering import expand_pieces_by_quantity


def make_sheet_15():
    return Sheet(
        id=2, name="MDF Branco TX 15mm",
        material_code="MDF_15.5_BRANCO_TX", thickness_real=15.5,
        length=2750, width=1850, trim=10, kerf=4.0,
        grain="sem_veio", price=165,
    )

def make_sheet_18():
    return Sheet(
        id=3, name="MDF Branco TX 18mm",
        material_code="MDF_18.5_BRANCO_TX", thickness_real=18.5,
        length=2750, width=1850, trim=10, kerf=4.0,
        grain="sem_veio", price=195,
    )


def pieces_15mm():
    """Todas as peças 15mm (mdf15 + mdp15) do lote 6."""
    pieces = []
    pid = 1

    def add(desc, comp, larg, qty=1):
        nonlocal pid
        for _ in range(qty):
            pieces.append(Piece(
                id=pid, persistent_id=f"P15_{pid:03d}",
                length=comp, width=larg, quantity=1,
                material_code="MDF_15.5_BRANCO_TX",
            ))
            pid += 1

    # MDF 15mm — Aéreo (15 peças)
    add("Lateral Esq. Aéreo", 700, 350, 3)
    add("Lateral Dir. Aéreo", 700, 350, 3)
    add("Topo Aéreo", 770, 350, 3)
    add("Base Aéreo", 770, 350, 3)
    add("Fundo Aéreo", 770, 670, 3)

    # MDP 15mm — Lavanderia Balcão (5 peças)
    add("Lateral Esq. Balcão Lav.", 850, 550, 1)
    add("Lateral Dir. Balcão Lav.", 850, 550, 1)
    add("Topo Balcão Lav.", 970, 550, 1)
    add("Base Balcão Lav.", 970, 550, 1)
    add("Fundo Balcão Lav.", 970, 820, 1)

    # MDP 15mm — Lavanderia Aéreo (12 peças)
    add("Lateral Esq. Aéreo Lav.", 600, 300, 2)
    add("Lateral Dir. Aéreo Lav.", 600, 300, 2)
    add("Topo Aéreo Lav.", 970, 300, 2)
    add("Base Aéreo Lav.", 970, 300, 2)
    add("Fundo Aéreo Lav.", 970, 570, 2)

    return pieces


def pieces_18mm():
    """Todas as peças 18mm (mdf18 + mdp18) do lote 6, exceto largura=0."""
    pieces = []
    pid = 100

    def add(desc, comp, larg, qty=1):
        nonlocal pid
        for _ in range(qty):
            pieces.append(Piece(
                id=pid, persistent_id=f"P18_{pid:03d}",
                length=comp, width=larg, quantity=1,
                material_code="MDF_18.5_BRANCO_TX",
            ))
            pid += 1

    # MDF 18mm — Balcão Pia (5 peças)
    add("Lateral Esq. Balcão", 850, 550, 1)
    add("Lateral Dir. Balcão", 850, 550, 1)
    add("Topo Balcão", 1164, 550, 1)
    add("Base Balcão", 1164, 550, 1)
    add("Fundo Balcão", 1164, 814, 1)

    # MDF 18mm — Despenseiro (5 + qty=5 = 10 peças)
    add("Lateral Esq. Desp.", 2200, 550, 1)
    add("Lateral Dir. Desp.", 2200, 550, 1)
    add("Topo Desp.", 564, 550, 1)
    add("Base Desp.", 564, 550, 1)
    add("Fundo Desp.", 564, 2164, 1)  # Peça ENORME — 564x2164
    add("Prateleira Desp.", 564, 550, 5)

    # MDP 18mm — Tampões Despenseiro (3 peças, excluindo rodapé largura=0)
    add("Tamp. Lat. Esq.", 2200, 550, 1)
    add("Tamp. Lat. Dir.", 2200, 550, 1)
    add("Tamp. Topo", 600, 550, 1)

    return pieces


def pieces_only_mdf15():
    """Apenas peças mdf15 (sem mdp15)."""
    pieces = []
    pid = 1
    def add(desc, comp, larg, qty=1):
        nonlocal pid
        for _ in range(qty):
            pieces.append(Piece(id=pid, persistent_id=f"P15_{pid:03d}",
                length=comp, width=larg, quantity=1, material_code="MDF_15.5_BRANCO_TX"))
            pid += 1
    add("Lateral Esq.", 700, 350, 3)
    add("Lateral Dir.", 700, 350, 3)
    add("Topo", 770, 350, 3)
    add("Base", 770, 350, 3)
    add("Fundo", 770, 670, 3)
    return pieces


def pieces_only_mdp15():
    """Apenas peças mdp15 (sem mdf15)."""
    pieces = []
    pid = 50
    def add(desc, comp, larg, qty=1):
        nonlocal pid
        for _ in range(qty):
            pieces.append(Piece(id=pid, persistent_id=f"PMDP15_{pid:03d}",
                length=comp, width=larg, quantity=1, material_code="MDF_15.5_BRANCO_TX"))
            pid += 1
    add("Lateral Esq. Balcão", 850, 550, 1)
    add("Lateral Dir. Balcão", 850, 550, 1)
    add("Topo Balcão", 970, 550, 1)
    add("Base Balcão", 970, 550, 1)
    add("Fundo Balcão", 970, 820, 1)
    add("Lateral Esq. Aéreo", 600, 300, 2)
    add("Lateral Dir. Aéreo", 600, 300, 2)
    add("Topo Aéreo", 970, 300, 2)
    add("Base Aéreo", 970, 300, 2)
    add("Fundo Aéreo", 970, 570, 2)
    return pieces


def pieces_only_mdf18():
    """Apenas peças mdf18."""
    pieces = []
    pid = 100
    def add(desc, comp, larg, qty=1):
        nonlocal pid
        for _ in range(qty):
            pieces.append(Piece(id=pid, persistent_id=f"P18_{pid:03d}",
                length=comp, width=larg, quantity=1, material_code="MDF_18.5_BRANCO_TX"))
            pid += 1
    add("Lateral Esq.", 850, 550, 1)
    add("Lateral Dir.", 850, 550, 1)
    add("Topo", 1164, 550, 1)
    add("Base", 1164, 550, 1)
    add("Fundo", 1164, 814, 1)
    add("Lateral Esq. Desp.", 2200, 550, 1)
    add("Lateral Dir. Desp.", 2200, 550, 1)
    add("Topo Desp.", 564, 550, 1)
    add("Base Desp.", 564, 550, 1)
    add("Fundo Desp.", 564, 2164, 1)
    add("Prateleira", 564, 550, 5)
    return pieces


def pieces_only_mdp18():
    """Apenas peças mdp18 (sem rodapé largura=0)."""
    pieces = []
    pid = 200
    def add(desc, comp, larg, qty=1):
        nonlocal pid
        for _ in range(qty):
            pieces.append(Piece(id=pid, persistent_id=f"PMDP18_{pid:03d}",
                length=comp, width=larg, quantity=1, material_code="MDF_18.5_BRANCO_TX"))
            pid += 1
    add("Tamp. Lat. Esq.", 2200, 550, 1)
    add("Tamp. Lat. Dir.", 2200, 550, 1)
    add("Tamp. Topo", 600, 550, 1)
    return pieces


def run_scenario(name, pieces, sheet):
    expanded = expand_pieces_by_quantity(pieces)
    total_area = sum(p.length * p.width for p in expanded)
    usable = sheet.usable_length * sheet.usable_width
    min_th = minimum_theoretical_sheets(expanded, sheet)
    max_occ = maximum_theoretical_occupancy(expanded, sheet, min_th)

    config = NestingConfig()
    builder = LayoutBuilder(config)
    start = time.time()
    result = builder.build_layout(pieces, [sheet])
    elapsed = time.time() - start

    gap = result.total_sheets - min_th

    print(f"\n{'='*60}")
    print(f"  {name}")
    print(f"{'='*60}")
    print(f"  Peças: {len(expanded)}")
    print(f"  Área total: {total_area/1e6:.2f} m²")
    print(f"  Mínimo teórico: {min_th} chapas")
    print(f"  RESULTADO: {result.total_sheets} chapas ({elapsed:.2f}s)")
    print(f"  Aproveitamento: {result.avg_occupancy:.1f}%")
    print(f"  Gap: {'PERFEITO' if gap == 0 else f'+{gap}'}")

    for sl in result.sheets:
        print(f"    Chapa {sl.index}: {sl.occupancy:.1f}% ({sl.piece_count} peças)")

    return result.total_sheets, min_th, gap


if __name__ == "__main__":
    sheet15 = make_sheet_15()
    sheet18 = make_sheet_18()

    print("\n" + "=" * 60)
    print("  TESTE 1: AGRUPAMENTO INCORRETO (como estava antes)")
    print("  4 grupos separados — cada um otimizado independentemente")
    print("=" * 60)

    t1_mdf15, m1_mdf15, g1 = run_scenario("MDF 15mm sozinho (15 peças)", pieces_only_mdf15(), sheet15)
    t1_mdp15, m1_mdp15, g2 = run_scenario("MDP 15mm sozinho (12 peças)", pieces_only_mdp15(), sheet15)
    t1_mdf18, m1_mdf18, g3 = run_scenario("MDF 18mm sozinho (15 peças)", pieces_only_mdf18(), sheet18)
    t1_mdp18, m1_mdp18, g4 = run_scenario("MDP 18mm sozinho (3 peças)", pieces_only_mdp18(), sheet18)

    total_separado = t1_mdf15 + t1_mdp15 + t1_mdf18 + t1_mdp18
    min_separado = m1_mdf15 + m1_mdp15 + m1_mdf18 + m1_mdp18

    print(f"\n{'='*60}")
    print(f"  AGRUPAMENTO INCORRETO — TOTAL: {total_separado} chapas (mín. {min_separado})")
    print(f"{'='*60}")

    print("\n\n" + "=" * 60)
    print("  TESTE 2: AGRUPAMENTO CORRETO (como deveria ser)")
    print("  2 grupos — todas peças 15mm juntas, todas 18mm juntas")
    print("=" * 60)

    t2_15, m2_15, g5 = run_scenario("TODAS 15mm juntas (27 peças)", pieces_15mm(), sheet15)
    t2_18, m2_18, g6 = run_scenario("TODAS 18mm juntas (18 peças)", pieces_18mm(), sheet18)

    total_junto = t2_15 + t2_18
    min_junto = m2_15 + m2_18

    print(f"\n{'='*60}")
    print(f"  AGRUPAMENTO CORRETO — TOTAL: {total_junto} chapas (mín. {min_junto})")
    print(f"{'='*60}")

    print(f"\n\n{'='*60}")
    print(f"  COMPARAÇÃO FINAL")
    print(f"{'='*60}")
    print(f"  Separado (4 grupos): {total_separado} chapas")
    print(f"  Junto (2 grupos):    {total_junto} chapas")
    economia = total_separado - total_junto
    if economia > 0:
        print(f"  ECONOMIA: {economia} chapas = R${economia * 180:.0f}")
    elif economia == 0:
        print(f"  Mesmo resultado (sem impacto neste caso)")
    else:
        print(f"  Junto usou mais?! Investigar...")
    print(f"{'='*60}")
