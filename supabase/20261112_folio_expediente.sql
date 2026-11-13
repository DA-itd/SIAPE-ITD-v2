-- ============================================================================
-- SIAPE-ITD | FOLIO DEL EXPEDIENTE: SIAPE-ITD-X-YYYY-ZZZ
-- ----------------------------------------------------------------------------
-- FORMATO:
--   SIAPE-ITD-A-2026-001
--     X    = A si el expediente se abrió entre enero y junio.
--            B si se abrió entre julio y diciembre (incluye julio y agosto).
--     YYYY = año en que se abrió el expediente.
--     ZZZ  = consecutivo anual que inicia en 001.
--
-- QUÉ HACE:
--   1. Crea una tabla interna de consecutivos por año.
--   2. Crea un trigger que asigna el folio automáticamente a TODO expediente
--      nuevo, sin importar desde qué función se cree.
--   3. Renumera los expedientes existentes que todavía tengan el formato
--      anterior (EXP-ITD-XXXXXXXX) conservando el orden por fecha de apertura.
--   4. Deja el contador listo para continuar con el siguiente número.
--
-- CÓMO EJECUTARLO:
--   Supabase > SQL Editor > pegar este archivo completo > Run.
--   Se puede ejecutar más de una vez; sólo renumera los folios que aún no
--   tienen el formato nuevo.
-- ============================================================================

-- 1. Contador interno por año -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_folio_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.case_folio_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.case_folio_counters FROM PUBLIC, anon, authenticated;

-- 2. Función que calcula el folio ---------------------------------------------
CREATE OR REPLACE FUNCTION public.siape_assign_case_folio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opened TIMESTAMPTZ := COALESCE(NEW.opened_at, now());
  v_year INTEGER := EXTRACT(YEAR FROM v_opened)::INTEGER;
  v_period TEXT := CASE
    WHEN EXTRACT(MONTH FROM v_opened) <= 6 THEN 'A'
    ELSE 'B'
  END;
  v_seq INTEGER;
BEGIN
  INSERT INTO public.case_folio_counters (year, last_number)
  VALUES (v_year, 0)
  ON CONFLICT (year) DO NOTHING;

  UPDATE public.case_folio_counters
  SET last_number = last_number + 1
  WHERE year = v_year
  RETURNING last_number INTO v_seq;

  NEW.case_folio := format(
    'SIAPE-ITD-%s-%s-%s',
    v_period,
    v_year,
    lpad(v_seq::text, 3, '0')
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.siape_assign_case_folio() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_siape_assign_case_folio ON public.clinical_cases;
CREATE TRIGGER trg_siape_assign_case_folio
BEFORE INSERT ON public.clinical_cases
FOR EACH ROW
EXECUTE FUNCTION public.siape_assign_case_folio();

-- 3. Renumerar expedientes con el formato anterior ----------------------------
--    Se numeran por año y por fecha de apertura, después del último número
--    que ya exista con el formato nuevo (por si el script se ejecuta de nuevo).

WITH pending AS (
  SELECT
    cc.id,
    EXTRACT(YEAR FROM cc.opened_at)::INTEGER AS y,
    CASE WHEN EXTRACT(MONTH FROM cc.opened_at) <= 6 THEN 'A' ELSE 'B' END AS p,
    row_number() OVER (
      PARTITION BY EXTRACT(YEAR FROM cc.opened_at)::INTEGER
      ORDER BY cc.opened_at, cc.id
    ) AS rn
  FROM public.clinical_cases cc
  WHERE cc.case_folio IS NULL
     OR cc.case_folio !~ '^SIAPE-ITD-[AB]-[0-9]{4}-[0-9]{3}$'
),
existing AS (
  SELECT
    substring(case_folio FROM 'SIAPE-ITD-[AB]-([0-9]{4})-')::INTEGER AS y,
    max(substring(case_folio FROM '([0-9]{3})$')::INTEGER) AS max_seq
  FROM public.clinical_cases
  WHERE case_folio ~ '^SIAPE-ITD-[AB]-[0-9]{4}-[0-9]{3}$'
  GROUP BY 1
)
UPDATE public.clinical_cases cc
SET case_folio = format(
  'SIAPE-ITD-%s-%s-%s',
  p.p,
  p.y,
  lpad((p.rn + COALESCE(e.max_seq, 0))::text, 3, '0')
)
FROM pending p
LEFT JOIN existing e ON e.y = p.y
WHERE cc.id = p.id;

-- 4. Sincronizar el contador con el número más alto ya usado -------------------
INSERT INTO public.case_folio_counters (year, last_number)
SELECT
  substring(case_folio FROM 'SIAPE-ITD-[AB]-([0-9]{4})-')::INTEGER AS y,
  max(substring(case_folio FROM '([0-9]{3})$')::INTEGER) AS last_number
FROM public.clinical_cases
WHERE case_folio ~ '^SIAPE-ITD-[AB]-[0-9]{4}-[0-9]{3}$'
GROUP BY 1
ON CONFLICT (year) DO UPDATE
SET last_number = GREATEST(public.case_folio_counters.last_number, EXCLUDED.last_number);

-- 5. Verificación --------------------------------------------------------------
SELECT
  substring(case_folio FROM 'SIAPE-ITD-[AB]-([0-9]{4})-')::INTEGER AS anio,
  count(*) AS expedientes,
  min(case_folio) AS primer_folio,
  max(case_folio) AS ultimo_folio
FROM public.clinical_cases
GROUP BY 1
ORDER BY 1;
