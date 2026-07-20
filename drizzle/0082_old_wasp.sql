CREATE TABLE `doerj_monitoramentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(255) NOT NULL,
	`oab` varchar(50),
	`descricao` varchar(500),
	`ativo` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `doerj_monitoramentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doerj_publicacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materia_id` varchar(20) NOT NULL,
	`data_publicacao` varchar(10) NOT NULL,
	`jornal` varchar(100),
	`tipo` varchar(100),
	`trecho` text,
	`url` varchar(500),
	`termo_busca` varchar(100) DEFAULT 'Higor',
	`lida` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `doerj_publicacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tarefaComentarios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tarefaId` int NOT NULL,
	`texto` text NOT NULL,
	`autorId` int,
	`autorNome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tarefaComentarios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tarefasDemanda` (
	`id` int AUTO_INCREMENT NOT NULL,
	`demandaId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text,
	`responsavelId` int,
	`responsavelNome` varchar(255),
	`statusTarefa` enum('pendente','em_andamento','concluida') NOT NULL DEFAULT 'pendente',
	`prioridadeTarefa` enum('baixa','media','alta') NOT NULL DEFAULT 'media',
	`prazo` timestamp,
	`criadoPorId` int,
	`criadoPorNome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tarefasDemanda_id` PRIMARY KEY(`id`)
);
