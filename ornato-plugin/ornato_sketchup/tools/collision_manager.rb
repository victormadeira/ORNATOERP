# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# CollisionManager — Fast AABB collision queries for Ornato
#
# Provides:
#   1. A cached bounding-box index of all Ornato modules so that
#      PlacementTool can query without rebuilding the list every
#      mouse move (SketchUp calls onMouseMove ~60× per second)
#
#   2. A "ghost box" test: given a position + dimensions, returns
#      the list of colliding groups (if any)
#
#   3. A snap grid: snaps the candidate position to whole mm
#      increments (user-configurable)
#
# Usage pattern in PlacementTool:
#
#   cm = CollisionManager.new          # build cache once
#   result = cm.query(pt, w, d, h)    # called on every mouse move
#   result[:collides]                  # true/false
#   result[:colliding_groups]          # [Sketchup::Group, ...]
#   result[:snap_candidates]           # [{pt:, type:, group:}, ...]
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    class CollisionManager

      # Shrink ghost AABB by this amount to allow modules to touch
      COLLISION_SHRINK = 1.5 # mm

      # Snap magnet distance — how close before we snap
      SNAP_DISTANCE = 20.0  # mm

      # How many model units = 1mm (SketchUp internal = inches)
      MM = 1.0.mm

      # ─────────────────────────────────────────────────────────
      # Build the collision index from the current model state.
      # Call once per placement operation (not on every mouse move).
      # ─────────────────────────────────────────────────────────
      def initialize(exclude_group = nil)
        @cache = []
        @exclude_id = exclude_group&.entityID

        model = Sketchup.active_model
        return unless model

        model.active_entities.each do |e|
          next unless e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)
          next if e.entityID == @exclude_id
          next unless e.get_attribute('Ornato', 'module_type') || e.get_attribute('Ornato', 'params')

          bb = e.bounds
          @cache << {
            group:  e,
            min:    bb.min,
            max:    bb.max,
            center: bb.center,
            type:   e.get_attribute('Ornato', 'module_type').to_s,
          }
        end
      end

      # Rebuild the cache (call after user undos or deletes modules)
      def refresh(exclude_group = nil)
        initialize(exclude_group)
      end

      # ─────────────────────────────────────────────────────────
      # Query whether a ghost box at `origin` with dimensions
      # `w` (X), `d` (Y), `h` (Z) — all in SketchUp internal units
      # — collides with any cached module, and compute snap candidates.
      #
      # @param origin [Geom::Point3d]  bottom-left-front corner
      # @param w [Float]  width  in internal units
      # @param d [Float]  depth  in internal units
      # @param h [Float]  height in internal units
      # @return [Hash] { collides:, colliding_groups:, snap_candidates: }
      # ─────────────────────────────────────────────────────────
      def query(origin, w, d, h)
        s = COLLISION_SHRINK * MM
        ghost_min = Geom::Point3d.new(origin.x + s, origin.y + s, origin.z + s)
        ghost_max = Geom::Point3d.new(origin.x + w - s, origin.y + d - s, origin.z + h - s)

        colliding = []
        snap_candidates = []

        @cache.each do |cached|
          cm = cached[:min]
          cx = cached[:max]

          # AABB overlap test
          if overlaps_3d?(ghost_min, ghost_max, cm, cx)
            colliding << cached[:group]
          end

          # Snap candidates (side-by-side alignment)
          snap_pts = compute_snap_candidates(origin, w, d, h, cached)
          snap_candidates.concat(snap_pts)
        end

        {
          collides:         !colliding.empty?,
          colliding_groups: colliding,
          snap_candidates:  snap_candidates,
        }
      end

      # ─────────────────────────────────────────────────────────
      # Find the best snap position for `origin` within SNAP_DISTANCE.
      # Returns the snapped point, or `origin` if no snap found.
      # Also returns the snap type and reference group.
      # ─────────────────────────────────────────────────────────
      def best_snap(origin, w, d, h)
        threshold = SNAP_DISTANCE * MM
        best_dist = threshold
        best_pt   = origin
        best_type = :none
        best_grp  = nil

        @cache.each do |cached|
          snap_pts = compute_snap_candidates(origin, w, d, h, cached)
          snap_pts.each do |sp|
            dist = origin.distance(sp[:pt])
            if dist < best_dist
              best_dist = dist
              best_pt   = sp[:pt]
              best_type = sp[:type]
              best_grp  = cached[:group]
            end
          end
        end

        { pt: best_pt, type: best_type, group: best_grp }
      end

      # ─────────────────────────────────────────────────────────
      # Snap origin.x, origin.y to integer mm values
      # (keeps Z as-is to preserve floor/shelf height)
      # ─────────────────────────────────────────────────────────
      def snap_to_grid(pt, grid_mm = 1.0)
        grid = grid_mm * MM
        Geom::Point3d.new(
          (pt.x / grid).round * grid,
          (pt.y / grid).round * grid,
          pt.z
        )
      end

      # How many modules are cached
      def count
        @cache.length
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      def overlaps_3d?(min_a, max_a, min_b, max_b)
        min_a.x < max_b.x && max_a.x > min_b.x &&
          min_a.y < max_b.y && max_a.y > min_b.y &&
          min_a.z < max_b.z && max_a.z > min_b.z
      end

      # Compute snap candidate points for the ghost box relative to a cached module
      # Returns array of { pt: Geom::Point3d, type: Symbol }
      def compute_snap_candidates(origin, w, d, h, cached)
        cm = cached[:min]
        cx = cached[:max]
        candidates = []

        # -- X-axis snaps (left/right side-by-side) --

        # Our left face touches cached's right face (we are to the right)
        candidates << {
          pt:   Geom::Point3d.new(cx.x,     origin.y, origin.z),
          type: :side_right,
        }

        # Our right face touches cached's left face (we are to the left)
        candidates << {
          pt:   Geom::Point3d.new(cm.x - w, origin.y, origin.z),
          type: :side_left,
        }

        # -- Y-axis snaps (front/back) --

        # Our front face touches cached's back face
        candidates << {
          pt:   Geom::Point3d.new(origin.x, cx.y,     origin.z),
          type: :back,
        }

        # Our back face touches cached's front face
        candidates << {
          pt:   Geom::Point3d.new(origin.x, cm.y - d, origin.z),
          type: :front,
        }

        # -- Z-axis snap (stacked on top) --
        candidates << {
          pt:   Geom::Point3d.new(origin.x, origin.y, cx.z),
          type: :on_top,
        }

        # -- X alignment: match left edge --
        candidates << {
          pt:   Geom::Point3d.new(cm.x, origin.y, origin.z),
          type: :align_left,
        }

        # -- X alignment: match right edge --
        candidates << {
          pt:   Geom::Point3d.new(cx.x - w, origin.y, origin.z),
          type: :align_right,
        }

        candidates
      end

    end # class CollisionManager
  end # module Tools
end # module Ornato
