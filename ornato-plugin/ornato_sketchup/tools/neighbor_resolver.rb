# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# NeighborResolver — Intelligent module adjacency handler
#
# When two Ornato modules touch or are placed next to each other,
# this engine:
#   1. Detects which faces are in contact (AABB face adjacency)
#   2. Suppresses duplicate lateral panels (marks shared face as
#      "divisoria compartilhada" so it's cut only once)
#   3. Calculates minifix/confirmat positions between the modules
#      at the shared face
#   4. Stores adjacency data as Ornato attributes on both groups
#
# Triggered by PlacementTool after confirm_placement, and also
# available as a standalone analysis via Main.resolve_neighbors.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Tools
    module NeighborResolver

      # How close two bounding boxes need to be (in model units)
      # to be considered "touching" — accounts for floating point slop
      TOUCH_TOLERANCE = 2.0 # mm

      # Minimum shared face area to be considered a meaningful joint
      MIN_SHARED_AREA  = 100.0 # mm²

      # ─────────────────────────────────────────────────────────
      # Resolve all Ornato module adjacencies in the current model.
      # Clears previous adjacency data, then recomputes for all pairs.
      #
      # @return [Array<Hash>] list of resolved adjacency pairs
      # ─────────────────────────────────────────────────────────
      def self.resolve_all
        model = Sketchup.active_model
        return [] unless model

        groups = collect_ornato_groups(model)
        return [] if groups.length < 2

        adjacencies = []

        # Check all N*(N-1)/2 pairs
        groups.combination(2) do |a, b|
          adj = detect_adjacency(a, b)
          next unless adj

          store_adjacency(a, b, adj)
          adjacencies << adj
        end

        adjacencies
      end

      # ─────────────────────────────────────────────────────────
      # Resolve neighbors for a single newly-placed group.
      # Only checks the new group against existing groups.
      #
      # @param new_group [Sketchup::Group]
      # @return [Array<Hash>] adjacencies involving new_group
      # ─────────────────────────────────────────────────────────
      def self.resolve_for(new_group)
        model = Sketchup.active_model
        return [] unless model

        all_groups = collect_ornato_groups(model)
        others = all_groups.reject { |g| g.entityID == new_group.entityID }

        adjacencies = []
        others.each do |other|
          adj = detect_adjacency(new_group, other)
          next unless adj
          store_adjacency(new_group, other, adj)
          adjacencies << adj
        end

        adjacencies
      end

      # ─────────────────────────────────────────────────────────
      # Returns a summary of adjacencies for a group (for display).
      # ─────────────────────────────────────────────────────────
      def self.adjacency_summary(group)
        raw = group.get_attribute('Ornato', 'adjacencies', '[]')
        begin
          JSON.parse(raw, symbolize_names: true)
        rescue
          []
        end
      end

      # ─────────────────────────────────────────────────────────
      # Clear adjacency data from all groups in the model.
      # ─────────────────────────────────────────────────────────
      def self.clear_all
        model = Sketchup.active_model
        return unless model
        collect_ornato_groups(model).each do |g|
          g.set_attribute('Ornato', 'adjacencies', '[]')
          g.set_attribute('Ornato', 'shared_laterals', '[]')
        end
      end

      # ─────────────────────────────────────────────────────────
      private
      # ─────────────────────────────────────────────────────────

      def self.collect_ornato_groups(model)
        model.active_entities.select do |e|
          (e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance)) &&
            (e.get_attribute('Ornato', 'module_type') || e.get_attribute('Ornato', 'params'))
        end
      end

      # Detect whether two groups are adjacent and on which face
      # Returns nil if not touching, or an adjacency Hash if touching
      def self.detect_adjacency(a, b)
        bb_a = a.bounds
        bb_b = b.bounds

        tol = TOUCH_TOLERANCE.mm

        # ── AABB face proximity test ───────────────────────────
        # For each of the 6 face directions, check if the bounding
        # boxes share that face within tolerance.
        #
        # Axes: X (width), Y (depth), Z (height)
        # A face "touches" when the two boxes share the face plane
        # AND overlap in the other two axes.

        # X-direction: a.max.x ≈ b.min.x  (a is to the left of b)
        adj = try_face(bb_a, bb_b, :right, tol) ||
              try_face(bb_b, bb_a, :right, tol) ||  # b left of a
              try_face(bb_a, bb_b, :back,  tol) ||
              try_face(bb_b, bb_a, :back,  tol)

        return nil unless adj

        # Calculate shared area
        shared_area = calc_shared_area(bb_a, bb_b, adj[:axis], adj[:side])
        return nil if shared_area < MIN_SHARED_AREA.mm**2

        minifix_positions = calc_minifix_positions(bb_a, bb_b, adj[:axis], adj[:side], shared_area)

        {
          group_a_id:         a.entityID.to_s,
          group_b_id:         b.entityID.to_s,
          group_a_name:       a.respond_to?(:name) ? a.name : '',
          group_b_name:       b.respond_to?(:name) ? b.name : '',
          contact_axis:       adj[:axis],
          contact_side:       adj[:side],
          shared_area_mm2:    (shared_area / (1.mm**2)).round(1),
          minifix_positions:  minifix_positions,
          suppress_lateral:   should_suppress_lateral?(a, b, adj[:axis]),
        }
      end

      # Test if face `side` of `primary` touches the matching face of `secondary`.
      # side = :right means primary.max.x ≈ secondary.min.x
      # Returns { axis: :x, side: :right } or nil
      def self.try_face(primary, secondary, side, tol)
        case side
        when :right
          primary_coord  = primary.max.x
          secondary_coord = secondary.min.x
          axis = :x
          # Also check Y and Z overlap
          return nil unless ranges_overlap?(primary.min.y, primary.max.y, secondary.min.y, secondary.max.y)
          return nil unless ranges_overlap?(primary.min.z, primary.max.z, secondary.min.z, secondary.max.z)
        when :back
          primary_coord  = primary.max.y
          secondary_coord = secondary.min.y
          axis = :y
          return nil unless ranges_overlap?(primary.min.x, primary.max.x, secondary.min.x, secondary.max.x)
          return nil unless ranges_overlap?(primary.min.z, primary.max.z, secondary.min.z, secondary.max.z)
        else
          return nil
        end

        gap = (primary_coord - secondary_coord).abs
        return nil if gap > tol

        { axis: axis, side: side }
      end

      def self.ranges_overlap?(min_a, max_a, min_b, max_b)
        min_a < max_b && max_a > min_b
      end

      # Calculate the area of the rectangle shared on the contact face
      def self.calc_shared_area(bb_a, bb_b, axis, _side)
        case axis
        when :x
          # shared face is in YZ plane
          y_overlap = [bb_a.max.y, bb_b.max.y].min - [bb_a.min.y, bb_b.min.y].max
          z_overlap = [bb_a.max.z, bb_b.max.z].min - [bb_a.min.z, bb_b.min.z].max
          [y_overlap, 0.0].max * [z_overlap, 0.0].max
        when :y
          # shared face is in XZ plane
          x_overlap = [bb_a.max.x, bb_b.max.x].min - [bb_a.min.x, bb_b.min.x].max
          z_overlap = [bb_a.max.z, bb_b.max.z].min - [bb_a.min.z, bb_b.min.z].max
          [x_overlap, 0.0].max * [z_overlap, 0.0].max
        else
          0.0
        end
      end

      # Calculate standard minifix positions on the shared face.
      # Returns array of [x_mm, y_mm, z_mm] in world coords.
      #
      # Rules:
      #   - Minifix at 64mm from each horizontal edge (top, bottom)
      #   - If shared height > 600mm, add intermediate position at center
      #   - Minifix at System32 positions if height allows
      def self.calc_minifix_positions(bb_a, bb_b, axis, _side, _area)
        positions = []

        case axis
        when :x
          # Contact plane is at X = shared X boundary
          contact_x = (bb_a.max.x + bb_b.min.x) / 2.0

          # Y range: shared overlap
          y_min = [bb_a.min.y, bb_b.min.y].max
          y_max = [bb_a.max.y, bb_b.max.y].min
          y_center = (y_min + y_max) / 2.0

          # Z range: shared overlap (height)
          z_min = [bb_a.min.z, bb_b.min.z].max
          z_max = [bb_a.max.z, bb_b.max.z].min
          shared_h = z_max - z_min

          # Minifix at 64mm from bottom, 64mm from top
          [64.mm, shared_h - 64.mm].each do |z_off|
            next if z_off < 32.mm || z_off > shared_h - 32.mm
            positions << world_pos_mm(contact_x, y_center, z_min + z_off)
          end

          # Extra center position if tall
          if shared_h > 600.mm
            positions << world_pos_mm(contact_x, y_center, z_min + shared_h / 2.0)
          end

        when :y
          contact_y = (bb_a.max.y + bb_b.min.y) / 2.0
          x_min = [bb_a.min.x, bb_b.min.x].max
          x_max = [bb_a.max.x, bb_b.max.x].min
          x_center = (x_min + x_max) / 2.0
          z_min = [bb_a.min.z, bb_b.min.z].max
          z_max = [bb_a.max.z, bb_b.max.z].min
          shared_h = z_max - z_min

          [64.mm, shared_h - 64.mm].each do |z_off|
            next if z_off < 32.mm || z_off > shared_h - 32.mm
            positions << world_pos_mm(contact_y, x_center, z_min + z_off)
          end

          if shared_h > 600.mm
            positions << world_pos_mm(contact_y, x_center, z_min + shared_h / 2.0)
          end
        end

        positions
      end

      # Convert internal SketchUp units to [x_mm, y_mm, z_mm] array
      def self.world_pos_mm(a, b, c)
        [a.to_mm.round(1), b.to_mm.round(1), c.to_mm.round(1)]
      end

      # Decide whether to suppress the duplicate lateral at the contact face.
      # A lateral is suppressed if both modules have a piece at the contact face
      # (e.g. both have their own side panel at that position).
      # For now: always suppress when modules of the same type touch side-by-side.
      def self.should_suppress_lateral?(a, b, axis)
        return false unless axis == :x  # only for side-by-side (X axis) adjacency
        type_a = a.get_attribute('Ornato', 'module_type').to_s
        type_b = b.get_attribute('Ornato', 'module_type').to_s
        # Suppress when both are base cabinets, aéreos, or towers touching side-by-side
        %w[armario_base armario_aereo armario_torre nicho gaveteiro].any? { |t| t == type_a } &&
          %w[armario_base armario_aereo armario_torre nicho gaveteiro].any? { |t| t == type_b }
      end

      # ── Store adjacency data on both groups ────────────────────

      def self.store_adjacency(a, b, adj)
        # Store on group A — reference to group B
        store_on_group(a, adj.merge(neighbor_id: adj[:group_b_id], neighbor_name: adj[:group_b_name]))

        # Store on group B — reference to group A (flip contact side)
        flipped = adj.merge(
          neighbor_id:   adj[:group_a_id],
          neighbor_name: adj[:group_a_name],
          contact_side:  flip_side(adj[:contact_side])
        )
        store_on_group(b, flipped)

        # If suppress_lateral, mark both groups
        if adj[:suppress_lateral]
          mark_shared_lateral(a, b, adj)
        end
      end

      def self.store_on_group(group, adj_data)
        raw = group.get_attribute('Ornato', 'adjacencies', '[]')
        list = begin; JSON.parse(raw); rescue; []; end

        # Remove previous entry for same neighbor (avoid duplicates)
        list.reject! { |e| e['neighbor_id'] == adj_data[:neighbor_id].to_s }

        list << {
          neighbor_id:       adj_data[:neighbor_id],
          neighbor_name:     adj_data[:neighbor_name],
          contact_axis:      adj_data[:contact_axis].to_s,
          contact_side:      adj_data[:contact_side].to_s,
          shared_area_mm2:   adj_data[:shared_area_mm2],
          minifix_positions: adj_data[:minifix_positions],
          suppress_lateral:  adj_data[:suppress_lateral],
        }

        group.set_attribute('Ornato', 'adjacencies', JSON.generate(list))
      end

      def self.mark_shared_lateral(a, b, adj)
        # Mark on group A: the right-side lateral is shared
        sl_a = JSON.parse(a.get_attribute('Ornato', 'shared_laterals', '[]') rescue '[]')
        sl_a << { side: adj[:contact_side].to_s, shared_with: adj[:group_b_id] }
        a.set_attribute('Ornato', 'shared_laterals', JSON.generate(sl_a))

        # Mark on group B: the left-side lateral is shared
        sl_b = JSON.parse(b.get_attribute('Ornato', 'shared_laterals', '[]') rescue '[]')
        sl_b << { side: flip_side(adj[:contact_side]).to_s, shared_with: adj[:group_a_id] }
        b.set_attribute('Ornato', 'shared_laterals', JSON.generate(sl_b))
      end

      def self.flip_side(side)
        case side.to_sym
        when :right then :left
        when :left  then :right
        when :front then :back
        when :back  then :front
        else side
        end
      end

    end # module NeighborResolver
  end # module Tools
end # module Ornato
