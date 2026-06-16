CREATE TABLE `intimacoesMNI` (
	`id` int AUTO_INCREMENT NOT NULL,
	`idAviso` varchar(255),
	`processoId` int,
	`numeroCNJ` varchar(30),
	`tipoAviso` varchar(100),
	`tipoComunicacao` varchar(100),
	`dataDisponibilizacao` timestamp,
	`dataPublicacao` timestamp,
	`orgao` varchar(255),
	`vara` varchar(255),
	`comarca` varchar(255),
	`teor` text,
	`parametrosJson` text,
	`partesJson` text,
	`statusIntimacao` enum('pendente','visualizado','tratado','descartado') NOT NULL DEFAULT 'pendente',
	`tratadoPorId` int,
	`tratadoPorNome` varchar(255),
	`tratadoEm` timestamp,
	`observacoes` text,
	`prazoGeradoId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `intimacoesMNI_id` PRIMARY KEY(`id`),
	CONSTRAINT `intimacoesMNI_idAviso_unique` UNIQUE(`idAviso`)
);
--> statement-breakpoint
CREATE TABLE `mniCredenciais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tribunal` varchar(50) NOT NULL DEFAULT 'TJRJ',
	`idConsultante` varchar(255) NOT NULL,
	`senhaConsultante` varchar(500) NOT NULL,
	`ambienteMNI` enum('homologacao','producao') NOT NULL DEFAULT 'homologacao',
	`urlWsdl` varchar(500),
	`ativo` boolean NOT NULL DEFAULT false,
	`ultimoTesteEm` timestamp,
	`ultimoTesteStatus` varchar(50),
	`criadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mniCredenciais_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sincronizacoesMNI` (
	`id` int AUTO_INCREMENT NOT NULL,
	`processoId` int,
	`numeroCNJ` varchar(30),
	`tipoSincMNI` enum('processo','avisos','teor') NOT NULL DEFAULT 'processo',
	`statusSincMNI` enum('sucesso','erro','parcial') NOT NULL DEFAULT 'sucesso',
	`movimentacoesImportadas` int DEFAULT 0,
	`avisosImportados` int DEFAULT 0,
	`erroMsg` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sincronizacoesMNI_id` PRIMARY KEY(`id`)
);
