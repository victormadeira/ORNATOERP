#!/usr/bin/env python3
"""Benchmark avancado: Multiplos cenarios de dificuldade crescente.

Cenario 1: Cozinha simples (46 pecas, 1 material) — FACIL
Cenario 2: Quarto completo (32 pecas, 2 materiais) — MEDIO
Cenario 3: Lote misto grande (80+ pecas, 3 materiais) — DIFICIL
Cenario 4: Pecas extremas (retangulos muito longos + muito pequenos) — STRESS
Cenario 5: Quase-perfeito (area = 99.5% de N chapas) — EDGE CASE
"""

import sys
import time
sys.path.insert(0, ".")

from app.core.domain.models import Piece, Sheet, Remnant
from app.core.nesting.layout_builder import LayoutBuilder, NestingConfig
from app.core.nesting.placement import minimum_theoretical_sheets, maximum_theoretical_occupancy
from app.core.nesting.part_ordering import expand_pieces_by_quantity


def make_sheet(mat_code="MDF_18.5_BRANCO_TX", espessura=18.5, price=195):
    return Sheet(
        id=1, name=f"Chapa {mat_code}",
        material_code=mat_code, thickness_real=espessura,
        length=2750, width=1850, trim=10, kerf=4.0,
        grain="sem_veio", price=price,
    )


def make_piece(pid, length, width, mat_code="MDF_18.5_BRANCO_TX"):
    return Piece(
        id=pid, persistent_id=f"P{pid:03d}",
        length=length, width=width, quantity=1,
        material_code=mat_code,
    )


# ======================================================================
# CENARIO 2: QUARTO COMPLETO — 2 materiais
# ======================================================================
def scenario_bedroom():
    """Quarto: guarda-roupa + comoda + criado-mudo, 2 materiais."""
    pieces = []
    pid = 1

    def add(comp, larg, qty, mat="MDF_18.5_BRANCO_TX"):
        nonlocal pid
        for _ in range(qty):
            pieces.append(make_piece(pid, comp, larg, mat))
            pid += 1

    # GUARDA-ROUPA (2000x600x2400mm) — MDF 18mm
    add(600, 2382, 2)    # Laterais
    add(1964, 600, 2)    # Topo + Base
    add(1964, 580, 3)    # Prateleiras
    add(1964, 100, 2)    # Travessas
    add(980, 2378, 2)    # Portas

    # COMODA (1200x500x900mm) — MDF 18mm
    add(500, 882, 2)     # Laterais
    add(1164, 500, 1)    # Topo
    add(1164, 500, 1)    # Base
    add(1164, 250, 4)    # Frentes gavetas
    add(1164, 80, 1)     # Travessa

    # CRIADO-MUDO 2x (450x400x550mm) — MDF 15mm
    mat15 = "MDF_15.5_BRANCO_TX"
    add(400, 532, 4, mat15)  # Laterais (2 modulos)
    add(414, 400, 4, mat15)  # Topo+Base (2 modulos)
    add(414, 380, 2, mat15)  # Prateleiras
    add(446, 528, 2, mat15)  # Portas

    sheets = [
        make_sheet("MDF_18.5_BRANCO_TX", 18.5),
        make_sheet("MDF_15.5_BRANCO_TX", 15.5),
    ]
    return "Quarto Completo (2 materiais)", pieces, sheets


# ======================================================================
# CENARIO 3: LOTE MISTO GRANDE — 3 materiais
# ======================================================================
def scenario_large_mixed():
    """Cozinha + banheiro + lavanderia — lote grande, 3 materiais."""
    pieces = []
    pid = 1

    def add(comp, larg, qty, mat="MDF_18.5_BRANCO_TX"):
        nonlocal pid
        for _ in range(qty):
            pieces.append(make_piece(pid, comp, larg, mat))
            pid += 1

    mat18 = "MDF_18.5_BRANCO_TX"
    mat15 = "MDF_15.5_BRANCO_TX"
    mat25 = "MDF_25.5_BRANCO_TX"

    # COZINHA (5 modulos) — MDF 18mm
    for mod_w in [800, 600, 600, 400, 500]:
        h = 870
        add(550, h-18, 2, mat18)        # Laterais
        add(mod_w-36, 550, 1, mat18)     # Base
        add(mod_w-36, 530, 1, mat18)     # Prateleira
        add(mod_w-36, 80, 1, mat18)      # Travessa
        if mod_w >= 600:
            add(mod_w-4, h-4, 1, mat18)  # Porta

    # AEREOS (4 modulos) — MDF 15mm
    for mod_w in [800, 600, 400, 500]:
        h = 700
        add(350, h, 2, mat15)
        add(mod_w-36, 350, 2, mat15)     # Topo+Base
        add(mod_w-36, 330, 1, mat15)     # Prateleira
        add(mod_w-4, h-4, 1, mat15)      # Porta

    # BANHEIRO gabinete (800x450x850) — MDF 18mm
    add(450, 832, 2, mat18)
    add(764, 450, 2, mat18)
    add(764, 430, 1, mat18)

    # LAVANDERIA armario alto (600x400x2000) — MDF 25mm
    add(400, 1950, 2, mat25)
    add(550, 400, 2, mat25)
    add(550, 380, 3, mat25)
    add(596, 970, 2, mat25)  # Portas

    sheets = [
        make_sheet(mat18, 18.5, 195),
        make_sheet(mat15, 15.5, 165),
        make_sheet(mat25, 25.5, 285),
    ]
    return "Lote Misto Grande (3 materiais)", pieces, sheets


# ======================================================================
# CENARIO 4: PECAS EXTREMAS — stress test
# ======================================================================
def scenario_extreme():
    """Mix de pecas muito longas + muito pequenas (pior caso)."""
    pieces = []
    pid = 1

    def add(comp, larg, qty, mat="MDF_18.5_BRANCO_TX"):
        nonlocal pid
        for _ in range(qty):
            pieces.append(make_piece(pid, comp, larg, mat))
            pid += 1

    # Pecas muito longas (quase o comprimento da chapa)
    add(2700, 550, 2)   # 2700mm — quase nao cabe
    add(2500, 400, 2)   # 2500mm
    add(2200, 600, 2)   # 2200mm

    # Pecas medias
    add(1200, 500, 4)
    add(800, 600, 4)
    add(600, 400, 6)

    # Pecas muito pequenas (preenchimento)
    add(200, 150, 8)
    add(150, 100, 10)
    add(300, 200, 6)
    add(250, 180, 4)

    sheets = [make_sheet()]
    return "Pecas Extremas (stress test)", pieces, sheets


# ======================================================================
# CENARIO 5: QUASE-PERFEITO — edge case
# ======================================================================
def scenario_edge_case():
    """Pecas que preenchem exatamente N chapas (menos spacing)."""
    pieces = []
    pid = 1

    def add(comp, larg, qty, mat="MDF_18.5_BRANCO_TX"):
        nonlocal pid
        for _ in range(qty):
            pieces.append(make_piece(pid, comp, larg, mat))
            pid += 1

    # Area util = 2730 x 1830 = 4,995,900 mm²
    # Com spacing 7mm e kerf 4mm entre pecas
    # Dividir em pecas que preenchem bem 2 chapas

    # Chapa 1: pecas grandes que encaixam bem
    add(1358, 908, 4)   # 4 quadrantes: 1358*4+3*11=5443 ~ 2730*2, 908*2+11=1827 ~ 1830

    # Chapa 2: pecas medias variadas
    add(900, 600, 3)
    add(900, 400, 3)
    add(800, 500, 2)
    add(700, 300, 2)
    add(400, 350, 2)
    add(300, 250, 4)

    sheets = [make_sheet()]
    return "Edge Case (quase-perfeito)", pieces, sheets


# ======================================================================
# RUNNER
# ======================================================================
def run_scenario(name, pieces, sheets):
    """Rodar um cenario e imprimir resultados."""
    expanded = expand_pieces_by_quantity(pieces)

    # Info por material
    materials = {}
    for p in expanded:
        mc = p.material_code
        if mc not in materials:
            materials[mc] = {"count": 0, "area": 0}
        materials[mc]["count"] += 1
        materials[mc]["area"] += p.length * p.width

    print(f"\n{'=' * 70}")
    print(f"CENARIO: {name}")
    print(f"{'=' * 70}")
    print(f"Total pecas: {len(expanded)}")

    for mc, info in materials.items():
        sheet = next((s for s in sheets if s.material_code == mc), sheets[0])
        usable = sheet.usable_length * sheet.usable_width
        mat_pieces = [p for p in expanded if p.material_code == mc]
        min_th = minimum_theoretical_sheets(mat_pieces, sheet)
        max_occ = maximum_theoretical_occupancy(mat_pieces, sheet, min_th)
        print(f"  {mc}: {info['count']} pecas, area={info['area']/1e6:.2f}m², "
              f"min_chapas={min_th}, max_occ={max_occ:.1f}%")

    # Otimizar
    config = NestingConfig()
    builder = LayoutBuilder(config)
    start = time.time()
    result = builder.build_layout(pieces, sheets)
    elapsed = time.time() - start

    print(f"\nResultado: {result.total_sheets} chapas em {elapsed:.2f}s")
    print(f"Aproveitamento medio: {result.avg_occupancy:.1f}%")

    # Comparacao
    total_min = 0
    for mc, info in materials.items():
        sheet = next((s for s in sheets if s.material_code == mc), sheets[0])
        mat_pieces = [p for p in expanded if p.material_code == mc]
        min_th = minimum_theoretical_sheets(mat_pieces, sheet)
        total_min += min_th

    gap = result.total_sheets - total_min
    status = "PERFEITO" if gap == 0 else f"+{gap} chapas"

    print(f"\nChapas: {result.total_sheets} vs {total_min} teorico → {status}")

    for sl in result.sheets:
        mat = sl.sheet.material_code if sl.sheet else "?"
        print(f"  Chapa {sl.index}: {sl.occupancy:.1f}% ({sl.piece_count} pecas) [{mat}]")

    # Log de decisoes
    for d in builder.decisions_log:
        phase = d.get("phase", "?")
        if phase == "final_choice":
            print(f"  [ENGINE] {d.get('material')}: {d.get('bins')} chapas, "
                  f"{d.get('avg_occ'):.1f}%, gap={d.get('gap', '?')}")
        elif phase in ("last_bin_opt", "global_repack"):
            print(f"  [ENGINE] {phase}: {d.get('bins_before')}→{d.get('bins_after')} chapas")

    return gap, result.total_sheets, total_min, elapsed


if __name__ == "__main__":
    scenarios = [
        scenario_bedroom,
        scenario_large_mixed,
        scenario_extreme,
        scenario_edge_case,
    ]

    results = []
    total_gap = 0
    total_time = 0

    for scenario_fn in scenarios:
        name, pieces, sheets = scenario_fn()
        gap, real, theoretical, elapsed = run_scenario(name, pieces, sheets)
        results.append((name, real, theoretical, gap, elapsed))
        total_gap += gap
        total_time += elapsed

    print(f"\n\n{'=' * 70}")
    print(f"RESUMO GERAL")
    print(f"{'=' * 70}")
    print(f"{'Cenario':<35} {'Chapas':>7} {'Teorico':>8} {'Gap':>5} {'Tempo':>8}")
    print(f"{'-'*35} {'-'*7} {'-'*8} {'-'*5} {'-'*8}")
    for name, real, theoretical, gap, elapsed in results:
        status = "OK" if gap == 0 else f"+{gap}"
        print(f"{name:<35} {real:>7} {theoretical:>8} {status:>5} {elapsed:>7.2f}s")
    print(f"{'-'*35} {'-'*7} {'-'*8} {'-'*5} {'-'*8}")
    print(f"{'TOTAL':<35} {sum(r[1] for r in results):>7} "
          f"{sum(r[2] for r in results):>8} "
          f"{'+'+str(total_gap) if total_gap else 'OK':>5} {total_time:>7.2f}s")

    if total_gap == 0:
        print(f"\nTODOS OS CENARIOS ATINGIRAM O MINIMO TEORICO!")
    else:
        print(f"\nGap total: +{total_gap} chapas acima do teorico")
