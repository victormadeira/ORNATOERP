"""Cenarios de benchmark da auditoria de otimizacao.

Dois cenarios controlados para validar o motor:
- Cenario A: material liso, rotacao permitida (meta: >= 95% bruto)
- Cenario B: material com veio, sem rotacao (meta: >= 95% bruto)

Chapa: 2750 x 1850 mm, refilo 10mm/lado, kerf 7mm
"""

import pytest

from app.core.domain.models import Piece, Sheet
from app.core.domain.enums import GrainDirection, RotationPolicy
from app.core.nesting.layout_builder import LayoutBuilder, NestingConfig


# ---------------------------------------------------------------------------
# Chapa padrao
# ---------------------------------------------------------------------------

SHEET = Sheet(
    id=1,
    name="Chapa Benchmark",
    material_code="MDF_18.5_BRANCO",
    length=2750,
    width=1850,
    trim=10,
    kerf=7,
    grain=GrainDirection.NONE,
)

SHEET_GRAIN = Sheet(
    id=2,
    name="Chapa Benchmark Veio",
    material_code="MDF_18.5_CARVALHO",
    length=2750,
    width=1850,
    trim=10,
    kerf=7,
    grain=GrainDirection.HORIZONTAL,
)

AREA_BRUTA = 2750 * 1850  # 5.087.500 mm2


# ---------------------------------------------------------------------------
# Cenario A — rotacao permitida
# ---------------------------------------------------------------------------

CENARIO_A_PIECES = [
    Piece(id=1, persistent_id="A01", length=900, width=766, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=2, persistent_id="A02", length=800, width=766, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=3, persistent_id="A03", length=500, width=766, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=4, persistent_id="A04", length=509, width=766, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=5, persistent_id="A05", length=1200, width=700, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=6, persistent_id="A06", length=900, width=700, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=7, persistent_id="A07", length=616, width=700, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=8, persistent_id="A08", length=350, width=900, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=9, persistent_id="A09", length=350, width=700, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=10, persistent_id="A10", length=350, width=600, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
    Piece(id=11, persistent_id="A11", length=350, width=509, quantity=1,
          material_code="MDF_18.5_BRANCO", rotation_policy=RotationPolicy.FREE),
]

CENARIO_A_TOTAL_AREA = sum(p.length * p.width for p in CENARIO_A_PIECES)
# 4.924.444 mm2
CENARIO_A_IDEAL_BRUTO = CENARIO_A_TOTAL_AREA / AREA_BRUTA * 100  # 96.79%


# ---------------------------------------------------------------------------
# Cenario B — sem rotacao (veio fixo)
# ---------------------------------------------------------------------------

CENARIO_B_PIECES = [
    Piece(id=1, persistent_id="B01", length=1100, width=480, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=2, persistent_id="B02", length=900, width=480, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=3, persistent_id="B03", length=716, width=480, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=4, persistent_id="B04", length=900, width=450, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=5, persistent_id="B05", length=700, width=450, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=6, persistent_id="B06", length=600, width=450, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=7, persistent_id="B07", length=509, width=450, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=8, persistent_id="B08", length=1200, width=420, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=9, persistent_id="B09", length=900, width=420, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=10, persistent_id="B10", length=616, width=420, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=11, persistent_id="B11", length=800, width=459, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=12, persistent_id="B12", length=700, width=459, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=13, persistent_id="B13", length=700, width=459, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
    Piece(id=14, persistent_id="B14", length=509, width=459, quantity=1,
          material_code="MDF_18.5_CARVALHO", grain=GrainDirection.HORIZONTAL,
          rotation_policy=RotationPolicy.FIXED),
]

CENARIO_B_TOTAL_AREA = sum(p.length * p.width for p in CENARIO_B_PIECES)
# 4.906.881 mm2
CENARIO_B_IDEAL_BRUTO = CENARIO_B_TOTAL_AREA / AREA_BRUTA * 100  # 96.45%


# ---------------------------------------------------------------------------
# Config de benchmark (mais iteracoes para melhor resultado)
# ---------------------------------------------------------------------------

BENCHMARK_CONFIG = NestingConfig(
    spacing=7,
    kerf=7,
    allow_rotation=True,
    vacuum_aware=True,
    try_remnants=False,
    rr_iterations=800,
    rr_window_size=80,
    max_combinations=300,
    compact_passes=15,
    remnant_weight=1.0,
    vacuum_weight=0.5,
)


# ---------------------------------------------------------------------------
# Testes
# ---------------------------------------------------------------------------

class TestCenarioA:
    """Cenario A — material liso, rotacao permitida."""

    def test_single_sheet(self):
        """Todas as pecas devem caber em 1 chapa."""
        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": True,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(CENARIO_A_PIECES, [SHEET])

        assert result.total_sheets == 1, (
            f"Esperado 1 chapa, obteve {result.total_sheets}"
        )

    def test_min_occupancy_95_bruto(self):
        """Aproveitamento bruto deve ser >= 95%."""
        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": True,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(CENARIO_A_PIECES, [SHEET])

        assert result.total_sheets == 1

        # Calcular aproveitamento bruto
        placed_area = sum(
            p.effective_length * p.effective_width
            for sl in result.sheets
            for p in sl.placements
        )
        aproveitamento_bruto = placed_area / AREA_BRUTA * 100

        assert aproveitamento_bruto >= 95.0, (
            f"Aproveitamento bruto {aproveitamento_bruto:.2f}% < 95%.\n"
            f"Ideal: {CENARIO_A_IDEAL_BRUTO:.2f}%\n"
            f"Area pecas: {CENARIO_A_TOTAL_AREA}\n"
            f"Area colocada: {placed_area}"
        )

    def test_all_pieces_placed(self):
        """Todas as 11 pecas devem ser colocadas."""
        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": True,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(CENARIO_A_PIECES, [SHEET])

        total_placed = sum(len(sl.placements) for sl in result.sheets)
        assert total_placed == 11, (
            f"Esperado 11 pecas, colocou {total_placed}"
        )

    def test_decisions_log(self):
        """O log de decisoes deve existir."""
        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": True,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(CENARIO_A_PIECES, [SHEET])

        assert len(builder.decisions_log) > 0, "decisions_log vazio"
        assert result.score_details.get("decisions_log") is not None


class TestCenarioB:
    """Cenario B — material com veio, sem rotacao."""

    def test_single_sheet(self):
        """Todas as pecas devem caber em 1 chapa."""
        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": False,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(CENARIO_B_PIECES, [SHEET_GRAIN])

        assert result.total_sheets == 1, (
            f"Esperado 1 chapa, obteve {result.total_sheets}"
        )

    def test_min_occupancy_95_bruto(self):
        """Aproveitamento bruto deve ser >= 95%."""
        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": False,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(CENARIO_B_PIECES, [SHEET_GRAIN])

        assert result.total_sheets == 1

        placed_area = sum(
            p.effective_length * p.effective_width
            for sl in result.sheets
            for p in sl.placements
        )
        aproveitamento_bruto = placed_area / AREA_BRUTA * 100

        assert aproveitamento_bruto >= 95.0, (
            f"Aproveitamento bruto {aproveitamento_bruto:.2f}% < 95%.\n"
            f"Ideal: {CENARIO_B_IDEAL_BRUTO:.2f}%\n"
            f"Area pecas: {CENARIO_B_TOTAL_AREA}\n"
            f"Area colocada: {placed_area}"
        )

    def test_all_pieces_placed(self):
        """Todas as 14 pecas devem ser colocadas."""
        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": False,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(CENARIO_B_PIECES, [SHEET_GRAIN])

        total_placed = sum(len(sl.placements) for sl in result.sheets)
        assert total_placed == 14, (
            f"Esperado 14 pecas, colocou {total_placed}"
        )

    def test_no_rotation_applied(self):
        """Nenhuma peca deve ter sido rotacionada."""
        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": False,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(CENARIO_B_PIECES, [SHEET_GRAIN])

        for sl in result.sheets:
            for p in sl.placements:
                assert not p.rotated, (
                    f"Peca {p.piece_persistent_id} foi rotacionada "
                    f"({p.rotation}°) — proibido no cenario B"
                )


# ---------------------------------------------------------------------------
# Runner detalhado (para uso direto: python -m pytest tests/test_benchmark_audit.py -v -s)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 70)
    print("BENCHMARK DE AUDITORIA — Motor de Otimizacao de Chapas")
    print("=" * 70)

    for name, pieces, sheet, ideal, allow_rot in [
        ("Cenario A (rotacao livre)", CENARIO_A_PIECES, SHEET, CENARIO_A_IDEAL_BRUTO, True),
        ("Cenario B (sem rotacao)", CENARIO_B_PIECES, SHEET_GRAIN, CENARIO_B_IDEAL_BRUTO, False),
    ]:
        print(f"\n--- {name} ---")
        print(f"Pecas: {len(pieces)}")
        print(f"Area total pecas: {sum(p.length * p.width for p in pieces):,.0f} mm2")
        print(f"Area bruta chapa: {AREA_BRUTA:,.0f} mm2")
        print(f"Ideal bruto: {ideal:.2f}%")

        config = NestingConfig(**{
            **BENCHMARK_CONFIG.__dict__,
            "allow_rotation": allow_rot,
        })
        builder = LayoutBuilder(config)
        result = builder.build_layout(pieces, [sheet])

        placed_area = sum(
            p.effective_length * p.effective_width
            for sl in result.sheets
            for p in sl.placements
        )
        total_placed = sum(len(sl.placements) for sl in result.sheets)
        aproveitamento_bruto = placed_area / AREA_BRUTA * 100
        aproveitamento_util = placed_area / (sheet.usable_length * sheet.usable_width) * 100

        print(f"Chapas usadas: {result.total_sheets}")
        print(f"Pecas colocadas: {total_placed}")
        print(f"Aproveitamento bruto: {aproveitamento_bruto:.2f}%")
        print(f"Aproveitamento util: {aproveitamento_util:.2f}%")
        print(f"Score: {result.score:.2f}")

        # Status
        if result.total_sheets > 1:
            print("RESULTADO: REPROVADO (mais de 1 chapa)")
        elif aproveitamento_bruto >= 96:
            print("RESULTADO: EXCELENTE")
        elif aproveitamento_bruto >= 95:
            print("RESULTADO: APROVADO")
        elif aproveitamento_bruto >= 94:
            print("RESULTADO: ACEITAVEL (merece inspecao)")
        else:
            print("RESULTADO: REPROVADO (< 94% bruto)")

        # Log de decisoes
        print(f"\nDecisoes do engine ({len(builder.decisions_log)} entradas):")
        for d in builder.decisions_log:
            print(f"  [{d['phase']}] {d}")

    print("\n" + "=" * 70)
