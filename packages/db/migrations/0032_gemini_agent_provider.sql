-- The product has one AI provider: Gemini configured by the application owner.
UPDATE public.ai_agents
SET model_provider = 'gemini'
WHERE model_provider IS DISTINCT FROM 'gemini';

ALTER TABLE public.ai_agents
  ALTER COLUMN model_provider SET DEFAULT 'gemini';

CREATE OR REPLACE FUNCTION public.enforce_gemini_ai_agent_provider()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.model_provider := 'gemini';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_agents_enforce_gemini_provider ON public.ai_agents;
CREATE TRIGGER ai_agents_enforce_gemini_provider
  BEFORE INSERT OR UPDATE OF model_provider ON public.ai_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_gemini_ai_agent_provider();