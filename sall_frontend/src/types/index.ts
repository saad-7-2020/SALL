export interface DbConnection {
  id:       string
  name:     string
  host:     string
  port:     string
  user:     string
  password: string
  status:   'connected' | 'error' | 'pending'
}

export interface Database {
  id:          string
  name:        string
  description: string
  color:       string
}

export interface PipelineStep {
  step:          string
  status:        'pending' | 'running' | 'done' | 'error'
  label:         string
  detail?:       string
  informations?: string[]
}

export interface SqlEvent {
  index:       number
  description: string
  query:       string
  rows:        number
  columns:     string[]
}

export interface Message {
  id:             string
  conv_id:        string
  role:           'user' | 'assistant'
  content:        string
  pipeline_steps: PipelineStep[]
  sql_events:     SqlEvent[]
  figures:        any[]
  created_at:     string
  streaming?:     boolean
}

export interface Conversation {
  id:         string
  title:      string
  databases:  string[]
  created_at: string
  updated_at: string
  messages:   Message[]
}

export interface SSEEvent {
  type:          string
  step?:         string
  status?:       string
  label?:        string
  detail?:       string
  informations?: string[]
  content?:      string
  index?:        number
  description?:  string
  query?:        string
  rows?:         number
  columns?:      string[]
  figures?:      any[]
  stats?:        Record<string, number>
  message?:      string
}