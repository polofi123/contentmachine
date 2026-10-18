export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analysis_finding_library_refs: {
        Row: {
          component_id: string
          created_at: string
          finding_id: string
          id: string
          is_primary: boolean
          relevance: number | null
          supporting_text: string
        }
        Insert: {
          component_id: string
          created_at?: string
          finding_id: string
          id?: string
          is_primary?: boolean
          relevance?: number | null
          supporting_text: string
        }
        Update: {
          component_id?: string
          created_at?: string
          finding_id?: string
          id?: string
          is_primary?: boolean
          relevance?: number | null
          supporting_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_finding_library_refs_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "analysis_finding_library_refs_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_finding_library_refs_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "analysis_finding_library_refs_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "analysis_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_findings: {
        Row: {
          applied_text: string | null
          confidence: number | null
          created_at: string
          diagnosis: string
          diagnosis_type: string
          edited: boolean
          evidence: Json
          id: string
          intended_effect: string
          operation: Json
          priority: string
          run_id: string
          scope: string
          state: string
          updated_at: string
          why_applicable: string
        }
        Insert: {
          applied_text?: string | null
          confidence?: number | null
          created_at?: string
          diagnosis: string
          diagnosis_type: string
          edited?: boolean
          evidence: Json
          id?: string
          intended_effect: string
          operation: Json
          priority?: string
          run_id: string
          scope?: string
          state?: string
          updated_at?: string
          why_applicable: string
        }
        Update: {
          applied_text?: string | null
          confidence?: number | null
          created_at?: string
          diagnosis?: string
          diagnosis_type?: string
          edited?: boolean
          evidence?: Json
          id?: string
          intended_effect?: string
          operation?: Json
          priority?: string
          run_id?: string
          scope?: string
          state?: string
          updated_at?: string
          why_applicable?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_runs: {
        Row: {
          created_at: string
          id: string
          library_citable: number | null
          library_total: number | null
          model: string
          script_version_id: string
          story_map: Json | null
          summary: Json | null
          trace: Json | null
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          library_citable?: number | null
          library_total?: number | null
          model: string
          script_version_id: string
          story_map?: Json | null
          summary?: Json | null
          trace?: Json | null
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          library_citable?: number | null
          library_total?: number | null
          model?: string
          script_version_id?: string
          story_map?: Json | null
          summary?: Json | null
          trace?: Json | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_script_version_id_fkey"
            columns: ["script_version_id"]
            isOneToOne: false
            referencedRelation: "script_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "analysis_runs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      components: {
        Row: {
          archived_at: string | null
          body: string | null
          created_at: string
          id: string
          is_placeholder: boolean
          is_seeded: boolean
          layer_id: string
          name: string
          parent_id: string | null
          sort_order: number
          source_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_placeholder?: boolean
          is_seeded?: boolean
          layer_id: string
          name: string
          parent_id?: string | null
          sort_order?: number
          source_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          archived_at?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_placeholder?: boolean
          is_seeded?: boolean
          layer_id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          source_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "components_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "components_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "components_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
        ]
      }
      hook_word_tags: {
        Row: {
          component_id: string
          created_at: string
          hook_id: string
          id: string
          span_text: string | null
        }
        Insert: {
          component_id: string
          created_at?: string
          hook_id: string
          id?: string
          span_text?: string | null
        }
        Update: {
          component_id?: string
          created_at?: string
          hook_id?: string
          id?: string
          span_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hook_word_tags_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "hook_word_tags_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hook_word_tags_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "hook_word_tags_hook_id_fkey"
            columns: ["hook_id"]
            isOneToOne: false
            referencedRelation: "hooks"
            referencedColumns: ["id"]
          },
        ]
      }
      hooks: {
        Row: {
          created_at: string
          id: string
          is_selected: boolean
          notes: string | null
          text: string
          updated_at: string
          video_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_selected?: boolean
          notes?: string | null
          text: string
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_selected?: boolean
          notes?: string | null
          text?: string
          updated_at?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hooks_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "hooks_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hooks_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          created_at: string
          format: string | null
          id: string
          niche: string | null
          note: string | null
          promoted_video_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          format?: string | null
          id?: string
          niche?: string | null
          note?: string | null
          promoted_video_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          format?: string | null
          id?: string
          niche?: string | null
          note?: string | null
          promoted_video_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_promoted_video_id_fkey"
            columns: ["promoted_video_id"]
            isOneToOne: true
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "ideas_promoted_video_id_fkey"
            columns: ["promoted_video_id"]
            isOneToOne: true
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_promoted_video_id_fkey"
            columns: ["promoted_video_id"]
            isOneToOne: true
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      layers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          label: string
          prefix: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          label: string
          prefix: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          prefix?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      plan_goals: {
        Row: {
          created_at: string
          month: string
          note: string | null
          target_posts: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          month: string
          note?: string | null
          target_posts?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          month?: string
          note?: string | null
          target_posts?: number
          updated_at?: string
        }
        Relationships: []
      }
      plan_pillar_targets: {
        Row: {
          created_at: string
          month: string
          pillar: string
          target_count: number
        }
        Insert: {
          created_at?: string
          month: string
          pillar: string
          target_count?: number
        }
        Update: {
          created_at?: string
          month?: string
          pillar?: string
          target_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_pillar_targets_month_fkey"
            columns: ["month"]
            isOneToOne: false
            referencedRelation: "plan_goals"
            referencedColumns: ["month"]
          },
        ]
      }
      script_beat_components: {
        Row: {
          component_id: string
          created_at: string
          id: string
          script_beat_id: string
        }
        Insert: {
          component_id: string
          created_at?: string
          id?: string
          script_beat_id: string
        }
        Update: {
          component_id?: string
          created_at?: string
          id?: string
          script_beat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_beat_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "script_beat_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_beat_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "script_beat_components_script_beat_id_fkey"
            columns: ["script_beat_id"]
            isOneToOne: false
            referencedRelation: "script_beats"
            referencedColumns: ["id"]
          },
        ]
      }
      script_beat_tags: {
        Row: {
          beat_id: string
          component_id: string
          created_at: string
          id: string
          span_end: number
          span_start: number
          span_text: string
        }
        Insert: {
          beat_id: string
          component_id: string
          created_at?: string
          id?: string
          span_end: number
          span_start: number
          span_text: string
        }
        Update: {
          beat_id?: string
          component_id?: string
          created_at?: string
          id?: string
          span_end?: number
          span_start?: number
          span_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_beat_tags_beat_id_fkey"
            columns: ["beat_id"]
            isOneToOne: false
            referencedRelation: "script_beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_beat_tags_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "script_beat_tags_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_beat_tags_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
        ]
      }
      script_beats: {
        Row: {
          created_at: string
          dance_relation: string | null
          function_component_id: string | null
          function_label: string | null
          id: string
          parked: boolean
          script_id: string
          sort_order: number
          story_loop: number | null
          story_role: string | null
          story_section: string | null
          t_end_sec: number | null
          t_start_sec: number | null
          text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dance_relation?: string | null
          function_component_id?: string | null
          function_label?: string | null
          id?: string
          parked?: boolean
          script_id: string
          sort_order?: number
          story_loop?: number | null
          story_role?: string | null
          story_section?: string | null
          t_end_sec?: number | null
          t_start_sec?: number | null
          text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dance_relation?: string | null
          function_component_id?: string | null
          function_label?: string | null
          id?: string
          parked?: boolean
          script_id?: string
          sort_order?: number
          story_loop?: number | null
          story_role?: string | null
          story_section?: string | null
          t_end_sec?: number | null
          t_start_sec?: number | null
          text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_beats_function_component_id_fkey"
            columns: ["function_component_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "script_beats_function_component_id_fkey"
            columns: ["function_component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_beats_function_component_id_fkey"
            columns: ["function_component_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "script_beats_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      script_versions: {
        Row: {
          content: string
          created_at: string
          id: string
          label: string | null
          parent_version_id: string | null
          script_id: string
          segments: Json
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          label?: string | null
          parent_version_id?: string | null
          script_id: string
          segments: Json
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          label?: string | null
          parent_version_id?: string | null
          script_id?: string
          segments?: Json
        }
        Relationships: [
          {
            foreignKeyName: "script_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "script_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_versions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          created_at: string
          duration_target_sec: number | null
          edit_spec: string | null
          format: string | null
          id: string
          name: string
          updated_at: string
          video_id: string
        }
        Insert: {
          created_at?: string
          duration_target_sec?: number | null
          edit_spec?: string | null
          format?: string | null
          id?: string
          name?: string
          updated_at?: string
          video_id: string
        }
        Update: {
          created_at?: string
          duration_target_sec?: number | null
          edit_spec?: string | null
          format?: string | null
          id?: string
          name?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "scripts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      slots: {
        Row: {
          created_at: string
          description: string | null
          in_default_template: boolean
          key: string
          label: string
          layer_id: string | null
          sort_order: number
          updated_at: string
          workflow_stage: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          in_default_template?: boolean
          key: string
          label: string
          layer_id?: string | null
          sort_order?: number
          updated_at?: string
          workflow_stage?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          in_default_template?: boolean
          key?: string
          label?: string
          layer_id?: string | null
          sort_order?: number
          updated_at?: string
          workflow_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "slots_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
        ]
      }
      story_direction: {
        Row: {
          created_at: string
          destination: string | null
          final_thought: string | null
          id: string
          meaning: string | null
          starting_belief: string | null
          tense: string | null
          updated_at: string
          video_id: string
        }
        Insert: {
          created_at?: string
          destination?: string | null
          final_thought?: string | null
          id?: string
          meaning?: string | null
          starting_belief?: string | null
          tense?: string | null
          updated_at?: string
          video_id: string
        }
        Update: {
          created_at?: string
          destination?: string | null
          final_thought?: string | null
          id?: string
          meaning?: string | null
          starting_belief?: string | null
          tense?: string | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_direction_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "story_direction_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_direction_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      story_lenses: {
        Row: {
          component_id: string | null
          created_at: string
          id: string
          is_selected: boolean
          notes: string | null
          text: string
          tier: string | null
          updated_at: string
          video_id: string
        }
        Insert: {
          component_id?: string | null
          created_at?: string
          id?: string
          is_selected?: boolean
          notes?: string | null
          text: string
          tier?: string | null
          updated_at?: string
          video_id: string
        }
        Update: {
          component_id?: string | null
          created_at?: string
          id?: string
          is_selected?: boolean
          notes?: string | null
          text?: string
          tier?: string | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_lenses_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "story_lenses_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_lenses_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "story_lenses_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "story_lenses_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_lenses_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      story_questions: {
        Row: {
          answered_beat_id: string | null
          created_at: string
          id: string
          opened_beat_id: string | null
          source_component_id: string | null
          text: string
          updated_at: string
          video_id: string
        }
        Insert: {
          answered_beat_id?: string | null
          created_at?: string
          id?: string
          opened_beat_id?: string | null
          source_component_id?: string | null
          text: string
          updated_at?: string
          video_id: string
        }
        Update: {
          answered_beat_id?: string | null
          created_at?: string
          id?: string
          opened_beat_id?: string | null
          source_component_id?: string | null
          text?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_questions_answered_beat_id_fkey"
            columns: ["answered_beat_id"]
            isOneToOne: false
            referencedRelation: "script_beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_questions_opened_beat_id_fkey"
            columns: ["opened_beat_id"]
            isOneToOne: false
            referencedRelation: "script_beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_questions_source_component_id_fkey"
            columns: ["source_component_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "story_questions_source_component_id_fkey"
            columns: ["source_component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_questions_source_component_id_fkey"
            columns: ["source_component_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "story_questions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "story_questions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_questions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_components: {
        Row: {
          anchor_beat_id: string | null
          component_id: string
          created_at: string
          id: string
          notes: string | null
          placement_note: string | null
          placement_sec: number | null
          state: string
          updated_at: string
          video_id: string
        }
        Insert: {
          anchor_beat_id?: string | null
          component_id: string
          created_at?: string
          id?: string
          notes?: string | null
          placement_note?: string | null
          placement_sec?: number | null
          state?: string
          updated_at?: string
          video_id: string
        }
        Update: {
          anchor_beat_id?: string | null
          component_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          placement_note?: string | null
          placement_sec?: number | null
          state?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_components_anchor_beat_id_fkey"
            columns: ["anchor_beat_id"]
            isOneToOne: false
            referencedRelation: "script_beats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "component_performance"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "video_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_components_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "library_mechanism_usage"
            referencedColumns: ["component_id"]
          },
          {
            foreignKeyName: "video_components_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_components_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_components_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_metrics: {
        Row: {
          avg_view_duration_sec: number | null
          comments: number | null
          created_at: string
          id: string
          likes: number | null
          measured_at: string
          note: string | null
          retention_pct: number | null
          video_id: string
          views: number | null
        }
        Insert: {
          avg_view_duration_sec?: number | null
          comments?: number | null
          created_at?: string
          id?: string
          likes?: number | null
          measured_at?: string
          note?: string | null
          retention_pct?: number | null
          video_id: string
          views?: number | null
        }
        Update: {
          avg_view_duration_sec?: number | null
          comments?: number | null
          created_at?: string
          id?: string
          likes?: number | null
          measured_at?: string
          note?: string | null
          retention_pct?: number | null
          video_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_metrics_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_metrics_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_metrics_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_slots: {
        Row: {
          created_at: string
          id: string
          note: string | null
          slot_key: string
          state: string
          updated_at: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          slot_key: string
          state?: string
          updated_at?: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          slot_key?: string
          state?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_slots_slot_key_fkey"
            columns: ["slot_key"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "video_slots_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_slots_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_slots_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          channel_avg_views: number | null
          channel_name: string | null
          created_at: string
          id: string
          is_mine: boolean
          lego_angle: string | null
          lego_audio: string | null
          lego_hook: string | null
          lego_key_visuals: string | null
          lego_story_structure: string | null
          lego_topic: string | null
          lego_visual_format: string | null
          loop_type: string | null
          notes: string | null
          pillar: string | null
          planned_publish_at: string | null
          platform: string | null
          platform_video_id: string | null
          published_at: string | null
          status: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          channel_avg_views?: number | null
          channel_name?: string | null
          created_at?: string
          id?: string
          is_mine?: boolean
          lego_angle?: string | null
          lego_audio?: string | null
          lego_hook?: string | null
          lego_key_visuals?: string | null
          lego_story_structure?: string | null
          lego_topic?: string | null
          lego_visual_format?: string | null
          loop_type?: string | null
          notes?: string | null
          pillar?: string | null
          planned_publish_at?: string | null
          platform?: string | null
          platform_video_id?: string | null
          published_at?: string | null
          status?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          channel_avg_views?: number | null
          channel_name?: string | null
          created_at?: string
          id?: string
          is_mine?: boolean
          lego_angle?: string | null
          lego_audio?: string | null
          lego_hook?: string | null
          lego_key_visuals?: string | null
          lego_story_structure?: string | null
          lego_topic?: string | null
          lego_visual_format?: string | null
          loop_type?: string | null
          notes?: string | null
          pillar?: string | null
          planned_publish_at?: string | null
          platform?: string | null
          platform_video_id?: string | null
          published_at?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      component_performance: {
        Row: {
          avg_views_when_skipped: number | null
          avg_views_when_used: number | null
          best_views_when_used: number | null
          component_id: string | null
          layer_id: string | null
          name: string | null
          source_id: string | null
          videos_skipped: number | null
          videos_used: number | null
        }
        Relationships: [
          {
            foreignKeyName: "components_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
        ]
      }
      library_mechanism_usage: {
        Row: {
          avg_model_confidence: number | null
          avg_retrieval_relevance: number | null
          component_id: string | null
          layer_id: string | null
          name: string | null
          source_id: string | null
          times_accepted: number | null
          times_applied: number | null
          times_edited_first: number | null
          times_recommended: number | null
          times_rejected: number | null
        }
        Relationships: [
          {
            foreignKeyName: "components_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "layers"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_month: {
        Row: {
          month: string | null
          pending: number | null
          planned: number | null
          published: number | null
          target_posts: number | null
          unfilled: number | null
        }
        Relationships: []
      }
      plan_pillar_mix: {
        Row: {
          month: string | null
          pillar: string | null
          published: number | null
          scheduled: number | null
          target_count: number | null
        }
        Relationships: []
      }
      video_completeness: {
        Row: {
          empty_slots: number | null
          filled_slots: number | null
          pct_filled: number | null
          skipped_slots: number | null
          total_slots: number | null
          video_id: string | null
        }
        Relationships: []
      }
      video_latest_metrics: {
        Row: {
          avg_view_duration_sec: number | null
          comments: number | null
          likes: number | null
          measured_at: string | null
          retention_pct: number | null
          video_id: string | null
          views: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_metrics_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_completeness"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_metrics_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_stats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_metrics_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_stats: {
        Row: {
          channel_avg_views: number | null
          channel_name: string | null
          created_at: string | null
          id: string | null
          is_mine: boolean | null
          latest_measured_at: string | null
          latest_views: number | null
          lego_angle: string | null
          lego_audio: string | null
          lego_hook: string | null
          lego_key_visuals: string | null
          lego_story_structure: string | null
          lego_topic: string | null
          lego_visual_format: string | null
          loop_type: string | null
          metric_snapshots: number | null
          notes: string | null
          outlier_score: number | null
          platform: string | null
          platform_video_id: string | null
          published_at: string | null
          retention_pct: number | null
          status: string | null
          title: string | null
          updated_at: string | null
          url: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

