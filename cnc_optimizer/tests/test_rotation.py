"""Testes de rotacao e selecao de face (FASE 4)."""

import pytest

from app.core.domain.models import Piece, Sheet, Worker, MachiningData, FaceMachiningProfile
from app.core.domain.enums import (
    GrainDirection, RotationPolicy, FaceSide, SheetType,
)
from app.core.rotation.rotation_policy import (
    get_allowed_rotations,
    rotation_is_allowed,
    piece_needs_rotation,
    get_effective_dimensions,
    piece_fits_rotated,
)
from app.core.rotation.rotation_scoring import (
    score_rotation,
    find_best_rotation,
    rank_rotations,
    RotationWeights,
    RotationScore,
)
from app.core.faces.face_profiles import (
    classify_worker_side,
    split_workers_by_face,
    build_face_profile,
    build_both_profiles,
)
from app.core.faces.face_selector import (
    select_primary_face,
    requires_flip,
    count_flips,
    apply_face_selection,
    analyze_piece_faces,
)


# ===================================================================
# Helpers
# ===================================================================

def _make_piece(**kwargs) -> Piece:
    """Criar peca de teste com defaults."""
    defaults = {
        "id": 1,
        "persistent_id": "test_001",
        "description": "Teste",
        "length": 720,
        "width": 550,
        "thickness_real": 18.5,
        "grain": GrainDirection.NONE,
        "rotation_policy": RotationPolicy.FREE,
        "is_rectangular": True,
    }
    defaults.update(kwargs)
    return Piece(**defaults)


def _make_sheet(**kwargs) -> Sheet:
    """Criar chapa de teste."""
    defaults = {
        "id": 1,
        "length": 2750,
        "width": 1850,
        "trim": 10,
        "grain": GrainDirection.NONE,
    }
    defaults.update(kwargs)
    return Sheet(**defaults)


def _make_worker(**kwargs) -> Worker:
    """Criar worker de teste."""
    defaults = {
        "category": "transfer_hole",
        "tool_code": "f_5mm_twister243",
        "face": "top",
        "side": "side_a",
        "x": 37,
        "y": 37,
        "depth": 12,
    }
    defaults.update(kwargs)
    return Worker(**defaults)


# ===================================================================
# ROTATION POLICY
# ===================================================================

class TestAllowedRotations:
    """Testes de rotacoes permitidas."""

    def test_free_rectangular(self):
        """Retangulo sem veio → [0, 90] (deduplicado)."""
        piece = _make_piece(length=720, width=550)
        rotations = get_allowed_rotations(piece)
        assert rotations == [0.0, 90.0]

    def test_free_square(self):
        """Quadrado sem veio → [0] (deduplicado)."""
        piece = _make_piece(length=500, width=500)
        rotations = get_allowed_rotations(piece)
        assert rotations == [0.0]

    def test_free_irregular(self):
        """Peca irregular sem veio → [0, 90, 180, 270]."""
        piece = _make_piece(is_rectangular=False)
        rotations = get_allowed_rotations(piece)
        assert rotations == [0.0, 90.0, 180.0, 270.0]

    def test_grain_locked_rectangular(self):
        """Retangulo com veio → [0] (180 deduplicado)."""
        piece = _make_piece(
            grain=GrainDirection.HORIZONTAL,
            rotation_policy=RotationPolicy.GRAIN_LOCKED,
        )
        rotations = get_allowed_rotations(piece)
        assert rotations == [0.0]

    def test_grain_locked_irregular(self):
        """Peca irregular com veio → [0, 180]."""
        piece = _make_piece(
            grain=GrainDirection.HORIZONTAL,
            rotation_policy=RotationPolicy.GRAIN_LOCKED,
            is_rectangular=False,
        )
        rotations = get_allowed_rotations(piece)
        assert rotations == [0.0, 180.0]

    def test_fixed(self):
        """Peca fixa → [0]."""
        piece = _make_piece(rotation_policy=RotationPolicy.FIXED)
        rotations = get_allowed_rotations(piece)
        assert rotations == [0.0]

    def test_grain_with_sheet(self):
        """Peca com veio + chapa com veio compativel."""
        piece = _make_piece(
            grain=GrainDirection.HORIZONTAL,
            rotation_policy=RotationPolicy.GRAIN_LOCKED,
            is_rectangular=False,
        )
        sheet = _make_sheet(grain=GrainDirection.HORIZONTAL)
        rotations = get_allowed_rotations(piece, sheet)
        assert 0.0 in rotations

    def test_grain_incompatible_sheet(self):
        """Peca com veio horizontal + chapa com veio vertical → [0]."""
        piece = _make_piece(
            grain=GrainDirection.HORIZONTAL,
            rotation_policy=RotationPolicy.GRAIN_LOCKED,
        )
        sheet = _make_sheet(grain=GrainDirection.VERTICAL)
        rotations = get_allowed_rotations(piece, sheet)
        assert rotations == [0.0]


class TestRotationHelpers:
    """Testes de helpers de rotacao."""

    def test_rotation_is_allowed_free(self):
        """Verificar rotacoes especificas."""
        piece = _make_piece()
        assert rotation_is_allowed(piece, 0)
        assert rotation_is_allowed(piece, 90)
        assert not rotation_is_allowed(piece, 45)

    def test_piece_needs_rotation_rectangular(self):
        """Retangulo precisa de rotacao."""
        piece = _make_piece(length=720, width=550)
        assert piece_needs_rotation(piece)

    def test_piece_needs_rotation_square(self):
        """Quadrado nao precisa de rotacao."""
        piece = _make_piece(length=500, width=500)
        assert not piece_needs_rotation(piece)

    def test_effective_dimensions_0(self):
        """Rotacao 0: dimensoes originais."""
        piece = _make_piece(length=720, width=550)
        l, w = get_effective_dimensions(piece, 0)
        assert l == 720
        assert w == 550

    def test_effective_dimensions_90(self):
        """Rotacao 90: troca dimensoes."""
        piece = _make_piece(length=720, width=550)
        l, w = get_effective_dimensions(piece, 90)
        assert l == 550
        assert w == 720

    def test_effective_dimensions_180(self):
        """Rotacao 180: dimensoes originais."""
        piece = _make_piece(length=720, width=550)
        l, w = get_effective_dimensions(piece, 180)
        assert l == 720
        assert w == 550

    def test_piece_fits_rotated(self):
        """Peca cabe apos rotacao."""
        piece = _make_piece(length=720, width=550)
        assert piece_fits_rotated(piece, 0, 800, 600)
        assert piece_fits_rotated(piece, 90, 600, 800)
        assert not piece_fits_rotated(piece, 0, 700, 600)  # 720 > 700


# ===================================================================
# ROTATION SCORING
# ===================================================================

class TestRotationScoring:
    """Testes do scoring de rotacao."""

    def test_score_valid_rotation(self):
        """Score de rotacao valida tem total > 0."""
        piece = _make_piece()
        score = score_rotation(piece, 0, 1000, 800)
        assert score.fits
        assert score.total > 0
        assert score.effective_length == 720
        assert score.effective_width == 550

    def test_score_doesnt_fit(self):
        """Score de rotacao que nao cabe tem total negativo."""
        piece = _make_piece(length=720, width=550)
        score = score_rotation(piece, 0, 500, 400)  # muito pequeno
        assert not score.fits
        assert score.total < 0

    def test_score_90_different(self):
        """Score de 0 vs 90 pode ser diferente."""
        piece = _make_piece(length=720, width=550)
        score_0 = score_rotation(piece, 0, 800, 600)
        score_90 = score_rotation(piece, 90, 800, 600)
        # Rotacao 90: 550x720, nao cabe em 800x600 (720 > 600)
        assert score_0.fits
        assert not score_90.fits

    def test_find_best_rotation(self):
        """Encontrar melhor rotacao."""
        piece = _make_piece(length=720, width=550)
        best = find_best_rotation(piece, 1000, 800)
        assert best.fits
        assert best.total > 0

    def test_find_best_when_only_90_fits(self):
        """Quando so 90 graus cabe, seleciona 90."""
        piece = _make_piece(length=720, width=550)
        # Espaco 600x800: so rotacao 90 (550x720) cabe
        best = find_best_rotation(piece, 600, 800)
        assert best.fits
        assert best.rotation == 90.0

    def test_rank_rotations(self):
        """Rankear rotacoes."""
        piece = _make_piece(length=720, width=550)
        ranked = rank_rotations(piece, 1000, 800)
        assert len(ranked) >= 1
        # Primeiro deve ser o que cabe com melhor score
        assert ranked[0].fits

    def test_custom_weights(self):
        """Pesos customizados afetam score."""
        piece = _make_piece()
        weights = RotationWeights(
            fit_gain=1.0,
            compactness=0.0,
            vacuum_support=0.0,
            cut_stability=0.0,
            travel_reduction=0.0,
            machining_access=0.0,
        )
        score = score_rotation(piece, 0, 1000, 800, weights=weights)
        assert score.fits
        # Score = fit_gain puro
        assert abs(score.total - score.fit_gain) < 0.001

    def test_weights_validation(self):
        """Pesos devem somar 1.0."""
        valid = RotationWeights()
        assert valid.validate()

        invalid = RotationWeights(fit_gain=0.5)  # soma != 1
        assert not invalid.validate()


# ===================================================================
# FACE PROFILES
# ===================================================================

class TestFaceProfiles:
    """Testes de perfis de usinagem por face."""

    def test_classify_top_as_side_a(self):
        """Workers no topo = side A."""
        w = _make_worker(face="top")
        assert classify_worker_side(w) == FaceSide.A

    def test_classify_back_as_side_b(self):
        """Workers atras = side B."""
        w = _make_worker(face="back")
        assert classify_worker_side(w) == FaceSide.B

    def test_classify_bottom_as_side_b(self):
        """Workers embaixo = side B."""
        w = _make_worker(face="bottom")
        assert classify_worker_side(w) == FaceSide.B

    def test_classify_top_edge_as_side_a(self):
        """Workers na borda superior = side A."""
        w = _make_worker(face="top_edge")
        assert classify_worker_side(w) == FaceSide.A

    def test_split_workers(self):
        """Separar workers por face."""
        workers = [
            _make_worker(face="top"),
            _make_worker(face="top"),
            _make_worker(face="back"),
        ]
        a, b = split_workers_by_face(workers)
        assert len(a) == 2
        assert len(b) == 1

    def test_build_profile_empty(self):
        """Perfil sem workers."""
        profile = build_face_profile([], FaceSide.A)
        assert profile.worker_count == 0
        assert profile.total_machining_depth == 0

    def test_build_profile_with_workers(self):
        """Perfil com workers."""
        workers = [
            _make_worker(depth=12, tool_code="f_5mm_twister243"),
            _make_worker(depth=14, tool_code="f_15mm_tambor_min"),
            _make_worker(depth=10, tool_code="r_f"),
        ]
        profile = build_face_profile(workers, FaceSide.A, piece_area=396000)

        assert profile.worker_count == 3
        assert profile.total_machining_depth == 36  # 12+14+10
        assert profile.tool_changes == 2  # 3 ferramentas distintas
        assert profile.contour_complexity > 0

    def test_build_both_profiles(self):
        """Construir perfis para ambas faces."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="top", tool_code="f_5mm_twister243"),
                    _make_worker(face="top", tool_code="f_15mm_tambor_min"),
                    _make_worker(face="back", tool_code="f_35mm_dob"),
                ]
            )
        )
        profile_a, profile_b = build_both_profiles(piece)

        assert profile_a.worker_count == 2
        assert profile_b.worker_count == 1

    def test_finish_sensitive_dobradica(self):
        """Furo de dobradica indica face sensivel."""
        workers = [_make_worker(tool_code="f_35mm_dob", face="back")]
        profile = build_face_profile(workers, FaceSide.B)
        assert profile.finish_sensitive


# ===================================================================
# FACE SELECTOR
# ===================================================================

class TestFaceSelector:
    """Testes de selecao de face."""

    def test_no_machining_defaults_a(self):
        """Sem usinagem → face A."""
        piece = _make_piece()
        assert select_primary_face(piece) == FaceSide.A

    def test_only_face_a(self):
        """Usinagem so na face A → A."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="top"),
                    _make_worker(face="top"),
                ]
            )
        )
        assert select_primary_face(piece) == FaceSide.A

    def test_only_face_b(self):
        """Usinagem so na face B → B."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="back"),
                    _make_worker(face="back"),
                ]
            )
        )
        assert select_primary_face(piece) == FaceSide.B

    def test_more_face_a(self):
        """Mais usinagem na face A → A."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="top"),
                    _make_worker(face="top"),
                    _make_worker(face="top"),
                    _make_worker(face="back"),
                ]
            )
        )
        assert select_primary_face(piece) == FaceSide.A

    def test_more_face_b(self):
        """Mais usinagem na face B → B."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="top"),
                    _make_worker(face="back"),
                    _make_worker(face="back"),
                    _make_worker(face="back"),
                ]
            )
        )
        assert select_primary_face(piece) == FaceSide.B

    def test_requires_flip_both_faces(self):
        """Peca com workers em ambas faces precisa de flip."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="top"),
                    _make_worker(face="back"),
                ]
            )
        )
        assert requires_flip(piece)

    def test_no_flip_single_face(self):
        """Peca com workers so numa face nao precisa de flip."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="top"),
                    _make_worker(face="top"),
                ]
            )
        )
        assert not requires_flip(piece)

    def test_no_flip_no_machining(self):
        """Peca sem usinagem nao precisa de flip."""
        piece = _make_piece()
        assert not requires_flip(piece)

    def test_count_flips(self):
        """Contar flips num lote."""
        pieces = [
            _make_piece(id=1, machining=MachiningData(
                workers=[_make_worker(face="top"), _make_worker(face="back")]
            )),
            _make_piece(id=2, machining=MachiningData(
                workers=[_make_worker(face="top")]
            )),
            _make_piece(id=3, machining=MachiningData(
                workers=[_make_worker(face="top"), _make_worker(face="bottom")]
            )),
        ]
        assert count_flips(pieces) == 2  # 1a e 3a precisam de flip

    def test_apply_face_selection(self):
        """Aplicar selecao atualiza campos da peca."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="top"),
                    _make_worker(face="top"),
                    _make_worker(face="back"),
                ]
            )
        )
        apply_face_selection(piece)

        assert piece.face_a_profile is not None
        assert piece.face_b_profile is not None
        assert piece.face_a_profile.worker_count == 2
        assert piece.face_b_profile.worker_count == 1
        assert piece.preferred_face == FaceSide.A
        assert piece.requires_flip is True

    def test_analyze_piece_faces(self):
        """Analise completa retorna dicionario."""
        piece = _make_piece(
            machining=MachiningData(
                workers=[
                    _make_worker(face="top", tool_code="f_5mm_twister243"),
                    _make_worker(face="back", tool_code="f_35mm_dob"),
                ]
            )
        )
        analysis = analyze_piece_faces(piece)

        assert analysis["primary_face"] in ("A", "B")
        assert analysis["requires_flip"] is True
        assert analysis["face_a"]["worker_count"] == 1
        assert analysis["face_b"]["worker_count"] == 1
        assert analysis["flip_reason"] is not None


# ===================================================================
# Cenarios reais
# ===================================================================

class TestRealRotationScenarios:
    """Cenarios realistas de producao."""

    def test_lateral_branco_livre(self):
        """Lateral Branco TX: rotacao livre, melhor rotacao encontrada."""
        piece = _make_piece(
            description="Lateral Direita",
            material_code="MDF_18.5_BRANCO_TX",
            length=720, width=550,
            grain=GrainDirection.NONE,
            rotation_policy=RotationPolicy.FREE,
        )
        best = find_best_rotation(piece, 2730, 1830)
        assert best.fits
        assert best.rotation in [0.0, 90.0]

    def test_lateral_carvalho_travada(self):
        """Lateral Carvalho: so rotacao 0 (retangulo com veio)."""
        piece = _make_piece(
            description="Lateral Carvalho",
            material_code="MDF_18.5_CARVALHO_HANOVER",
            length=2200, width=600,
            grain=GrainDirection.HORIZONTAL,
            rotation_policy=RotationPolicy.GRAIN_LOCKED,
        )
        rotations = get_allowed_rotations(piece)
        assert rotations == [0.0]

    def test_porta_com_dobradicas(self):
        """Porta com dobradicas: face B (back) tem furos 35mm."""
        piece = _make_piece(
            description="Porta Lisa",
            length=716, width=597,
            machining=MachiningData(
                workers=[
                    Worker(category="transfer_hole", tool_code="f_35mm_dob",
                           face="back", x=100, y=22, depth=14),
                    Worker(category="transfer_hole", tool_code="f_35mm_dob",
                           face="back", x=616, y=22, depth=14),
                ]
            )
        )
        # Porta so tem usinagem na face B
        assert select_primary_face(piece) == FaceSide.B
        assert not requires_flip(piece)  # So face B

    def test_lateral_com_system32_e_rasgo(self):
        """Lateral com System 32 (face A) + rasgo fundo (face A)."""
        piece = _make_piece(
            description="Lateral",
            length=720, width=550,
            machining=MachiningData(
                workers=[
                    Worker(category="transfer_hole", tool_code="f_5mm_twister243",
                           face="top", x=37, y=37, depth=12),
                    Worker(category="transfer_hole", tool_code="f_5mm_twister243",
                           face="top", x=37, y=69, depth=12),
                    Worker(category="transfer_hole", tool_code="f_15mm_tambor_min",
                           face="top", x=37, y=274, depth=14),
                    Worker(category="Transfer_vertical_saw_cut", tool_code="r_f",
                           face="left", x=0, y=17, depth=10.5,
                           length=720, width=6),
                ]
            )
        )
        # Face A tem 4 workers, face B nenhum → A
        assert select_primary_face(piece) == FaceSide.A
        assert not requires_flip(piece)

    def test_peca_dois_lados(self):
        """Peca com usinagem em ambos os lados precisa de flip."""
        piece = _make_piece(
            description="Base com minifix",
            length=1164, width=550,
            machining=MachiningData(
                workers=[
                    # Face A: furos System 32
                    Worker(category="transfer_hole", tool_code="f_5mm_twister243",
                           face="top", x=37, y=37, depth=12),
                    Worker(category="transfer_hole", tool_code="f_5mm_twister243",
                           face="top", x=37, y=513, depth=12),
                    # Face B: minifix eixo
                    Worker(category="transfer_hole", tool_code="f_8mm_eixo_tambor_min",
                           face="bottom", x=37, y=275, depth=30),
                ]
            )
        )
        assert requires_flip(piece)
        # Face B tem through-hole (depth=30 >= 15mm), prioridade mais alta
        assert select_primary_face(piece) == FaceSide.B
