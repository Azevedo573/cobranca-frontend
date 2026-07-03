ALTER TABLE `whatsappInstancias` ADD `horarioAtendimentoInicio` varchar(5) DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `horarioAtendimentoFim` varchar(5) DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `diasAtendimento` varchar(20) DEFAULT '1,2,3,4,5' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `mensagemForaHorario` text;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `horarioInicioEnvio` varchar(5) DEFAULT '08:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `horarioFimEnvio` varchar(5) DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `diasSemana` varchar(20) DEFAULT '1,2,3,4,5' NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `delayMinSegundos` int DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `delayMaxSegundos` int DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `limiteHora` int DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsappInstancias` ADD `limiteDia` int DEFAULT 150 NOT NULL;