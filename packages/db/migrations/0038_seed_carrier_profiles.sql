-- 0038_seed_carrier_profiles.sql
-- Seed telecom carrier profiles with standard USSD forwarding codes for Saudi Arabia, Egypt, GCC, and Universal GSM

INSERT INTO carrier_profiles (
  country_code,
  operator_name,
  forward_on_no_answer_code,
  forward_on_busy_code,
  forward_all_code,
  cancel_forward_code,
  setup_instructions_url,
  is_manual_only
) VALUES
  -- Saudi Arabia
  ('SA', 'الاتصالات السعودية (STC)', '*61*{PHONE}*11*20#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://stc.com.sa', false),
  ('SA', 'موبايلي (Mobily)', '*61*{PHONE}*11*20#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://mobily.com.sa', false),
  ('SA', 'زين السعودية (Zain SA)', '*61*{PHONE}*11*20#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://sa.zain.com', false),
  ('SA', 'سلام (Salam)', '*61*{PHONE}*11*20#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://salam.sa', false),
  ('SA', 'فيرجن موبايل (Virgin Mobile)', '*61*{PHONE}*11*20#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://virginmobile.sa', false),
  ('SA', 'ريد بول موبايل (Red Bull Mobile)', '*61*{PHONE}*11*20#', '*67*{PHONE}#', '*21*{PHONE}#', '##61#', 'https://redbullmobile.sa', false),

  -- Egypt
  ('EG', 'فودافون مصر (Vodafone)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://vodafone.com.eg', false),
  ('EG', 'أورانج مصر (Orange)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://orange.eg', false),
  ('EG', 'اتصالات مصر (e& Egypt)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://etisalat.eg', false),
  ('EG', 'المصرية للاتصالات (WE)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://te.eg', false),

  -- UAE
  ('AE', 'اتصالات الإمارات (e& UAE)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://etisalat.ae', false),
  ('AE', 'دو (du)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://du.ae', false),

  -- Kuwait & Qatar & GCC
  ('KW', 'زين الكويت (Zain KW)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://kw.zain.com', false),
  ('KW', 'STC الكويت (stc KW)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://stc.com.kw', false),
  ('KW', 'أوريدو الكويت (Ooredoo KW)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://ooredoo.com.kw', false),
  ('QA', 'أوريدو قطر (Ooredoo QA)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://ooredoo.qa', false),
  ('QA', 'فودافون قطر (Vodafone QA)', '*61*{PHONE}#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', 'https://vodafone.qa', false),

  -- Global Standard GSM
  ('GLOBAL', 'المعيار العالمي العام (GSM Standard)', '*61*{PHONE}*11*20#', '*67*{PHONE}#', '*21*{PHONE}#', '##002#', NULL, false)
ON CONFLICT DO NOTHING;
