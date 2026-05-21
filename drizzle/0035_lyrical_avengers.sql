CREATE TABLE `modelosDocumento` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int,
	`nome` varchar(255) NOT NULL,
	`tipo` enum('proposta_acordo','termo_acordo','notificacao_debito','carta_cobranca','recibo_pagamento','contrato_parcelamento','outro') NOT NULL DEFAULT 'outro',
	`conteudoHtml` text NOT NULL,
	`logoUrl` text,
	`marcaDaguaUrl` text,
	`logoAlinhamento` enum('esquerda','centro','direita') DEFAULT 'esquerda',
	`margemSuperior` int DEFAULT 40,
	`margemInferior` int DEFAULT 40,
	`margemEsquerda` int DEFAULT 50,
	`margemDireita` int DEFAULT 50,
	`ativo` int NOT NULL DEFAULT 1,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modelosDocumento_id` PRIMARY KEY(`id`)
);
