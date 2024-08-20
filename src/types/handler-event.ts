export interface HandlerEvent {
  messages?: Message[];
  payload?: string;
}

interface Message {
  event_metadata?: EventMetadata;
  details?: Details;
}

interface Details {
  bucket_id?: string;
  object_id?: string;
}

interface EventMetadata {
  event_id?: string;
  event_type?: string;
  created_at?: string;
  tracing_context?: TracingContext;
  cloud_id?: string;
  folder_id?: string;
}

interface TracingContext {
  trace_id?: string;
  span_id?: string;
  parent_span_id?: string;
}
