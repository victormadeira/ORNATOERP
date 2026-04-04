# frozen_string_literal: true
# Ornato CNC Plugin - Resize Observer
# Monitors Ornato Dynamic Components for resize events and recalculates
# internal piece dimensions that are too complex for native DC formulas.
# Handles: drawer redistribution, shelf repositioning, closure recalculation.

module Ornato
  module Constructor
    class ResizeObserver < Sketchup::EntitiesObserver

      def initialize
        @tracked_modules = {} # entity_id => { last_dims, spec }
        @debounce_timer = nil
      end

      # Start observing the active model
      def start
        model = Sketchup.active_model
        return unless model

        model.entities.add_observer(self)
        scan_existing_modules
        puts "Ornato ResizeObserver: Started"
      end

      # Stop observing
      def stop
        model = Sketchup.active_model
        return unless model

        model.entities.remove_observer(self)
        @tracked_modules.clear
        puts "Ornato ResizeObserver: Stopped"
      end

      # Called when entities change
      def onElementModified(entities, entity)
        return unless entity.respond_to?(:get_attribute)
        return unless entity.get_attribute('ornato', 'module_type')

        check_resize(entity)
      end

      # Called when the model changes (transactions complete)
      def onTransactionCommit(model)
        @tracked_modules.each_key do |entity_id|
          entity = find_entity_by_id(entity_id)
          check_resize(entity) if entity
        end
      end

      private

      # Scan model for existing Ornato modules
      def scan_existing_modules
        model = Sketchup.active_model
        return unless model

        model.entities.each do |entity|
          next unless entity.respond_to?(:get_attribute)

          module_type = entity.get_attribute('ornato', 'module_type')
          next unless module_type

          register_module(entity)
        end
      end

      # Register a module for tracking
      def register_module(entity)
        bounds = entity.bounds
        @tracked_modules[entity.entityID] = {
          last_width:  bounds.width.to_mm,
          last_height: bounds.height.to_mm,
          last_depth:  bounds.depth.to_mm,
          module_type: entity.get_attribute('ornato', 'module_type'),
          construction_type: entity.get_attribute('ornato', 'construction_type'),
        }
      end

      # Check if a module was resized and recalculate if needed
      def check_resize(entity)
        return unless entity

        tracked = @tracked_modules[entity.entityID]
        unless tracked
          register_module(entity)
          return
        end

        bounds = entity.bounds
        new_w = bounds.width.to_mm
        new_h = bounds.height.to_mm
        new_d = bounds.depth.to_mm

        # Check if dimensions actually changed (with tolerance)
        tolerance = 0.5 # mm
        w_changed = (new_w - tracked[:last_width]).abs > tolerance
        h_changed = (new_h - tracked[:last_height]).abs > tolerance
        d_changed = (new_d - tracked[:last_depth]).abs > tolerance

        return unless w_changed || h_changed || d_changed

        # Update tracked dimensions
        tracked[:last_width] = new_w
        tracked[:last_height] = new_h
        tracked[:last_depth] = new_d

        # Recalculate complex internals
        recalculate_module(entity, new_w, new_h, new_d)
      end

      # Recalculate module internals after resize
      def recalculate_module(entity, width, height, depth)
        thickness = entity.get_attribute('ornato', 'thickness')&.to_f || 18.0
        construction = (entity.get_attribute('ornato', 'construction_type') || 'base_between_laterals').to_sym

        internal_w = width - 2 * thickness
        internal_h = height - 2 * thickness

        entities = if entity.respond_to?(:definition)
                     entity.definition.entities
                   elsif entity.respond_to?(:entities)
                     entity.entities
                   else
                     return
                   end

        # Group child pieces by type
        shelves = []
        drawers = []
        dividers = []
        doors = []

        entities.each do |child|
          next unless child.respond_to?(:name) && child.name

          case child.name
          when /^PRAT/
            shelves << child
          when /^GAV/
            drawers << child
          when /^DIV/
            dividers << child
          when /^POR/
            doors << child
          end
        end

        # Redistribute shelves evenly
        redistribute_shelves(shelves, internal_h, thickness) if shelves.length > 0

        # Redistribute drawers evenly
        redistribute_drawers(drawers, internal_h, internal_w, thickness) if drawers.length > 0

        # Recalculate door dimensions
        recalculate_doors(doors, internal_w, internal_h, thickness) if doors.length > 0
      end

      # Redistribute shelves evenly in the vertical span
      def redistribute_shelves(shelves, internal_height, thickness)
        count = shelves.length
        spacing = internal_height / (count + 1)

        shelves.sort_by! { |s| s.bounds.min.z }

        shelves.each_with_index do |shelf, i|
          target_z = thickness + spacing * (i + 1)
          current_z = shelf.bounds.min.z.to_mm

          if (target_z - current_z).abs > 1.0
            delta_z = (target_z - current_z) / 25.4 # convert to inches
            tr = Geom::Transformation.new([0, 0, delta_z])
            shelf.transform!(tr)
          end
        end
      end

      # Redistribute drawers evenly
      def redistribute_drawers(drawers, internal_height, internal_width, thickness)
        count = drawers.length
        gap = 2.0 # mm between drawers
        front_height = (internal_height - (count - 1) * gap) / count

        drawers.sort_by! { |d| d.bounds.min.z }

        drawers.each_with_index do |drawer, i|
          target_z = thickness + i * (front_height + gap)
          current_z = drawer.bounds.min.z.to_mm

          if (target_z - current_z).abs > 1.0
            delta_z = (target_z - current_z) / 25.4
            tr = Geom::Transformation.new([0, 0, delta_z])
            drawer.transform!(tr)
          end

          # Scale drawer width if body width changed
          current_w = drawer.bounds.width.to_mm
          if (current_w - internal_width).abs > 1.0
            # This needs more careful handling with DC formulas
            # For now, just note it needs updating
            drawer.set_attribute('ornato', 'needs_width_update', true)
          end
        end
      end

      # Recalculate door dimensions
      def recalculate_doors(doors, internal_width, internal_height, thickness)
        count = doors.length
        return if count == 0

        gap = 2.0
        overlay = thickness # total overlay

        total_width = internal_width + 2 * overlay
        door_width = (total_width - (count - 1) * gap) / count
        door_height = internal_height + 2 * overlay

        doors.sort_by! { |d| d.bounds.min.x }

        doors.each_with_index do |door, i|
          # Store target dimensions for the door
          door.set_attribute('ornato', 'orn_target_width', door_width)
          door.set_attribute('ornato', 'orn_target_height', door_height)

          target_x = -overlay + i * (door_width + gap)
          current_x = door.bounds.min.x.to_mm

          if (target_x - current_x).abs > 1.0
            delta_x = (target_x - current_x) / 25.4
            tr = Geom::Transformation.new([delta_x, 0, 0])
            door.transform!(tr)
          end
        end
      end

      # Find entity by ID in the active model
      def find_entity_by_id(entity_id)
        model = Sketchup.active_model
        return nil unless model

        model.entities.each do |entity|
          return entity if entity.entityID == entity_id
        end
        nil
      end

    end
  end
end
