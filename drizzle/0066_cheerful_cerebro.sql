ALTER TABLE `demandas` ADD `statusDemanda` enum('aberta','em_andamento','concluida','cancelada') DEFAULT 'aberta' NOT NULL;--> statement-breakpoint
ALTER TABLE `demandas` ADD `resolvidoEm` timestamp;