"""Modelos Pydantic do dominio CNC Optimizer.

Todos os modelos tipados que representam o dominio: pecas, chapas,
operacoes de usinagem, posicionamentos, configuracao de maquina, etc.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Optional

from .enums import (
    GrainDirection,
    RotationPolicy,
    PieceClassification,
    VacuumRisk,
    OperationPhase,
    OperationType,
    FaceSide,
    CutDirection,
    ZOrigin,
    ContourOrder,
    SheetType,
)


# ---------------------------------------------------------------------------
# Geometria / Contorno
# ---------------------------------------------------------------------------

class Segment(BaseModel):
    """Segmento de contorno: linha ou arco."""
    type: str  # "line" ou "arc"
    x1: float = 0
    y1: float = 0
    x2: float = 0
    y2: float = 0
    # Campos de arco (opcionais)
    cx: Optional[float] = None   # centro X do arco
    cy: Optional[float] = None   # centro Y do arco
    r: Optional[float] = None    # raio
    dir: Optional[str] = None    # "cw" ou "ccw"


class Hole(BaseModel):
    """Furo ou vazado interno de uma peca."""
    type: str  # "circle" ou "polygon"
    # Para circle:
    cx: Optional[float] = None
    cy: Optional[float] = None
    r: Optional[float] = None
    # Para polygon:
    segments: list[Segment] = []


class Contour(BaseModel):
    """Contorno 2D completo de uma peca (outer + holes)."""
    outer: list[Segment] = []
    holes: list[Hole] = []


# ---------------------------------------------------------------------------
# Usinagem / Workers
# ---------------------------------------------------------------------------

class Worker(BaseModel):
    """Operacao individual de usinagem (furo, rasgo, pocket, contorno)."""
    category: str = ""         # "Transfer_vertical_saw_cut", "transfer_hole"
    tool_code: str = ""        # "f_15mm_tambor_min", "r_f", etc.
    face: str = ""             # "top", "back", "left", "bottom_edge", etc.
    side: str = ""             # "side_a", "side_b"
    x: float = 0
    y: float = 0
    depth: float = 5
    # Campos adicionais (rasgos)
    length: Optional[float] = None
    width: Optional[float] = None
    diameter: Optional[float] = None
    corner_radius: Optional[float] = None


class MachiningData(BaseModel):
    """Dados completos de usinagem de uma peca."""
    code: str = ""                     # "123456A"
    workers: list[Worker] = []
    contour: Optional[Contour] = None
    borders: list[str] = []            # 4 bordas [frente, tras, esq, dir]


class FaceMachiningProfile(BaseModel):
    """Perfil de usinagem de uma face (A ou B)."""
    face: FaceSide = FaceSide.A
    worker_count: int = 0
    total_machining_depth: float = 0
    contour_complexity: float = 0      # 0-1
    removed_area_ratio: float = 0      # area removida / area total
    tool_changes: int = 0
    has_through_holes: bool = False
    finish_sensitive: bool = False
    setup_difficulty: float = 0        # 0-1


# ---------------------------------------------------------------------------
# Pecas
# ---------------------------------------------------------------------------

class EdgeBands(BaseModel):
    """Fitas de borda da peca (4 lados)."""
    front: str = ""       # upmedgeside1 (comprimento frontal)
    back: str = ""        # upmedgeside2 (comprimento traseiro)
    left: str = ""        # upmedgeside3 (largura esquerda)
    right: str = ""       # upmedgeside4 (largura direita)
    type_code: str = ""   # "1C", "2C+1L", "4Lados"


class Piece(BaseModel):
    """Peca 2D com geometria, usinagem e metadados."""
    id: int = 0
    persistent_id: str = ""
    upmcode: str = ""                # CM_LAT_DIR, CM_BAS, etc.
    description: str = ""
    module_desc: str = ""            # "Balcao", "Armario Alto"
    module_id: int = 0
    product_final: str = ""

    # Material
    material: str = ""               # nome completo do material
    material_code: str = ""          # MDF_18.5_BRANCO_TX
    thickness_nominal: float = 18
    thickness_real: float = 18.5
    finish: str = ""                 # BRANCO_TX

    # Dimensoes (mm)
    length: float = 0                # comprimento (dimensao maior)
    width: float = 0                 # largura (dimensao menor)
    quantity: int = 1

    # Orientacao e visual
    upmdraw: str = ""                # FTE1x2, FTED1x3, etc.
    grain: GrainDirection = GrainDirection.NONE
    rotation_policy: RotationPolicy = RotationPolicy.FREE
    visual_face_sensitive: bool = False

    # Classificacao
    classification: PieceClassification = PieceClassification.NORMAL

    # Geometria
    contour: Optional[Contour] = None   # None = retangular
    is_rectangular: bool = True

    # Bordas
    edges: EdgeBands = EdgeBands()

    # Usinagem
    machining: MachiningData = MachiningData()
    face_a_profile: Optional[FaceMachiningProfile] = None
    face_b_profile: Optional[FaceMachiningProfile] = None
    preferred_face: FaceSide = FaceSide.A
    requires_flip: bool = False

    # Computados
    area_mm2: float = 0
    perimeter_mm: float = 0

    def compute_area(self) -> float:
        """Calcular area da peca."""
        self.area_mm2 = self.length * self.width
        return self.area_mm2

    def compute_perimeter(self) -> float:
        """Calcular perimetro da peca."""
        self.perimeter_mm = 2 * (self.length + self.width)
        return self.perimeter_mm

    def classify(self, small_threshold: float = 400, very_small_threshold: float = 200) -> None:
        """Classificar peca por tamanho (para calculo de vacuo)."""
        min_side = min(self.length, self.width)
        if min_side < very_small_threshold:
            self.classification = PieceClassification.VERY_SMALL
        elif min_side < small_threshold:
            self.classification = PieceClassification.SMALL
        else:
            self.classification = PieceClassification.NORMAL


# ---------------------------------------------------------------------------
# Chapas e Retalhos
# ---------------------------------------------------------------------------

class Sheet(BaseModel):
    """Chapa de material para corte."""
    id: int = 0
    name: str = ""
    type: SheetType = SheetType.NEW
    material_code: str = ""
    thickness_nominal: float = 18
    thickness_real: float = 18.5
    length: float = 2750             # comprimento (mm)
    width: float = 1850              # largura (mm)
    trim: float = 10                 # refilo (mm)
    grain: GrainDirection = GrainDirection.NONE
    kerf: float = 4                  # largura do disco (mm)
    price: float = 0
    active: bool = True

    # Para chapas organicas
    contour: Optional[Contour] = None
    holes: list[Hole] = []
    forbidden_areas: list[Contour] = []

    @property
    def usable_length(self) -> float:
        """Comprimento util apos refilo."""
        return self.length - 2 * self.trim

    @property
    def usable_width(self) -> float:
        """Largura util apos refilo."""
        return self.width - 2 * self.trim

    @property
    def usable_area(self) -> float:
        """Area util apos refilo."""
        return self.usable_length * self.usable_width


class Remnant(BaseModel):
    """Retalho (sobra) de chapa reutilizavel."""
    id: int = 0
    name: str = ""
    material_code: str = ""
    thickness_real: float = 0
    length: float = 0
    width: float = 0
    available: bool = True
    origin_batch: str = ""
    sheet_ref_id: Optional[int] = None

    # Para retalhos organicos
    contour: Optional[Contour] = None

    @property
    def area(self) -> float:
        return self.length * self.width

    @property
    def is_usable(self, min_width: float = 300, min_length: float = 600) -> bool:
        return self.length >= min_length and self.width >= min_width


# ---------------------------------------------------------------------------
# Ferramentas e Maquina
# ---------------------------------------------------------------------------

class MachineTool(BaseModel):
    """Ferramenta do magazine da CNC."""
    id: int = 0
    code: str = ""                   # codigo no sistema
    name: str = ""
    type: str = "broca"              # broca, fresa_reta, fresa_compressao, serra
    diameter: float = 0              # mm
    max_depth: float = 30            # mm
    doc: Optional[float] = None      # depth of cut por passe (mm)
    extra_depth: float = 0.2         # profundidade extra (mm)
    cut_speed: float = 4000          # mm/min
    rpm: int = 12000
    tool_code: str = ""              # codigo que bate com worker.tool_code
    tool_number: Optional[int] = None  # T01, T02...


class MachineConfig(BaseModel):
    """Configuracao completa da maquina CNC (postprocessador)."""
    id: int = 0
    name: str = ""

    # G-code
    gcode_header: str = "%\nG90 G54 G17"
    gcode_footer: str = "G0 Z200.000\nM5\nM30\n%"
    comment_prefix: str = ";"
    tool_change_cmd: str = "M6"
    spindle_on_cmd: str = "M3"
    spindle_off_cmd: str = "M5"

    # Eixo Z
    z_safe: float = 30               # mm - altura segura
    z_approach: float = 2.0          # mm - aproximacao lenta
    z_approach_rapid: float = 5.0    # mm - aproximacao rapida
    z_origin: ZOrigin = ZOrigin.TABLE
    extra_depth: float = 0.2         # mm - profundidade extra

    # Velocidades
    cut_speed: float = 4000          # mm/min
    plunge_speed: float = 1500       # mm/min
    rapid_speed: float = 20000       # mm/min
    rpm_default: int = 12000

    # Precisao
    decimal_places: int = 3

    # Onion Skin
    use_onion_skin: bool = True
    onion_thickness: float = 0.5     # mm
    onion_max_area: float = 500      # cm²

    # Tabs
    use_tabs: bool = False
    tab_width: float = 4             # mm
    tab_height: float = 1.5          # mm
    tab_count: int = 2
    tab_max_area: float = 800        # cm²

    # Lead-in / Lead-out
    use_lead_in: bool = True
    lead_in_radius: float = 5        # mm
    lead_in_type: str = "arc"        # "arc" ou "line"

    # Rampa
    use_ramp: bool = True
    ramp_angle: float = 3.0          # graus

    # Direcao de corte
    cut_direction: CutDirection = CutDirection.CLIMB
    contour_order: ContourOrder = ContourOrder.SMALLEST_FIRST

    # Feed rate para pecas pequenas
    feed_pct_small: float = 50       # % da velocidade normal
    feed_max_area: float = 500       # cm² - abaixo disso, reduz velocidade

    # Mergulho
    plunge_speed_factor: float = 1.0
    dwell_spindle: float = 0         # segundos de espera apos ligar spindle

    # N-codes
    use_n_codes: bool = False
    n_code_increment: int = 10

    # Exportacao
    export_side_a: bool = True
    export_side_b: bool = False
    export_holes: bool = True
    export_grooves: bool = True


# ---------------------------------------------------------------------------
# Posicionamento e Layout
# ---------------------------------------------------------------------------

class Placement(BaseModel):
    """Posicionamento de uma instancia de peca em uma chapa."""
    piece_id: int = 0
    piece_persistent_id: str = ""
    instance: int = 0                # instancia (0 a quantidade-1)
    sheet_index: int = 0
    x: float = 0                     # posicao X na chapa (mm, dentro do refilo)
    y: float = 0                     # posicao Y na chapa (mm, dentro do refilo)
    rotation: float = 0              # graus (0, 90, 180, 270)
    rotated: bool = False
    face_up: FaceSide = FaceSide.A

    # Dimensoes efetivas (apos rotacao)
    effective_length: float = 0
    effective_width: float = 0

    # Scores
    rotation_score: float = 0
    vacuum_risk: float = 0
    vacuum_class: VacuumRisk = VacuumRisk.LOW


class SheetLayout(BaseModel):
    """Layout de uma chapa com pecas posicionadas."""
    index: int = 0
    sheet: Sheet = Sheet()
    placements: list[Placement] = []
    occupancy: float = 0             # percentual 0-100
    piece_count: int = 0
    remnants: list[dict] = []        # retalhos gerados {x, y, w, h}
    kerf: float = 4
    trim: float = 10
    cuts: list[dict] = []


class LayoutResult(BaseModel):
    """Resultado completo de um nesting."""
    sheets: list[SheetLayout] = []
    total_sheets: int = 0
    total_pieces: int = 0
    avg_occupancy: float = 0
    min_occupancy: float = 0
    max_occupancy: float = 0
    score: float = 0
    score_details: dict = {}
    config_used: dict = {}


# ---------------------------------------------------------------------------
# Operacoes de Corte
# ---------------------------------------------------------------------------

class CuttingOperation(BaseModel):
    """Operacao individual no plano de corte."""
    id: int = 0
    piece_id: int = 0
    piece_persistent_id: str = ""
    sheet_index: int = 0
    type: OperationType = OperationType.HOLE
    phase: OperationPhase = OperationPhase.INTERNAL

    # Ferramenta
    tool_code: str = ""
    tool_diameter: float = 0

    # Posicao absoluta na chapa (mm)
    x: float = 0
    y: float = 0
    depth: float = 5

    # Geometria da operacao
    length: Optional[float] = None   # comprimento (rasgos)
    width: Optional[float] = None    # largura (rasgos)
    contour_segments: list[Segment] = []  # para contornos complexos

    # Retencao
    use_onion_skin: bool = False
    onion_thickness: float = 0.5
    tabs: list[dict] = []            # [{x, y, width, height}]

    # Ordem
    sequence: int = 0
    priority: int = 0


class CuttingPlan(BaseModel):
    """Plano de corte completo para uma chapa."""
    sheet_index: int = 0
    operations: list[CuttingOperation] = []
    tool_changes: int = 0
    total_travel: float = 0          # mm de deslocamento vazio
    estimated_time: float = 0        # minutos estimados


# ---------------------------------------------------------------------------
# Resultado de Simulacao de Vacuo
# ---------------------------------------------------------------------------

class PieceVacuumResult(BaseModel):
    """Resultado de vacuo para uma peca individual."""
    piece_id: int = 0
    piece_persistent_id: str = ""
    initial_risk: float = 0
    max_risk: float = 0
    risk_at_cut: float = 0           # risco no momento do corte
    risk_class: VacuumRisk = VacuumRisk.LOW
    supported_area_ratio: float = 1.0
    suggested_action: str = ""       # "", "tabs", "onion_skin", "reorder"


class VacuumSimulationResult(BaseModel):
    """Resultado completo da simulacao de vacuo."""
    sheet_index: int = 0
    pieces: list[PieceVacuumResult] = []
    critical_count: int = 0
    high_count: int = 0
    suggestions: list[str] = []


# ---------------------------------------------------------------------------
# Score
# ---------------------------------------------------------------------------

class LayoutScore(BaseModel):
    """Score detalhado de um layout."""
    total: float = 0
    occupancy: float = 0
    sheet_count: float = 0
    compactness: float = 0
    travel: float = 0
    vacuum: float = 0
    rotation: float = 0
    remnant_value: float = 0
    face_selection: float = 0


# ---------------------------------------------------------------------------
# Job de Otimizacao
# ---------------------------------------------------------------------------

class OptimizationConfig(BaseModel):
    """Configuracao de uma otimizacao."""
    spacing: float = 7               # espaco entre pecas (mm)
    kerf: Optional[float] = None     # override do kerf da chapa
    trim: Optional[float] = None     # override do refilo
    allow_rotation: Optional[bool] = None  # None = usar logica de veio
    bin_type: str = "maxrects"       # maxrects, guillotine, skyline, shelf
    split_direction: str = "auto"    # auto, horizontal, vertical
    use_remnants: bool = True
    consider_remnants: bool = True
    min_remnant_width: float = 300   # mm
    min_remnant_length: float = 600  # mm
    vacuum_aware: bool = True
    max_iterations: int = 300
    ga_population: Optional[int] = None
    ga_generations: Optional[int] = None
    score_profile: str = "balanced"


class OptimizationJob(BaseModel):
    """Job completo de otimizacao."""
    id: Optional[int] = None
    batch_id: int = 0
    pieces: list[Piece] = []
    sheets: list[Sheet] = []
    remnants: list[Remnant] = []
    machine: MachineConfig = MachineConfig()
    tools: list[MachineTool] = []
    config: OptimizationConfig = OptimizationConfig()


class OptimizationResult(BaseModel):
    """Resultado completo de uma otimizacao."""
    job_id: int = 0
    layout: LayoutResult = LayoutResult()
    cutting_plans: list[CuttingPlan] = []
    vacuum_results: list[VacuumSimulationResult] = []
    score: LayoutScore = LayoutScore()
    elapsed_seconds: float = 0
