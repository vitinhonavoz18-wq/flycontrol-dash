CREATE TABLE IF NOT EXISTS public.external_order_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_partial TEXT,
  payload JSONB,
  status_code INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_order_logs ENABLE ROW LEVEL SECURITY;

-- Allow only super_admins to view logs
CREATE POLICY "Admins can view external order logs" 
ON public.external_order_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);
