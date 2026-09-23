-- Visita guiada ao backoffice, mostrada automaticamente no primeiro login de cada admin.

alter table profiles add column if not exists tour_seen boolean not null default false;
