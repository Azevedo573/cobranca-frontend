CREATE TABLE `modeloAnexos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`modeloId` int NOT NULL,
	`url` text NOT NULL,
	`nomeOriginal` varchar(255) NOT NULL,
	`mimeType` varchar(100) NOT NULL,
	`tamanhoBytes` int DEFAULT 0,
	`ordem` int DEFAULT 0,
	`legenda` varchar(255),
	`largura` int DEFAULT 400,
	`alinhamento` enum('esquerda','centro','direita') DEFAULT 'centro',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `modeloAnexos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `modelosDocumento` ADD `logoPosicaoVertical` enum('topo','rodape') DEFAULT 'topo';--> statement-breakpoint
ALTER TABLE `modelosDocumento` ADD `logoLargura` int DEFAULT 120;--> statement-breakpoint
ALTER TABLE `modelosDocumento` ADD `marcaDaguaOpacidade` int DEFAULT 8;--> statement-breakpoint
ALTER TABLE `modelosDocumento` ADD `marcaDaguaPosicao` enum('diagonal','centro','topo','rodape') DEFAULT 'diagonal';