"""Enumeracoes do dominio CNC Optimizer."""

from enum import Enum


class GrainDirection(str, Enum):
    """Direcao do veio do material."""
    NONE = "sem_veio"
    HORIZONTAL = "horizontal"
    VERTICAL = "vertical"


class RotationPolicy(str, Enum):
    """Politica de rotacao da peca."""
    FREE = "free"            # 0, 90, 180, 270
    GRAIN_LOCKED = "grain"   # 0, 180 apenas
    FIXED = "fixed"          # 0 apenas


class PieceClassification(str, Enum):
    """Classificacao de tamanho da peca para vacuo."""
    NORMAL = "normal"
    SMALL = "pequena"           # < 400mm menor lado
    VERY_SMALL = "super_pequena"  # < 200mm menor lado


class VacuumRisk(str, Enum):
    """Nivel de risco de soltura por vacuo."""
    LOW = "low"           # < 0.3
    MEDIUM = "medium"     # 0.3 - 0.7
    HIGH = "high"         # 0.7 - 0.9
    CRITICAL = "critical"  # > 0.9


class OperationPhase(str, Enum):
    """Fase da operacao no plano de corte."""
    INTERNAL = "interna"        # furos, pockets, rasgos
    CONTOUR = "contorno"        # contorno externo da peca
    REMNANT = "retalho"         # contorno de retalho


class OperationType(str, Enum):
    """Tipo de operacao CNC."""
    HOLE = "hole"
    POCKET = "pocket"
    GROOVE = "groove"            # rasgo/canal
    INTERNAL_CONTOUR = "internal_contour"
    EXTERNAL_CONTOUR = "external_contour"
    REMNANT_CONTOUR = "remnant_contour"


class SheetType(str, Enum):
    """Tipo de chapa."""
    NEW = "new"
    REMNANT = "remnant"
    ORGANIC = "organic"          # contorno irregular


class FaceSide(str, Enum):
    """Lado da face de usinagem."""
    A = "A"
    B = "B"


class CutDirection(str, Enum):
    """Direcao de corte da fresa."""
    CLIMB = "climb"              # concordante
    CONVENTIONAL = "convencional"


class ZOrigin(str, Enum):
    """Origem do eixo Z."""
    TABLE = "mesa"               # Z0 = superficie da mesa
    MATERIAL_TOP = "topo"        # Z0 = topo do material


class ContourOrder(str, Enum):
    """Ordem de corte dos contornos."""
    SMALLEST_FIRST = "menor_primeiro"
    LARGEST_FIRST = "maior_primeiro"
    PROXIMITY = "proximidade"


class BinType(str, Enum):
    """Tipo de bin para nesting."""
    MAXRECTS = "maxrects"
    GUILLOTINE = "guillotine"
    SKYLINE = "skyline"
    SHELF = "shelf"


class SortStrategy(str, Enum):
    """Estrategia de ordenacao de pecas para nesting."""
    AREA_DESC = "area_desc"
    AREA_ASC = "area_asc"
    PERIM_DESC = "perim_desc"
    PERIM_ASC = "perim_asc"
    MAXSIDE_DESC = "maxside_desc"
    MAXSIDE_ASC = "maxside_asc"
    DIFF_DESC = "diff_desc"
    W_H_DESC = "w_h_desc"
    H_W_DESC = "h_w_desc"
    RATIO_SQ = "ratio_sq"
    RATIO_THIN = "ratio_thin"
    DIAGONAL = "diagonal"
    MINSIDE_DESC = "minside_desc"
    W_ASC_H_DESC = "w_asc_h_desc"
    AREA_DIFF = "area_diff"


class NestingHeuristic(str, Enum):
    """Heuristica de placement."""
    BSSF = "BSSF"   # Best Short Side Fit
    BLSF = "BLSF"   # Best Long Side Fit
    BAF = "BAF"      # Best Area Fit
    BL = "BL"        # Bottom-Left
    CP = "CP"        # Contact Point


class ScoreProfile(str, Enum):
    """Perfil de pesos do score."""
    BALANCED = "balanced"
    MAXIMIZE_OCCUPANCY = "maximize_occupancy"
    MINIMIZE_TIME = "minimize_time"
    CNC_SAFE = "cnc_safe"
