-- Fields from the X-Vault design: sub-topic, language, sensitive flag, and a colour per category.
alter table items add column subtopic text;
alter table items add column lang text;
alter table items add column sensitive integer not null default 0;
alter table categories add column color text;

update categories set color = case name
  when 'AI, Code & Dev Tools' then '#0EA5E9'
  when 'MENA Geopolitics & Society' then '#F59E0B'
  when 'Markets, Startups & Finance' then '#10B981'
  when 'Cinema, Gaming, History & Culture' then '#F97316'
  when 'Menswear, Design & Travel' then '#EAB308'
  when 'Health, Biotech & Longevity' then '#14B8A6'
  when 'Models, Pop Culture & NSFW' then '#F43F5E'
  when 'Viral Threads & Internet Culture' then '#38BDF8'
end;

-- Mark Arabic text so it can be filtered; everything else counts as English for now.
update items set lang = case when coalesce(body, '') || coalesce(title, '') glob '*[ء-ي]*' then 'ar' else 'en' end;
update items set sensitive = 1 where category = 'Models, Pop Culture & NSFW';

create index items_lang on items (lang);
