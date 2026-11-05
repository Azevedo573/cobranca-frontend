CREATE TABLE `juridicoEquipeMembros` (
	`id` int AUTO_INCREMENT NOT NULL,
	`equipeId` int NOT NULL,
	`userId` int NOT NULL,
	`gestor` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `juridicoEquipeMembros_id` PRIMARY KEY(`id`),
	CONSTRAINT `juridicoEquipeMembros_equipe_user_unique` UNIQUE(`equipeId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `juridicoEquipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(120) NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `juridicoEquipes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tarefaEventos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tarefaId` int NOT NULL,
	`tipo` varchar(60) NOT NULL,
	`descricao` text NOT NULL,
	`antesJson` text,
	`depoisJson` text,
	`usuarioId` int NOT NULL,
	`usuarioNome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tarefaEventos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tarefaNotificacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tarefaId` int NOT NULL,
	`userId` int NOT NULL,
	`tipo` varchar(60) NOT NULL,
	`lida` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tarefaNotificacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tarefasDemanda` MODIFY COLUMN `statusTarefa` enum('pendente','em_andamento','concluida','em_revisao','cancelada') NOT NULL DEFAULT 'pendente';--> statement-breakpoint
ALTER TABLE `demandas` ADD `equipeId` int;--> statement-breakpoint
ALTER TABLE `tarefaComentarios` ADD `oculto` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `exigeRevisao` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `bloqueada` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `motivoBloqueio` text;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `entrega` text;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `iniciadaEm` timestamp;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `entregueEm` timestamp;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `concluidaEm` timestamp;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `aprovadaEm` timestamp;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `aprovadoPorId` int;--> statement-breakpoint
ALTER TABLE `tarefasDemanda` ADD `versao` int DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `juridicoEquipeMembros_user_active_idx` ON `juridicoEquipeMembros` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `tarefaEventos_tarefa_data_idx` ON `tarefaEventos` (`tarefaId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `tarefaNotificacoes_user_lida_idx` ON `tarefaNotificacoes` (`userId`,`lida`);--> statement-breakpoint
CREATE INDEX `tarefasDemanda_responsavel_status_idx` ON `tarefasDemanda` (`responsavelId`,`statusTarefa`);--> statement-breakpoint
CREATE INDEX `tarefasDemanda_demanda_idx` ON `tarefasDemanda` (`demandaId`);