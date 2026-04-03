# frozen_string_literal: true
# ═══════════════════════════════════════════════════════════════
# HardwareComponents — Pre-built SketchUp ComponentDefinitions
# for visual hardware representations.
#
# Creates reusable component definitions (hinge, minifix, dowel,
# system32 pin, handle) that can be instantiated at multiple
# locations without duplicating geometry.
# ═══════════════════════════════════════════════════════════════

module Ornato
  module Visual
    class HardwareComponents
      CIRCLE_SEGMENTS = 24
      ALPHA = 0.7

      # ─── Hinge (dobradica) component ─────────────────
      # 35mm cup + rectangular base plate with 2 pilot holes
      #
      # @param model [Sketchup::Model]
      # @return [Sketchup::ComponentDefinition]
      def self.create_hinge_component(model)
        name = 'ornato_hw_hinge'
        existing = model.definitions[name]
        return existing if existing

        defn = model.definitions.add(name)
        ents = defn.entities

        # Cup material (gold)
        cup_mat = get_material(model, 'ornato_hw_hinge_cup', [245, 158, 11])
        # Base material (dark gold)
        base_mat = get_material(model, 'ornato_hw_hinge_base', [180, 120, 20])
        # Pilot material (light yellow)
        pilot_mat = get_material(model, 'ornato_hw_hinge_pilot', [253, 230, 138])

        # ── Cup: cylinder 35mm diameter, 12.5mm deep
        cup_radius = 17.5.mm
        cup_depth = 12.5.mm
        center = Geom::Point3d.new(0, 0, 0)
        normal = Geom::Vector3d.new(0, 0, -1)

        circle = ents.add_circle(center, normal, cup_radius, CIRCLE_SEGMENTS)
        cup_face = ents.add_face(circle)
        if cup_face
          cup_face.pushpull(cup_depth)
          ents.grep(Sketchup::Face).each do |f|
            f.material = cup_mat
            f.back_material = cup_mat
          end
        end

        # ── Base plate: 48mm x 12mm rectangle, 2mm thick
        # Positioned behind the cup center
        plate_w = 48.0.mm
        plate_h = 12.0.mm
        plate_t = 2.0.mm
        plate_x = -plate_w / 2.0
        plate_y = cup_radius + 2.0.mm  # just behind the cup

        p1 = Geom::Point3d.new(plate_x, plate_y, 0)
        p2 = Geom::Point3d.new(plate_x + plate_w, plate_y, 0)
        p3 = Geom::Point3d.new(plate_x + plate_w, plate_y + plate_h, 0)
        p4 = Geom::Point3d.new(plate_x, plate_y + plate_h, 0)

        plate_face = ents.add_face(p1, p2, p3, p4)
        if plate_face
          plate_face.pushpull(-plate_t)
          # Color only the new plate faces
          [plate_face].each do |f|
            f.material = base_mat
            f.back_material = base_mat
          end
        end

        # ── Pilot holes: 2 small cylinders on the base plate
        pilot_r = 1.25.mm  # 2.5mm diameter
        pilot_d = 10.0.mm
        [-12.0.mm, 12.0.mm].each do |offset_x|
          pilot_center = Geom::Point3d.new(offset_x, plate_y + plate_h / 2.0, 0)
          pilot_circle = ents.add_circle(pilot_center, Geom::Vector3d.new(0, 0, -1), pilot_r, CIRCLE_SEGMENTS)
          pilot_face = ents.add_face(pilot_circle)
          if pilot_face
            pilot_face.pushpull(pilot_d)
          end
        end

        defn
      end

      # ─── Minifix component ───────────────────────────
      # Body (15mm diameter cam) + pin hole indicator
      #
      # @param model [Sketchup::Model]
      # @return [Sketchup::ComponentDefinition]
      def self.create_minifix_component(model)
        name = 'ornato_hw_minifix'
        existing = model.definitions[name]
        return existing if existing

        defn = model.definitions.add(name)
        ents = defn.entities

        body_mat = get_material(model, 'ornato_hw_minifix_body', [59, 130, 246])
        pin_mat = get_material(model, 'ornato_hw_minifix_pin', [147, 197, 253])

        # ── Cam body: 15mm diameter, 12mm deep
        body_radius = 7.5.mm
        body_depth = 12.0.mm
        center = Geom::Point3d.new(0, 0, 0)

        circle = ents.add_circle(center, Geom::Vector3d.new(0, 0, -1), body_radius, CIRCLE_SEGMENTS)
        body_face = ents.add_face(circle)
        if body_face
          body_face.pushpull(body_depth)
          ents.grep(Sketchup::Face).each do |f|
            f.material = body_mat
            f.back_material = body_mat
          end
        end

        # ── Pin slot: small rectangle inside the cam to show orientation
        slot_w = 3.0.mm
        slot_h = body_radius * 1.5
        slot_d = 2.0.mm

        sp1 = Geom::Point3d.new(-slot_w / 2.0, -slot_h / 2.0, 0.1.mm)
        sp2 = Geom::Point3d.new(slot_w / 2.0, -slot_h / 2.0, 0.1.mm)
        sp3 = Geom::Point3d.new(slot_w / 2.0, slot_h / 2.0, 0.1.mm)
        sp4 = Geom::Point3d.new(-slot_w / 2.0, slot_h / 2.0, 0.1.mm)

        slot_face = ents.add_face(sp1, sp2, sp3, sp4)
        if slot_face
          slot_face.pushpull(-slot_d)
          slot_face.material = pin_mat
          slot_face.back_material = pin_mat
        end

        defn
      end

      # ─── Dowel (cavilha) component ───────────────────
      # Simple cylinder: 8mm diameter, 15mm depth
      #
      # @param model [Sketchup::Model]
      # @return [Sketchup::ComponentDefinition]
      def self.create_dowel_component(model)
        name = 'ornato_hw_dowel'
        existing = model.definitions[name]
        return existing if existing

        defn = model.definitions.add(name)
        ents = defn.entities

        mat = get_material(model, 'ornato_hw_dowel', [146, 64, 14])

        radius = 4.0.mm   # 8mm diameter
        depth = 15.0.mm
        center = Geom::Point3d.new(0, 0, 0)

        circle = ents.add_circle(center, Geom::Vector3d.new(0, 0, -1), radius, CIRCLE_SEGMENTS)
        face = ents.add_face(circle)
        if face
          face.pushpull(depth)
          ents.grep(Sketchup::Face).each do |f|
            f.material = mat
            f.back_material = mat
          end
        end

        defn
      end

      # ─── System 32 shelf pin component ───────────────
      # Small cylinder: 5mm diameter, 12mm depth
      #
      # @param model [Sketchup::Model]
      # @return [Sketchup::ComponentDefinition]
      def self.create_system32_pin(model)
        name = 'ornato_hw_system32_pin'
        existing = model.definitions[name]
        return existing if existing

        defn = model.definitions.add(name)
        ents = defn.entities

        mat = get_material(model, 'ornato_hw_system32', [156, 163, 175])

        radius = 2.5.mm
        depth = 12.0.mm
        center = Geom::Point3d.new(0, 0, 0)

        circle = ents.add_circle(center, Geom::Vector3d.new(0, 0, -1), radius, CIRCLE_SEGMENTS)
        face = ents.add_face(circle)
        if face
          face.pushpull(depth)
          ents.grep(Sketchup::Face).each do |f|
            f.material = mat
            f.back_material = mat
          end
        end

        defn
      end

      # ─── Handle (puxador) component ──────────────────
      # Handle with 2 mounting point cylinders at given spacing.
      # Connected by a thin bar for visualization.
      #
      # @param model [Sketchup::Model]
      # @param spacing [Float] distance between holes in mm (default: 160)
      # @return [Sketchup::ComponentDefinition]
      def self.create_handle_component(model, spacing = 160.0)
        name = "ornato_hw_handle_#{spacing.to_i}"
        existing = model.definitions[name]
        return existing if existing

        defn = model.definitions.add(name)
        ents = defn.entities

        hole_mat = get_material(model, 'ornato_hw_handle', [34, 197, 94])
        bar_mat = get_material(model, 'ornato_hw_handle_bar', [22, 163, 74])

        hole_radius = 2.5.mm  # 5mm diameter
        hole_depth = 18.0.mm  # through-hole typical
        half_spacing = (spacing / 2.0).mm

        # ── Left mounting hole
        left_center = Geom::Point3d.new(-half_spacing, 0, 0)
        left_circle = ents.add_circle(left_center, Geom::Vector3d.new(0, 0, -1), hole_radius, CIRCLE_SEGMENTS)
        left_face = ents.add_face(left_circle)
        if left_face
          left_face.pushpull(hole_depth)
        end

        # ── Right mounting hole
        right_center = Geom::Point3d.new(half_spacing, 0, 0)
        right_circle = ents.add_circle(right_center, Geom::Vector3d.new(0, 0, -1), hole_radius, CIRCLE_SEGMENTS)
        right_face = ents.add_face(right_circle)
        if right_face
          right_face.pushpull(hole_depth)
        end

        # ── Connecting bar for visualization
        bar_w = spacing.mm
        bar_h = 6.0.mm
        bar_t = 3.0.mm

        bp1 = Geom::Point3d.new(-half_spacing, -bar_h / 2.0, 1.0.mm)
        bp2 = Geom::Point3d.new(half_spacing, -bar_h / 2.0, 1.0.mm)
        bp3 = Geom::Point3d.new(half_spacing, bar_h / 2.0, 1.0.mm)
        bp4 = Geom::Point3d.new(-half_spacing, bar_h / 2.0, 1.0.mm)

        bar_face = ents.add_face(bp1, bp2, bp3, bp4)
        if bar_face
          bar_face.pushpull(bar_t)
        end

        # Apply materials
        ents.grep(Sketchup::Face).each do |f|
          f.material = hole_mat
          f.back_material = hole_mat
        end

        defn
      end

      # ─── Instance placement helper ───────────────────
      # Places a component instance at a specific position on a piece face.
      #
      # @param parent_ents [Sketchup::Entities] target entities collection
      # @param defn [Sketchup::ComponentDefinition] component to place
      # @param point [Geom::Point3d] placement point
      # @param rotation [Float] rotation angle in degrees (around Z)
      # @param layer [Sketchup::Layer] layer to assign
      # @return [Sketchup::ComponentInstance]
      def self.place_instance(parent_ents, defn, point, rotation = 0, layer = nil)
        tr = Geom::Transformation.new(point)
        if rotation != 0
          rot = Geom::Transformation.rotation(point, Geom::Vector3d.new(0, 0, 1), rotation.degrees)
          tr = rot * tr
        end

        instance = parent_ents.add_instance(defn, tr)
        instance.layer = layer if layer
        instance.name = "ornato_viz_#{defn.name}"
        instance
      end

      private

      # Get or create a semi-transparent material
      def self.get_material(model, name, rgb)
        mat = model.materials[name]
        return mat if mat

        mat = model.materials.add(name)
        mat.color = Sketchup::Color.new(rgb[0], rgb[1], rgb[2])
        mat.alpha = ALPHA
        mat
      end
    end
  end
end
