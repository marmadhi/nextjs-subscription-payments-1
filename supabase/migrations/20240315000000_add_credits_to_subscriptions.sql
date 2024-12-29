-- Ajout de la colonne credits avec une valeur par défaut de 0
alter table subscriptions 
add column if not exists credits integer not null default 0; 