# ═══════════════════════════════════════════════════════
# ComponentSwap — Troca componentes em módulos existentes
# Remove antigo, insere novo, regenera usinagens
# ═══════════════════════════════════════════════════════

require 'json'

module Ornato
  module Constructor
    module ComponentSwap

      # ── Aplicar troca ──
      # @param group [Sketchup::Group] módulo pai
      # @param swap_json [String] JSON com component + newConfig
      def self.apply_swap(group, swap_json)
        data = JSON.parse(swap_json, symbolize_names: true)
        component = data[:component]
        new_config = data[:newConfig] || {}

        return unless component && group

        model = Sketchup.active_model
        model.start_operation('Ornato: Trocar componente', true)

        begin
          slots = JSON.parse(group.get_attribute('Ornato', 'slots') || '[]')

          # Encontrar e atualizar o slot correspondente
          slot_idx = slots.index { |s| s['type'] == component[:type].to_s || s[:type] == component[:type] }

          if slot_idx
            old_slot = slots[slot_idx]

            # Remover geometria do componente antigo
            Aggregator.send(:remove_slot_geometry, group, old_slot, slot_idx)

            # Criar novo slot com config atualizada
            new_slot = old_slot.dup
            new_slot_sym = symbolize(new_slot)
            new_slot_sym[:config] = (new_slot_sym[:config] || {}).merge(new_config)

            # Aplicar mapeamento de IDs para valores reais
            apply_config_mapping(new_slot_sym, new_config)

            # Reagregar com nova config
            params = Aggregator.send(:get_module_params, group)
            if params
              case new_slot_sym[:slot].to_s
              when 'fechamento'
                Aggregator.send(:add_door, group, new_slot_sym, params)
              when 'gaveta'
                Aggregator.send(:add_drawers, group, new_slot_sym, params)
              when 'interno'
                Aggregator.send(:add_internal, group, new_slot_sym, params)
              end
            end

            # Atualizar slots
            slots[slot_idx] = desymbolize(new_slot_sym)
            group.set_attribute('Ornato', 'slots', JSON.generate(slots))
          end

          # Regenerar usinagens se engine disponível
          regenerate_machining(group)

          model.commit_operation
          Sketchup.status_text = 'Ornato: Componente trocado com sucesso'

        rescue => e
          model.abort_operation
          UI.messagebox("Erro ao trocar: #{e.message}")
          puts "ComponentSwap ERRO: #{e.message}\n#{e.backtrace.first(5).join("\n")}"
        end
      end

      private

      # ── Mapear IDs de seleção para valores de config ──
      def self.apply_config_mapping(slot, selections)
        # Fechamento
        if selections[:tipo_fechamento]
          type_map = {
            'porta_2_abrir' => 'porta_2_abrir',
            'porta_1_abrir_e' => 'porta_1_abrir',
            'porta_1_abrir_d' => 'porta_1_abrir',
            'porta_basculante' => 'porta_basculante',
            'porta_correr_2' => 'porta_correr',
            'porta_correr_3' => 'porta_correr',
            'sem_porta' => nil,
          }
          new_type = type_map[selections[:tipo_fechamento].to_s]
          slot[:type] = new_type if new_type

          if selections[:tipo_fechamento].to_s.include?('_e')
            slot[:config][:lado] = 'esquerda'
          elsif selections[:tipo_fechamento].to_s.include?('_d')
            slot[:config][:lado] = 'direita'
          end

          if selections[:tipo_fechamento].to_s.include?('correr_3')
            slot[:config][:n_folhas] = 3
          end
        end

        # Dobradiça
        if selections[:tipo_dobradica]
          slot[:config][:tipo_dobradica] = selections[:tipo_dobradica].to_s
        end

        # Puxador
        if selections[:tipo_puxador]
          pux_map = {
            'pux_128' => '128mm', 'pux_160' => '160mm', 'pux_192' => '192mm',
            'pux_256' => '256mm', 'pux_gola' => 'perfil_gola', 'pux_cava' => 'cava',
            'sem_puxador' => 'sem',
          }
          slot[:config][:tipo_puxador] = pux_map[selections[:tipo_puxador].to_s] || selections[:tipo_puxador].to_s
        end

        # Gavetas
        if selections[:quantidade]
          gv_map = { 'gv_1' => 1, 'gv_2' => 2, 'gv_3' => 3, 'gv_4' => 4, 'gv_5' => 5, 'gv_prog' => 4 }
          slot[:config][:quantidade] = gv_map[selections[:quantidade].to_s] || 2
          slot[:config][:divisao] = 'progressiva' if selections[:quantidade].to_s == 'gv_prog'
        end

        # Corrediça
        if selections[:corredica]
          cor_map = {
            'cor_metalica' => 'metalica', 'cor_telescopica' => 'telescopica',
            'cor_soft' => 'soft_close', 'cor_push' => 'push_open',
            'cor_tandembox' => 'tandembox', 'cor_legrabox' => 'legrabox',
          }
          slot[:config][:corredica] = cor_map[selections[:corredica].to_s] || selections[:corredica].to_s
        end

        # Prateleira
        if selections[:tipo_prateleira]
          prat_map = {
            'prat_regulavel' => 'regulavel', 'prat_fixa' => 'fixa',
            'prat_vidro' => 'vidro', 'prat_inclinada' => 'inclinada',
          }
          slot[:config][:tipo] = prat_map[selections[:tipo_prateleira].to_s] || 'regulavel'
        end
      end

      # ── Regenerar usinagens ──
      def self.regenerate_machining(group)
        return unless defined?(Ornato::Hardware::RulesEngine)
        begin
          config = Ornato::Config.load rescue {}
          engine = Ornato::Hardware::RulesEngine.new(config)
          machining = engine.process_module(group)
          group.set_attribute('Ornato', 'machining_data', JSON.generate(machining)) if machining
        rescue => e
          puts "ComponentSwap: Usinagem não regenerada (#{e.message})"
        end
      end

      # ── Hash utils ──
      def self.symbolize(hash)
        return hash unless hash.is_a?(Hash)
        hash.each_with_object({}) { |(k, v), h| h[k.to_sym] = v.is_a?(Hash) ? symbolize(v) : v }
      end

      def self.desymbolize(hash)
        return hash unless hash.is_a?(Hash)
        hash.each_with_object({}) { |(k, v), h| h[k.to_s] = v.is_a?(Hash) ? desymbolize(v) : v }
      end

    end
  end
end
